import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import type { TransferProgress } from '@/lib/ble'
import { format_bytes } from '@/lib/files'
import { CheckCheck, ChevronUp, Loader2, Minus, WifiOff, X } from 'lucide-react'
import './transfer-panel.css'

export interface TransferTask {
    sceneName: string
    deviceName: string
    refreshSeconds: number
}

interface TransferState {
    task: TransferTask
    progress: TransferProgress | null
    running: boolean
    done: boolean
    error: string | null
}

interface TransferPanelProps extends TransferState {
    open: boolean
    on_open: (open: boolean) => void
    on_cancel: () => void
    on_history: () => void
    on_dismiss: () => void
}

const stages = { preparing: '准备画面', sending: '正在传输', verifying: '校验数据', refreshing: '请求刷新' }

/**
 * 为弹窗、后台任务卡和页头生成一致的真实任务状态。
 * @param state 当前传输状态。
 * @returns 可展示的进度与阶段名称。
 */
function task_status(state: TransferState) {
    return {
        percent: state.done ? 100 : Math.round(state.progress?.percent ?? 0),
        label: state.done ? '数据已发送 · 已请求刷新' : state.error ? '任务已停止' : stages[state.progress?.stage ?? 'preparing'],
    }
}

/**
 * 在页面顶部保留可恢复的传输任务入口。
 * @param props 当前任务与展开事件。
 * @returns 显示阶段与进度的任务按钮。
 */
export function TransferTaskButton(props: TransferState & { on_click: () => void }) {
    const status = task_status(props)
    return <button className={`transfer-task-button ${props.error ? 'failed' : ''}`} onClick={props.on_click} aria-label={`查看写入进度：${status.label} ${status.percent}%`}>
        {props.running ? <Loader2 size={14} className="animate-spin" /> : props.done ? <CheckCheck size={15} /> : <WifiOff size={15} />}
        <span>{status.label}</span><b>{status.percent}%</b>
    </button>
}

/**
 * 展示可最小化的写入窗口，关闭窗口只收起界面，取消必须单独操作。
 * @param props 任务快照、真实进度和控制事件。
 * @returns 写入弹窗及跨页面的后台进度卡。
 */
export function TransferPanel(props: TransferPanelProps) {
    const { task, progress, running, done, error, open, on_open, on_cancel, on_history, on_dismiss } = props
    const status = task_status(props)
    const details = <><span>{progress?.layer || '准备画面'}</span><span>{format_bytes(progress?.sentBytes ?? 0)} / {format_bytes(progress?.totalBytes ?? 0)}</span></>
    return <>
        <Dialog open={open} onOpenChange={on_open}><DialogContent showCloseButton={false} className="transfer-window">
            <button className="transfer-minimize" aria-label="最小化写入窗口" title="最小化到后台" onClick={() => on_open(false)}><Minus size={18} /></button>
            <DialogHeader><DialogTitle>{done ? '发送完成' : error ? '发送停止' : '发送中'}</DialogTitle><DialogDescription>{task.sceneName} · {task.deviceName}</DialogDescription></DialogHeader>
            <div className="transfer-dialog">
                <div className="transfer-progress-title"><b>{status.label}</b><span>{status.percent}%</span></div><Progress value={status.percent} aria-label="写入进度" />
                <div className="transfer-detail">{details}</div>
                {error ? <p className="transfer-error" role="alert">{error}</p> : <p className="transfer-note">{done ? `本次刷新预留约 ${task.refreshSeconds} 秒；尚无屏幕完成回执。` : '保持页面和设备连接。'}</p>}
            </div>
            <DialogFooter>{running ? <><Button variant="outline" disabled={progress?.stage === 'refreshing'} onClick={on_cancel}>{progress?.stage === 'refreshing' ? '正在提交刷新' : '取消发送'}</Button><Button onClick={() => on_open(false)}><Minus size={15} />最小化到后台</Button></> : <><Button variant="outline" onClick={on_history}>查看发送记录</Button><Button onClick={on_dismiss}>完成</Button></>}</DialogFooter>
        </DialogContent></Dialog>
        {!open && <section className={`transfer-dock ${error ? 'failed' : done ? 'done' : ''}`} aria-label="后台写入任务" aria-live="polite">
            <div className="transfer-dock-heading"><span className="transfer-dock-icon">{running ? <Loader2 size={15} className="animate-spin" /> : done ? <CheckCheck size={16} /> : <WifiOff size={16} />}</span><div><b title={task.sceneName}>{task.sceneName}</b><small>{task.deviceName}</small></div><button aria-label="展开写入窗口" title="展开写入窗口" onClick={() => on_open(true)}><ChevronUp size={17} /></button>{!running && <button aria-label="关闭后台任务卡" onClick={on_dismiss}><X size={15} /></button>}</div>
            <div className="transfer-dock-status"><span>{status.label}</span><b>{status.percent}%</b></div><Progress value={status.percent} aria-label="后台写入进度" />
            <div className="transfer-detail">{details}</div>{running && progress && progress.speed > 0 && <small className="transfer-dock-speed">{format_bytes(progress.speed)}/s</small>}{error && <p className="transfer-error" role="alert">{error}</p>}
        </section>}
    </>
}
