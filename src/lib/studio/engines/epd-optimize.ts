import { ditherCanvas, type CanvasLike, type DitherImageOptions, type ImageDataLike } from 'epdoptimize'
import type { Palette } from '../model'
import { image_result, validate_pixels, type ProcessAlgorithm } from '../processing'
import { graphicColors, graphic_ink } from './graphic-palette'

const palettes: Record<Palette, string[]> = {
    bw: ['#000000', '#ffffff'],
    bwr: ['#000000', '#ffffff', '#ff0000'],
    bwry: ['#000000', '#ffffff', '#ff0000', '#ffff00'],
}

const algorithms: Record<ProcessAlgorithm, DitherImageOptions> = {
    none: { ditheringType: 'quantizationOnly' },
    floyd: { ditheringType: 'errorDiffusion', errorDiffusionMatrix: 'floydSteinberg' },
    atkinson: { ditheringType: 'errorDiffusion', errorDiffusionMatrix: 'atkinson' },
    bayer: { ditheringType: 'ditherItOrdered', orderedDitheringMatrix: [4, 4] },
    burkes: { ditheringType: 'errorDiffusion', errorDiffusionMatrix: 'burkes' },
}

/**
 * 使用 EPD Optimize 的正式量化接口处理已完成调色的原生尺寸像素，不修改源图。
 * @param image 主流程已铺白并调整亮度、对比度的 RGBA 图像。
 * @param palette 屏幕支持的标准色彩集合。
 * @param algorithm 官方量化或抖动算法。
 * @param graphic 先匹配标准图标八色，再输出设备支持的实色。
 * @returns 与源图同尺寸、全不透明的独立屏幕像素；上游处理失败时抛出错误。
 */
export async function process_pixels(image: ImageData, palette: Palette, algorithm: ProcessAlgorithm, graphic = false): Promise<ImageData> {
    validate_pixels(image, palette)
    if (!Object.hasOwn(algorithms, algorithm)) throw new Error(`不支持的抖动算法：${algorithm}`)
    const target: { image?: ImageDataLike } = {}
    const canvas: CanvasLike = {
        width: image.width,
        height: image.height,
        getContext: () => ({
            getImageData: () => ({ width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) }),
            putImageData: next => { target.image = next },
        }),
    }
    const result = await ditherCanvas(canvas, canvas, {
        palette: graphic ? Object.values(graphicColors).map(color => `#${[color.r, color.g, color.b].map(channel => channel.toString(16).padStart(2, '0')).join('')}`) : palettes[palette],
        colorMatching: 'rgb',
        processingEngine: 'js',
        adjustmentEngine: 'js',
        sampleColorsFromImage: false,
        serpentine: true,
        edgePreservation: { enabled: false },
        edgeAntialiasing: { enabled: false },
        ...algorithms[graphic ? 'none' : algorithm],
    })
    const output = target.image
    if (!result || !output || output.width !== image.width || output.height !== image.height || output.data.length !== image.data.length) {
        throw new Error('EPD Optimize 返回的像素尺寸或长度不正确')
    }
    const data = new Uint8ClampedArray(output.data)
    for (let index = 0; index < data.length; index += 4) {
        if (graphic) {
            const ink = graphic_ink({ r: data[index], g: data[index + 1], b: data[index + 2] }, palette)
            data[index] = ink.r
            data[index + 1] = ink.g
            data[index + 2] = ink.b
        }
        data[index + 3] = 255
    }
    return image_result(data, image.width, image.height)
}
