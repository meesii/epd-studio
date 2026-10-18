import type { ProcessMode, ProcessOptions } from './processing'
import { is_line_element } from './line-geometry'

export type Palette = 'bw' | 'bwr' | 'bwry'

export interface SceneElement {
    id: string
    type: 'text' | 'rect' | 'line' | 'image' | 'qr'
    name: string
    x: number
    y: number
    width: number
    height: number
    rotation?: number
    visible: boolean
    locked: boolean
    fill: string
    text?: string
    fontSize?: number
    fontWeight?: number
    fontFamily?: string
    align?: 'left' | 'center' | 'right'
    verticalAlign?: 'top' | 'middle' | 'bottom'
    src?: string
    fit?: 'contain' | 'cover'
    processOptions?: ProcessOptions
    processMode?: ProcessMode
    flipX?: boolean
    flipY?: boolean
    stroke?: string
    strokeWidth?: number
    radius?: number
}

export interface Scene {
    id: string
    name: string
    width: number
    height: number
    palette: Palette
    background: string
    elements: SceneElement[]
    updatedAt: number
    processOptions?: ProcessOptions
}

export interface TemplateSource {
    title: string
    url: string
    platform: string
}

export interface Template {
    id: string
    name: string
    category: '日常' | '工作' | '影像' | '学习' | '门店'
    description: string
    sources?: TemplateSource[]
    note?: string
    fields?: { name: string; label?: string; group?: string }[]
    scene: Scene
}

/**
 * 创建可用于本地作品和图层的唯一标识。
 * @returns 新标识。
 */
export function new_id(): string {
    return globalThis.crypto?.randomUUID?.() ?? `epd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 校验画布尺寸，避免导入数据占用过量内存。
 * @param width 画布宽度。
 * @param height 画布高度。
 * @returns 尺寸有效时无返回值，否则抛出错误。
 */
export function validate_dimensions(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 2000 || height > 2000) {
        throw new Error('画布尺寸须为 1–2000 的整数像素')
    }
}

/**
 * 创建空白作品。
 * @param name 作品名称。
 * @param width 画布宽度。
 * @param height 画布高度。
 * @param palette 屏幕色彩模式。
 * @returns 新的独立作品。
 */
export function create_scene(name = '未命名作品', width = 800, height = 480, palette: Palette = 'bwr'): Scene {
    validate_dimensions(width, height)
    return { id: new_id(), name, width, height, palette, background: '#ffffff', elements: [], updatedAt: Date.now() }
}

/**
 * 深拷贝作品并重新生成作品和图层标识。
 * @param scene 原作品。
 * @returns 可以独立编辑的新作品。
 */
export function clone_scene(scene: Scene): Scene {
    const copy = structuredClone(scene)
    copy.id = new_id()
    copy.elements = copy.elements.map(element => ({ ...element, id: new_id() }))
    copy.updatedAt = Date.now()
    return copy
}

/**
 * 缩放作品中的几何坐标，保持字号和边框比例。
 * @param scene 原作品。
 * @param width 新画布宽度。
 * @param height 新画布高度。
 * @param palette 新屏幕色彩模式。
 * @returns 缩放后的作品，不修改原对象。
 */
export function resize_scene(scene: Scene, width: number, height: number, palette = scene.palette): Scene {
    validate_dimensions(width, height)
    const scaleX = width / scene.width
    const scaleY = height / scene.height
    return {
        ...scene, width, height, palette, updatedAt: Date.now(),
        elements: scene.elements.map(element => ({
            ...element,
            x: Math.round(element.x * scaleX * 100) / 100,
            y: Math.round(element.y * scaleY * 100) / 100,
            width: Math.round(element.width * scaleX * 100) / 100,
            height: Math.round(element.height * scaleY * 100) / 100,
            ...(element.fontSize !== undefined && { fontSize: Math.round(element.fontSize * Math.min(scaleX, scaleY) * 100) / 100 }),
            ...(element.strokeWidth !== undefined && { strokeWidth: element.strokeWidth * Math.min(scaleX, scaleY) }),
            ...(element.radius !== undefined && { radius: element.radius * Math.min(scaleX, scaleY) }),
        })),
    }
}

/**
 * 从顶层到下层查找指针命中的可编辑图层，使用逆变换匹配旋转后的边界。
 * @param scene 当前画布。
 * @param point 以画布像素表示的指针位置。
 * @param lineTolerance 细线额外命中容差，单位为画布像素；其他图层不扩大边界。
 * @returns 命中的最上方图层，没有命中时返回 null。
 */
export function hit_test(scene: Scene, point: { x: number; y: number }, lineTolerance = 4): SceneElement | null {
    for (let index = scene.elements.length - 1; index >= 0; index--) {
        const element = scene.elements[index]
        if (!element.visible || element.locked) continue
        const offsetX = point.x - element.x - element.width / 2
        const offsetY = point.y - element.y - element.height / 2
        const radians = -(element.rotation ?? 0) * Math.PI / 180
        const localX = offsetX * Math.cos(radians) - offsetY * Math.sin(radians)
        const localY = offsetX * Math.sin(radians) + offsetY * Math.cos(radians)
        const tolerance = is_line_element(element) && Number.isFinite(lineTolerance) ? Math.max(0, lineTolerance) : 0
        if (Math.abs(localX) <= element.width / 2 + tolerance + 1e-8 && Math.abs(localY) <= element.height / 2 + tolerance + 1e-8) return element
    }
    return null
}

/**
 * 共用画布与独立图层的处理参数校验，保留旧作品的可选兼容字段。
 * @param value 待检查的完整处理设置。
 * @returns 参数的类型和范围是否有效。
 */
export function is_process_options(value: unknown): value is ProcessOptions {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const options = value as ProcessOptions
    return (options.engine === undefined || ['epdoptimize', 'opendisplay'].includes(options.engine)) &&
        ['none', 'floyd', 'atkinson', 'bayer', 'burkes', 'adaptive', 'threshold'].includes(options.algorithm) &&
        Number.isFinite(options.contrast) && options.contrast >= 0 && options.contrast <= 3 &&
        Number.isFinite(options.brightness) && options.brightness >= -100 && options.brightness <= 100 &&
        (options.threshold === undefined || (Number.isFinite(options.threshold) && options.threshold >= 0 && options.threshold <= 255)) &&
        (options.redSaturation === undefined || (Number.isFinite(options.redSaturation) && options.redSaturation >= 0 && options.redSaturation <= 1)) &&
        (options.ditherStrength === undefined || (Number.isFinite(options.ditherStrength) && options.ditherStrength >= 0 && options.ditherStrength <= 1))
}

/**
 * 检查导入数据能否作为本地作品使用。
 * @param value 待检查的数据。
 * @returns 数据具有安全的作品结构时返回 true。
 */
export function is_scene(value: unknown): value is Scene {
    if (!value || typeof value !== 'object') return false
    const scene = value as Scene
    if (typeof scene.id !== 'string' || typeof scene.name !== 'string' || typeof scene.background !== 'string' ||
        !['bw', 'bwr', 'bwry'].includes(scene.palette) || !Number.isFinite(scene.updatedAt) || !Array.isArray(scene.elements)) return false
    try { validate_dimensions(scene.width, scene.height) } catch { return false }
    if (scene.processOptions !== undefined && !is_process_options(scene.processOptions)) return false
    return scene.elements.length <= 200 && scene.elements.every(element => element && typeof element === 'object' &&
        typeof element.id === 'string' && typeof element.name === 'string' && typeof element.fill === 'string' &&
        ['text', 'rect', 'line', 'image', 'qr'].includes(element.type) &&
        [element.x, element.y, element.width, element.height].every(Number.isFinite) && element.width > 0 && element.height > 0 &&
        typeof element.visible === 'boolean' && typeof element.locked === 'boolean' &&
        (element.rotation === undefined || Number.isFinite(element.rotation)) &&
        (element.fontSize === undefined || (Number.isFinite(element.fontSize) && element.fontSize > 0)) &&
        (element.fontWeight === undefined || Number.isFinite(element.fontWeight)) &&
        (element.verticalAlign === undefined || ['top', 'middle', 'bottom'].includes(element.verticalAlign)) &&
        (element.strokeWidth === undefined || (Number.isFinite(element.strokeWidth) && element.strokeWidth >= 0)) &&
        (element.radius === undefined || (Number.isFinite(element.radius) && element.radius >= 0)) &&
        (element.fit === undefined || ['contain', 'cover'].includes(element.fit)) &&
        (element.processOptions === undefined || is_process_options(element.processOptions)) &&
        (element.processMode === undefined || ['auto', 'graphic', 'photo'].includes(element.processMode)) &&
        (element.flipX === undefined || typeof element.flipX === 'boolean') &&
        (element.flipY === undefined || typeof element.flipY === 'boolean') &&
        (element.src === undefined || (typeof element.src === 'string' && /^data:image\/(png|jpeg|webp|gif);/.test(element.src))) &&
        (element.text === undefined || typeof element.text === 'string'))
}
