import { useEffect, useRef } from 'react'
import { has_open_overlay, is_input_target } from '@/lib/input-target'
import type { Scene } from '@/lib/studio'

interface NudgeProps {
    scene: Scene
    selectedId: string | null
    selectedIds?: readonly string[]
    enabled: boolean
    pointerActive: boolean
    on_change: (change: (current: Scene) => Scene, record?: boolean) => boolean
    on_delete?: () => void
    on_select_all?: () => void
    on_clear_selection?: () => void
}

const directions: Record<string, { x: number; y: number }> = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
}

/**
 * 处理选中图层的微移与删除，连续按住方向键只记录一次撤销。
 * @param props 当前草稿、选择状态、指针手势状态及同步编辑回调。
 * @returns 无返回值；监听器随工作台卸载释放。
 */
export function use_layer_nudge(props: NudgeProps): void {
    const latest = useRef(props)
    latest.current = props
    const resetHold = useRef<() => void>(() => {})
    const selectedIds = props.selectedIds ?? (props.selectedId ? [props.selectedId] : [])
    const selected = new Set(selectedIds)
    const selectionState = JSON.stringify([...selected].sort().map(id => {
        const element = props.scene.elements.find(item => item.id === id)
        return [id, element?.visible, element?.locked]
    }))

    useEffect(() => { resetHold.current() }, [props.scene.id, selectionState, props.enabled, props.pointerActive])

    useEffect(() => {
        const owner = document
        const view = owner.defaultView
        if (!view) return
        const pressed = new Set<string>()
        const pointers = new Set<number>()
        let recorded = false
        let composing = false

        function reset(): void {
            pressed.clear()
            recorded = false
        }
        resetHold.current = reset

        /**
         * 保护输入控件与手势交互，整组微移长按共用一次撤销，选择与删除只响应首次按下。
         * @param event 当前键盘事件。
         * @returns 无返回值。
         */
        function key_down(event: KeyboardEvent): void {
            const direction = directions[event.key]
            const deleting = event.key === 'Delete' && !!latest.current.on_delete
            const selectingAll = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && !!latest.current.on_select_all
            const clearing = event.key === 'Escape' && !!latest.current.on_clear_selection
            if ((!selectingAll && (event.ctrlKey || event.metaKey)) || event.altKey || event.isComposing || event.keyCode === 229 || composing) { reset(); return }
            if (!direction && !deleting && !selectingAll && !clearing) {
                if (event.key !== 'Shift') reset()
                return
            }
            const current = latest.current
            const ids = new Set(current.selectedIds ?? (current.selectedId ? [current.selectedId] : []))
            const elements = current.scene.elements.filter(item => ids.has(item.id))
            if (event.defaultPrevented || !current.enabled || current.pointerActive || pointers.size
                || (!selectingAll && !elements.length)
                || event.composedPath().some(is_input_target) || is_input_target(owner.activeElement) || has_open_overlay(owner)) {
                reset()
                return
            }
            if (selectingAll || clearing) {
                reset()
                if (event.repeat) return
                event.preventDefault()
                if (selectingAll) current.on_select_all?.()
                else current.on_clear_selection?.()
                return
            }
            if (deleting) {
                reset()
                if (event.repeat) return
                event.preventDefault()
                current.on_delete?.()
                return
            }
            if (!elements.some(element => element.visible && !element.locked)) { reset(); return }
            // 失焦、换图层或指针操作后的旧重复事件不能开始新的编辑。
            if (event.repeat && !pressed.has(event.key)) return
            pressed.add(event.key)
            event.preventDefault()
            const step = event.shiftKey ? 10 : 1
            let moved = false
            const accepted = current.on_change(scene => {
                if (scene.id !== current.scene.id) return scene
                const targets = scene.elements.filter(item => ids.has(item.id) && item.visible && !item.locked)
                if (!targets.length || targets.some(target => !Number.isFinite(target.x) || !Number.isFinite(target.y))) return scene
                const minX = Math.max(...targets.map(target => -20000 - target.x))
                const maxX = Math.min(...targets.map(target => 20000 - target.x))
                const minY = Math.max(...targets.map(target => -20000 - target.y))
                const maxY = Math.min(...targets.map(target => 20000 - target.y))
                const deltaX = Math.max(minX, Math.min(maxX, direction.x * step))
                const deltaY = Math.max(minY, Math.min(maxY, direction.y * step))
                if (minX > maxX || minY > maxY || (!deltaX && !deltaY)) return scene
                const moving = new Set(targets.map(target => target.id))
                moved = true
                return { ...scene, elements: scene.elements.map(item => moving.has(item.id) ? { ...item, x: item.x + deltaX, y: item.y + deltaY } : item) }
            }, !recorded)
            if (accepted && moved) recorded = true
            if (!accepted) reset()
        }

        function key_up(event: KeyboardEvent): void {
            pressed.delete(event.key)
            if (!pressed.size) reset()
        }
        function pointer_down(event: PointerEvent): void { reset(); pointers.add(event.pointerId) }
        function pointer_end(event: PointerEvent): void { pointers.delete(event.pointerId) }
        function blur(): void { reset(); pointers.clear(); composing = false }
        function composition_start(): void { reset(); composing = true }
        function composition_end(): void { reset(); composing = false }
        function visibility_change(): void { if (owner.visibilityState === 'hidden') blur() }

        view.addEventListener('keydown', key_down)
        view.addEventListener('keyup', key_up)
        view.addEventListener('pointerdown', pointer_down, true)
        view.addEventListener('pointerup', pointer_end, true)
        view.addEventListener('pointercancel', pointer_end, true)
        view.addEventListener('blur', blur)
        owner.addEventListener('focusin', reset)
        owner.addEventListener('compositionstart', composition_start)
        owner.addEventListener('compositionend', composition_end)
        owner.addEventListener('visibilitychange', visibility_change)
        return () => {
            resetHold.current = () => {}
            view.removeEventListener('keydown', key_down)
            view.removeEventListener('keyup', key_up)
            view.removeEventListener('pointerdown', pointer_down, true)
            view.removeEventListener('pointerup', pointer_end, true)
            view.removeEventListener('pointercancel', pointer_end, true)
            view.removeEventListener('blur', blur)
            owner.removeEventListener('focusin', reset)
            owner.removeEventListener('compositionstart', composition_start)
            owner.removeEventListener('compositionend', composition_end)
            owner.removeEventListener('visibilitychange', visibility_change)
        }
    }, [])
}
