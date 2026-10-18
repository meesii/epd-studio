import type { Palette, SceneElement } from './model'
import { validate_dimensions } from './model'

export type ProcessEngine = 'epdoptimize' | 'opendisplay'
export type ProcessAlgorithm = 'none' | 'floyd' | 'atkinson' | 'bayer' | 'burkes'
export type ProcessMode = 'auto' | 'graphic' | 'photo'

export interface ProcessOptions {
    engine?: ProcessEngine
    algorithm: ProcessAlgorithm | 'adaptive' | 'threshold'
    contrast: number
    brightness: number
    threshold?: number
    redSaturation?: number
    ditherStrength?: number
}

export interface ResolvedOptions {
    engine: ProcessEngine
    algorithm: ProcessAlgorithm
    contrast: number
    brightness: number
}

export const defaultOptions: ResolvedOptions = {
    engine: 'epdoptimize', algorithm: 'atkinson', contrast: 1, brightness: 0,
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback

/**
 * 解析旧作品的算法别名，统一两套开源内核的有效参数。
 * @param supplied 新设置或兼容读取的旧作品设置。
 * @returns 具有明确内核、算法和有效调色范围的独立设置。
 */
export function resolve_options(supplied: ProcessOptions = defaultOptions): ResolvedOptions {
    const engine = supplied.engine ?? defaultOptions.engine
    if (engine !== 'epdoptimize' && engine !== 'opendisplay') throw new Error('不支持的图像处理内核')
    const algorithm = supplied.algorithm === 'adaptive' ? 'atkinson' : supplied.algorithm === 'threshold' ? 'none' : supplied.algorithm
    if (!['none', 'floyd', 'atkinson', 'bayer', 'burkes'].includes(algorithm)) throw new Error('不支持的抖动算法')
    return {
        engine, algorithm,
        contrast: clamp(finite(supplied.contrast, defaultOptions.contrast), 0, 3),
        brightness: clamp(finite(supplied.brightness, defaultOptions.brightness), -100, 100),
    }
}

/**
 * 取得当前图层的独立设置，文字与矢量图层默认直接量化以保留轮廓。
 * @param element 当前图层，独立设置存在时完整覆盖画布默认值。
 * @param supplied 画布的处理设置。
 * @returns 已解析的有效内核、算法与调色参数。
 */
export function resolve_layer_options(element: SceneElement, supplied: ProcessOptions = defaultOptions): ResolvedOptions {
    const options = resolve_options(element.processOptions ?? supplied)
    if (element.type === 'image' && element.processMode === 'graphic') return { ...options, algorithm: 'none' }
    return element.processOptions || element.type === 'image' ? options : { ...options, algorithm: 'none' }
}

/**
 * 构造浏览器与无 DOM 测试环境都能使用的像素对象。
 * @param data RGBA 数据。
 * @param width 像素宽度。
 * @param height 像素高度。
 * @returns 独立的像素对象。
 */
export function image_result(data: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): ImageData {
    if (typeof ImageData !== 'undefined') return new ImageData(data, width, height)
    return { data, width, height, colorSpace: 'srgb' } as ImageData
}

/**
 * 校验原生图像规格及屏幕调色板，供两个内核共用。
 * @param image 待处理的原生 RGBA 像素。
 * @param palette 目标屏幕色彩。
 * @returns 无返回值；无效数据抛出错误。
 */
export function validate_pixels(image: ImageData, palette: Palette): void {
    validate_dimensions(image.width, image.height)
    if (!['bw', 'bwr', 'bwry'].includes(palette)) throw new Error('不支持的屏幕色彩模式')
    if (image.data.length !== image.width * image.height * 4) throw new Error('像素数据长度与画布尺寸不一致')
}

/**
 * 对一幅原生尺寸图像调整一次，并调用所选开源内核生成设备像素。
 * @param image 原生尺寸 RGBA 像素，不会被修改。
 * @param palette 目标屏幕色彩。
 * @param supplied 作品的内核、算法与通用调色设置。
 * @param graphic 使用图标八色匹配并映射为设备实色，不执行误差扩散。
 * @returns 与输入同尺寸、全不透明且可直接打包的屏幕像素。
 */
export async function process_image_data(image: ImageData, palette: Palette, supplied: ProcessOptions = defaultOptions, graphic = false): Promise<ImageData> {
    validate_pixels(image, palette)
    const options = resolve_options(supplied)
    const data = new Uint8ClampedArray(image.data.length)
    for (let index = 0; index < data.length; index += 4) {
        const alpha = image.data[index + 3] / 255
        for (let channel = 0; channel < 3; channel++) {
            const value = image.data[index + channel] * alpha + 255 * (1 - alpha)
            data[index + channel] = (value - 128) * options.contrast + 128 + options.brightness * 2.55
        }
        data[index + 3] = 255
    }
    const source = image_result(data, image.width, image.height)
    const engine = options.engine === 'epdoptimize' ? await import('./engines/epd-optimize') : await import('./engines/open-display')
    return engine.process_pixels(source, palette, graphic ? 'none' : options.algorithm, graphic)
}

export interface PackedLayer { name: string; cfg: number; data: Uint8Array }

/**
 * 将量化像素打包为固件驱动对应的原生像素流。
 * @param image 已量化的 RGBA 像素。
 * @param palette 作品色彩模式。
 * @param modelId 固件中的屏幕型号编号；省略时使用标准分层格式。
 * @returns 按发送顺序排列的像素层，cfg 为写入首块的配置值。
 */
export function pack_image_data(image: ImageData, palette: Palette, modelId?: number): PackedLayer[] {
    validate_dimensions(image.width, image.height)
    if (image.data.length !== image.width * image.height * 4) throw new Error('像素数据长度与画布尺寸不一致')
    if (!['bw', 'bwr', 'bwry'].includes(palette)) throw new Error('不支持的屏幕色彩模式')
    if (modelId !== undefined) {
        const supported: Record<number, Palette> = { 1: 'bw', 2: 'bwr', 3: 'bwr', 4: 'bw', 5: 'bwry', 6: 'bw', 7: 'bwr', 8: 'bw', 9: 'bwr', 10: 'bw', 11: 'bwr', 12: 'bwry' }
        if (!supported[modelId]) throw new Error(`未知屏幕驱动 ${modelId}，无法安全打包图像`)
        if (palette !== 'bw' && supported[modelId] !== palette) throw new Error('画布色彩与屏幕驱动不匹配，请先切换色彩模式')
    }
    // 禁止隐式二次量化，确保屏幕像素与发送前预览一致。
    const codes = new Uint8Array(image.width * image.height)
    for (let index = 0; index < codes.length; index++) {
        const pixel = index * 4
        const red = image.data[pixel], green = image.data[pixel + 1], blue = image.data[pixel + 2]
        if (image.data[pixel + 3] !== 255) throw new Error('图像包含透明像素，请先执行屏幕色彩处理')
        if (red === 0 && green === 0 && blue === 0) codes[index] = 0
        else if (red === 255 && green === 255 && blue === 255) codes[index] = 1
        else if (palette !== 'bw' && red === 255 && green === 0 && blue === 0) codes[index] = 3
        else if (palette === 'bwry' && red === 255 && green === 255 && blue === 0) codes[index] = 2
        else throw new Error('图像尚未转换为屏幕色彩，请先执行图像处理')
    }
    if (palette === 'bwry' || modelId === 5 || modelId === 12) {
        if (image.width % 4) throw new Error('四色屏幕宽度须为 4 的倍数')
        const data = new Uint8Array(image.width * image.height / 4)
        for (let index = 0; index < codes.length; index++) data[index >> 2] |= codes[index] << (6 - (index % 4) * 2)
        // 原生驱动仅在 cfg 低位为 0x0f 时发送 DTM1 写 RAM 命令。
        return [{ name: '四色画面', cfg: 0x0f, data }]
    }
    if (modelId === 8 || modelId === 9) {
        if (image.width % 2) throw new Error('UC8159 屏幕宽度须为 2 的倍数')
        const data = new Uint8Array(image.width * image.height / 2)
        const codeMap = [0, 3, 3, 4]
        for (let index = 0; index < codes.length; index++) data[index >> 1] |= codeMap[codes[index]] << (index % 2 ? 0 : 4)
        return [{ name: 'UC8159 原生画面', cfg: 0x0f, data }]
    }
    const stride = Math.ceil(image.width / 8)
    const black = new Uint8Array(stride * image.height).fill(0xff)
    const red = new Uint8Array(stride * image.height).fill(0xff)
    for (let row = 0; row < image.height; row++) {
        for (let column = 0; column < image.width; column++) {
            const code = codes[row * image.width + column]
            const index = row * stride + (column >> 3)
            const mask = 1 << (7 - column % 8)
            if (code === 0) black[index] &= ~mask
            if (code === 3) red[index] &= ~mask
        }
    }
    const layers: PackedLayer[] = [{ name: '黑白图层', cfg: 0x0f, data: black }]
    // 黑白作品也须覆盖三色设备的红层，避免保留上一次画面的红色。
    if (palette === 'bwr' || (modelId !== undefined && [2, 3, 7, 9, 11].includes(modelId))) layers.push({ name: '红色图层', cfg: 0x00, data: red })
    return layers
}
