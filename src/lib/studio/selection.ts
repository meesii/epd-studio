import type { Scene, SceneElement } from './model'

export type SelectionBox = { x: number; y: number; width: number; height: number }
export type SelectionGuide = { axis: 'x' | 'y'; position: number }
export type AlignAction = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom' | 'center'
export type DistributeAxis = 'horizontal' | 'vertical'

type Point = { x: number; y: number }
type AxisTarget = { position: number; canvas: boolean }
type MoveRange = { min: number; max: number }

const epsilon = 1e-8

function element_axes(element: SceneElement): { cosine: number; sine: number } {
    const radians = ((element.rotation ?? 0) % 360) * Math.PI / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    return { cosine: Math.abs(cosine) < 1e-12 ? 0 : cosine, sine: Math.abs(sine) < 1e-12 ? 0 : sine }
}

function normalized_box(box: SelectionBox): SelectionBox {
    return { x: Math.min(box.x, box.x + box.width), y: Math.min(box.y, box.y + box.height), width: Math.abs(box.width), height: Math.abs(box.height) }
}

/**
 * 计算图层绕中心旋转后在画布坐标中的轴对齐边界。
 * @param element 当前图层。
 * @returns 包含整个旋转图层的最小轴对齐矩形。
 */
export function element_box(element: SceneElement): SelectionBox {
    const { cosine, sine } = element_axes(element)
    const width = Math.abs(cosine) * element.width + Math.abs(sine) * element.height
    const height = Math.abs(sine) * element.width + Math.abs(cosine) * element.height
    return { x: element.x + (element.width - width) / 2, y: element.y + (element.height - height) / 2, width, height }
}

/**
 * 合并多个图层的旋转边界，保持调用方传入的成员集合。
 * @param elements 需要组成选区的图层。
 * @returns 整组选区的轴对齐边界；没有成员时返回 null。
 */
export function selection_box(elements: readonly SceneElement[]): SelectionBox | null {
    if (!elements.length) return null
    const boxes = elements.map(element_box)
    const left = Math.min(...boxes.map(box => box.x))
    const top = Math.min(...boxes.map(box => box.y))
    const right = Math.max(...boxes.map(box => box.x + box.width))
    const bottom = Math.max(...boxes.map(box => box.y + box.height))
    return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * 使用两个矩形的四条分离轴判断相交，排除旋转图层 AABB 中的空白角落。
 * @param element 待命中的旋转图层。
 * @param box 已归一化的框选矩形。
 * @returns 实际矩形相交或边缘接触时为 true。
 */
function intersects_box(element: SceneElement, box: SelectionBox): boolean {
    const { cosine, sine } = element_axes(element)
    const offsetX = box.x + box.width / 2 - element.x - element.width / 2
    const offsetY = box.y + box.height / 2 - element.y - element.height / 2
    const elementHalfWidth = element.width / 2
    const elementHalfHeight = element.height / 2
    const boxHalfWidth = box.width / 2
    const boxHalfHeight = box.height / 2
    return Math.abs(offsetX) <= boxHalfWidth + Math.abs(cosine) * elementHalfWidth + Math.abs(sine) * elementHalfHeight + epsilon
        && Math.abs(offsetY) <= boxHalfHeight + Math.abs(sine) * elementHalfWidth + Math.abs(cosine) * elementHalfHeight + epsilon
        && Math.abs(offsetX * cosine + offsetY * sine) <= elementHalfWidth + Math.abs(cosine) * boxHalfWidth + Math.abs(sine) * boxHalfHeight + epsilon
        && Math.abs(-offsetX * sine + offsetY * cosine) <= elementHalfHeight + Math.abs(sine) * boxHalfWidth + Math.abs(cosine) * boxHalfHeight + epsilon
}

/**
 * 框选实际相交的可编辑图层，允许向任意方向拖出矩形。
 * @param scene 当前作品。
 * @param box 拖动产生的矩形，宽高可以为负数。
 * @returns 按作品图层顺序排列的可见、未锁定图层标识。
 */
export function select_box(scene: Scene, box: SelectionBox): string[] {
    if (![box.x, box.y, box.width, box.height].every(Number.isFinite)) return []
    const bounds = normalized_box(box)
    return scene.elements.filter(element => element.visible && !element.locked && intersects_box(element, bounds)).map(element => element.id)
}

function movable_elements(scene: Scene, ids: readonly string[]): SceneElement[] {
    const selected = new Set(ids)
    return scene.elements.filter(element => selected.has(element.id) && element.visible && !element.locked)
}

function axis_positions(start: number, size: number): number[] {
    return [start, start + size / 2, start + size]
}

function move_range(start: number, size: number, canvasSize: number): MoveRange {
    const visible = Math.min(8, size, canvasSize)
    return { min: visible - start - size, max: canvasSize - visible - start }
}

function clamp_move(value: number, range: MoveRange): number {
    return Math.max(range.min, Math.min(range.max, value))
}

/**
 * 在单轴上选取最近吸附目标，同距离时优先画布参考线。
 * @param sources 移动前选区的边缘与中心。
 * @param targets 画布和其他可见图层的边缘与中心。
 * @param delta 已限制画布边界的移动距离。
 * @param threshold 以画布像素计的吸附阈值。
 * @param range 保留部分选区在画布中的移动范围。
 * @returns 吸附后的距离及对应参考线；没有目标时保留原距离。
 */
function snap_axis(sources: number[], targets: AxisTarget[], delta: number, threshold: number, range: MoveRange): { delta: number; position?: number } {
    let best: { distance: number; canvas: boolean; delta: number; position: number } | null = null
    for (const target of targets) {
        for (const source of sources) {
            const nextDelta = target.position - source
            const distance = Math.abs(nextDelta - delta)
            if (distance > threshold + epsilon || nextDelta < range.min - epsilon || nextDelta > range.max + epsilon) continue
            if (!best || distance < best.distance - epsilon || (Math.abs(distance - best.distance) <= epsilon && target.canvas && !best.canvas)) {
                best = { distance, canvas: target.canvas, delta: clamp_move(nextDelta, range), position: target.position }
            }
        }
    }
    return best ? { delta: best.delta, position: best.position } : { delta }
}

/**
 * 将可移动选区整体吸附到画布或其他可见图层，每轴保留 8 像素交集，较小图层或画布则保留该轴全长。
 * @param scene 当前作品。
 * @param ids 选中的图层标识；隐藏或锁定成员不移动。
 * @param delta 从手势起点累计的整体移动距离。
 * @param threshold 调用方按显示倍率换算的画布像素阈值；小于等于零时关闭吸附和参考线。
 * @returns 受画布边界限制的整体位移，以及至多各一条横纵参考线；不修改作品。
 */
export function snap_move(scene: Scene, ids: readonly string[], delta: Point, threshold: number): { delta: Point; guides: SelectionGuide[] } {
    const bounds = selection_box(movable_elements(scene, ids))
    if (!bounds) return { delta: { x: 0, y: 0 }, guides: [] }
    const horizontalRange = move_range(bounds.x, bounds.width, scene.width)
    const verticalRange = move_range(bounds.y, bounds.height, scene.height)
    const moved = {
        x: clamp_move(Number.isFinite(delta.x) ? delta.x : 0, horizontalRange),
        y: clamp_move(Number.isFinite(delta.y) ? delta.y : 0, verticalRange),
    }
    if (!(threshold > 0) || !Number.isFinite(threshold)) return { delta: moved, guides: [] }
    const selected = new Set(ids)
    const horizontalTargets: AxisTarget[] = axis_positions(0, scene.width).map(position => ({ position, canvas: true }))
    const verticalTargets: AxisTarget[] = axis_positions(0, scene.height).map(position => ({ position, canvas: true }))
    for (const element of scene.elements) {
        if (!element.visible || selected.has(element.id)) continue
        const target = element_box(element)
        horizontalTargets.push(...axis_positions(target.x, target.width).map(position => ({ position, canvas: false })))
        verticalTargets.push(...axis_positions(target.y, target.height).map(position => ({ position, canvas: false })))
    }
    const horizontal = snap_axis(axis_positions(bounds.x, bounds.width), horizontalTargets, moved.x, threshold, horizontalRange)
    const vertical = snap_axis(axis_positions(bounds.y, bounds.height), verticalTargets, moved.y, threshold, verticalRange)
    const guides: SelectionGuide[] = []
    if (horizontal.position !== undefined) guides.push({ axis: 'x', position: horizontal.position })
    if (vertical.position !== undefined) guides.push({ axis: 'y', position: vertical.position })
    return { delta: { x: horizontal.delta, y: vertical.delta }, guides }
}

/**
 * 将可移动选区作为整体相对画布对齐，保留成员之间的距离和旋转。
 * @param scene 当前作品。
 * @param ids 选中的图层标识；隐藏或锁定成员保持原位。
 * @param action 画布边缘、中线或水平与垂直同时居中的对齐动作。
 * @returns 更新了成员位置的作品；没有可移动成员或位置无需变化时返回原引用。
 */
export function align_selection(scene: Scene, ids: readonly string[], action: AlignAction): Scene {
    const elements = movable_elements(scene, ids)
    const bounds = selection_box(elements)
    if (!bounds) return scene
    const delta = { x: 0, y: 0 }
    if (action === 'left') delta.x = -bounds.x
    else if (action === 'right') delta.x = scene.width - bounds.x - bounds.width
    else if (action === 'top') delta.y = -bounds.y
    else if (action === 'bottom') delta.y = scene.height - bounds.y - bounds.height
    else if (action !== 'centerX' && action !== 'centerY' && action !== 'center') return scene
    if (action === 'centerX' || action === 'center') delta.x = (scene.width - bounds.width) / 2 - bounds.x
    if (action === 'centerY' || action === 'center') delta.y = (scene.height - bounds.height) / 2 - bounds.y
    if (Math.abs(delta.x) <= epsilon && Math.abs(delta.y) <= epsilon) return scene
    const moving = new Set(elements.map(element => element.id))
    return { ...scene, elements: scene.elements.map(element => moving.has(element.id) ? { ...element, x: element.x + delta.x, y: element.y + delta.y } : element) }
}

/**
 * 将选中图层分别对齐到参考边缘或中线，使用旋转后的真实外接边界。
 * @param scene 当前作品。
 * @param ids 按选择先后排列的图层标识，锁定及隐藏图层不作为参考也不移动。
 * @param action 参考范围的目标边缘或中心。
 * @param target 使用第一个有效选中图层或整张画布作为对齐参考。
 * @returns 各成员独立移动后的作品；没有有效参考或无需变化时保留原引用。
 */
export function align_layers(scene: Scene, ids: readonly string[], action: AlignAction, target: 'selection' | 'canvas' = 'selection'): Scene {
    const members = movable_elements(scene, ids)
    const membersById = new Map(members.map(element => [element.id, element]))
    const reference = ids.map(id => membersById.get(id)).find(element => element !== undefined)
    const bounds = target === 'canvas' ? { x: 0, y: 0, width: scene.width, height: scene.height } : reference ? element_box(reference) : null
    if (!members.length || (target === 'selection' && members.length < 2) || !bounds) return scene
    const targets = new Set(members.map(element => element.id))
    return patch_selection(scene, [...targets], element => {
        if (target === 'selection' && element.id === reference?.id) return {}
        const box = element_box(element)
        let deltaX = 0
        let deltaY = 0
        if (action === 'left') deltaX = bounds.x - box.x
        if (action === 'right') deltaX = bounds.x + bounds.width - box.x - box.width
        if (action === 'top') deltaY = bounds.y - box.y
        if (action === 'bottom') deltaY = bounds.y + bounds.height - box.y - box.height
        if (action === 'centerX' || action === 'center') deltaX = bounds.x + bounds.width / 2 - box.x - box.width / 2
        if (action === 'centerY' || action === 'center') deltaY = bounds.y + bounds.height / 2 - box.y - box.height / 2
        return { x: Math.abs(deltaX) <= epsilon ? element.x : element.x + deltaX, y: Math.abs(deltaY) <= epsilon ? element.y : element.y + deltaY }
    })
}

/**
 * 按空间位置等间距排列图层，固定两端，保持各自尺寸及另一轴的位置。
 * @param scene 当前作品。
 * @param ids 待分布的图层标识；重复、隐藏或锁定成员不参与。
 * @param axis 水平或垂直方向，间距按旋转后的外接边界计算；空间不足时均匀重叠。
 * @returns 分布后的作品；不足三个有效成员、已等距或固定两端无法保持空间次序时返回原引用。
 */
export function distribute_layers(scene: Scene, ids: readonly string[], axis: DistributeAxis): Scene {
    const position = axis === 'horizontal' ? 'x' : 'y'
    const size = axis === 'horizontal' ? 'width' : 'height'
    const members = movable_elements(scene, ids).map(element => ({ element, box: element_box(element) }))
    const compare = (first: typeof members[number], second: typeof members[number]): number => first.box[position] - second.box[position]
        || first.box[size] - second.box[size] || first.element.id.localeCompare(second.element.id)
    members.sort(compare)
    if (members.length < 3) return scene
    const first = members[0]
    const last = members[members.length - 1]
    const totalSize = members.reduce((sum, member) => sum + member.box[size], 0)
    const gap = (last.box[position] + last.box[size] - first.box[position] - totalSize) / (members.length - 1)
    const positions = new Map<string, number>()
    let cursor = first.box[position] + first.box[size] + gap
    let previousStart = first.box[position]
    for (const member of members.slice(1, -1)) {
        // 过度重叠时不能让中间成员越过端点，否则下次分布会更换端点并持续漂移。
        if (cursor < previousStart - epsilon || cursor > last.box[position] + epsilon) return scene
        const delta = cursor - member.box[position]
        if (Math.abs(delta) > epsilon) positions.set(member.element.id, member.element[position] + delta)
        previousStart = cursor
        cursor += member.box[size] + gap
    }
    const placed = members.map(member => {
        const next = positions.get(member.element.id)
        return next === undefined ? member : { element: member.element, box: element_box({ ...member.element, [position]: next }) }
    }).sort(compare)
    // 同位成员还会按尺寸及标识排序，必须连同这些条件保序，防止再次分布更换端点。
    if (placed.some((member, index) => member.element.id !== members[index].element.id)) return scene
    return patch_selection(scene, [...positions.keys()], element => ({ [position]: positions.get(element.id)! }))
}

/**
 * 在同一次作品更新中批量修改选中图层，保留未改变的对象及锁定图层。
 * @param scene 当前作品。
 * @param ids 待修改的图层标识。
 * @param change 为每个成员计算属性修改，可保留各自不同的未编辑值。
 * @returns 更新后的作品；所有属性均未变化时保留原引用。
 */
export function patch_selection(scene: Scene, ids: readonly string[], change: (element: SceneElement) => Partial<SceneElement>): Scene {
    const targets = new Set(ids)
    let changed = false
    const elements = scene.elements.map(element => {
        if (!targets.has(element.id) || element.locked) return element
        const patch = change(element)
        if (!(Object.keys(patch) as (keyof SceneElement)[]).some(key => !Object.is(element[key], patch[key]))) return element
        changed = true
        return { ...element, ...patch }
    })
    return changed ? { ...scene, elements } : scene
}
