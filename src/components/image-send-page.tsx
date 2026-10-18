import { useEffect, useRef, useState, type DragEvent } from 'react'
import { AlignCenter, ArrowDownToLine, Bluetooth, ClipboardPaste, FileImage, ImagePlus, Loader2, Maximize2, MousePointer2, Redo2, Replace, RotateCcw, RotateCw, ScanEye, Send, Undo2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { use_canvas_gesture } from '@/hooks/use-canvas-gesture'
import { center_image, fit_image, resize_image_scene, type ImageSource } from '@/lib/image-scene'
import { defaultOptions, type Palette, type ProcessOptions, type Scene } from '@/lib/studio'
import { normalize_rotation } from '@/lib/studio/transform'
import { CanvasSelection } from './canvas-selection'
import { ScenePreview } from './scene-preview'
import { ProcessSettings } from './process-settings'
import { ImagePurpose } from './image-purpose'
import './canvas-transform.css'
import './image-send-page.css'

interface ImageSendPageProps {
    scene: Scene
    source: ImageSource | null
    on_change: (change: (current: Scene) => Scene, record?: boolean) => boolean
    on_image: (file: File) => Promise<void>
    on_paste: () => void | Promise<void>
    pasting: boolean
    loading: boolean
    deviceName: string
    deviceSize?: { width: number; height: number; palette: Palette }
    sending: boolean
    deviceBusy?: boolean
    cooldown: number
    on_send: () => void
    on_connect: () => void
    connected: boolean
    connecting: boolean
    canUndo: boolean
    canRedo: boolean
    on_undo: () => void
    on_redo: () => void
}

const paletteNames: Record<Palette, string> = { bw: '黑白双色', bwr: '黑白红三色', bwry: '黑白红黄四色' }
const sizePresets = [[400, 300], [640, 384], [800, 480], [880, 528]]

/**
 * 提供不进入作品库的单张图片调整与发布入口，所有设备操作由父级执行。
 * @param props 临时图片、原始素材、编辑历史及设备回调。
 * @returns 图片直传页面。
 */
export function ImageSendPage(props: ImageSendPageProps) {
    const { scene, source, on_change, on_image, loading, deviceName, deviceSize, sending, cooldown, on_send, on_connect, connected, connecting } = props
    const image = scene.elements.find(element => element.type === 'image')
    const [selectedId, set_selected_id] = useState<string | null>(image?.id ?? null)
    const [view, set_view] = useState<'design' | 'output'>('design')
    const [zoom, set_zoom] = useState<'fit' | 100 | 125 | 200>('fit')
    const [fitMode, set_fit_mode] = useState<'contain' | 'cover' | 'custom'>('contain')
    const [dragging, set_dragging] = useState(false)
    const [viewSize, set_view_size] = useState({ width: 0, height: 0 })
    const input = useRef<HTMLInputElement>(null)
    const stage = useRef<HTMLDivElement>(null)
    const viewport = useRef<HTMLDivElement>(null)
    const dragDepth = useRef(0)
    const options = scene.processOptions ?? defaultOptions
    const imageOptions = image?.processOptions ?? options
    const gesture = use_canvas_gesture({
        scene, selectedId, stage, enabled: view === 'design' && !loading && Boolean(image), on_select: set_selected_id,
        on_change: (change, record) => {
            const changed = on_change(change, record)
            if (changed) set_fit_mode('custom')
            return changed
        },
    })
    const selected = gesture.scene.elements.find(element => element.id === selectedId)
    const fitScale = Math.min(viewSize.width / scene.width, viewSize.height / scene.height)
    const scale = zoom === 'fit' ? fitScale : zoom / 100
    const canSend = Boolean(image && source) && !loading && !sending && !connecting && !props.deviceBusy && cooldown <= 0
    const mismatch = Boolean(deviceSize && (scene.width !== deviceSize.width || scene.height !== deviceSize.height || (scene.palette !== 'bw' && scene.palette !== deviceSize.palette)))
    const ready = Boolean(image && source)

    useEffect(() => {
        set_selected_id(image?.id ?? null)
        set_fit_mode('contain')
        set_zoom('fit')
        set_view('design')
    }, [image?.id])

    useEffect(() => {
        if (!viewport.current) return
        const observer = new ResizeObserver(([entry]) => {
            const width = Math.max(0, Math.floor(entry.contentRect.width))
            const height = Math.max(0, Math.floor(entry.contentRect.height))
            set_view_size(current => current.width === width && current.height === height ? current : { width, height })
        })
        observer.observe(viewport.current)
        return () => observer.disconnect()
    }, [])

    /**
     * 将选择或拖入的第一张图片交给父级加载，不保存到作品库。
     * @param file 本地图片文件。
     * @returns 图片处理结束后的任务。
     */
    async function import_file(file: File): Promise<void> {
        if (loading) return
        try { await on_image(file) }
        catch (error) { toast.error(error instanceof Error ? error.message : String(error)) }
    }

    /**
     * 适配原始图片比例并回到设计视图，避免自由缩放后的形变成为新比例。
     * @param mode 完整显示或铺满画布。
     * @returns 无返回值。
     */
    function apply_fit(mode: 'contain' | 'cover'): void {
        if (!source) return
        if (on_change(current => fit_image(current, source, mode))) { set_fit_mode(mode); set_view('design'); set_selected_id(image?.id ?? null) }
    }

    /**
     * 改变画布规格，并用原图重新适配到目标尺寸。
     * @param width 目标画布宽度。
     * @param height 目标画布高度。
     * @param palette 目标色彩模式。
     * @returns 无返回值。
     */
    function change_size(width: number, height: number, palette = scene.palette): void {
        if (on_change(current => resize_image_scene(current, width, height, palette, source ?? undefined))) {
            set_fit_mode('contain')
            set_zoom('fit')
        }
    }

    /**
     * 保留图片中心与尺寸，仅更新规范化旋转角度。
     * @param rotation 目标角度。
     * @returns 无返回值。
     */
    function rotate(rotation: number): void {
        if (!image) return
        if (on_change(current => ({ ...current, elements: current.elements.map(element => element.id === image.id ? { ...element, rotation: normalize_rotation(rotation) } : element) }))) set_fit_mode('custom')
    }

    /**
     * 更新输出处理参数，保留原始素材与几何变换。
     * @param value 完整的处理参数。
     * @returns 无返回值。
     */
    function update_options(value: ProcessOptions): void {
        on_change(current => image?.processOptions
            ? { ...current, elements: current.elements.map(element => element.id === image.id ? { ...element, processOptions: value } : element) }
            : { ...current, processOptions: value })
    }

    /**
     * 接收浏览器文件拖入事件，避免图片文件触发整页导航。
     * @param event 文件拖放事件。
     * @returns 无返回值。
     */
    function drop_file(event: DragEvent<HTMLDivElement>): void {
        event.preventDefault()
        dragDepth.current = 0
        set_dragging(false)
        const file = event.dataTransfer.files[0]
        if (file) void import_file(file)
    }

    return <div className="image-send-page" onDragEnter={event => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        dragDepth.current++
        set_dragging(true)
    }} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } }} onDragLeave={event => {
        if (!event.dataTransfer.types.includes('Files')) return
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (!dragDepth.current) set_dragging(false)
    }} onDrop={drop_file}>
        <div className="image-send-heading"><h1 title="临时图片不保存，关闭页面后丢失">图片直传</h1><div className="image-send-actions">{connected ? <span className="image-device-name" title={deviceName}>{deviceName || '已连接'}</span> : <Button variant="outline" onClick={on_connect} disabled={connecting || sending}>{connecting ? <Loader2 className="animate-spin" /> : <Bluetooth />}{connecting ? '正在连接' : '连接设备'}</Button>}<Button onClick={on_send} disabled={!canSend} className="image-publish-button">{sending ? <Loader2 className="animate-spin" /> : <Send />}{sending ? '正在发送' : cooldown > 0 ? `等待刷新 ${cooldown}s` : '发送到墨水屏'}</Button></div></div>

        <div className="image-send-layout">
            <aside className="image-settings" aria-label="图片调整">
                <section className="image-setting-section">
                    <h2>素材与变换</h2>
                    {ready && <div className="image-source-file"><img src={source!.src} alt="已选择的图片缩略图" draggable={false} /><div><b title={source!.name}>{source!.name}</b><small>{source!.width} × {source!.height}</small></div></div>}
                    <div className="image-source-actions"><Button className="image-replace-button" variant="outline" title="PNG / JPG / WEBP / GIF / BMP / SVG，最大 15 MB；SVG 导入后转换为图片" onClick={() => input.current?.click()} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : ready ? <Replace /> : <ImagePlus />}{loading ? '正在打开图片' : ready ? '替换图片' : '选择图片'}</Button><Button variant="outline" size="icon" aria-label="粘贴图片" title="粘贴图片 (Ctrl+V)" disabled={props.pasting || loading} onClick={() => void props.on_paste()}>{props.pasting ? <Loader2 className="animate-spin" /> : <ClipboardPaste size={14} />}</Button></div>
                    <div className="image-fit-options"><button disabled={!ready || loading} className={fitMode === 'contain' ? 'active' : ''} aria-pressed={fitMode === 'contain'} title="按原图比例居中显示，并重置旋转" onClick={() => apply_fit('contain')}>完整显示</button><button disabled={!ready || loading} className={fitMode === 'cover' ? 'active' : ''} aria-pressed={fitMode === 'cover'} title="按原图比例铺满，超出画布的部分不显示，并重置旋转" onClick={() => apply_fit('cover')}>铺满画布</button></div>
                    <Button variant="ghost" className="image-center-button" disabled={!ready || loading} onClick={() => on_change(current => center_image(current))}><AlignCenter />居中</Button>
                    <div className="image-angle-field"><label htmlFor="image-rotation">旋转角度</label><div><Input id="image-rotation" aria-label="图片直传旋转角度" type="number" value={image?.rotation ?? 0} min={-180} max={180} step={0.01} disabled={!ready || loading} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) rotate(value) }} /><span>°</span></div></div>
                    <div className="image-angle-actions"><Button variant="outline" disabled={!ready || loading} aria-label="图片向左旋转90度" onClick={() => rotate((image?.rotation ?? 0) - 90)}><RotateCcw />左转 90°</Button><Button variant="outline" disabled={!ready || loading} aria-label="图片向右旋转90度" onClick={() => rotate((image?.rotation ?? 0) + 90)}><RotateCw />右转 90°</Button><Button variant="ghost" disabled={!ready || loading || !image?.rotation} onClick={() => rotate(0)}>重置</Button></div>
                </section>

                <section className="image-setting-section">
                    <h2>输出</h2>
                    <label className="field-label">画布尺寸<Select value={`${scene.width}x${scene.height}`} onValueChange={value => { const [width, height] = value.split('x').map(Number); change_size(width, height) }} disabled={loading}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{!sizePresets.some(([width, height]) => width === scene.width && height === scene.height) && <SelectItem value={`${scene.width}x${scene.height}`}>{scene.width} × {scene.height} 像素</SelectItem>}{sizePresets.map(([width, height]) => <SelectItem key={width} value={`${width}x${height}`}>{width} × {height} 像素</SelectItem>)}</SelectContent></Select></label>
                    <label className="field-label">颜色<Select value={scene.palette} onValueChange={value => on_change(current => ({ ...current, palette: value as Palette }))} disabled={loading}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(paletteNames).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
                    {deviceSize && <Button variant="outline" className="image-device-fit" title="按设备规格重新适配原图，并重置旋转" onClick={() => change_size(deviceSize.width, deviceSize.height, deviceSize.palette)} disabled={loading}><ArrowDownToLine />按设备适配<span>{deviceSize.width} × {deviceSize.height}</span></Button>}
                    <ImagePurpose mode={image?.processMode} on_change={processMode => on_change(current => ({ ...current, elements: current.elements.map(element => element.id === image?.id ? { ...element, processMode } : element) }))} disabled={!ready || loading} />
                    <ProcessSettings options={imageOptions} on_change={update_options} disabled={!ready || loading} fixedAlgorithm={image?.processMode === 'graphic' ? 'none' : undefined} rangeClassName="image-process-range" />
                    <div className="process-actions">
                        <Button variant="outline" className="w-full" disabled={!ready || loading} onClick={() => { update_options({ ...defaultOptions }); set_view('output') }}>使用推荐设置</Button>
                    </div>
                </section>
            </aside>

            <section className={`image-preview-panel ${ready ? '' : 'is-empty'}`} aria-label="图片预览">
                <div className="image-preview-toolbar"><div className="image-view-toggle"><button className={view === 'design' ? 'active' : ''} onClick={() => set_view('design')} aria-pressed={view === 'design'}><MousePointer2 />调整图片</button><button className={view === 'output' ? 'active' : ''} onClick={() => set_view('output')} aria-pressed={view === 'output'} disabled={!ready}><ScanEye />输出预览</button></div><div className="image-history-actions"><Button variant="ghost" size="icon" aria-label="撤销图片调整" title="撤销" disabled={!props.canUndo || loading} onClick={props.on_undo}><Undo2 /></Button><Button variant="ghost" size="icon" aria-label="重做图片调整" title="重做" disabled={!props.canRedo || loading} onClick={props.on_redo}><Redo2 /></Button></div></div>
                <div className="image-preview-viewport" ref={viewport}>{ready ? <div className="paper-stage image-preview-paper" style={{ width: scale > 0 ? scene.width * scale : '90%', height: scale > 0 ? scene.height * scale : undefined, aspectRatio: `${scene.width} / ${scene.height}` }} ref={stage} tabIndex={0} aria-label="图片直传可编辑画布" onPointerDown={gesture.start_move} onPointerMove={gesture.move} onPointerUp={gesture.end} onPointerCancel={gesture.cancel} onLostPointerCapture={gesture.cancel}>
                    <ScenePreview scene={gesture.scene} processed={view === 'output'} options={options} />
                    {selected && selected.visible && view === 'design' && <CanvasSelection element={selected} scene={scene} on_start={gesture.start_handle} />}
                </div> : <button className="image-empty-dropzone" onClick={() => input.current?.click()} disabled={loading}><span className="image-empty-art" aria-hidden="true"><FileImage size={38} strokeWidth={1.3} /><span><Upload size={15} /></span></span><strong>放入一张图片</strong><span>拖入图片，或点击选择文件</span><small>也可按 <kbd>Ctrl</kbd> + <kbd>V</kbd> 粘贴</small></button>}</div>
                <div className="image-preview-bottom"><span>{gesture.action === 'rotate' ? `旋转 ${Math.round(selected?.rotation ?? 0)}° · Shift 吸附` : gesture.action && gesture.action !== 'move' ? `${Math.round(selected?.width ?? 0)} × ${Math.round(selected?.height ?? 0)} px · Shift 切换比例` : `${scene.width} × ${scene.height} · ${paletteNames[scene.palette]}`}</span><div className="image-zoom-control"><Button variant="ghost" size="icon" aria-label="适应图片画布" title="适应画布" onClick={() => set_zoom('fit')} disabled={!ready}><Maximize2 /></Button><Select value={String(zoom)} onValueChange={value => set_zoom(value === 'fit' ? 'fit' : Number(value) as 100 | 125 | 200)} disabled={!ready}><SelectTrigger aria-label="图片预览缩放"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fit">适应</SelectItem><SelectItem value="100">100%</SelectItem><SelectItem value="125">125%</SelectItem><SelectItem value="200">200%</SelectItem></SelectContent></Select></div></div>
                {mismatch && <div className="image-size-notice"><span>画布与设备规格不同</span><button title="重新适配原图并重置旋转" onClick={() => deviceSize && change_size(deviceSize.width, deviceSize.height, deviceSize.palette)}>按设备适配</button></div>}
                {dragging && <div className="image-drop-overlay"><Upload size={26} /><b>松开以{ready ? '替换' : '导入'}图片</b></div>}
                {loading && <div className="image-loading-overlay"><Loader2 className="animate-spin" size={27} /><b>正在打开图片…</b></div>}
            </section>
        </div>

        <input ref={input} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml,.svg" aria-label="选择图片直传文件" disabled={loading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void import_file(file) }} />
    </div>
}
