import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { hit_test, qr_size, type Scene, type SceneElement } from '@/lib/studio'
import { resize_element, resize_text_element, rotate_element, type ResizeHandle } from '@/lib/studio/transform'
import { is_line_element } from '@/lib/studio/line-geometry'
import { select_box, snap_move, type SelectionBox, type SelectionGuide } from '@/lib/studio/selection'

export type CanvasAction = 'move' | 'rotate' | ResizeHandle
type ElementBox = Pick<SceneElement, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'fontSize'> & { type?: SceneElement['type'] }
type Point = { x: number; y: number }
type Gesture = {
    sceneId: string
    sceneWidth: number
    sceneHeight: number
    selectionKey: string
    pointerId: number
    snapshots: SceneElement[]
    elements: SceneElement[]
    action: CanvasAction | 'marquee'
    start: Point
    clientStart: Point
    patches: Record<string, ElementBox> | null
    moved: boolean
    baseIds: string[]
    box: SelectionBox | null
}
type Preview = { patches: Record<string, ElementBox>; action: CanvasAction; guides: SelectionGuide[] }

interface GestureProps {
    scene: Scene
    selectedId: string | null
    selectedIds?: readonly string[]
    stage: RefObject<HTMLDivElement | null>
    enabled: boolean
    snapping?: boolean
    on_select: (id: string | null) => void
    on_select_many?: (ids: string[]) => void
    on_change: (change: (current: Scene) => Scene, record?: boolean) => boolean
}

/**
 * 比较会影响手势来源的几何；局部预览未指定类型时沿用原图层类型。
 * @param first 当前几何或预览补丁。
 * @param second 手势开始时的几何快照。
 * @returns 坐标、尺寸、旋转及明确指定的类型一致时为 true。
 */
function same_box(first: ElementBox, second: ElementBox): boolean {
    return first.x === second.x && first.y === second.y && first.width === second.width && first.height === second.height
        && (first.rotation ?? 0) === (second.rotation ?? 0) && (first.type === undefined || second.type === undefined || first.type === second.type)
        && (first.type !== 'text' && first.fontSize === undefined || (first.fontSize ?? 20) === (second.fontSize ?? 20))
}

function selection_key(ids: readonly string[]): string {
    return JSON.stringify([...new Set(ids)].sort())
}

/**
 * 检查整段手势的来源几何，任一成员变化时放弃整组提交。
 * @param scene 当前作品，允许颜色等非几何属性更新。
 * @param state 手势开始时的作品尺寸和图层快照。
 * @returns 作品及全部来源图层仍可用于当前手势时为 true。
 */
function valid_geometry(scene: Scene, state: Gesture): boolean {
    if (scene.id !== state.sceneId || scene.width !== state.sceneWidth || scene.height !== state.sceneHeight) return false
    if (state.action === 'marquee' && scene.elements.length !== state.snapshots.length) return false
    return state.snapshots.every(original => {
        const current = scene.elements.find(element => element.id === original.id)
        return current && current.visible === original.visible && current.locked === original.locked && same_box(current, original)
            && (original.type !== 'text' || (current.text === original.text && current.fontFamily === original.fontFamily && current.fontWeight === original.fontWeight && current.align === original.align && current.verticalAlign === original.verticalAlign))
    })
}

/**
 * 在内存中预览框选、整体移动和单层变换，抬起指针时才提交一条可撤销编辑。
 * @param props 当前作品、选择集合、画布容器及兼容单选的编辑回调。
 * @returns 实时预览作品、选框、吸附参考线及画布指针事件。
 */
export function use_canvas_gesture({ scene, selectedId, selectedIds, stage, enabled, snapping = false, on_select, on_select_many, on_change }: GestureProps) {
    const gesture = useRef<Gesture | null>(null)
    const [preview, set_preview] = useState<Preview | null>(null)
    const [marquee, set_marquee] = useState<SelectionBox | null>(null)
    const [active, set_active] = useState(false)
    const ids = on_select_many && selectedIds ? [...new Set(selectedIds)] : selectedId ? [selectedId] : []
    const currentKey = selection_key(ids)

    /**
     * 将浏览器坐标转换成作品原生像素，允许从画布外空白开始框选。
     * @param event 当前指针事件。
     * @returns 作品像素坐标；画布不可见时返回空值。
     */
    function scene_point(event: PointerEvent): Point | null {
        const bounds = stage.current?.getBoundingClientRect()
        if (!bounds?.width || !bounds.height) return null
        return { x: (event.clientX - bounds.left) / bounds.width * scene.width, y: (event.clientY - bounds.top) / bounds.height * scene.height }
    }

    /**
     * 放弃手势、框选和参考线，不写入作品或撤销记录。
     * @returns 无返回值。
     */
    const cancel = useCallback(() => {
        const state = gesture.current
        gesture.current = null
        set_preview(null)
        set_marquee(null)
        set_active(false)
        if (state && stage.current?.hasPointerCapture?.(state.pointerId)) stage.current.releasePointerCapture(state.pointerId)
    }, [stage])

    useEffect(() => {
        const state = gesture.current
        if (state && (!enabled || currentKey !== state.selectionKey || !valid_geometry(scene, state))) cancel()
    })

    useEffect(() => {
        const on_key = (event: KeyboardEvent) => {
            if (!gesture.current) return
            if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z')) {
                event.preventDefault()
                event.stopImmediatePropagation()
                cancel()
            }
        }
        const on_blur = () => cancel()
        window.addEventListener('keydown', on_key, true)
        window.addEventListener('blur', on_blur)
        return () => { window.removeEventListener('keydown', on_key, true); window.removeEventListener('blur', on_blur) }
    }, [cancel])

    /**
     * 捕获主指针和全部来源快照，选择变化与拖动使用同一目标集合。
     * @param event 鼠标、笔或触摸指针事件。
     * @param nextIds 本次手势保留的选择集合。
     * @param action 整体移动、框选或单层变换。
     * @param baseIds 框选需叠加的原选择；普通框选为空。
     * @returns 无返回值。
     */
    function begin(event: PointerEvent, nextIds: string[], action: Gesture['action'], baseIds: string[] = []): void {
        if (!enabled || event.button !== 0 || event.isPrimary === false || gesture.current) return
        const point = scene_point(event)
        if (!point || !stage.current) return
        const selected = new Set(nextIds)
        const snapshots = scene.elements.filter(element => action === 'marquee' || selected.has(element.id)).map(element => ({ ...element }))
        const elements = snapshots.filter(element => selected.has(element.id) && element.visible && !element.locked)
        if (action !== 'marquee' && !elements.length) return
        if (action !== 'move' && action !== 'marquee' && nextIds.length !== 1) return
        event.preventDefault()
        event.stopPropagation()
        stage.current.focus({ preventScroll: true })
        stage.current.setPointerCapture?.(event.pointerId)
        gesture.current = {
            sceneId: scene.id, sceneWidth: scene.width, sceneHeight: scene.height, selectionKey: selection_key(nextIds), pointerId: event.pointerId,
            snapshots, elements, action, start: point, clientStart: { x: event.clientX, y: event.clientY }, patches: null, moved: false, baseIds, box: null,
        }
        set_active(true)
    }

    /**
     * 点击选择或增减成员，空白区域启动任意方向框选，已选成员保留整组拖动。
     * @param event 画布或其周围空白上的主指针事件。
     * @returns 无返回值。
     */
    function start_move(event: PointerEvent<HTMLDivElement>): void {
        if (!enabled || event.button !== 0 || event.isPrimary === false || gesture.current) return
        if (event.target instanceof Element && event.target.closest('button, input, textarea, select, a, [role="button"], [contenteditable="true"]')) return
        const point = scene_point(event)
        if (!point) return
        const bounds = stage.current?.getBoundingClientRect()
        const inside = point.x >= 0 && point.x <= scene.width && point.y >= 0 && point.y <= scene.height
        const element = inside ? hit_test(scene, point, bounds?.width ? 5 * scene.width / bounds.width : 4) : null
        if (!on_select_many) {
            on_select(element?.id ?? null)
            if (element) begin(event, [element.id], 'move')
            return
        }
        const adding = event.shiftKey || event.ctrlKey || event.metaKey
        if (!element) { begin(event, ids, 'marquee', adding ? ids : []); return }
        if (adding && ids.includes(element.id)) {
            event.preventDefault()
            event.stopPropagation()
            on_select_many(ids.filter(id => id !== element.id))
            return
        }
        const nextIds = ids.includes(element.id) ? ids : adding ? [...ids, element.id] : [element.id]
        if (selection_key(nextIds) !== currentKey) on_select_many(nextIds)
        begin(event, nextIds, 'move')
    }

    /**
     * 只对单一选中图层启动缩放或旋转，避免组选择被控制柄隐式拆散。
     * @param event 控制柄上的指针事件。
     * @param action 缩放方向或旋转。
     * @returns 无返回值。
     */
    function start_handle(event: PointerEvent<HTMLButtonElement>, action: Exclude<CanvasAction, 'move'>): void {
        event.stopPropagation()
        if (ids.length !== 1) return
        const element = scene.elements.find(item => item.id === ids[0])
        if (element?.visible && !element.locked) begin(event, ids, action)
    }

    /**
     * 从手势快照计算选框或同一位移，预览不会修改作品及撤销栈。
     * @param event 当前主指针事件。
     * @returns 无返回值。
     */
    function move(event: PointerEvent<HTMLDivElement>): void {
        const state = gesture.current
        if (!state || state.pointerId !== event.pointerId) return
        if (!enabled || currentKey !== state.selectionKey || !valid_geometry(scene, state)) { cancel(); return }
        const point = scene_point(event)
        if (!point) return
        if (!state.moved && Math.hypot(event.clientX - state.clientStart.x, event.clientY - state.clientStart.y) < 2) return
        state.moved = true
        if (state.action === 'marquee') {
            state.box = { x: Math.min(state.start.x, point.x), y: Math.min(state.start.y, point.y), width: Math.abs(point.x - state.start.x), height: Math.abs(point.y - state.start.y) }
            set_marquee(state.box)
            return
        }
        const patches = Object.create(null) as Record<string, ElementBox>
        let guides: SelectionGuide[] = []
        if (state.action === 'move') {
            const original = state.elements[0]
            let delta = { x: point.x - state.start.x, y: point.y - state.start.y }
            if (snapping || state.elements.length > 1) {
                const bounds = stage.current?.getBoundingClientRect()
                const snapped = snap_move(scene, state.elements.map(element => element.id), delta, snapping && !event.altKey && bounds?.width ? 5 * scene.width / bounds.width : 0)
                delta = snapped.delta
                guides = snapped.guides
            } else {
                delta = {
                    x: Math.max(-original.width + 8, Math.min(scene.width - 8, original.x + delta.x)) - original.x,
                    y: Math.max(-original.height + 8, Math.min(scene.height - 8, original.y + delta.y)) - original.y,
                }
            }
            delta = { x: Math.round(delta.x * 100) / 100, y: Math.round(delta.y * 100) / 100 }
            for (const original of state.elements) patches[original.id] = { x: original.x + delta.x, y: original.y + delta.y, width: original.width, height: original.height, rotation: original.rotation }
        } else {
            const original = state.elements[0]
            let patch: ElementBox
            if (state.action === 'rotate') patch = { ...original, rotation: rotate_element(original, state.start, point, event.shiftKey) }
            else if (original.type === 'text') patch = { ...original, ...resize_text_element(original, state.start, point, state.action) }
            else {
                const corner = state.action.length === 2
                const defaultRatio = original.type === 'image' && corner
                let minSize = 8
                if (original.type === 'qr') { try { minSize = qr_size(original.text) } catch { minSize = 8 } }
                patch = { ...original, ...resize_element(original, state.start, point, state.action, event.shiftKey ? !defaultRatio : defaultRatio, minSize), ...(is_line_element(original) ? { type: 'line' as const } : {}) }
            }
            patches[original.id] = { x: Math.round(patch.x * 100) / 100, y: Math.round(patch.y * 100) / 100, width: Math.round(patch.width * 100) / 100, height: Math.round(patch.height * 100) / 100, rotation: Math.round((patch.rotation ?? 0) * 100) / 100, ...(patch.type === 'line' ? { type: 'line' } : {}), ...(original.type === 'text' && patch.fontSize !== undefined ? { fontSize: patch.fontSize } : {}) }
        }
        state.patches = patches
        set_preview({ patches, action: state.action, guides })
    }

    /**
     * 框选仅更新选择，变换则原子提交全体成员；取消或外部几何变化不留下历史。
     * @param event 抬起的主指针事件。
     * @returns 无返回值。
     */
    function end(event: PointerEvent<HTMLDivElement>): void {
        const state = gesture.current
        if (!state || state.pointerId !== event.pointerId) return
        move(event)
        if (gesture.current !== state) return
        cancel()
        if (state.action === 'marquee') {
            const nextIds = [...new Set([...state.baseIds, ...(state.box ? select_box(scene, state.box) : [])])]
            if (selection_key(nextIds) !== currentKey) on_select_many?.(nextIds)
            return
        }
        const patches = state.patches
        if (!patches || state.elements.every(element => same_box(patches[element.id], element))) return
        on_change(current => {
            if (!valid_geometry(current, state)) return current
            return { ...current, elements: current.elements.map(element => patches[element.id] ? { ...element, ...patches[element.id] } : element) }
        })
    }

    const previewScene = preview ? { ...scene, elements: scene.elements.map(element => preview.patches[element.id] ? { ...element, ...preview.patches[element.id] } : element) } : scene
    return { scene: previewScene, action: preview?.action ?? null, guides: preview?.guides ?? [], marquee, active, start_move, start_handle, move, end, cancel }
}
