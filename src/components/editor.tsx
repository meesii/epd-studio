import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from '@/components/ui/select'
import { Tabs,TabsContent,TabsList,TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { defaultOptions,resize_scene,resolve_layer_options,type ProcessOptions,type Scene,type SceneElement } from '@/lib/studio'
import { normalize_rotation } from '@/lib/studio/transform'
import { is_line_element, line_size, set_line_size } from '@/lib/studio/line-geometry'
import { align_selection, align_layers, distribute_layers, type AlignAction, type DistributeAxis } from '@/lib/studio/selection'
import { use_canvas_gesture } from '@/hooks/use-canvas-gesture'
import { use_layer_nudge } from '@/hooks/use-layer-nudge'
import { AlignCenter,AlignLeft,AlignRight,AlignHorizontalJustifyStart,AlignHorizontalJustifyCenter,AlignHorizontalJustifyEnd,AlignVerticalJustifyStart,AlignVerticalJustifyCenter,AlignVerticalJustifyEnd,ArrowDown,ArrowUp,Check,Copy,Focus,Grid2X2,ImagePlus,Layers,LockKeyhole,Magnet,Maximize2,Minus,MousePointer2,Plus,QrCode,Redo2,RotateCcw,RotateCw,ScanEye,SlidersHorizontal,Square,Trash2,Type,Undo2,UnlockKeyhole,BetweenHorizontalStart,BetweenVerticalStart } from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { ScenePreview } from './scene-preview'
import { ProcessSettings } from './process-settings'
import { ImagePurpose } from './image-purpose'
import { CanvasSelection, CanvasGroupSelection } from './canvas-selection'
import { TemplateFields } from './template-fields'
import { TextFontSettings } from './text-font-settings'
import { LayerList } from './layer-list'
import { BatchProperties } from './batch-properties'
import './canvas-transform.css'

type EditorProps = {
    scene: Scene
    selectedId: string | null
    selectedIds?: readonly string[]
    on_select: (id: string | null) => void
    on_select_many?: (ids: string[]) => void
    on_change: (change: (current: Scene) => Scene, record?: boolean) => boolean
    options: ProcessOptions
    on_options: (value: ProcessOptions) => void
    on_image: () => void
    on_template: () => void
    on_undo: () => void
    on_redo: () => void
    canUndo: boolean
    canRedo: boolean
}

const paletteNames = { bw: '黑白双色', bwr: '黑白红三色', bwry: '黑白红黄四色' }
const colors = ['#ffffff', '#171717', '#d43630', '#efbf35']
const alignActions: { action: AlignAction; label: string; icon: typeof AlignLeft }[] = [
    { action: 'left', label: '左对齐', icon: AlignHorizontalJustifyStart },
    { action: 'centerX', label: '水平居中', icon: AlignHorizontalJustifyCenter },
    { action: 'right', label: '右对齐', icon: AlignHorizontalJustifyEnd },
    { action: 'top', label: '顶部对齐', icon: AlignVerticalJustifyStart },
    { action: 'centerY', label: '垂直居中', icon: AlignVerticalJustifyCenter },
    { action: 'bottom', label: '底部对齐', icon: AlignVerticalJustifyEnd },
]

/**
 * 创建一个可编辑图层，使用当前画布比例安排默认位置与尺寸。
 * @param type 新图层类型。
 * @param scene 当前作品。
 * @returns 带独立标识的新图层。
 */
function make_element(type: SceneElement['type'], scene: Scene): SceneElement {
    const scale = scene.width / 400
    const base: SceneElement = { id: crypto.randomUUID(), type, name: type === 'text' ? '新的文字' : type === 'qr' ? '二维码' : type === 'line' ? '线条' : '矩形', x: 32 * scale, y: 36 * scale, width: 220 * scale, height: 54 * scale, visible: true, locked: false, fill: '#171717' }
    if (type === 'text') return { ...base, text: '输入文字', fontSize: 22 * scale, fontWeight: 500, fontFamily: 'sans-serif', align: 'left' }
    if (type === 'qr') return { ...base, text: 'https://example.com', width: 88 * scale, height: 88 * scale }
    if (type === 'line') return { ...base, width: 160 * scale, height: 2 }
    return { ...base, width: 120 * scale, height: 60 * scale, radius: 0 }
}

/**
 * 显示单个数值属性并限制输入范围。
 * @param props 属性名称、当前值、范围与变更回调。
 * @returns 带标签的数值输入框。
 */
function NumberField({ label, value, on_change, min = -2000, max = 2000, step = 1 }: { label: string; value: number; on_change: (value: number) => void; min?: number; max?: number; step?: number }) {
    const precision = step < 1 ? 100 : 10
    return <label className="number-field"><span>{label}</span><Input type="number" aria-label={label} value={Math.round(value * precision) / precision} min={min} max={max} step={step} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) on_change(Math.min(max, Math.max(min, next))) }} /></label>
}

/**
 * 提供图层编辑、画布预览与输出处理，始终保留原始作品数据。
 * @param props 当前作品和工作区操作。
 * @returns 创作工作台。
 */
export function Editor(props: EditorProps) {
    const { scene, on_select, on_change, options, on_options } = props
    const sourceIds = props.selectedIds ?? (props.selectedId ? [props.selectedId] : [])
    const selectedIds = sourceIds.filter(id => scene.elements.some(element => element.id === id && !element.locked))
    const selectedId = props.selectedId && selectedIds.includes(props.selectedId) ? props.selectedId : selectedIds.at(-1) ?? null
    const [view, set_view] = useState<'design' | 'output'>('design')
    const [zoom, set_zoom] = useState<'fit' | number>('fit')
    const [showGrid, set_show_grid] = useState(true)
    const [snapEnabled, set_snap_enabled] = useState(true)
    const [alignTarget, set_align_target] = useState<'selection' | 'canvas'>('selection')
    const [viewSize, set_view_size] = useState({ width: 0, height: 0 })
    const viewport = useRef<HTMLDivElement>(null)
    const stage = useRef<HTMLDivElement>(null)
    const previousSelection = useRef(selectedId)
    const selectionAnchor = useRef(selectedId)
    const gesture = use_canvas_gesture({ scene, selectedId, selectedIds, stage, enabled: view === 'design', on_select, on_select_many: props.on_select_many ? select_many : undefined, snapping: snapEnabled, on_change })
    use_layer_nudge({ scene, selectedId, selectedIds, enabled: view === 'design', pointerActive: gesture.active, on_change, on_delete: remove, on_select_all: props.on_select_many ? select_all : undefined, on_clear_selection: props.on_select_many ? () => select_many([]) : undefined })
    const selectedItems = gesture.scene.elements.filter(item => selectedIds.includes(item.id))
    const selected = selectedItems.length === 1 ? selectedItems[0] : undefined
    const movableCount = selectedItems.filter(element => element.visible && !element.locked).length
    const alignReference = selectedIds.map(id => selectedItems.find(element => element.id === id && element.visible && !element.locked)).find(element => element !== undefined)
    const selectedLine = selected && is_line_element(selected) ? line_size(selected) : null
    const paperRatio = scene.width / scene.height
    const fitWidth = Math.min(viewSize.width, viewSize.height * paperRatio)
    const paperWidth = zoom === 'fit' ? fitWidth : scene.width * zoom / 100
    const zoomPercent = Math.round(paperWidth / scene.width * 100)
    const gridVisible = showGrid && view === 'design'

    /**
     * 同步主选项和整组选区，兼容仅接收单选回调的使用方。
     * @param ids 按选择顺序排列的图层标识，新建图层可先于下一次渲染传入。
     * @returns 无返回值。
     */
    function select_many(ids: string[]): void {
        const next = [...new Set(ids)].filter(id => !scene.elements.find(element => element.id === id)?.locked)
        if (props.on_select_many) props.on_select_many(next)
        else on_select(next.at(-1) ?? null)
    }

    /**
     * 按图层列表的显示顺序扩展范围，或用修饰键增减单个图层。
     * @param id 当前点击的图层。
     * @param event 携带 Shift、Ctrl 或 Command 状态的点击事件。
     * @returns 无返回值。
     */
    function select_layer(id: string, event: MouseEvent): void {
        if (!scene.elements.some(element => element.id === id && !element.locked)) return
        const additive = event.ctrlKey || event.metaKey
        if (event.shiftKey && props.on_select_many) {
            const order = [...scene.elements].reverse().filter(element => !element.locked).map(element => element.id)
            const anchor = order.indexOf(selectionAnchor.current ?? id)
            const target = order.indexOf(id)
            const range = anchor < 0 ? [id] : order.slice(Math.min(anchor, target), Math.max(anchor, target) + 1)
            select_many(additive ? [...selectedIds, ...range] : [...selectedIds.filter(selected => range.includes(selected)), ...range])
        } else {
            select_many(additive && props.on_select_many ? selectedIds.includes(id) ? selectedIds.filter(item => item !== id) : [...selectedIds, id] : [id])
            selectionAnchor.current = id
        }
        set_view('design')
    }

    /**
     * 全选可在画布上移动的图层，隐藏及锁定图层不参与。
     * @returns 无返回值。
     */
    function select_all(): void {
        const available = scene.elements.filter(element => element.visible && !element.locked).map(element => element.id)
        select_many([...selectedIds.filter(id => available.includes(id)), ...available])
    }

    /**
     * 根据参考范围分别对齐选区成员，整体居中操作保留组内相对位置。
     * @param action 目标边缘或中心；整体居中始终使用画布作为参考。
     * @returns 无返回值。
     */
    function align(action: AlignAction): void {
        const alignMembers = selectedItems.length > 1 && action !== 'center'
        on_change(current => current.id !== scene.id ? current : alignMembers ? align_layers(current, selectedIds, action, alignTarget) : align_selection(current, selectedIds, action), true)
    }

    /**
     * 将可移动图层沿指定方向等间距分布，并记为一次可撤销操作。
     * @param axis 水平或垂直方向。
     * @returns 无返回值。
     */
    function distribute(axis: DistributeAxis): void {
        on_change(current => current.id === scene.id ? distribute_layers(current, selectedIds, axis) : current, true)
    }

    /**
     * 按实际预览区域的内容尺寸适配画布，避免重复扣除容器内边距。
     * @returns 释放尺寸观察器的函数。
     */
    function watch_viewport(): (() => void) | undefined {
        if (!viewport.current || typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(([entry]) => {
            const width = Math.max(0, Math.floor(entry.contentRect.width))
            const height = Math.max(0, Math.floor(entry.contentRect.height))
            set_view_size(current => current.width === width && current.height === height ? current : { width, height })
        })
        observer.observe(viewport.current)
        return () => observer.disconnect()
    }

    useEffect(watch_viewport, [])
    useEffect(() => {
        if (sourceIds.length !== selectedIds.length) select_many(selectedIds)
    })
    useEffect(() => {
        if (selectedId !== previousSelection.current && selectedId && scene.elements.some(element => element.id === selectedId)) {
            set_view('design')
            if (selectedIds.length === 1) selectionAnchor.current = selectedId
        }
        previousSelection.current = selectedId
    }, [selectedId, selectedIds.length, scene.elements])
    const patch = (value: Partial<SceneElement>) => on_change((current) => ({ ...current, elements: current.elements.map((item) => item.id === selectedId ? { ...item, ...value } : item) }))
    const insert = (type: SceneElement['type']) => {
        if (scene.elements.length >= 200) return
        const element = make_element(type, scene)
        const added = on_change((current) => ({ ...current, elements: [...current.elements, element] }))
        if (!added) return
        on_select(element.id)
        set_view('design')
    }
    /**
     * 共用按钮与快捷键删除入口，只有成功删除后才清空选择。
     * @returns 无返回值；删除作为独立编辑写入撤销历史。
     */
    function remove(): void {
        if (!selectedIds.length) return
        const targets = new Set(selectedIds)
        let removed = false
        const accepted = on_change(current => {
            if (current.id !== scene.id || !current.elements.some(element => targets.has(element.id))) return current
            removed = true
            return { ...current, elements: current.elements.filter(element => !targets.has(element.id)) }
        }, true)
        if (accepted && removed) select_many([])
    }
    /**
     * 复制整组选区并保留成员间距，选择新副本以便接着移动。
     * @returns 无返回值；超过图层上限时保持原作品。
     */
    function duplicate(): void {
        if (!selectedItems.length || scene.elements.length + selectedItems.length > 200) return
        const copies = selectedItems.map(element => ({ ...element, id: crypto.randomUUID(), name: `${element.name} 副本`, x: element.x + 8, y: element.y + 8 }))
        const added = on_change(current => current.id === scene.id ? { ...current, elements: [...current.elements, ...copies] } : current)
        if (added) select_many(copies.map(element => element.id))
    }
    /**
     * 将选中的图层一起前移或后移一层，保留选区内部顺序。
     * @param direction 前移为 1，后移为 -1。
     * @returns 编辑是否被工作区接受。
     */
    const reorder = (direction: 1 | -1) => on_change((current) => {
        if (current.id !== scene.id) return current
        const elements = [...current.elements]
        const targets = new Set(selectedIds)
        let changed = false
        for (let step = 0; step < elements.length - 1; step++) {
            const index = direction > 0 ? elements.length - 2 - step : step + 1
            const target = index + direction
            if (targets.has(elements[index].id) && !targets.has(elements[target].id)) {
                ;[elements[index], elements[target]] = [elements[target], elements[index]]
                changed = true
            }
        }
        return changed ? { ...current, elements } : current
    })
    const alignTools = <div className="canvas-align" role="group" aria-label="图层对齐">
        {selectedItems.length > 1 ? <label className="canvas-align-target">对齐参考<Select value={alignTarget} onValueChange={value => set_align_target(value as 'selection' | 'canvas')}><SelectTrigger aria-label="对齐参考"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="selection">先选图层</SelectItem><SelectItem value="canvas">整个画布</SelectItem></SelectContent></Select></label> : <span>对齐到画布</span>}
        {selectedItems.length > 1 && alignTarget === 'selection' && alignReference && <span className="canvas-align-reference" title={alignReference.name}>基准：{alignReference.name}</span>}
        <div className="canvas-align-actions">{alignActions.map(item => <Button key={item.action} variant="outline" size="sm" aria-label={item.label} title={item.label} disabled={!movableCount || (selectedItems.length > 1 && alignTarget === 'selection' && movableCount < 2) || gesture.active} onClick={() => align(item.action)}><item.icon /></Button>)}</div>
        {selectedItems.length > 1 && <div className="canvas-distribute" role="group" aria-label="等间距分布"><Button variant="outline" size="sm" aria-label="水平等间距" title={movableCount < 3 ? '选择至少 3 个可移动图层' : '固定两端，水平等间距'} disabled={movableCount < 3 || gesture.active} onClick={() => distribute('horizontal')}><BetweenHorizontalStart />水平等间距</Button><Button variant="outline" size="sm" aria-label="垂直等间距" title={movableCount < 3 ? '选择至少 3 个可移动图层' : '固定两端，垂直等间距'} disabled={movableCount < 3 || gesture.active} onClick={() => distribute('vertical')}><BetweenVerticalStart />垂直等间距</Button></div>}
        <Button variant="outline" size="sm" aria-label={selectedItems.length > 1 ? '整组在画布居中' : '画布居中'} disabled={!movableCount || gesture.active} onClick={() => align('center')}><Focus />{selectedItems.length > 1 ? '整组居中' : '画布居中'}</Button>
    </div>

    return <div className="editor-shell">
        <aside className="layer-panel">
            <div className="panel-heading"><span>创作工具</span><MousePointer2 size={15} /></div>
            <div className="insert-grid">
                <button onClick={() => insert('text')}><Type /><span>文字</span></button>
                <button onClick={props.on_image}><ImagePlus /><span>图片</span></button>
                <button onClick={() => insert('rect')}><Square /><span>形状</span></button>
                <button onClick={() => insert('line')}><Minus /><span>线条</span></button>
                <button onClick={() => insert('qr')}><QrCode /><span>二维码</span></button>
                <TemplateFields key={scene.id} scene={scene} selectedIds={selectedIds} disabled={gesture.active} on_change={on_change} />
            </div>
            <button className="template-shortcut" onClick={props.on_template}><Grid2X2 size={16} /><span>从模板开始</span><Plus size={14} /></button>
            <div className="panel-heading layer-heading"><span>图层 <span className="count">{scene.elements.length}</span></span><Layers size={15} /></div>
            <LayerList scene={scene} selectedIds={selectedIds} on_select={select_layer} on_change={on_change} disabled={gesture.active} />
            <Collapsible className="layer-panel-foot">
                <CollapsibleTrigger asChild><Button type="button" variant="ghost" className="layer-help-trigger">操作提示</Button></CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="layer-help-list">
                        <span>拖动空白处框选</span>
                        <span>Shift + 点击多选</span>
                        <span>⌘ / Ctrl + A 全选</span>
                        <span>⌘ / Ctrl + Z 撤销</span>
                        <span>⌘ / Ctrl + Shift + Z 重做</span>
                        <span>Delete 删除</span>
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </aside>

        <section className="canvas-panel">
            <div className="canvas-toolbar">
                <div className="view-toggle"><button className={view === 'design' ? 'active' : ''} onClick={() => set_view('design')}><MousePointer2 size={14} />设计画布</button><button className={view === 'output' ? 'active' : ''} onClick={() => set_view('output')}><ScanEye size={14} />墨水屏预览</button></div>
                <div className="canvas-actions"><Button variant="ghost" size="icon" title="撤销" aria-label="撤销" disabled={!props.canUndo} onClick={props.on_undo}><Undo2 /></Button><Button variant="ghost" size="icon" title="重做" aria-label="重做" disabled={!props.canRedo} onClick={props.on_redo}><Redo2 /></Button><span className="toolbar-divider" /><Button variant="ghost" size="icon" title="吸附对齐 · Alt 临时关闭" aria-label="吸附对齐" aria-pressed={snapEnabled && view === 'design'} disabled={view === 'output'} onClick={() => set_snap_enabled(current => !current)}><Magnet /></Button><Button variant="ghost" size="icon" title={view === 'output' ? '网格仅用于设计画布' : showGrid ? '隐藏网格' : '显示网格'} aria-label="切换网格" aria-pressed={gridVisible} disabled={view === 'output'} onClick={() => set_show_grid(current => !current)}><Grid2X2 /></Button></div>
            </div>
            <div className={`canvas-desk ${gridVisible ? 'with-grid' : ''}`}>
                <div className="canvas-viewport" ref={viewport} onPointerDown={gesture.start_move} onPointerMove={gesture.move} onPointerUp={gesture.end} onPointerCancel={gesture.cancel} onLostPointerCapture={gesture.cancel}>
                    <div className="paper-stage" style={{ width: paperWidth > 0 ? paperWidth : '90%', height: paperWidth > 0 ? paperWidth / paperRatio : undefined, aspectRatio: `${scene.width} / ${scene.height}` }} ref={stage} tabIndex={0} aria-label="可编辑画布" title="Shift / Ctrl 多选，拖动空白处框选；方向键移动，Shift 加速">
                        <ScenePreview scene={gesture.scene} processed={view === 'output'} options={options} showWarnings />
                        {gridVisible && <div className="canvas-grid" aria-hidden="true" style={{ backgroundSize: `${20 * paperWidth / scene.width}px ${20 * paperWidth / scene.width}px` }} />}
                        {selected && selected.visible && view === 'design' && <CanvasSelection element={selected} scene={scene} on_start={gesture.start_handle} />}
                        {selectedItems.length > 1 && view === 'design' && <CanvasGroupSelection elements={selectedItems} scene={scene} />}
                        {view === 'design' && <svg className="canvas-guides" viewBox={`0 0 ${scene.width} ${scene.height}`} preserveAspectRatio="none" aria-hidden="true">{gesture.guides.map(guide => <line key={guide.axis} data-axis={guide.axis} data-canvas-guide={guide.axis} x1={guide.axis === 'x' ? guide.position : 0} y1={guide.axis === 'y' ? guide.position : 0} x2={guide.axis === 'x' ? guide.position : scene.width} y2={guide.axis === 'y' ? guide.position : scene.height} vectorEffect="non-scaling-stroke" />)}</svg>}
                        {gesture.marquee && <div className="canvas-marquee" data-canvas-marquee="" aria-hidden="true" style={{ left: `${gesture.marquee.x / scene.width * 100}%`, top: `${gesture.marquee.y / scene.height * 100}%`, width: `${gesture.marquee.width / scene.width * 100}%`, height: `${gesture.marquee.height / scene.height * 100}%` }} />}
                    </div>
                </div>
                <div className="canvas-view-footer">
                    <div className="canvas-caption">{gesture.action === 'rotate' ? `${Math.round(selected?.rotation ?? 0)}° · Shift 吸附 15°` : gesture.action && gesture.action !== 'move' ? `${Math.round(selected?.width ?? 0)} × ${Math.round(selected?.height ?? 0)} px` : `${scene.width} × ${scene.height} · ${paletteNames[scene.palette]}`}{selectedItems.length > 1 && ` · 已选 ${selectedItems.length} 层`}{selected?.locked && ' · 已锁定'}</div>
                    <div className="zoom-control" role="group" aria-label="画布视图">
                        <Button size="sm" variant="ghost" className="zoom-fit" aria-label="适应画布" title="适应画布" aria-pressed={zoom === 'fit'} onClick={() => set_zoom('fit')}><Maximize2 /><span>适应</span></Button>
                        <span className="zoom-divider" aria-hidden="true" />
                        <Select value={String(zoom)} onValueChange={value => set_zoom(value === 'fit' ? 'fit' : Number(value))}>
                            <SelectTrigger className="zoom-select" aria-label="画布缩放" title="画布缩放"><SelectValue>{zoomPercent > 0 ? `${zoomPercent}%` : '适应'}</SelectValue></SelectTrigger>
                            <SelectContent position="popper" side="top" align="end" sideOffset={8}><SelectItem value="fit">适应画布</SelectItem>{[25, 50, 75, 100, 125, 150, 200].map(value => <SelectItem key={value} value={String(value)}>{value}%</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                </div>
            </div>
        </section>

        <aside className="property-panel">
            <Tabs defaultValue="element"><TabsList className="property-tabs"><TabsTrigger value="element">属性</TabsTrigger><TabsTrigger value="process">图像处理</TabsTrigger></TabsList>
                <TabsContent value="element" className="property-content">
                    <div className="property-section"><div className="panel-heading"><span>画布设置</span><SlidersHorizontal size={14} /></div>
                        <label className="field-label">屏幕尺寸<Select value={`${scene.width}x${scene.height}`} onValueChange={(value) => { const [width, height] = value.split('x').map(Number); on_change((current) => resize_scene(current, width, height)) }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[[400, 300], [640, 384], [800, 480], [880, 528]].map(([width, height]) => <SelectItem value={`${width}x${height}`} key={width}>{width} × {height} 像素</SelectItem>)}</SelectContent></Select></label>
                        <label className="field-label">颜色模式<Select value={scene.palette} onValueChange={(value) => on_change((current) => ({ ...current, palette: value as Scene['palette'] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bw">黑白双色</SelectItem><SelectItem value="bwr">黑白红三色</SelectItem><SelectItem value="bwry">黑白红黄四色</SelectItem></SelectContent></Select></label>
                    </div>
                    {selected ? <div className="property-section">
                        <div className="panel-heading"><span>图层属性</span><button className="plain-icon" aria-label={selected.locked ? '解锁图层' : '锁定图层'} title={selected.locked ? '解锁图层' : '锁定图层'} onClick={() => patch({ locked: !selected.locked })}>{selected.locked ? <LockKeyhole size={14} /> : <UnlockKeyhole size={14} />}</button></div>
                        <label className="field-label">图层名称<Input value={selected.name} maxLength={80} onChange={(event) => patch({ name: event.target.value })} /></label>
                        {selected.type === 'image' && <ImagePurpose mode={selected.processMode} on_change={processMode => patch({ processMode })} disabled={selected.locked} />}
                        {alignTools}
                        <label className="field-label">渲染设置<Select value={selected.processOptions ? 'custom' : 'default'} onValueChange={value => patch({ processOptions: value === 'custom' ? resolve_layer_options(selected, options) : undefined })}><SelectTrigger aria-label="图层渲染设置"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">默认设置</SelectItem><SelectItem value="custom">单独设置</SelectItem></SelectContent></Select></label>
                        {selected.processOptions && <div role="group" aria-label="当前图层渲染参数"><ProcessSettings options={selected.processOptions} on_change={value => patch({ processOptions: value })} fixedAlgorithm={selected.type === 'image' && selected.processMode === 'graphic' ? 'none' : undefined} /></div>}
                        {(selected.type === 'text' || selected.type === 'qr') && <label className="field-label">{selected.type === 'qr' ? '二维码内容' : '文字内容'}<Textarea value={selected.text ?? ''} maxLength={10000} onChange={(event) => patch({ text: event.target.value })} rows={3} /></label>}
                        {selected.type === 'image' && <>
                            <label className="field-label">图片适配<Select value={selected.fit ?? 'contain'} onValueChange={(value) => patch({ fit: value as 'contain' | 'cover' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="contain">完整显示</SelectItem><SelectItem value="cover">填满画框 · 中心裁剪</SelectItem></SelectContent></Select></label>
                            <div className="image-actions"><Button variant={selected.flipX ? 'secondary' : 'outline'} size="sm" onClick={() => patch({ flipX: !selected.flipX })}>水平镜像</Button><Button variant={selected.flipY ? 'secondary' : 'outline'} size="sm" onClick={() => patch({ flipY: !selected.flipY })}>垂直翻转</Button></div>
                            <div className="image-rotation"><label><span>图片旋转 °</span><Input type="number" aria-label="图片旋转角度" value={selected.rotation ?? 0} min={-180} max={180} disabled={selected.locked} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) patch({ rotation: normalize_rotation(value) }) }} /></label>
                                <div className="image-rotate-actions"><Button variant="outline" size="sm" aria-label="向左旋转90度" disabled={selected.locked} onClick={() => patch({ rotation: normalize_rotation((selected.rotation ?? 0) - 90) })}><RotateCcw />左转 90°</Button><Button variant="outline" size="sm" aria-label="向右旋转90度" disabled={selected.locked} onClick={() => patch({ rotation: normalize_rotation((selected.rotation ?? 0) + 90) })}><RotateCw />右转 90°</Button><Button variant="ghost" size="sm" aria-label="重置旋转" disabled={selected.locked || !selected.rotation} onClick={() => patch({ rotation: 0 })}>重置</Button></div>
                            </div>
                        </>}
                        <div className="property-grid"><NumberField label="X" value={selected.x} on_change={(value) => patch({ x: value })} /><NumberField label="Y" value={selected.y} on_change={(value) => patch({ y: value })} />{selectedLine ? <><NumberField label="长度" value={selectedLine.length} min={0.01} step={0.01} on_change={(value) => patch(set_line_size(selected, { length: value }))} /><NumberField label="线宽" value={selectedLine.thickness} min={0.01} max={selectedLine.length} step={0.01} on_change={(value) => patch(set_line_size(selected, { thickness: value }))} /></> : selected.type !== 'text' && <><NumberField label="宽度" value={selected.width} min={1} on_change={(value) => patch({ width: value })} /><NumberField label="高度" value={selected.height} min={1} on_change={(value) => patch({ height: value })} /></>}</div>
                        {selected.type === 'text' && <div className="text-size-note"><span>内容尺寸 <b>{Math.round(selected.width)} × {Math.round(selected.height)} px</b></span></div>}
                        {selected.type === 'text' && <><TextFontSettings element={selected} on_change={patch} />
                            <div className="align-row">{(['left', 'center', 'right'] as const).map((align) => <Button key={align} size="icon" variant={selected.align === align ? 'secondary' : 'ghost'} aria-label={{ left: '左对齐', center: '居中对齐', right: '右对齐' }[align]} onClick={() => patch({ align })}>{align === 'left' ? <AlignLeft /> : align === 'center' ? <AlignCenter /> : <AlignRight />}</Button>)}</div></>}
                        {(selected.type === 'text' || selected.type === 'rect' || selected.type === 'line') && <label className="field-label">{selectedLine ? '线条颜色' : '填充颜色'}<div className="swatch-row">{colors.slice(0, scene.palette === 'bw' ? 2 : scene.palette === 'bwr' ? 3 : 4).map((color) => <button key={color} className={`color-swatch ${selected.fill === color ? 'active' : ''}`} style={{ background: color }} aria-label={`${selectedLine ? '线条颜色' : '填充'} ${color}`} onClick={() => patch({ fill: color })}>{selected.fill === color && <Check size={12} color={color === '#171717' ? '#ffffff' : '#171717'} />}</button>)}</div></label>}
                        <div className="property-grid">{selectedLine ? <NumberField label="角度 °" value={normalize_rotation((selected.rotation ?? 0) + (selectedLine.vertical ? 90 : 0))} min={-180} max={180} on_change={(value) => patch({ rotation: normalize_rotation(value - (selectedLine.vertical ? 90 : 0)) })} /> : selected.type !== 'image' && <NumberField label="旋转 °" value={selected.rotation ?? 0} min={-180} max={180} on_change={(value) => patch({ rotation: value })} />}{selected.type === 'rect' && !selectedLine && <NumberField label="圆角" value={selected.radius ?? 0} min={0} max={100} on_change={(value) => patch({ radius: value })} />}</div>
                        <div className="layer-actions"><Button variant="outline" size="sm" onClick={duplicate} disabled={scene.elements.length >= 200}><Copy size={13} />复制</Button><Button variant="outline" size="icon-sm" title="上移图层" aria-label="上移图层" onClick={() => reorder(1)}><ArrowUp size={13} /></Button><Button variant="outline" size="icon-sm" title="下移图层" aria-label="下移图层" onClick={() => reorder(-1)}><ArrowDown size={13} /></Button><Button variant="ghost" size="icon-sm" className="text-destructive" title="删除图层" aria-label="删除图层" onClick={remove}><Trash2 size={13} /></Button></div>
                    </div> : selectedItems.length > 1 ? <div className="property-section">
                        <div className="panel-heading"><span>已选 {selectedItems.length} 个图层</span><Layers size={15} /></div>
                        <p className="selection-summary">拖动任一选中图层可一起移动，方向键可微调位置。</p>
                        {movableCount < selectedItems.length && <p className="selection-summary">锁定和隐藏图层不参与移动与对齐。</p>}
                        {alignTools}
                        <BatchProperties key={selectedIds.join(',')} scene={scene} elements={selectedItems} options={options} on_change={on_change} disabled={gesture.active} />
                        <div className="layer-actions"><Button variant="outline" size="sm" onClick={duplicate} disabled={scene.elements.length + selectedItems.length > 200 || gesture.active}><Copy size={13} />复制</Button><Button variant="outline" size="icon-sm" title="上移图层" aria-label="上移图层" disabled={gesture.active} onClick={() => reorder(1)}><ArrowUp size={13} /></Button><Button variant="outline" size="icon-sm" title="下移图层" aria-label="下移图层" disabled={gesture.active} onClick={() => reorder(-1)}><ArrowDown size={13} /></Button><Button variant="ghost" size="icon-sm" className="text-destructive" title="删除图层" aria-label="删除图层" disabled={gesture.active} onClick={remove}><Trash2 size={13} /></Button></div>
                    </div> : <div className="property-empty"><MousePointer2 size={20} /><p>选择图层以编辑属性</p></div>}
                </TabsContent>
                <TabsContent value="process" className="property-content"><div className="property-section"><div className="panel-heading"><span>像素处理</span><ScanEye size={14} /></div>
                    <ProcessSettings options={options} on_change={on_options} />
                    <div className="process-actions">
                        <Button variant="outline" className="w-full" onClick={() => { on_options({ ...defaultOptions }); set_view('output') }}>使用推荐设置</Button>
                        <Button variant="outline" className="w-full" onClick={() => set_view('output')}><ScanEye size={14} />查看最终像素</Button>
                    </div>
                </div><p className="process-note">预览、导出和发送共用所选处理引擎。</p></TabsContent>
            </Tabs>
        </aside>
    </div>
}
