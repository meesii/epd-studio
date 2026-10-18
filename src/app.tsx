import { DevicePage } from '@/components/device-page'
import { Editor } from '@/components/editor'
import { StudioEmpty } from '@/components/studio-empty'
import { ImageSendPage } from '@/components/image-send-page'
import { TemplateGallery,WorksGallery } from '@/components/gallery'
import { TransferPage } from '@/components/transfer-page'
import { TransferPanel, TransferTaskButton, type TransferTask } from '@/components/transfer-panel'
import { Button } from '@/components/ui/button'
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator,DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { deviceClient,use_device } from '@/hooks/use-device'
import { use_workspace } from '@/hooks/use-workspace'
import { use_page } from '@/hooks/use-page'
import { use_image_draft } from '@/hooks/use-image-draft'
import { use_image_paste } from '@/hooks/use-image-paste'
import { resize_image_scene } from '@/lib/image-scene'
import { screenModels,type TransferProgress } from '@/lib/ble'
import { read_image,save_file } from '@/lib/files'
import { export_scene,export_workspace,import_scene,import_workspace,type Workspace } from '@/lib/storage'
import { clone_scene,create_scene,defaultOptions,pack_image_data,render_scene_output,resize_scene,type ProcessOptions,type Scene,type Template } from '@/lib/studio'
import { ArrowRight,ArrowUpRight,Bluetooth,BluetoothConnected,CircleHelp,ClipboardPaste,Download,FilePlus2,FolderOpen,Grid2X2,ImagePlus,Layers,Loader2,Menu,MoreHorizontal,Save,Send,Upload } from 'lucide-react'
import { useEffect,useRef,useState } from 'react'
import { toast } from 'sonner'

const pages = [{ id: 'studio' as const, label: '创作工作台', icon: Layers }, { id: 'image' as const, label: '图片直传', icon: ImagePlus }, { id: 'works' as const, label: '我的作品', icon: FolderOpen }, { id: 'templates' as const, label: '本地模板', icon: Grid2X2 }, { id: 'devices' as const, label: '设备中心', icon: Bluetooth }, { id: 'transfers' as const, label: '发送记录', icon: Send }]

/**
 * 协调本地创作、作品保存、蓝牙控制与发送任务。
 * @returns EPD Studio 应用界面。
 */
export default function App() {
    const work = use_workspace()
    const imageWork = use_image_draft()
    const [imageLoading, set_image_loading] = useState(false)
    const imageTicket = useRef(0)
    const navigationTicket = useRef(0)
    const publishBusy = useRef(false)
    const { device, logs, autoConnect, autoState, set_auto_connect } = use_device()
    const [page, set_page] = use_page((previous, next) => {
        navigationTicket.current += 1
        if (previous === 'studio' && next !== 'studio') work.clear_draft()
        set_pending_action(null)
        set_adapt_open(false)
        set_new_open(false)
        set_sidebar(false)
    })
    const [sidebar, set_sidebar] = useState(false)
    const [selectedIds, set_selected_ids] = useState<string[]>([])
    const selectedId = selectedIds.at(-1) ?? null
    const set_selected_id = (id: string | null) => set_selected_ids(id ? [id] : [])
    const options = work.scene?.processOptions ?? defaultOptions
    const set_options = (value: ProcessOptions) => work.change_scene((current) => ({ ...current, processOptions: value }))
    const [manualConnecting, set_connecting] = useState(false)
    const connecting = manualConnecting || autoState?.status === 'connecting'
    const [modeBusy, set_mode_busy] = useState(false)
    const modeAction = useRef(false)
    const [filterName, set_filter_name] = useState(true)
    const [sending, set_sending] = useState(false)
    const [progress, set_progress] = useState<TransferProgress | null>(null)
    const [transferOpen, set_transfer_open] = useState(false)
    const [transferDone, set_transfer_done] = useState(false)
    const [transferError, set_transfer_error] = useState<string | null>(null)
    const [transferTask, set_transfer_task] = useState<TransferTask | null>(null)
    const [pending_action, set_pending_action] = useState<((discard: boolean) => void) | null>(null)
    const [helpOpen, set_help_open] = useState(false)
    const [deleteScene, set_delete_scene] = useState<Scene | null>(null)
    const [adaptOpen, set_adapt_open] = useState(false)
    const [adaptSource, set_adapt_source] = useState<'studio' | 'image'>('studio')
    const adaptScene = adaptSource === 'image' ? imageWork.scene : work.scene
    const [newOpen, set_new_open] = useState(false)
    const [newName, set_new_name] = useState('未命名作品')
    const [backup, set_backup] = useState<Workspace | null>(null)
    const [cooldown, set_cooldown] = useState(0)
    const cooldownUntil = useRef(0)
    const abort = useRef<AbortController | null>(null)
    const fileInput = useRef<HTMLInputElement>(null)
    const projectInput = useRef<HTMLInputElement>(null)
    const model = screenModels.find((item) => item.id === device.modelId)
    const currentPage = pages.find((item) => item.id === page)!
    useEffect(() => {
        const available = new Set(work.scene?.elements.map(element => element.id) ?? [])
        set_selected_ids(current => {
            const next = current.filter(id => available.has(id))
            return next.length === current.length ? current : next
        })
    }, [work.scene])
    const clipboard = use_image_paste({
        enabled: !!work.workspace && (page === 'studio' ? !!work.scene : page === 'image') && !sidebar && !pending_action && !helpOpen && !deleteScene && !adaptOpen && !newOpen && !backup && !transferOpen,
        contextKey: page === 'studio' ? `studio:${work.scene?.id ?? ''}` : page,
        on_image: (file, is_current) => page === 'image' ? import_direct_image(file, is_current) : add_image(file, is_current),
    })

    /**
     * 为可能已经触发的物理刷新预留等待时间，避免连续刷新命令重叠。
     * @returns 无返回值。
     */
    function wait_refresh(): void {
        const seconds = screenModels.find((item) => item.id === deviceClient.snapshot.modelId)?.refreshSeconds ?? 20
        cooldownUntil.current = Date.now() + seconds * 1000
        set_cooldown(seconds)
    }

    useEffect(() => {
        const tick = window.setInterval(() => set_cooldown(Math.max(0, Math.ceil((cooldownUntil.current - Date.now()) / 1000))), 500)
        return () => window.clearInterval(tick)
    }, [])

    useEffect(() => {
        const on_key = (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey)) return
            if (event.key.toLowerCase() === 's') {
                event.preventDefault()
                if (page === 'image') return
                if (work.scene && work.dirty && work.saveState !== 'saving') void save_current()
                return
            }
            if (event.key.toLowerCase() !== 'z' || pending_action || (page !== 'studio' && page !== 'image')) return
            const target = event.target as HTMLElement
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return
            event.preventDefault()
            if (page === 'image') imageWork.move_history(event.shiftKey ? 'redo' : 'undo')
            else work.move_history(event.shiftKey ? 'redo' : 'undo')
        }
        window.addEventListener('keydown', on_key)
        return () => window.removeEventListener('keydown', on_key)
    }, [page, work.move_history, work.scene, work.dirty, work.saveState, work.save_scene, pending_action, imageWork.move_history])

    useEffect(() => {
        const on_leave = (event: BeforeUnloadEvent) => {
            if (!imageWork.dirty && !sending && !imageLoading) return
            event.preventDefault()
            event.returnValue = ''
        }
        window.addEventListener('beforeunload', on_leave)
        return () => window.removeEventListener('beforeunload', on_leave)
    }, [imageWork.dirty, sending, imageLoading])

    /**
     * 仅在用户点击保存或按快捷键时将当前草稿写入作品库。
     * @returns 当前快照是否保存成功。
     */
    async function save_current(): Promise<boolean> {
        const saved = await work.save_scene()
        if (saved) toast.success('作品已保存')
        return saved
    }

    /**
     * 切换草稿前保留保存、明确放弃和取消三种选择。
     * @param action 已确认后执行的草稿切换操作。
     * @returns 无返回值。
     */
    function replace_draft(action: (discard: boolean) => void): void {
        if (work.has_changes()) set_pending_action(() => action)
        else action(false)
    }

    /**
     * 打开独立新草稿，保存之前不加入作品库。
     * @param scene 新草稿内容。
     * @returns 无返回值。
     */
    function start_draft(scene: Scene): void {
        replace_draft((discard) => {
            if (!work.add_scene(scene, discard)) return
            set_selected_id(null)
            set_page('studio')
        })
    }

    /**
     * 从新建对话框创建默认黑白红三色画布。
     * @returns 无返回值。
     */
    function create_draft(): void {
        if (!newName.trim()) return
        set_new_open(false)
        start_draft(create_scene(newName.trim(), 800, 480, 'bwr'))
    }

    /**
     * 请求用户选择蓝牙设备并完成固件握手。
     * @returns 连接是否成功。
     */
    async function connect_device(reuse = false): Promise<boolean> {
        set_connecting(true)
        try {
            if (reuse) await deviceClient.reconnect()
            else await deviceClient.connect({ filterName })
            toast.success(`已连接 ${deviceClient.snapshot.name}`)
            return true
        } catch (error) {
            if (!(error instanceof DOMException && error.name === 'NotFoundError')) toast.error(error instanceof Error ? error.message : String(error))
            return false
        } finally { set_connecting(false) }
    }

    /**
     * 从模板页或设备中心校时并启用真实固件模式，与图片发送共用操作锁。
     * @param mode 1为设备日历，2为设备时钟。
     * @param weekStart 固件星期起始日，0到6。
     * @returns 模式命令结束后的任务，物理刷新仍需观察屏幕。
     */
    async function activate_mode(mode: 1 | 2, weekStart: number): Promise<void> {
        if (modeAction.current || publishBusy.current || sending || connecting || cooldownUntil.current > Date.now()) return
        modeAction.current = true
        set_mode_busy(true)
        try {
            if (!deviceClient.snapshot.connected && !await connect_device()) return
            await deviceClient.set_mode(mode, weekStart)
            wait_refresh()
            toast.success(mode === 1 ? '日历模式命令已发送' : '时钟模式命令已发送')
        } catch (error) { toast.error(error instanceof Error ? error.message : String(error)) }
        finally { modeAction.current = false; set_mode_busy(false) }
    }

    /**
     * 生成与最终传输一致的量化画布，不修改任何原始素材。
     * @param scene 待输出的作品。
     * @returns 已完成像素处理的画布。
     */
    async function output_canvas(scene: Scene): Promise<HTMLCanvasElement> {
        const canvas = document.createElement('canvas')
        await render_scene_output(canvas, scene, scene.processOptions ?? defaultOptions)
        return canvas
    }

    /**
     * 捕获发送画布并共用设备校验、可靠传输和后台进度，不将临时图片保存为作品。
     * @param input 用户点击发送时的作品或图片画布。
     * @param sourcePage 画布所属的编辑入口。
     * @returns 当前发送任务结束后的异步任务。
     */
    async function publish(input: Scene | null = work.scene, sourcePage: 'studio' | 'image' = 'studio'): Promise<void> {
        if (!input || publishBusy.current || modeAction.current || connecting || sending || cooldown > 0 || (sourcePage === 'image' && (imageLoading || !input.elements.some(element => element.type === 'image' && element.src)))) return
        const scene = structuredClone(input)
        publishBusy.current = true
        try {
            if (!deviceClient.snapshot.connected && !await connect_device()) return
            const target = { ...deviceClient.snapshot }
            const profile = screenModels.find(item => item.id === target.modelId)
            if (!profile) { toast.error('尚未识别屏幕型号，请在设备中心配置'); set_page('devices'); return }
            if (scene.width !== profile.width || scene.height !== profile.height || (scene.palette !== 'bw' && scene.palette !== profile.colors)) { set_adapt_source(sourcePage); set_adapt_open(true); return }
            if (cooldownUntil.current > Date.now()) { toast.info('请等待当前屏幕刷新后再发送'); return }
            set_transfer_open(true)
            set_transfer_task({ sceneName: scene.name.trim() || '未命名作品', deviceName: target.name, refreshSeconds: profile.refreshSeconds })
            set_sending(true)
            set_transfer_done(false)
            set_transfer_error(null)
            set_progress({ stage: 'preparing', layer: '', sentBytes: 0, totalBytes: 0, percent: 0, speed: 0 })
            abort.current = new AbortController()
            const started = Date.now()
            let sentBytes = 0
            let refreshSent = false
            try {
                const canvas = await output_canvas(scene)
                if (abort.current.signal.aborted) throw new DOMException('发送已取消', 'AbortError')
                const layers = pack_image_data(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height), scene.palette, profile.id)
                const bytes = layers.reduce((total, layer) => total + layer.data.length, 0)
                set_progress({ stage: 'preparing', layer: layers[0]?.name ?? '', sentBytes: 0, totalBytes: bytes, percent: 0, speed: 0 })
                const result = await deviceClient.transfer(layers, value => { sentBytes = value.sentBytes; refreshSent = value.stage === 'refreshing'; set_progress(value) }, abort.current.signal)
                work.add_record({ id: crypto.randomUUID(), sceneName: scene.name, deviceName: target.name, time: Date.now(), status: 'sent', bytes: result.bytes, durationMs: result.durationMs, verified: result.verified })
                if (sourcePage === 'image') imageWork.mark_sent(scene)
                wait_refresh()
                set_transfer_done(true)
                toast.success('数据已发送，等待屏幕刷新')
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                const cancelled = error instanceof DOMException && error.name === 'AbortError'
                set_transfer_error(message)
                work.add_record({ id: crypto.randomUUID(), sceneName: scene.name, deviceName: target.name, time: Date.now(), status: cancelled ? 'cancelled' : 'failed', bytes: sentBytes, durationMs: Date.now() - started, verified: false, error: message })
                if (refreshSent) wait_refresh()
                toast.error(cancelled ? '已停止发送' : '发送失败', { description: message })
            } finally { set_sending(false); abort.current = null }
        } finally { publishBusy.current = false }
    }

    /**
     * 解码图片直传文件，后选择的图片优先，整个过程只更新独立临时画布。
     * @param file 用户选择或拖入的本地图片。
     * @param is_current 粘贴来源是否仍是当前编辑会话。
     * @returns 图片读取结束后的异步任务。
     */
    async function import_direct_image(file: File, is_current = () => true): Promise<void> {
        if (!is_current()) return
        const ticket = ++imageTicket.current
        set_image_loading(true)
        try {
            const image = await read_image(file)
            if (ticket !== imageTicket.current || !is_current()) return
            imageWork.import_image({ ...image, name: file.name })
        } catch (error) {
            if (ticket === imageTicket.current && is_current()) toast.error(error instanceof Error ? error.message : String(error))
        } finally { if (ticket === imageTicket.current) set_image_loading(false) }
    }

    /**
     * 导入图片为独立可编辑图层，保留画布的现有内容。
     * @param file 用户选择的本地图片。
     * @param is_current 粘贴来源是否仍是当前编辑会话。
     * @returns 导入操作结束后的异步任务。
     */
    async function add_image(file: File, is_current = () => true): Promise<void> {
        if (!work.scene || !is_current()) return
        if (work.scene.elements.length >= 200) { toast.error('每个作品最多包含 200 个图层'); return }
        const sceneId = work.scene.id
        const ticket = navigationTicket.current
        try {
            const image = await read_image(file)
            if (ticket !== navigationTicket.current || !is_current()) return
            const elementId = crypto.randomUUID()
            let sameScene = true
            const added = work.change_scene((current) => {
                if (current.id !== sceneId) { sameScene = false; return current }
                const scale = Math.min(current.width / image.width * 0.85, current.height / image.height * 0.85)
                const width = Math.max(1, Math.round(image.width * scale))
                const height = Math.max(1, Math.round(image.height * scale))
                const element = { id: elementId, type: 'image' as const, name: file.name.replace(/\.[^.]+$/, '') || '粘贴图片', x: Math.round((current.width - width) / 2), y: Math.round((current.height - height) / 2), width, height, visible: true, locked: false, fill: '#ffffff', src: image.src, ...(image.processMode && { processMode: image.processMode }) }
                return { ...current, elements: [...current.elements, element] }
            })
            if (!sameScene) { toast.info('导入期间切换了作品，请在目标作品中重新导入'); return }
            if (!added) return
            set_selected_id(elementId)
            set_page('studio')
        } catch (error) { if (ticket === navigationTicket.current && is_current()) toast.error(error instanceof Error ? error.message : String(error)) }
    }

    /**
     * 用模板创建独立作品，不覆盖已有草稿。
     * @param template 用户选中的模板。
     * @returns 无返回值。
     */
    function use_template(template: Template): void {
        start_draft(clone_scene(template.scene))
    }

    /**
     * 导出可再次编辑的作品数据。
     * @param scene 待导出的作品。
     * @returns 无返回值。
     */
    function download_scene(scene: Scene): void {
        try { save_file(export_scene({ ...scene, name: scene.name.trim() || '未命名作品', elements: scene.elements.map((item) => ({ ...item, name: item.name.trim() || '未命名图层' })) }), `${scene.name.trim() || '未命名作品'}.epd.json`) }
        catch (error) { toast.error(error instanceof Error ? error.message : String(error)) }
    }

    /**
     * 导入作品或显示工作区恢复预览；离页后结束的文件读取不能重新打开旧操作。
     * @param file 用户选择的本地作品文件。
     * @returns 文件解析和当前页面状态更新结束后的任务。
     */
    async function import_project(file: File): Promise<void> {
        const ticket = navigationTicket.current
        try {
            if (file.size > 10 * 1024 * 1024) throw new Error('请选择小于 10 MB 的作品文件')
            const header = JSON.parse(await file.text()) as { format?: string }
            if (ticket !== navigationTicket.current) return
            if (header.format === 'epd-studio-workspace') {
                const value = await import_workspace(file)
                if (ticket === navigationTicket.current) set_backup(value)
            } else {
                const scene = await import_scene(file)
                if (ticket === navigationTicket.current) start_draft(clone_scene(scene))
            }
        } catch (error) {
            if (ticket === navigationTicket.current) toast.error(error instanceof Error ? error.message : String(error))
        }
    }

    if (!work.workspace) return <div className="loading-screen"><Loader2 className="animate-spin" size={20} /><p>加载中</p></div>

    return <TooltipProvider><div className={`app-shell${page === 'studio' ? ' studio-layout' : ''}`}>
        <aside className={`app-sidebar ${sidebar ? 'mobile-open' : ''}`}>
            <a className="brand" href="#" onClick={(event) => { event.preventDefault(); set_page('studio'); set_sidebar(false) }}><span className="brand-mark">E<span /></span><span>EPD<span className="brand-light">STUDIO</span></span></a>
            <nav aria-label="主导航">{pages.map((item) => <button key={item.id} aria-label={item.label} title={item.label} className={page === item.id ? 'active' : ''} onClick={() => { set_page(item.id); set_sidebar(false) }}><item.icon size={18} /><span>{item.label}</span>{item.id === 'works' && <small>{work.workspace!.scenes.length}</small>}{page === item.id && <i />}</button>)}</nav>
            <button className="sidebar-device" onClick={() => set_page('devices')}><span className={`device-status-icon ${device.connected ? 'connected' : ''}`}>{device.connected ? <BluetoothConnected size={18} /> : <Bluetooth size={18} />}</span><span><b>{device.name || '未连接设备'}</b><small>{device.connected ? '已连接' : '蓝牙未连接'}</small></span><ArrowUpRight size={14} /></button>
        </aside>
        {sidebar && <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => set_sidebar(false)} />}
        <div className="app-main"><header className="app-header"><div className="header-inner"><div className="header-location"><button className="mobile-menu" aria-label="打开导航" onClick={() => set_sidebar(true)}><Menu size={20} /></button><span className="header-root">工作空间</span><span className="breadcrumb-slash">/</span><span>{currentPage.label}</span></div><div className="header-actions"><Button variant="ghost" size="icon" aria-label="使用帮助" title="使用帮助" onClick={() => set_help_open(true)}><CircleHelp size={18} /></Button>{transferTask && <TransferTaskButton task={transferTask} progress={progress} running={sending} done={transferDone} error={transferError} on_click={() => set_transfer_open(true)} />}<Button variant="outline" className="connect-button" onClick={device.connected ? () => set_page('devices') : () => void connect_device()} disabled={connecting || sending || modeBusy}>{connecting ? <Loader2 className="animate-spin" /> : device.connected ? <BluetoothConnected /> : <Bluetooth />}{connecting ? '正在连接' : device.connected ? device.name : '连接设备'}{device.connected && <span className="connected-dot" />}</Button></div></div></header>
            <main className={page === 'studio' ? 'studio-page' : page === 'image' ? 'image-page' : ''}>
                {page === 'studio' && <><h1 className="sr-only">创作工作台</h1>
                    {work.scene ? <><div className="project-bar"><div className="project-name"><span className="project-icon"><Layers size={17} /></span><Input aria-label="作品名称" value={work.scene.name} maxLength={100} onChange={(event) => work.change_scene((current) => ({ ...current, name: event.target.value }))} /><span className={`save-status ${work.saveState}`}><span />{work.saveState === 'saving' ? '保存中' : work.saveState === 'error' ? '保存失败' : work.dirty ? '未保存' : '已保存'}</span></div><div className="project-actions"><Button variant="outline" onClick={() => set_new_open(true)}><FilePlus2 size={14} />新建作品</Button><Button variant="outline" onClick={() => fileInput.current?.click()}><ImagePlus size={14} />导入图片</Button><Button variant="outline" size="icon" aria-label="粘贴图片" title="粘贴图片 (Ctrl+V)" disabled={clipboard.pasting} onClick={() => void clipboard.paste_image()}>{clipboard.pasting ? <Loader2 className="animate-spin" /> : <ClipboardPaste size={14} />}</Button><Button variant="outline" className="save-button" disabled={!work.dirty || work.saveState === 'saving'} onClick={() => void save_current()} title="保存作品 (Ctrl+S)">{work.saveState === 'saving' ? <Loader2 className="animate-spin" /> : <Save size={14} />}保存作品</Button><Button className="publish-button" disabled={sending || connecting || modeBusy || cooldown > 0} onClick={() => void publish()}>{sending ? <Loader2 className="animate-spin" /> : <Send size={14} />}{sending ? '正在发送' : cooldown > 0 ? `等待刷新 ${cooldown}s` : '发送到墨水屏'}</Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="作品选项" title="作品选项"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="project-menu"><DropdownMenuItem onClick={() => projectInput.current?.click()}><Upload />导入作品</DropdownMenuItem><DropdownMenuItem onClick={() => download_scene(work.scene!)}><Download />导出作品</DropdownMenuItem><DropdownMenuItem onClick={async () => { try { const canvas = await output_canvas(work.scene!); canvas.toBlob((blob) => { if (blob) save_file(blob, `${work.scene!.name}.png`) }, 'image/png') } catch (error) { toast.error(error instanceof Error ? error.message : String(error)) } }}><ImagePlus />导出 PNG</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => start_draft(clone_scene(work.scene!))}><Layers />复制作品</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></div>
                    <Editor scene={work.scene} selectedId={selectedId} selectedIds={selectedIds} on_select={set_selected_id} on_select_many={set_selected_ids} on_change={work.change_scene} options={options} on_options={set_options} on_image={() => fileInput.current?.click()} on_template={() => set_page('templates')} on_undo={() => work.move_history('undo')} on_redo={() => work.move_history('redo')} canUndo={work.canUndo} canRedo={work.canRedo} />
                    </> : <StudioEmpty savedCount={work.workspace.scenes.length} on_new={() => set_new_open(true)} on_template={() => set_page('templates')} on_works={() => set_page('works')} on_import={() => projectInput.current?.click()} />}</>}
                {page === 'image' && <ImageSendPage scene={imageWork.scene} source={imageWork.source} on_change={imageWork.change_scene} on_image={import_direct_image} on_paste={clipboard.paste_image} pasting={clipboard.pasting} loading={imageLoading} deviceName={device.name} deviceSize={model ? { width: model.width, height: model.height, palette: model.colors } : undefined} connected={device.connected} connecting={connecting} deviceBusy={modeBusy} sending={sending} cooldown={cooldown} on_send={() => void publish(imageWork.scene, 'image')} on_connect={() => void connect_device()} canUndo={imageWork.canUndo} canRedo={imageWork.canRedo} on_undo={() => imageWork.move_history('undo')} on_redo={() => imageWork.move_history('redo')} />}
                {page === 'works' && <WorksGallery scenes={work.workspace.scenes} on_open={(id) => replace_draft((discard) => { if (work.open_scene(id, discard)) { set_selected_id(null); set_page('studio') } })} on_new={() => set_new_open(true)} on_duplicate={(scene) => start_draft(clone_scene(scene))} on_export={download_scene} on_delete={set_delete_scene} />}
                {page === 'templates' && <TemplateGallery on_use={use_template} device={device} busy={sending || connecting || modeBusy || cooldown > 0} on_mode={(mode, week) => void activate_mode(mode, week)} />}
                {page === 'devices' && <DevicePage device={device} logs={logs} connecting={connecting} sending={sending || modeBusy || cooldown > 0} autoConnect={autoConnect} autoState={autoState} on_auto_connect={set_auto_connect} on_connect={() => void connect_device()} on_reconnect={() => void connect_device(true)} on_refresh={wait_refresh} filterName={filterName} on_filter={set_filter_name} />}
                {page === 'transfers' && <TransferPage on_clear={work.clear_records} records={work.workspace.history} on_create={() => set_page('studio')} />}
            </main>
        </div>
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml,.svg" className="sr-only" aria-label="导入图片文件" onChange={(event) => { const file = event.target.files?.[0]; if (file) void add_image(file); event.target.value = '' }} />
        <input ref={projectInput} type="file" accept=".json" className="sr-only" aria-label="导入作品文件" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void import_project(file) }} />
        <Dialog open={newOpen} onOpenChange={set_new_open}><DialogContent><DialogHeader><DialogTitle>新建作品</DialogTitle><DialogDescription>800 × 480 · 黑白红三色</DialogDescription></DialogHeader><label className="field-label">作品名称<Input autoFocus value={newName} maxLength={100} onChange={(event) => set_new_name(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') create_draft() }} /></label><DialogFooter><Button variant="outline" onClick={() => set_new_open(false)}>取消</Button><Button disabled={!newName.trim()} onClick={create_draft}>创建草稿 <ArrowRight size={14} /></Button></DialogFooter></DialogContent></Dialog>
        <Dialog open={!!deleteScene} onOpenChange={(open) => { if (!open) set_delete_scene(null) }}><DialogContent><DialogHeader><DialogTitle>删除「{deleteScene?.name}」？</DialogTitle><DialogDescription>该操作会从当前浏览器移除作品；若正在编辑这份作品，其未保存修改也会放弃。请先导出需要保留的内容。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => { if (deleteScene) download_scene(work.scene?.id === deleteScene.id ? work.scene : deleteScene) }}>先导出作品</Button><Button variant="destructive" onClick={() => { if (deleteScene && work.remove_scene(deleteScene.id, true)) { set_delete_scene(null); set_selected_id(null) } }}>确认删除作品</Button></DialogFooter></DialogContent></Dialog>
        <Dialog open={!!backup} onOpenChange={(open) => { if (!open) set_backup(null) }}><DialogContent><DialogHeader><DialogTitle>恢复这份工作区备份？</DialogTitle><DialogDescription>备份中有 {backup?.scenes.length} 份作品和 {backup?.history.length} 条发送记录。恢复将替换当前作品库，并放弃未保存草稿。请先导出需要保留的内容。</DialogDescription></DialogHeader><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { try { save_file(export_workspace(work.workspace!), 'epd-studio-current-backup.json') } catch (error) { toast.error(error instanceof Error ? error.message : String(error)) } }}><Download size={14} />备份已保存作品库</Button>{work.scene && <Button variant="outline" onClick={() => download_scene(work.scene!)}><Download size={14} />导出当前草稿</Button>}</div><DialogFooter><Button variant="outline" onClick={() => set_backup(null)}>取消</Button><Button onClick={() => { if (backup && work.restore_workspace(backup, true)) { set_backup(null); set_selected_id(null); set_page('works'); toast.info('正在恢复工作区') } }}>确认恢复备份</Button></DialogFooter></DialogContent></Dialog>
        <Dialog open={!!pending_action} onOpenChange={(open) => { if (!open && work.saveState !== 'saving') set_pending_action(null) }}><DialogContent><DialogHeader><DialogTitle>保存当前作品？</DialogTitle><DialogDescription>「{work.scene?.name.trim() || '未命名作品'}」有未保存内容。保存后再切换，或放弃这份草稿的修改。</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" disabled={work.saveState === 'saving'} onClick={() => set_pending_action(null)}>取消</Button><Button variant="outline" disabled={work.saveState === 'saving'} onClick={() => { const action = pending_action; set_pending_action(null); action?.(true) }}>不保存，继续</Button><Button disabled={work.saveState === 'saving'} onClick={async () => { if (!pending_action) return; const action = pending_action; const ticket = navigationTicket.current; if (await save_current()) { if (ticket !== navigationTicket.current) return; if (work.has_changes()) { toast.info('保存期间画面有变化，请再次保存后继续'); return } set_pending_action(null); action(false) } }}>{work.saveState === 'saving' ? <Loader2 className="animate-spin" /> : <Save size={14} />}保存后继续</Button></DialogFooter></DialogContent></Dialog>
        <Dialog open={adaptOpen} onOpenChange={set_adapt_open}><DialogContent><DialogHeader><DialogTitle>适配屏幕尺寸</DialogTitle><DialogDescription>画布 {adaptScene?.width} × {adaptScene?.height}，设备 {model?.width} × {model?.height}（{model?.colors.toUpperCase()}）。适配后检查预览再发送。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => set_adapt_open(false)}>继续编辑</Button><Button onClick={() => { if (model) { if (adaptSource === 'image') imageWork.change_scene(current => resize_image_scene(current, model.width, model.height, model.colors, imageWork.source)); else work.change_scene(current => resize_scene(current, model.width, model.height, current.palette === 'bw' ? 'bw' : model.colors)) } set_adapt_open(false); set_selected_id(null) }}>适配当前画布</Button></DialogFooter></DialogContent></Dialog>
        {transferTask && <TransferPanel task={transferTask} progress={progress} running={sending} done={transferDone} error={transferError} open={transferOpen} on_open={set_transfer_open} on_cancel={() => abort.current?.abort()} on_history={() => { set_transfer_open(false); set_page('transfers') }} on_dismiss={() => { set_transfer_open(false); set_transfer_task(null) }} />}
        <Dialog open={helpOpen} onOpenChange={set_help_open}><DialogContent><DialogHeader><DialogTitle>使用帮助</DialogTitle><DialogDescription className="sr-only">编辑、连接、发送与保存说明</DialogDescription></DialogHeader><div className="guide-steps"><div><span><strong>编辑</strong>拖动图层移动，控制点缩放，圆柄旋转。文字随内容和字号自动调整尺寸。Ctrl+V 粘贴图片；方向键移动 1 像素，Shift+方向键移动 10 像素。</span></div><div><span><strong>连接</strong>使用支持 Web Bluetooth 的 Chrome / Edge，通过 localhost 或 HTTPS 打开。断开手机蓝牙并唤醒设备。</span></div><div><span><strong>发送</strong>检查墨水屏预览与屏幕型号。发送完成后，实体屏幕仍需要时间刷新。</span></div><div><span><strong>保存与备份</strong>Ctrl+S 保存到当前浏览器。离开工作台会清除未保存内容，已保存作品可从「我的作品」继续编辑。清除浏览器数据前请导出备份。</span></div></div><DialogFooter><Button variant="outline" onClick={() => { try { save_file(export_workspace(work.workspace!), 'epd-studio-backup.json') } catch (error) { toast.error(error instanceof Error ? error.message : String(error)) } }}><Download size={14} />备份全部作品</Button><Button onClick={() => set_help_open(false)}>关闭</Button></DialogFooter></DialogContent></Dialog>
    </div><Toaster position="bottom-right" offset={{ right: 'max(24px, calc((100vw - var(--app-width)) / 2 + 24px))', bottom: 24 }} mobileOffset={16} richColors closeButton /></TooltipProvider>
}
