import QRCode from 'qrcode'
import type { Scene, SceneElement } from './model'
import { validate_dimensions } from './model'
import { layout_natural_text } from './text-layout'
import { fit_scene_text } from './text-bounds'
import { pixel_font, pixel_font_ready, text_font } from './text-font'
import type { ProcessOptions } from './processing'
import { defaultOptions, process_image_data, resolve_layer_options } from './processing'
import { process_layer_data } from './layer-output'

export { canvasFont, font_family } from './text-font'
const imageCache = new Map<string, Promise<HTMLImageElement>>()
const renderVersions = new WeakMap<HTMLCanvasElement, number>()

export interface ImageBounds {
    sourceX: number
    sourceY: number
    sourceWidth: number
    sourceHeight: number
    targetX: number
    targetY: number
    targetWidth: number
    targetHeight: number
}

/**
 * 计算图片等比完整显示或居中裁剪时的源区域与目标区域。
 * @param sourceWidth 图片原生宽度。
 * @param sourceHeight 图片原生高度。
 * @param targetWidth 图层宽度。
 * @param targetHeight 图层高度。
 * @param fit 完整显示或填满图层的模式。
 * @returns 可直接用于 drawImage 九参数形式的区域数据。
 */
export function image_bounds(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number, fit: SceneElement['fit'] = 'contain'): ImageBounds {
    if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every(value => Number.isFinite(value) && value > 0)) {
        throw new Error('图片或图层尺寸无效')
    }
    if (fit === 'cover') {
        const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
        const cropWidth = targetWidth / scale
        const cropHeight = targetHeight / scale
        return {
            sourceX: (sourceWidth - cropWidth) / 2,
            sourceY: (sourceHeight - cropHeight) / 2,
            sourceWidth: cropWidth,
            sourceHeight: cropHeight,
            targetX: 0,
            targetY: 0,
            targetWidth,
            targetHeight,
        }
    }
    const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
    const imageWidth = sourceWidth * scale
    const imageHeight = sourceHeight * scale
    return {
        sourceX: 0,
        sourceY: 0,
        sourceWidth,
        sourceHeight,
        targetX: (targetWidth - imageWidth) / 2,
        targetY: (targetHeight - imageHeight) / 2,
        targetWidth: imageWidth,
        targetHeight: imageHeight,
    }
}

/**
 * 计算二维码保持每个模块至少一个物理像素所需的最小边长。
 * @param text 二维码内容。
 * @returns 不含外围留白的二维码模块边长。
 */
export function qr_size(text?: string): number {
    if (!text?.trim()) throw new Error('二维码内容为空，请填写链接或文字')
    try {
        return QRCode.create(text, { errorCorrectionLevel: 'M' }).modules.size
    } catch {
        throw new Error('二维码内容过长或无法编码，请缩短链接或文字')
    }
}

/**
 * 解码本地栅格图片并保留少量缓存，避免拖动时重复解码。
 * @param src 已导入的图片数据地址。
 * @returns 解码完成的图片。
 */
function load_image(src: string): Promise<HTMLImageElement> {
    if (!/^data:image\/(png|jpeg|webp|gif);/.test(src)) return Promise.reject(new Error('仅支持本地导入的 PNG、JPEG、WebP 或 GIF 图片'))
    const existing = imageCache.get(src)
    if (existing) return existing
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => { imageCache.delete(src); reject(new Error('图片无法解码，请重新导入 PNG 或 JPEG 文件')) }
        image.src = src
    })
    if (imageCache.size > 30) imageCache.delete(imageCache.keys().next().value!)
    imageCache.set(src, promise)
    return promise
}

/**
 * 将一个可见图层绘制到离屏缓冲区。
 * @param ctx 绘图上下文。
 * @param element 待绘制的图层。
 * @param textMask 是否以黑色绘制文字覆盖范围，供点阵输出统一着色。
 * @returns 图片或二维码完成绘制后结束。
 */
async function draw_element(ctx: CanvasRenderingContext2D, element: SceneElement, textMask = false) {
    if (!element.visible) return
    const { width, height } = element
    ctx.save()
    ctx.translate(element.x + width / 2, element.y + height / 2)
    ctx.rotate((element.rotation ?? 0) * Math.PI / 180)
    ctx.translate(-width / 2, -height / 2)
    ctx.fillStyle = element.fill
    if (element.type === 'rect' || element.type === 'line') {
        ctx.beginPath()
        const radius = element.type === 'rect' ? Math.max(0, Math.min(element.radius ?? 0, width / 2, height / 2)) : 0
        if (radius) ctx.roundRect(0, 0, width, height, radius)
        else ctx.rect(0, 0, width, height)
        ctx.fill()
        if (element.type === 'rect' && element.stroke && element.strokeWidth) {
            ctx.strokeStyle = element.stroke
            ctx.lineWidth = element.strokeWidth
            ctx.stroke()
        }
    } else if (element.type === 'text') {
        const fontSize = element.fontSize ?? 20
        if (textMask) ctx.fillStyle = '#000000'
        ctx.font = text_font(element)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
        const layout = layout_natural_text(ctx, element.text ?? '', fontSize, element.align)
        const pixel = pixel_font(element.fontFamily)
        const alignPixels = pixel && fontSize % pixel.size === 0 && (element.rotation ?? 0) % 360 === 0
        for (const line of layout.lines) {
            const x = alignPixels ? Math.round(element.x + line.x) - element.x : line.x
            const baseline = alignPixels ? Math.round(element.y + line.baseline) - element.y : line.baseline
            ctx.fillText(line.text, x, baseline)
        }
    } else if (element.type === 'image' && element.src) {
        const image = await load_image(element.src)
        const bounds = image_bounds(image.naturalWidth, image.naturalHeight, width, height, element.fit)
        ctx.translate(element.flipX ? width : 0, element.flipY ? height : 0)
        ctx.scale(element.flipX ? -1 : 1, element.flipY ? -1 : 1)
        ctx.drawImage(image, bounds.sourceX, bounds.sourceY, bounds.sourceWidth, bounds.sourceHeight, bounds.targetX, bounds.targetY, bounds.targetWidth, bounds.targetHeight)
    } else if (element.type === 'qr') {
        const size = Math.min(width, height)
        const required = qr_size(element.text)
        if (size < required) throw new Error(`二维码至少需要 ${required} × ${required} 像素，请放大图层或缩短内容`)
        const qr = document.createElement('canvas')
        await QRCode.toCanvas(qr, element.text!, {
            width: Math.round(size),
            margin: 0,
            errorCorrectionLevel: 'M',
            color: { dark: '#000000', light: '#ffffff' },
        })
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(qr, (width - size) / 2, (height - size) / 2, size, size)
    }
    ctx.restore()
}

/**
 * 将统一的字形覆盖范围转换成指定文字颜色，避免浏览器按黑字和白字使用不同边缘权重。
 * @param pixels 以黑色绘制的文字图层像素，原地写入二值覆盖与颜色自身的透明度。
 * @param fill 作品中保存的文字填充色。
 * @returns 无返回值。
 */
function color_text_mask(pixels: ImageData, fill: string): void {
    const swatch = document.createElement('canvas')
    swatch.width = swatch.height = 1
    const context = swatch.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('浏览器无法创建画布')
    context.fillStyle = fill
    context.fillRect(0, 0, 1, 1)
    const color = context.getImageData(0, 0, 1, 1).data
    for (let index = 0; index < pixels.data.length; index += 4) {
        pixels.data[index] = color[0]
        pixels.data[index + 1] = color[1]
        pixels.data[index + 2] = color[2]
        pixels.data[index + 3] = pixels.data[index + 3] >= 128 ? color[3] : 0
    }
}

/**
 * 计算旋转图层在原生像素中的裁剪区域，给描边和字形边缘保留余量。
 * @param element 已按实际字体修正尺寸的图层。
 * @param scene 目标画布尺寸。
 * @returns 位于画布内的整数区域；完全不可见时返回 null。
 */
function layer_bounds(element: SceneElement, scene: Scene) {
    const radians = (element.rotation ?? 0) * Math.PI / 180
    const padding = 2 + (element.type === 'rect' ? (element.strokeWidth ?? 0) / 2 : 0)
    const halfWidth = element.width / 2 + padding
    const halfHeight = element.height / 2 + padding
    const extentX = Math.abs(Math.cos(radians)) * halfWidth + Math.abs(Math.sin(radians)) * halfHeight
    const extentY = Math.abs(Math.sin(radians)) * halfWidth + Math.abs(Math.cos(radians)) * halfHeight
    const centerX = element.x + element.width / 2
    const centerY = element.y + element.height / 2
    const x = Math.max(0, Math.floor(centerX - extentX))
    const y = Math.max(0, Math.floor(centerY - extentY))
    const right = Math.min(scene.width, Math.ceil(centerX + extentX))
    const bottom = Math.min(scene.height, Math.ceil(centerY + extentY))
    return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

/**
 * 按图层顺序独立量化原生像素，仅在真实覆盖区域与下层合成。
 * @param ctx 已绘制原色背景的设备缓冲区。
 * @param scene 作品及屏幕调色板。
 * @param elements 已修正文字尺寸的图层。
 * @param options 图片默认继承的画布处理设置。
 * @returns 完成后缓冲区已是可发送的设备像素，不再执行整图抖动。
 */
async function draw_output_layers(ctx: CanvasRenderingContext2D, scene: Scene, elements: SceneElement[], options: ProcessOptions): Promise<void> {
    ctx.putImageData(await process_image_data(ctx.getImageData(0, 0, scene.width, scene.height), scene.palette, options), 0, 0)
    const layer = document.createElement('canvas')
    for (const element of elements) {
        if (!element.visible) continue
        const bounds = layer_bounds(element, scene)
        if (!bounds) continue
        layer.width = bounds.width
        layer.height = bounds.height
        const layerCtx = layer.getContext('2d', { willReadFrequently: true })
        if (!layerCtx) throw new Error('浏览器无法创建画布')
        layerCtx.setTransform(1, 0, 0, 1, -bounds.x, -bounds.y)
        const selected = resolve_layer_options(element, options)
        const textMask = element.type === 'text' && Boolean(pixel_font(element.fontFamily)) && selected.algorithm === 'none'
        await draw_element(layerCtx, element, textMask)
        const pixels = layerCtx.getImageData(0, 0, bounds.width, bounds.height)
        if (textMask) color_text_mask(pixels, element.fill)
        if (!pixels.data.some((value, index) => index % 4 === 3 && value !== 0)) continue
        const backdrop = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height)
        const sharpEdges = element.type !== 'image' && selected.algorithm === 'none'
        const graphic = element.type === 'image' && element.processMode === 'graphic'
        ctx.putImageData(await process_layer_data(pixels, backdrop, scene.palette, selected, sharpEdges, graphic), bounds.x, bounds.y)
    }
}

/**
 * 共用字体加载、文字边界与版本控制，绘制设计图或设备输出。
 * @param canvas 目标画布。
 * @param scene 待绘制的作品。
 * @param scale 设计预览的倍率；设备输出固定为 1。
 * @param on_warnings 接收不写入位图的文字溢出提示。
 * @param options 提供时逐图层转换为屏幕色彩。
 * @returns 全部字体与图像加载并绘制完成后结束。
 */
async function draw_scene(canvas: HTMLCanvasElement, scene: Scene, scale: number, on_warnings?: (warnings: string[]) => void, options?: ProcessOptions): Promise<void> {
    validate_dimensions(scene.width, scene.height)
    if (!Number.isFinite(scale) || scale <= 0 || scale > 4 || scene.width * scene.height * scale * scale > 16000000) {
        throw new Error('预览倍率超出可用范围')
    }
    const version = (renderVersions.get(canvas) ?? 0) + 1
    renderVersions.set(canvas, version)
    if (document.fonts) {
        const fonts = new Map<string, string>()
        for (const element of scene.elements) {
            if (element.visible && element.type === 'text') fonts.set(text_font(element), `${fonts.get(text_font(element)) ?? ''}${element.text ?? ''}`.slice(0, 256))
        }
        await Promise.all([...fonts].map(([font, sample]) => document.fonts.load(font, sample || '国MgÅpq')))
        await document.fonts.ready
    }
    if (scene.elements.some(element => element.visible && element.type === 'text' && !pixel_font_ready(element.fontFamily))) {
        throw new Error('点阵字体未加载，请刷新页面或改用其他字体')
    }
    const buffer = document.createElement('canvas')
    buffer.width = Math.round(scene.width * scale)
    buffer.height = Math.round(scene.height * scale)
    const ctx = buffer.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('浏览器无法创建画布')
    ctx.setTransform(buffer.width / scene.width, 0, 0, buffer.height / scene.height, 0, 0)
    ctx.fillStyle = scene.background
    ctx.fillRect(0, 0, scene.width, scene.height)
    const warnings: string[] = []
    const elements = fit_scene_text(scene, ctx).elements
    for (const element of elements) {
        if (element.visible && element.type === 'text') {
            const radians = (element.rotation ?? 0) * Math.PI / 180
            const centerX = element.x + element.width / 2
            const centerY = element.y + element.height / 2
            const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sideX, sideY]) => ({
                x: centerX + sideX * element.width / 2 * Math.cos(radians) - sideY * element.height / 2 * Math.sin(radians),
                y: centerY + sideX * element.width / 2 * Math.sin(radians) + sideY * element.height / 2 * Math.cos(radians),
            }))
            if (corners.some(point => point.x < 0 || point.x > scene.width || point.y < 0 || point.y > scene.height)) warnings.push(`「${element.name}」文字超出画布，请移动文字、插入换行或减小字号`)
        }
        if (!options) await draw_element(ctx, element)
    }
    if (options) {
        await draw_output_layers(ctx, scene, elements, options)
    }
    if (renderVersions.get(canvas) !== version) return
    canvas.width = buffer.width
    canvas.height = buffer.height
    const target = canvas.getContext('2d', { willReadFrequently: true })
    if (!target) throw new Error('浏览器无法创建画布')
    target.drawImage(buffer, 0, 0)
    on_warnings?.(warnings)
}

/**
 * 绘制原色设计图，并阻止较早的异步绘制覆盖最新预览。
 * @param canvas 目标画布。
 * @param scene 待绘制的作品。
 * @param scale 高清设计预览倍率。
 * @param on_warnings 接收文字溢出提示。
 * @returns 全部字体与图像加载并绘制完成后结束。
 */
export function render_scene(canvas: HTMLCanvasElement, scene: Scene, scale = 1, on_warnings?: (warnings: string[]) => void): Promise<void> {
    return draw_scene(canvas, scene, scale, on_warnings)
}

/**
 * 以原生尺寸逐图层生成预览、导出与发送共用的设备像素。
 * @param canvas 目标画布。
 * @param scene 待输出的作品。
 * @param options 图像处理参数；默认读取作品设置。
 * @param on_warnings 接收文字溢出提示。
 * @returns 可直接读取并打包发送的画布绘制完成后结束。
 */
export function render_scene_output(canvas: HTMLCanvasElement, scene: Scene, options: ProcessOptions = scene.processOptions ?? defaultOptions, on_warnings?: (warnings: string[]) => void): Promise<void> {
    return draw_scene(canvas, scene, 1, on_warnings, options)
}
