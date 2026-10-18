import type { SceneElement } from './model'

/**
 * 识别原生线条，以及旧作品中用无描边、无圆角的 1–2 像素细矩形表示的线条。
 * @param element 待判断的图层。
 * @returns 原生线条或长短轴比至少为 4 的旧细线时为 true。
 */
export function is_line_element(element: SceneElement): boolean {
    if (element.type === 'line') return true
    const thickness = Math.min(element.width, element.height)
    return element.type === 'rect' && !(element.stroke && element.strokeWidth) && !(element.radius ?? 0)
        && thickness > 0 && thickness <= 2 && Math.max(element.width, element.height) >= thickness * 4
}

/**
 * 读取线条沿局部坐标轴的长度与粗细，旋转不改变这两个属性。
 * @param element 线条或兼容的细矩形。
 * @returns 主轴方向、长度与线宽。
 */
export function line_size(element: SceneElement): { vertical: boolean; length: number; thickness: number } {
    const vertical = element.height > element.width
    return { vertical, length: vertical ? element.height : element.width, thickness: vertical ? element.width : element.height }
}

/**
 * 约束线条长短轴的间隔，避免短竖线收缩时增长或调粗时反而变细。
 * @param size 线条当前的主轴方向、长度和线宽。
 * @returns 不超过原长度的最短长度，以及不小于原线宽的最大线宽。
 */
export function line_size_limits(size: ReturnType<typeof line_size>): { minLength: number; maxThickness: number } {
    const gap = size.vertical ? Math.min(0.01, (size.length - size.thickness) / 2) : 0
    const minLength = size.thickness + gap
    const maxThickness = size.length - gap
    return {
        minLength: size.vertical && minLength <= size.thickness ? size.length : minLength,
        maxThickness: size.vertical && maxThickness >= size.length ? size.thickness : maxThickness,
    }
}

/**
 * 修改线长或线宽并保持主轴方向，旧细矩形在第一次尺寸编辑时升级为原生线条。
 * @param element 原线条。
 * @param size 需要更新的长度或粗细。
 * @returns 保留旋转中心的新几何属性和线条类型。
 */
export function set_line_size(element: SceneElement, size: { length?: number; thickness?: number }): Pick<SceneElement, 'type' | 'x' | 'y' | 'width' | 'height'> {
    const original = line_size(element)
    const requestedLength = size.length ?? original.length
    const requestedThickness = size.thickness ?? original.thickness
    if (![requestedLength, requestedThickness].every(Number.isFinite) || requestedLength <= 0 || requestedThickness <= 0) throw new Error('线条长度和线宽必须大于零')
    const limits = line_size_limits(original)
    const thickness = size.thickness === undefined ? original.thickness : Math.min(requestedThickness, limits.maxThickness)
    const length = Math.max(line_size_limits({ ...original, thickness }).minLength, requestedLength)
    const width = original.vertical ? thickness : length
    const height = original.vertical ? length : thickness
    return { type: 'line', x: element.x + (element.width - width) / 2, y: element.y + (element.height - height) / 2, width, height }
}
