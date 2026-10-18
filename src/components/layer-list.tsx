import { useEffect, useId, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { Eye, EyeOff, GripVertical, ImagePlus, LockKeyhole, Minus, QrCode, Square, Type, UnlockKeyhole } from 'lucide-react'
import type { Scene } from '@/lib/studio'
import { is_line_element } from '@/lib/studio/line-geometry'

type LayerListProps = {
    scene: Scene
    selectedIds: readonly string[]
    on_select: (id: string, event: MouseEvent) => void
    on_change: (change: (current: Scene) => Scene, record?: boolean) => boolean
    disabled?: boolean
}

type LayerSort = { id: string; sceneId: string; mode: 'pointer' | 'keyboard'; order: string[] }
type LayerDrop = { id: string; after: boolean }

/**
 * 提供从顶层到底层的可拖拽列表，键盘排序只在放下时写入一次撤销历史。
 * @param props 当前作品、选中图层和作品编辑回调。
 * @returns 可排序图层列表及辅助读屏提示。
 */
export function LayerList({ scene, selectedIds, on_select, on_change, disabled = false }: LayerListProps) {
    const [sort, set_sort] = useState<LayerSort | null>(null)
    const [drop, set_drop] = useState<LayerDrop | null>(null)
    const [message, set_message] = useState('')
    const sortRef = useRef<LayerSort | null>(null)
    const listRef = useRef<HTMLDivElement>(null)
    const helpId = useId()
    const order = [...scene.elements].reverse()
    const elements = new Map(scene.elements.map(element => [element.id, element]))
    const displayed = sort?.mode === 'keyboard' && sort.sceneId === scene.id
        ? sort.order.flatMap(id => elements.get(id) ?? []) : order

    useEffect(() => { sortRef.current = null; set_sort(null); set_drop(null) }, [scene.id, scene.elements, disabled])
    useLayoutEffect(() => {
        if (sort?.mode !== 'keyboard') return
        const handle = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[data-layer-sort]') ?? [])].find(button => button.dataset.layerSort === sort.id)
        handle?.focus({ preventScroll: true })
        handle?.scrollIntoView?.({ block: 'nearest' })
    }, [sort])

    /**
     * 记录抓取时的作品与显示顺序，取消操作不会修改作品。
     * @param id 要移动的图层标识。
     * @param mode 鼠标或键盘排序方式。
     * @returns 无返回值。
     */
    function start(id: string, mode: LayerSort['mode']): void {
        if (disabled || scene.elements.length < 2 || elements.get(id)?.locked) return
        const next = { id, mode, sceneId: scene.id, order: order.map(element => element.id) }
        sortRef.current = next
        set_sort(next)
        set_drop(null)
        set_message(`已抓取${elements.get(id)?.name ?? '图层'}，使用上下方向键移动，空格放下，Escape 取消`)
    }

    /**
     * 将预览的顶层顺序反转为画布绘制顺序，仅提交实际发生的变化。
     * @param next 目标显示顺序；省略时取消排序。
     * @returns 无返回值。
     */
    function finish(next?: string[]): void {
        const currentSort = sortRef.current
        sortRef.current = null
        set_sort(null)
        set_drop(null)
        if (!currentSort) return
        let changed = false
        const accepted = next ? on_change(current => {
            if (current.id !== currentSort.sceneId || current.elements.length !== next.length || current.elements.find(element => element.id === currentSort.id)?.locked) return current
            const members = new Map(current.elements.map(element => [element.id, element]))
            if (new Set(next).size !== next.length || next.some(id => !members.has(id))) return current
            const reordered = [...next].reverse().map(id => members.get(id)!)
            if (reordered.every((element, index) => current.elements[index] === element)) return current
            changed = true
            return { ...current, elements: reordered }
        }, true) : false
        set_message(!next ? '已取消排序' : accepted && changed ? '图层顺序已更新' : '图层顺序未改变')
    }

    /**
     * 按目标行上下半区显示插入位置，同时滚动长图层列表。
     * @param event 目标行接收的拖拽事件。
     * @param id 目标图层标识。
     * @returns 无返回值。
     */
    function drag_over(event: DragEvent<HTMLDivElement>, id: string): void {
        const currentSort = sortRef.current
        if (!currentSort || currentSort.sceneId !== scene.id || currentSort.id === id || disabled) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        const bounds = event.currentTarget.getBoundingClientRect()
        const after = event.clientY >= bounds.top + bounds.height / 2
        set_drop(current => current?.id === id && current.after === after ? current : { id, after })
        const list = listRef.current
        if (list) {
            const listBounds = list.getBoundingClientRect()
            if (event.clientY < listBounds.top + 28) list.scrollTop -= 16
            else if (event.clientY > listBounds.bottom - 28) list.scrollTop += 16
        }
    }

    /**
     * 将被拖图层插入目标行前后，保持其余图层内容与相对顺序。
     * @param event 放下事件。
     * @param id 目标图层标识。
     * @returns 无返回值。
     */
    function drop_layer(event: DragEvent<HTMLDivElement>, id: string): void {
        const currentSort = sortRef.current
        if (!currentSort || currentSort.sceneId !== scene.id || currentSort.id === id || disabled) return
        event.preventDefault()
        const bounds = event.currentTarget.getBoundingClientRect()
        const next = order.map(element => element.id).filter(member => member !== currentSort.id)
        const target = next.indexOf(id)
        if (target < 0) { finish(); return }
        next.splice(target + (event.clientY >= bounds.top + bounds.height / 2 ? 1 : 0), 0, currentSort.id)
        finish(next)
    }

    /**
     * 用空格抓取和放下，方向键预排顺序；阻止工作台快捷键误移动图层。
     * @param event 排序手柄上的键盘事件。
     * @param id 手柄对应图层。
     * @returns 无返回值。
     */
    function sort_key(event: KeyboardEvent<HTMLButtonElement>, id: string): void {
        const current = sortRef.current
        const grabbed = current?.id === id && current.mode === 'keyboard'
        if (event.key === 'Tab') { if (grabbed) finish(current.order); return }
        event.stopPropagation()
        if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault()
            if (grabbed) finish(current.order)
            else start(id, 'keyboard')
        } else if (grabbed && event.key === 'Escape') {
            event.preventDefault()
            finish()
        } else if (grabbed && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            const index = current.order.indexOf(id)
            const target = event.key === 'Home' ? 0 : event.key === 'End' ? current.order.length - 1 : index + (event.key === 'ArrowUp' ? -1 : 1)
            if (target < 0 || target >= current.order.length || target === index) return
            const next = [...current.order]
            next.splice(index, 1)
            next.splice(target, 0, id)
            const nextSort = { ...current, order: next }
            sortRef.current = nextSort
            set_sort(nextSort)
            set_message(`${elements.get(id)?.name ?? '图层'}，第 ${target + 1} 层，共 ${next.length} 层`)
        }
    }

    return <>
        <div className="layer-list" ref={listRef} aria-label="图层列表" onDragLeave={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) set_drop(null)
        }}>
            {displayed.map(element => <div key={element.id} data-layer-id={element.id}
                className={`layer-row ${!element.locked && selectedIds.includes(element.id) ? 'selected' : ''} ${element.locked ? 'locked' : ''} ${sort?.id === element.id ? 'sorting' : ''} ${drop?.id === element.id ? drop.after ? 'drop-after' : 'drop-before' : ''}`}
                draggable={!disabled && !element.locked && scene.elements.length > 1}
                onDragStart={event => {
                    if ((event.target as Element).closest('.layer-toggle,.layer-lock') || disabled || element.locked) { event.preventDefault(); return }
                    start(element.id, 'pointer')
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', element.id)
                }} onDragOver={event => drag_over(event, element.id)} onDrop={event => drop_layer(event, element.id)} onDragEnd={() => finish()}>
                <button className="layer-drag" data-layer-sort={element.id} aria-label={`拖拽${element.name}`} aria-describedby={helpId}
                    aria-pressed={sort?.id === element.id && sort.mode === 'keyboard'} disabled={disabled || element.locked || scene.elements.length < 2}
                    title="拖拽排序；空格抓取，上下键移动" onKeyDown={event => sort_key(event, element.id)}
                    onClick={event => { if (event.detail === 0) { if (sortRef.current?.id === element.id) finish(sortRef.current.order); else start(element.id, 'keyboard') } }}>
                    <GripVertical size={12} />
                </button>
                <button className="layer-select" disabled={element.locked} aria-pressed={!element.locked && selectedIds.includes(element.id)} onClick={event => { if (!element.locked) on_select(element.id, event) }}>
                    {element.type === 'text' ? <Type size={14} /> : element.type === 'image' ? <ImagePlus size={14} /> : element.type === 'qr' ? <QrCode size={14} /> : is_line_element(element) ? <Minus size={14} /> : <Square size={14} />}
                    <span>{element.name}</span>
                </button>
                <button className="layer-toggle" draggable={false} title={element.visible ? '隐藏图层' : '显示图层'} aria-label={`${element.visible ? '隐藏' : '显示'}${element.name}`} onClick={() => on_change(current => ({ ...current, elements: current.elements.map(item => item.id === element.id ? { ...item, visible: !item.visible } : item) }))}>{element.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                <button className={`layer-lock ${element.locked ? 'active' : ''}`} draggable={false} disabled={disabled} title={element.locked ? '解锁图层' : '锁定图层'} aria-label={`${element.locked ? '解锁' : '锁定'}${element.name}`} aria-pressed={element.locked} onClick={() => on_change(current => current.id === scene.id ? { ...current, elements: current.elements.map(item => item.id === element.id ? { ...item, locked: !item.locked } : item) } : current, true)}>{element.locked ? <LockKeyhole size={13} /> : <UnlockKeyhole size={13} />}</button>
            </div>)}
            {!scene.elements.length && <div className="empty-layers">暂无图层</div>}
        </div>
        <span id={helpId} className="sr-only">空格或 Enter 抓取图层，上下方向键排序，再次空格放下，Escape 取消。</span>
        <span className="sr-only" role="status" aria-live="polite">{message}</span>
    </>
}
