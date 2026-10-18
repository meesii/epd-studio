import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { clone_scene, fit_scene_text, validate_dimensions, type Scene } from '@/lib/studio'
import { load_workspace, named_scene, save_workspace, validate_scene, validate_workspace, type Workspace, type TransferRecord } from '@/lib/storage'
import { same_fields } from '@/lib/same-fields'

type SaveState = 'loading' | 'unsaved' | 'saving' | 'saved' | 'error'

/**
 * 比较可编辑内容，忽略时间戳，使撤销回保存版本时恢复为未修改状态。
 * @param first 当前草稿。
 * @param second 当前会话最后保存的草稿。
 * @returns 两份作品的编辑内容是否相同。
 */
function same_scene(first: Scene | null, second: Scene | null): boolean {
    if (!first || !second) return first === second
    const keys = ['id', 'name', 'width', 'height', 'palette', 'background'] as const
    if (keys.some((key) => first[key] !== second[key]) || first.elements.length !== second.elements.length) return false
    return same_fields(first.processOptions, second.processOptions) && first.elements.every((item, index) => same_fields(item, second.elements[index]))
}

/**
 * 原子重测内存快照，尺寸超限时保留全部原布局，避免草稿与保存基线失配。
 * @param scenes 当前草稿、基线或编辑历史。
 * @returns 全部适配成功的快照；失败时返回原数组。
 */
function fit_memory(scenes: (Scene | null)[]): (Scene | null)[] {
    try { return scenes.map((scene) => scene ? fit_scene_text(scene) : null) }
    catch (error) {
        toast.error('文字自动贴合失败，已保留原布局', { description: error instanceof Error ? error.message : String(error) })
        return scenes
    }
}

/**
 * 将内存草稿与已保存作品分开管理，只有明确保存才将草稿写入作品库。
 * @returns 草稿、已保存工作区及显式保存和切换操作。
 */
export function use_workspace() {
    const [workspace, set_workspace] = useState<Workspace | null>(null)
    const [scene, set_scene] = useState<Scene | null>(null)
    const [saveState, set_save_state] = useState<SaveState>('loading')
    const [dirty, set_dirty] = useState(false)
    const [isNew, set_is_new] = useState(false)
    const [, set_history_tick] = useState(0)
    const currentWorkspace = useRef<Workspace | null>(null)
    const currentDraft = useRef<Scene | null>(null)
    const savedDraft = useRef<Scene | null>(null)
    const draftSession = useRef(0)
    const blockedSave = useRef(false)
    const lastError = useRef<number | null>(null)
    const mounted = useRef(false)
    const pendingSaves = useRef(new Map<number, number>())
    const past = useRef<Scene[]>([])
    const future = useRef<Scene[]>([])
    const writes = useRef<Promise<unknown>>(Promise.resolve())

    /**
     * 读取最新草稿状态，供异步操作结束后检查，避免闭包中的 dirty 已过期。
     * @returns 当前是否存在未保存的草稿内容。
     */
    const has_changes = useCallback((): boolean => {
        const draft = currentDraft.current
        return !!draft && (!savedDraft.current || !same_scene(draft, savedDraft.current))
    }, [])

    /**
     * 计算当前草稿的保存状态，进行中的旧会话保存不能影响新草稿。
     * @returns 无返回值。
     */
    const show_draft = useCallback(() => {
        if (!mounted.current) return
        const draft = currentDraft.current
        const changed = has_changes()
        set_scene(draft)
        set_dirty(changed)
        set_is_new(!!draft && !currentWorkspace.current?.scenes.some((item) => item.id === draft.id))
        const pending = pendingSaves.current.get(draftSession.current) ?? 0
        set_save_state(blockedSave.current || lastError.current === draftSession.current ? 'error' : pending ? 'saving' : changed ? 'unsaved' : 'saved')
    }, [has_changes])

    /**
     * 替换当前内存草稿并建立独立编辑历史。
     * @param draft 要编辑的作品；空值表示清空工作台。
     * @param base 当前会话对应的已保存版本，新作品为空。
     * @returns 无返回值。
     */
    const select_draft = useCallback((draft: Scene | null, base: Scene | null) => {
        draftSession.current += 1
        const [nextDraft, nextBase] = fit_memory([draft ? structuredClone(draft) : null, base ? structuredClone(base) : null])
        currentDraft.current = nextDraft
        savedDraft.current = nextBase
        past.current = []
        future.current = []
        if (mounted.current) set_history_tick((tick) => tick + 1)
        show_draft()
    }, [show_draft])

    /**
     * 离开工作台时清除内存编辑会话，保留已明确保存的作品和进行中的保存请求。
     * @returns 无返回值。
     */
    const clear_draft = useCallback((): void => {
        select_draft(null, null)
    }, [select_draft])

    /**
     * 校验并串行提交明确的工作区操作，始终以队列执行时的已保存库为基础。
     * @param change 对已保存工作区进行修改的纯函数。
     * @param done 成功写入后的会话更新。
     * @returns 写入是否成功。
     */
    const write_workspace = useCallback((change: (value: Workspace) => Workspace, done?: (value: Workspace) => void): Promise<boolean> => {
        const session = draftSession.current
        if (blockedSave.current || !currentWorkspace.current) {
            lastError.current = session
            show_draft()
            toast.error('本地存储不可用，请导出草稿备份后重试')
            return Promise.resolve(false)
        }
        const task = writes.current.catch(() => {}).then(async () => {
            if (blockedSave.current || !currentWorkspace.current) return false
            const next = validate_workspace(change(structuredClone(currentWorkspace.current)))
            await save_workspace(next)
            currentWorkspace.current = next
            lastError.current = null
            if (mounted.current) {
                set_workspace(next)
                done?.(next)
                show_draft()
            }
            return true
        }).catch((error: unknown) => {
            lastError.current = session
            if (mounted.current) {
                show_draft()
                toast.error('保存失败，已保留内存草稿', { description: error instanceof Error ? error.message : String(error) })
            }
            return false
        })
        writes.current = task
        return task
    }, [show_draft])

    useEffect(() => {
        let active = true
        mounted.current = true
        load_workspace().then((value) => {
            if (!active) return
            blockedSave.current = false
            currentWorkspace.current = value
            set_workspace(value)
            clear_draft()
        }).catch((error: Error) => {
            if (!active) return
            blockedSave.current = true
            const empty: Workspace = { version: 1, scenes: [], activeSceneId: null, history: [], deviceAliases: {} }
            currentWorkspace.current = empty
            set_workspace(empty)
            clear_draft()
            toast.error('本地存储不可用，请导出草稿备份', { description: error.message })
        })
        return () => { active = false; mounted.current = false }
    }, [clear_draft])

    useEffect(() => {
        if (typeof document === 'undefined' || !document.fonts) return
        const fonts = document.fonts
        let active = true
        /**
         * 字体可用后同步重测内存草稿、保存基线和历史，不改变作品库。
         * @returns 无返回值。
         */
        const refit = () => {
            if (!active || !mounted.current) return
            const pastLength = past.current.length
            const [draft, base, ...history] = fit_memory([currentDraft.current, savedDraft.current, ...past.current, ...future.current])
            currentDraft.current = draft
            savedDraft.current = base
            past.current = history.slice(0, pastLength).filter((item): item is Scene => item !== null)
            future.current = history.slice(pastLength).filter((item): item is Scene => item !== null)
            show_draft()
        }
        void fonts.ready.then(refit).catch(() => {})
        fonts.addEventListener?.('loadingdone', refit)
        return () => { active = false; fonts.removeEventListener?.('loadingdone', refit) }
    }, [show_draft])

    /**
     * 只修改内存草稿，更新撤销历史但不改已保存作品。
     * @param change 对草稿副本执行一次的编辑回调。
     * @param record 是否加入撤销历史。
     * @returns 是否成功修改草稿。
     */
    const change_scene = useCallback((change: (current: Scene) => Scene, record = true): boolean => {
        const original = currentDraft.current
        if (!original) return false
        let next: Scene
        try {
            next = fit_scene_text({ ...change(structuredClone(original)), id: original.id, updatedAt: Date.now() })
            validate_dimensions(next.width, next.height)
            if (next.elements.length > 200) throw new Error('每个作品最多包含 200 个图层')
            if (new Set(next.elements.map((item) => item.id)).size !== next.elements.length) throw new Error('图层 ID 不能重复')
        } catch (error) {
            toast.error('无法修改作品', { description: error instanceof Error ? error.message : String(error) })
            return false
        }
        if (same_scene(original, next)) return true
        if (record) past.current = [...past.current.slice(-49), original]
        future.current = []
        currentDraft.current = next
        set_history_tick((tick) => tick + 1)
        show_draft()
        return true
    }, [show_draft])

    /**
     * 明确保存点击时的草稿快照，保存途中继续编辑会保持未保存状态。
     * @returns 本次请求的草稿快照是否已成功写入。
     */
    const save_scene = useCallback(async (): Promise<boolean> => {
        const draft = currentDraft.current
        if (!draft) return false
        let snapshot: Scene
        try {
            snapshot = validate_scene(named_scene(fit_scene_text(draft)))
        } catch (error) {
            toast.error('无法保存作品', { description: error instanceof Error ? error.message : String(error) })
            return false
        }
        const session = draftSession.current
        const original = structuredClone(draft)
        lastError.current = null
        pendingSaves.current.set(session, (pendingSaves.current.get(session) ?? 0) + 1)
        show_draft()
        const success = await write_workspace((value) => {
            const exists = value.scenes.some((item) => item.id === snapshot.id)
            if (!exists && value.scenes.length >= 100) throw new Error('工作区最多保存 100 个作品，请先导出或删除部分作品')
            return {
                ...value,
                scenes: exists ? value.scenes.map((item) => item.id === snapshot.id ? snapshot : item) : [...value.scenes, snapshot],
                activeSceneId: snapshot.id,
            }
        })
        if (success && draftSession.current === session && currentDraft.current?.id === original.id) savedDraft.current = fit_memory([original])[0]
        const remaining = (pendingSaves.current.get(session) ?? 1) - 1
        if (remaining) pendingSaves.current.set(session, remaining)
        else pendingSaves.current.delete(session)
        show_draft()
        return success
    }, [show_draft, write_workspace])

    /**
     * 打开已保存作品；脏草稿必须先保存或由用户明确放弃。
     * @param id 已保存作品 ID。
     * @param discard 是否已获得放弃当前草稿的明确确认。
     * @returns 是否成功打开作品。
     */
    const open_scene = useCallback((id: string, discard = false): boolean => {
        const value = currentWorkspace.current
        const target = value?.scenes.find((item) => item.id === id)
        if (!value || !target || (!discard && has_changes())) return false
        const next = { ...value, activeSceneId: id }
        currentWorkspace.current = next
        set_workspace(next)
        select_draft(target, target)
        return true
    }, [has_changes, select_draft])

    /**
     * 将新建、模板、复制或导入结果作为独立内存草稿，不加入作品库。
     * @param value 新草稿内容。
     * @param discard 是否已获得放弃当前草稿的明确确认。
     * @returns 是否成功切换到新草稿。
     */
    const add_scene = useCallback((value: Scene, discard = false): boolean => {
        const saved = currentWorkspace.current
        if (!saved || (!discard && has_changes())) return false
        let draft: Scene
        try {
            draft = validate_scene(named_scene(value))
            if (saved.scenes.some((item) => item.id === draft.id)) draft = clone_scene(draft)
        } catch (error) {
            toast.error('无法创建草稿', { description: error instanceof Error ? error.message : String(error) })
            return false
        }
        select_draft(draft, null)
        return true
    }, [has_changes, select_draft])

    /**
     * 明确删除已保存作品，独立写库且不将其他内存草稿带入保存数据。
     * @param id 需要删除的已保存作品 ID。
     * @param discard 是否已确认放弃此作品的未保存修改。
     * @returns 删除请求是否通过校验并进入写入队列。
     */
    const remove_scene = useCallback((id: string, discard = false): boolean => {
        const value = currentWorkspace.current
        if (!value?.scenes.some((item) => item.id === id) || blockedSave.current) return false
        const original = currentDraft.current
        if (!discard && original?.id === id && has_changes()) return false
        const session = draftSession.current
        void write_workspace((saved) => {
            const scenes = saved.scenes.filter((item) => item.id !== id)
            return { ...saved, scenes, activeSceneId: saved.activeSceneId === id ? scenes[0]?.id ?? null : saved.activeSceneId }
        }, () => {
            if (draftSession.current !== session || currentDraft.current?.id !== id) return
            if (same_scene(currentDraft.current, fit_memory([original])[0])) {
                clear_draft()
            } else {
                savedDraft.current = null
            }
        })
        return true
    }, [clear_draft, has_changes, write_workspace])

    /**
     * 只在内存中移动撤销和重做快照，不触发任何保存。
     * @param direction 撤销或重做方向。
     * @returns 无返回值。
     */
    const move_history = useCallback((direction: 'undo' | 'redo') => {
        const original = currentDraft.current
        if (!original) return
        const source = direction === 'undo' ? past.current : future.current
        const target = direction === 'undo' ? future.current : past.current
        const previous = source[source.length - 1]
        if (!previous || previous.id !== original.id) return
        let next: Scene
        try { next = fit_scene_text({ ...previous, updatedAt: Date.now() }) }
        catch (error) {
            toast.error('无法恢复文字布局，已保留当前草稿', { description: error instanceof Error ? error.message : String(error) })
            return
        }
        source.pop()
        target.push(original)
        currentDraft.current = next
        set_history_tick((tick) => tick + 1)
        show_draft()
    }, [show_draft])

    /**
     * 独立保存真实发送记录，不要求也不会隐式保存当前草稿。
     * @param record 本次发送结果。
     * @returns 记录请求是否已进入队列。
     */
    const add_record = useCallback((record: TransferRecord): boolean => {
        if (!currentWorkspace.current || blockedSave.current) return false
        const next = { ...record, sceneName: record.sceneName.trim() || '未命名作品' }
        void write_workspace((value) => ({ ...value, history: [next, ...value.history.filter((item) => item.id !== next.id)].slice(0, 100) }))
        return true
    }, [write_workspace])

    /**
     * 串行删除点击时已显示的发送记录，保留排队写入和后续完成的任务记录。
     * @returns 本次历史清空是否已成功写入；失败时保留原记录。
     */
    const clear_records = useCallback((): Promise<boolean> => {
        const records = new Set(currentWorkspace.current?.history.map(record => record.id))
        return write_workspace(value => ({ ...value, history: value.history.filter(record => !records.has(record.id)) }))
    }, [write_workspace])

    /**
     * 明确恢复完整已保存工作区，当前脏草稿需要先保存或确认放弃。
     * @param value 用户确认恢复的备份。
     * @param discard 是否已确认放弃当前未保存草稿。
     * @returns 恢复请求是否通过校验并进入队列。
     */
    const restore_workspace = useCallback((value: Workspace, discard = false): boolean => {
        if (blockedSave.current || !currentWorkspace.current) return false
        const original = currentDraft.current
        if (!discard && has_changes()) return false
        let next: Workspace
        try {
            next = validate_workspace({ ...value, scenes: value.scenes.map(named_scene) })
        } catch (error) {
            toast.error('无法恢复工作区', { description: error instanceof Error ? error.message : String(error) })
            return false
        }
        const session = draftSession.current
        void write_workspace(() => next, (saved) => {
            if (draftSession.current !== session) return
            if (same_scene(currentDraft.current, fit_memory([original])[0])) {
                clear_draft()
            } else {
                savedDraft.current = fit_memory([saved.scenes.find((item) => item.id === currentDraft.current?.id) ?? null])[0]
            }
        })
        return true
    }, [clear_draft, has_changes, write_workspace])

    return {
        workspace, scene, saveState, dirty, isNew, has_changes, clear_draft, change_scene, save_scene, open_scene, add_scene, remove_scene, move_history, add_record, clear_records, restore_workspace,
        canUndo: past.current.length > 0, canRedo: future.current.length > 0,
    }
}
