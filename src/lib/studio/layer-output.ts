import type { Palette } from './model'
import { image_result, process_image_data, resolve_options, validate_pixels, type ProcessOptions } from './processing'

/**
 * 检查一个像素是否为当前设备支持的全不透明标准色。
 * @param data 待检查的 RGBA 数据。
 * @param index 像素在 RGBA 数组中的起始位置。
 * @param palette 目标设备色彩。
 * @returns 像素属于设备标准色时返回 true。
 */
function is_palette_pixel(data: Uint8ClampedArray, index: number, palette: Palette): boolean {
    const red = data[index]
    const green = data[index + 1]
    const blue = data[index + 2]
    return data[index + 3] === 255 && (
        (red === 0 && green === 0 && blue === 0) ||
        (red === 255 && green === 255 && blue === 255) ||
        (palette !== 'bw' && red === 255 && green === 0 && blue === 0) ||
        (palette === 'bwry' && red === 255 && green === 255 && blue === 0)
    )
}

/**
 * 独立调色并量化一个原生图层区域，只覆盖该层有效像素且不重新处理透明处的底图。
 * @param layer 已完成旋转、缩放和裁剪的原色 RGBA 图层。
 * @param backdrop 与图层同尺寸、已转换为设备标准色的底图区域。
 * @param palette 目标设备色彩。
 * @param options 仅应用于当前图层的开源内核、算法及调色设置。
 * @param sharpEdges 无抖动文字、形状及二维码是否使用明确的二值边缘；整层半透明时不启用。
 * @param graphic 图片是否使用实色图标映射；源色在透明合成前独立转换。
 * @returns 独立的底图副本，仅有效覆盖处替换为本层的全不透明设备像素。
 */
export async function process_layer_data(layer: ImageData, backdrop: ImageData, palette: Palette, options: ProcessOptions, sharpEdges = false, graphic = false): Promise<ImageData> {
    validate_pixels(layer, palette)
    validate_pixels(backdrop, palette)
    if (layer.width !== backdrop.width || layer.height !== backdrop.height) throw new Error('图层与底图区域尺寸不一致')
    const resolved = resolve_options(graphic ? { ...options, algorithm: 'none' } : options)
    let maxAlpha = 0
    for (let index = 0; index < layer.data.length; index += 4) {
        if (!is_palette_pixel(backdrop.data, index, palette)) throw new Error('图层底图必须为当前设备的全不透明标准色')
        maxAlpha = Math.max(maxAlpha, layer.data[index + 3])
    }
    const output = new Uint8ClampedArray(backdrop.data)
    if (!maxAlpha) return image_result(output, layer.width, layer.height)
    let inks: Uint8ClampedArray | undefined
    if (graphic) {
        const opaque = new Uint8ClampedArray(layer.data)
        for (let index = 3; index < opaque.length; index += 4) opaque[index] = 255
        inks = (await process_image_data(image_result(opaque, layer.width, layer.height), palette, resolved, true)).data
    }
    const hard = sharpEdges && resolved.algorithm === 'none' && maxAlpha === 255
    const mask = new Uint8Array(layer.width * layer.height)
    const mixed = new Uint8ClampedArray(layer.data.length)
    for (let index = 0; index < layer.data.length; index += 4) {
        const coverage = hard ? (layer.data[index + 3] < 128 ? 0 : 255) : layer.data[index + 3]
        const alpha = coverage / 255
        mask[index / 4] = coverage ? 1 : 0
        for (let channel = 0; channel < 3; channel++) {
            const adjusted = inks ? inks[index + channel] : Math.max(0, Math.min(255, (layer.data[index + channel] - 128) * resolved.contrast + 128 + resolved.brightness * 2.55))
            mixed[index + channel] = coverage ? adjusted * alpha + backdrop.data[index + channel] * (1 - alpha) : 255
        }
        mixed[index + 3] = 255
    }
    const processed = await process_image_data(image_result(mixed, layer.width, layer.height), palette, { ...resolved, contrast: 1, brightness: 0 })
    validate_pixels(processed, palette)
    if (processed.width !== layer.width || processed.height !== layer.height) throw new Error('图层内核返回的区域尺寸不一致')
    for (let index = 0; index < output.length; index += 4) {
        if (!mask[index / 4]) continue
        if (!is_palette_pixel(processed.data, index, palette)) throw new Error('图层内核返回了无效的设备像素')
        output.set(processed.data.subarray(index, index + 4), index)
    }
    return image_result(output, layer.width, layer.height)
}
