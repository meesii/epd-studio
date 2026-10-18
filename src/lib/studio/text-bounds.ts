import type { Scene, SceneElement } from './model'
import { text_font } from './text-font'
import { layout_natural_text } from './text-layout'

export type TextMeasureContext = Pick<CanvasRenderingContext2D, 'font' | 'textAlign' | 'textBaseline' | 'measureText'>
let sharedContext: TextMeasureContext | null = null

/**
 * 延迟创建浏览器测量画布；没有 DOM 或 Canvas 的环境不猜测文字尺寸。
 * @returns 可用测量上下文，不支持 Canvas 时为 null。
 */
function get_text_context(): TextMeasureContext | null {
    if (sharedContext) return sharedContext
    if (typeof document === 'undefined') return null
    try { sharedContext = document.createElement('canvas').getContext('2d') }
    catch { return null }
    return sharedContext
}

/**
 * 将文字框贴合自然内容，保留水平及垂直对齐位置的世界坐标锚点。
 * @param element 文字图层；其他图层直接返回原对象。
 * @param context 可选测量上下文，省略时复用浏览器的独立测量画布。
 * @returns 拥有自然宽高的新文字图层；无变化或无法测量时保留原引用。
 */
export function fit_text_element(element: SceneElement, context?: TextMeasureContext): SceneElement {
    if (element.type !== 'text') return element
    const measure = context ?? get_text_context()
    if (!measure) return element
    measure.font = text_font(element)
    measure.textAlign = 'left'
    measure.textBaseline = 'alphabetic'
    const bounds = layout_natural_text(measure, element.text ?? '', element.fontSize ?? 20, element.align)
    if (bounds.width > 20000 || bounds.height > 20000) throw new Error('文字过长，请插入换行、减少空行或减小字号后重试')
    if (Math.abs(element.width - bounds.width) < 0.001 && Math.abs(element.height - bounds.height) < 0.001) return element
    const horizontalFactor = element.align === 'right' ? 1 : element.align === 'center' ? 0.5 : 0
    const verticalFactor = element.verticalAlign === 'bottom' ? 1 : element.verticalAlign === 'middle' ? 0.5 : 0
    const radians = (element.rotation ?? 0) * Math.PI / 180
    const localX = (horizontalFactor - 0.5) * (element.width - bounds.width)
    const localY = (verticalFactor - 0.5) * (element.height - bounds.height)
    const shiftX = localX * Math.cos(radians) - localY * Math.sin(radians)
    const shiftY = localX * Math.sin(radians) + localY * Math.cos(radians)
    return {
        ...element,
        x: element.x + element.width / 2 + shiftX - bounds.width / 2,
        y: element.y + element.height / 2 + shiftY - bounds.height / 2,
        width: bounds.width,
        height: bounds.height,
    }
}

/**
 * 统一规范作品文字边界，不修改保存时间、输入对象或非文字图层。
 * @param scene 当前作品或历史快照。
 * @param context 可选的真实字体测量上下文，测试可注入确定性的字形度量。
 * @returns 文字尺寸变化后的作品；全部尺寸已匹配时返回原作品引用。
 */
export function fit_scene_text(scene: Scene, context?: TextMeasureContext): Scene {
    if (!scene.elements.some(element => element.type === 'text')) return scene
    const measure = context ?? get_text_context()
    if (!measure) return scene
    let changed = false
    const elements = scene.elements.map(element => {
        const fitted = fit_text_element(element, measure)
        if (fitted !== element) changed = true
        return fitted
    })
    return changed ? { ...scene, elements } : scene
}
