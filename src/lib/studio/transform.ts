import type { SceneElement } from './model'
import { is_line_element, line_size, line_size_limits } from './line-geometry'
import { fit_text_element, type TextMeasureContext } from './text-bounds'
import { pixel_font } from './text-font'

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface Point {
    x: number
    y: number
}

type ElementBounds = Pick<SceneElement, 'x' | 'y' | 'width' | 'height'>
type Axis = -1 | 0 | 1

const handleAxes: Record<ResizeHandle, { horizontal: Axis; vertical: Axis }> = {
    nw: { horizontal: -1, vertical: -1 },
    n: { horizontal: 0, vertical: -1 },
    ne: { horizontal: 1, vertical: -1 },
    e: { horizontal: 1, vertical: 0 },
    se: { horizontal: 1, vertical: 1 },
    s: { horizontal: 0, vertical: 1 },
    sw: { horizontal: -1, vertical: 1 },
    w: { horizontal: -1, vertical: 0 },
}

function validate_element(element: SceneElement, startPoint: Point, currentPoint: Point): void {
    if (![element.x, element.y, element.width, element.height, element.rotation ?? 0, startPoint.x, startPoint.y, currentPoint.x, currentPoint.y].every(Number.isFinite) || element.width <= 0 || element.height <= 0) {
        throw new Error('图层尺寸与指针坐标必须是有效数值')
    }
}

function rotated(point: Point, degrees: number): Point {
    const radians = degrees * Math.PI / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    return { x: point.x * cosine - point.y * sine, y: point.x * sine + point.y * cosine }
}

/**
 * 将任意有限角度归一化为 [-180, 180)，供拖动旋转和旋转按钮共用。
 * @param value 原始角度，以度为单位。
 * @returns 与原角度等效的规范角度，不返回负零。
 */
export function normalize_rotation(value: number): number {
    if (!Number.isFinite(value)) throw new Error('旋转角度必须是有限数值')
    if (value >= -180 && value < 180) return value === 0 ? 0 : value
    const result = ((value + 180) % 360 + 360) % 360 - 180
    return Object.is(result, -0) ? 0 : result
}

/**
 * 使用手势开始时的图层快照缩放，固定旋转后的对角或对边中点。
 * 锁比例的角点沿原对角线投影，边点沿对应轴缩放并对称调整另一轴。
 * @param element 手势开始时的图层，调用方每帧应传入同一快照。
 * @param startPoint 按下指针时的画布坐标，可以与手柄中心存在偏差。
 * @param currentPoint 当前指针的画布坐标。
 * @param handle 当前操作的缩放手柄。
 * @param keepRatio 是否保持原始比例；二维码无论此值为何均保持比例。
 * @param minSize 被调整轴的最小正像素尺寸；锁比例时同时约束两轴。
 * @returns 新的未旋转外框坐标与尺寸，不修改原图层或其旋转角。
 */
export function resize_element(element: SceneElement, startPoint: Point, currentPoint: Point, handle: ResizeHandle, keepRatio = false, minSize = 8): ElementBounds {
    validate_element(element, startPoint, currentPoint)
    if (!Number.isFinite(minSize) || minSize <= 0) throw new Error('最小图层尺寸必须大于零')
    const axes = handleAxes[handle]
    if (!axes || !Object.hasOwn(handleAxes, handle)) throw new Error('不支持的缩放手柄')
    const original = { x: element.x, y: element.y, width: element.width, height: element.height }
    const delta = { x: currentPoint.x - startPoint.x, y: currentPoint.y - startPoint.y }
    if (Math.abs(delta.x) < 1e-10 && Math.abs(delta.y) < 1e-10) return original
    const local = rotated(delta, -(element.rotation ?? 0))
    const line = is_line_element(element) ? line_size(element) : null
    const horizontal = line?.vertical ? 0 : axes.horizontal
    const vertical = line && !line.vertical ? 0 : axes.vertical
    let width = element.width
    let height = element.height
    if (line) {
        const { minLength } = line_size_limits(line)
        if (horizontal) width = Math.max(minLength, element.width + horizontal * local.x)
        if (vertical) height = Math.max(minLength, element.height + vertical * local.y)
    } else if (keepRatio || element.type === 'qr') {
        let scale: number
        if (horizontal && vertical) {
            // 正交投影避免主导轴切换时跳变，同时保持起始点不在手柄中心时也不跳动。
            scale = 1 + (horizontal * element.width * local.x + vertical * element.height * local.y) / (element.width ** 2 + element.height ** 2)
        } else if (horizontal) {
            scale = 1 + horizontal * local.x / element.width
        } else {
            scale = 1 + vertical * local.y / element.height
        }
        scale = Math.max(minSize / element.width, minSize / element.height, scale)
        width = element.width * scale
        height = element.height * scale
    } else {
        if (horizontal) width = Math.max(minSize, element.width + horizontal * local.x)
        if (vertical) height = Math.max(minSize, element.height + vertical * local.y)
    }
    const centerShift = rotated({
        x: horizontal * (width - element.width) / 2,
        y: vertical * (height - element.height) / 2,
    }, element.rotation ?? 0)
    return {
        x: element.x + element.width / 2 + centerShift.x - width / 2,
        y: element.y + element.height / 2 + centerShift.y - height / 2,
        width,
        height,
    }
}

/**
 * 将文字拖拽缩放转换成字号和自然内容尺寸，固定旋转后的对角或对边中点。
 * @param element 手势开始时的文字图层。
 * @param startPoint 按下指针时的画布坐标。
 * @param currentPoint 当前指针的画布坐标。
 * @param handle 正在拖动的缩放手柄。
 * @param context 可选文字测量上下文，浏览器默认复用已有测量画布。
 * @returns 字号及贴合文字的新外框；点阵字体只使用原生字号的整数倍。
 */
export function resize_text_element(element: SceneElement, startPoint: Point, currentPoint: Point, handle: ResizeHandle, context?: TextMeasureContext): ElementBounds & { fontSize: number } {
    const desired = resize_element(element, startPoint, currentPoint, handle, true, 0.001)
    const originalSize = element.fontSize ?? 20
    const pixel = pixel_font(element.fontFamily)
    const requested = originalSize * desired.width / element.width
    const maximum = Math.min(300, Math.floor(originalSize * 19998 / Math.max(element.width, element.height)))
    const fontSize = pixel
        ? Math.max(1, Math.min(Math.floor(maximum / pixel.size), Math.round(requested / pixel.size))) * pixel.size
        : Math.max(4, Math.min(maximum, Math.round(requested)))
    if (fontSize === originalSize || (startPoint.x === currentPoint.x && startPoint.y === currentPoint.y)) {
        return { x: element.x, y: element.y, width: element.width, height: element.height, fontSize: originalSize }
    }
    const ratio = fontSize / originalSize
    let fitted: SceneElement
    try { fitted = fit_text_element({ ...element, fontSize, width: element.width * ratio, height: element.height * ratio }, context) }
    catch { return { x: element.x, y: element.y, width: element.width, height: element.height, fontSize: originalSize } }
    const axes = handleAxes[handle]
    const shift = rotated({ x: axes.horizontal * (fitted.width - element.width) / 2, y: axes.vertical * (fitted.height - element.height) / 2 }, element.rotation ?? 0)
    return {
        x: element.x + element.width / 2 + shift.x - fitted.width / 2,
        y: element.y + element.height / 2 + shift.y - fitted.height / 2,
        width: fitted.width,
        height: fitted.height,
        fontSize,
    }
}

/**
 * 绕手势开始时的图层中心计算旋转增量，不依赖旋转手柄的绝对方向。
 * @param element 手势开始时的图层快照。
 * @param startPoint 按下指针时的画布坐标。
 * @param currentPoint 当前指针的画布坐标。
 * @param snap 是否吸附到最接近的 15 度角度。
 * @returns [-180, 180) 内的新角度，中心或无位移指针保留原角度。
 */
export function rotate_element(element: SceneElement, startPoint: Point, currentPoint: Point, snap = false): number {
    validate_element(element, startPoint, currentPoint)
    const original = normalize_rotation(element.rotation ?? 0)
    const center = { x: element.x + element.width / 2, y: element.y + element.height / 2 }
    const start = { x: startPoint.x - center.x, y: startPoint.y - center.y }
    const current = { x: currentPoint.x - center.x, y: currentPoint.y - center.y }
    if (Math.hypot(currentPoint.x - startPoint.x, currentPoint.y - startPoint.y) < 1e-10 || Math.hypot(start.x, start.y) < 1e-10 || Math.hypot(current.x, current.y) < 1e-10) return original
    const delta = normalize_rotation((Math.atan2(current.y, current.x) - Math.atan2(start.y, start.x)) * 180 / Math.PI)
    const angle = original + delta
    return normalize_rotation(snap ? Math.round(angle / 15) * 15 : angle)
}
