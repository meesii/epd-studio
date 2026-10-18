import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { create_image_scene, place_image, type ImageSource } from '@/lib/image-scene'
import { is_scene, validate_dimensions, type Scene } from '@/lib/studio'
import { same_fields } from '@/lib/same-fields'

type ImageSnapshot = { scene: Scene; source: ImageSource | null }

/**
 * 比较图片会话的可编辑字段；发送完成时同时比较版本时间，阻止旧结果清除新修改。
 * @param first 第一份画布。
 * @param second 第二份画布。
 * @param compareTime 是否也要求版本时间相同。
 * @returns 两份画布是否相同。
 */
function same_scene(first: Scene, second: Scene, compareTime = false): boolean {
    const keys = ['id', 'name', 'width', 'height', 'palette', 'background'] as const
    if (keys.some((key) => first[key] !== second[key]) || first.elements.length !== second.elements.length || (compareTime && first.updatedAt !== second.updatedAt)) return false
    return same_fields(first.processOptions, second.processOptions) && first.elements.every((element, index) => same_fields(element, second.elements[index]))
}

/**
 * 管理独立图片直传草稿及最多 50 步撤销，不访问 IndexedDB 或已保存作品。
 * @returns 图片画布、原图信息、发送状态及内存编辑操作。
 */
export function use_image_draft() {
    const [state, set_state] = useState(() => ({ snapshot: { scene: create_image_scene(), source: null } as ImageSnapshot, dirty: false, canUndo: false, canRedo: false }))
    const current = useRef(state.snapshot)
    const past = useRef<ImageSnapshot[]>([])
    const future = useRef<ImageSnapshot[]>([])

    /**
     * 同步更新内存状态，避免 StrictMode 重放 state updater 时重复移动历史。
     * @param snapshot 新的图片与源信息快照。
     * @param dirty 当前图片是否有尚未发送的修改。
     * @returns 无返回值。
     */
    const commit = useCallback((snapshot: ImageSnapshot, dirty: boolean) => {
        current.current = snapshot
        set_state({ snapshot, dirty, canUndo: past.current.length > 0, canRedo: future.current.length > 0 })
    }, [])

    /**
     * 更新单图画布，拒绝其他图层或无效尺寸；所有修改只在内存中进行。
     * @param change 对当前画布副本执行一次的修改。
     * @param record 是否建立撤销记录。
     * @returns 是否成功修改图片草稿。
     */
    const change_scene = useCallback((change: (scene: Scene) => Scene, record = true): boolean => {
        const original = current.current
        let next: Scene
        try {
            next = { ...change(structuredClone(original.scene)), id: original.scene.id, updatedAt: Date.now() }
            validate_dimensions(next.width, next.height)
            if (next.elements.length > 1 || next.elements.some((element) => element.type !== 'image')) throw new Error('图片直传只支持一个图片图层')
            if (!is_scene(next)) throw new Error('图片参数无效')
            if (next.elements.length && (!original.source || next.elements[0].src !== original.source.src)) throw new Error('请通过选择图片替换原图')
        } catch (error) {
            toast.error('无法调整图片', { description: error instanceof Error ? error.message : String(error) })
            return false
        }
        if (same_scene(original.scene, next)) return true
        if (record) past.current = [...past.current.slice(-49), original]
        future.current = []
        const source = next.elements.length ? original.source : null
        commit({ scene: next, source }, !!source)
        return true
    }, [commit])

    /**
     * 替换为新原图并把原图尺寸一起记录到历史，保证撤销后仍可按原比例适配。
     * @param image 已解码图片与文件名。
     * @returns 无返回值。
     */
    const import_image = useCallback((image: ImageSource): void => {
        try {
            const original = current.current
            const source = { ...image }
            const scene = place_image(original.scene, source)
            past.current = [...past.current.slice(-49), original]
            future.current = []
            commit({ scene, source }, true)
        } catch (error) {
            toast.error('无法导入图片', { description: error instanceof Error ? error.message : String(error) })
        }
    }, [commit])

    /**
     * 同时撤销或重做图片几何与原图信息，不触发保存或网络操作。
     * @param direction 撤销或重做方向。
     * @returns 无返回值。
     */
    const move_history = useCallback((direction: 'undo' | 'redo') => {
        const source = direction === 'undo' ? past.current : future.current
        const target = direction === 'undo' ? future.current : past.current
        const previous = source.pop()
        if (!previous) return
        target.push(current.current)
        if (target.length > 50) target.shift()
        commit({ ...previous, scene: { ...previous.scene, updatedAt: Date.now() } }, !!previous.source)
    }, [commit])

    /**
     * 仅当发送快照仍是当前图片版本时清除待发送标记，保留发送期间的新修改。
     * @param snapshot 此次实际发送的画布快照。
     * @returns 无返回值。
     */
    const mark_sent = useCallback((snapshot: Scene): void => {
        if (same_scene(current.current.scene, snapshot, true)) commit(current.current, false)
    }, [commit])

    return { scene: state.snapshot.scene, source: state.snapshot.source, dirty: state.dirty, change_scene, import_image, move_history, canUndo: state.canUndo, canRedo: state.canRedo, mark_sent }
}
