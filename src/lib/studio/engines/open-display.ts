import { ColorScheme, DitherMode, ditherImage, getPalette } from '@opendisplay/epaper-dithering'
import type { Palette } from '../model'
import { image_result, validate_pixels, type ProcessAlgorithm } from '../processing'
import { graphicColors, graphic_ink } from './graphic-palette'

const schemes: Record<Palette, ColorScheme> = { bw: ColorScheme.MONO, bwr: ColorScheme.BWR, bwry: ColorScheme.BWRY }
const algorithms: Record<ProcessAlgorithm, DitherMode> = {
    none: DitherMode.NONE,
    floyd: DitherMode.FLOYD_STEINBERG,
    atkinson: DitherMode.ATKINSON,
    bayer: DitherMode.ORDERED,
    burkes: DitherMode.BURKES,
}

/**
 * 使用 OpenDisplay 的正式量化接口处理已完成调色的像素，并保留精确设备色。
 * @param image 主流程已铺白并调整亮度、对比度的原生尺寸 RGBA 图像。
 * @param palette 屏幕支持的标准色彩集合。
 * @param algorithm 官方量化或抖动算法。
 * @param graphic 使用独立的图标匹配色和设备输出色。
 * @returns 与源图同尺寸、全不透明的独立屏幕像素；上游处理失败时抛出错误。
 */
export async function process_pixels(image: ImageData, palette: Palette, algorithm: ProcessAlgorithm, graphic = false): Promise<ImageData> {
    validate_pixels(image, palette)
    if (!Object.hasOwn(algorithms, algorithm)) throw new Error(`不支持的抖动算法：${algorithm}`)
    const scheme = schemes[palette]
    const standard = getPalette(scheme)
    const matched = graphic ? { colors: graphicColors, accent: 'red' } : { ...standard, scheme }
    const result = ditherImage(image, matched, {
        mode: algorithms[graphic ? 'none' : algorithm],
        serpentine: true,
        exposure: 1,
        saturation: 1,
        shadows: 0,
        highlights: 0,
        tone: 'off',
        gamut: 'off',
        dbs: false,
    })
    if (result.width !== image.width || result.height !== image.height || result.indices.length !== image.width * image.height) {
        throw new Error('OpenDisplay 返回的像素尺寸或长度不正确')
    }
    const colors = Object.values(matched.colors).map(color => graphic ? graphic_ink(color, palette) : color)
    const data = new Uint8ClampedArray(image.data.length)
    for (let pixel = 0; pixel < result.indices.length; pixel++) {
        const color = colors[result.indices[pixel]]
        if (!color) throw new Error('OpenDisplay 返回的调色板索引越界')
        const index = pixel * 4
        data[index] = color.r
        data[index + 1] = color.g
        data[index + 2] = color.b
        data[index + 3] = 255
    }
    return image_result(data, image.width, image.height)
}
