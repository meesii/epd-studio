import { useEffect, useState } from 'react'
import { Bluetooth, ChevronDown, Cpu, FileDown, Info, Loader2, Moon, RotateCcw, Settings2, SquareDashed, Terminal, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import { AutoConnectPanel } from '@/components/auto-connect-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { deviceClient } from '@/hooks/use-device'
import type { AutoConnectState } from '@/lib/auto-reconnect'
import { screenModels, type DeviceLog, type DeviceSnapshot } from '@/lib/ble'
import { save_file } from '@/lib/files'
import './device-page.css'

type DeviceProps = {
    device: DeviceSnapshot
    logs: DeviceLog[]
    connecting: boolean
    sending: boolean
    on_connect: () => void
    on_reconnect: () => void
    on_refresh: () => void
    filterName: boolean
    on_filter: (value: boolean) => void
    autoConnect: boolean
    autoState: AutoConnectState
    on_auto_connect: (enabled: boolean) => void
}

/**
 * 将设备状态、连接偏好和控制集中在连续设置表单中。
 * @param props 真实设备状态、控制锁和用户操作回调。
 * @returns 默认折叠高级硬件与日志的设备控制台。
 */
export function DevicePage({ device, logs, connecting, sending, on_connect, on_reconnect, on_refresh, filterName, on_filter, autoConnect, autoState, on_auto_connect }: DeviceProps) {
    const [busy, set_busy] = useState(false)
    const [modelId, set_model_id] = useState('')
    const [pins, set_pins] = useState('')
    const [confirm, set_confirm] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null)
    const model = screenModels.find(item => item.id === device.modelId)
    const connectionBusy = connecting || autoState.status === 'connecting'
    const disabled = !device.connected || busy || sending || connectionBusy
    const controlBusy = busy || sending || connectionBusy

    useEffect(() => {
        set_pins('')
        if (!device.modelId) set_model_id('')
    }, [device.id, device.modelId])

    useEffect(() => {
        if (device.modelId) set_model_id(String(device.modelId))
    }, [device.id, device.modelId, device.config])

    /**
     * 执行设备操作，阻止重复提交并将实际错误呈现给用户。
     * @param action 异步蓝牙操作。
     * @param message 命令写入后的提示。
     * @returns 命令处理结束后的任务。
     */
    async function run(action: () => Promise<void>, message = '命令已发送'): Promise<void> {
        set_busy(true)
        try { await action(); toast.success(message) }
        catch (error) { toast.error(error instanceof Error ? error.message : String(error)) }
        finally { set_busy(false) }
    }

    /**
     * 验证通讯引脚后提交配置，任何校验失败均保留原配置。
     * @returns 设置结束后的任务。
     */
    async function apply_pins(): Promise<void> {
        const values = pins.trim().split(/[\s,]+/).map(value => Number(value))
        if (!pins.trim() || ![7, 8].includes(values.length) || values.some(value => !Number.isInteger(value) || (value !== 255 && (value < 0 || value > 47)))) throw new Error('请输入 7 或 8 个引脚编号，使用逗号分隔；范围 0–47，禁用填 255')
        await deviceClient.update_pins(values)
    }

    /**
     * 导出实际读取到的设备配置，不产生蓝牙写入。
     * @returns 无返回值。
     */
    function export_config(): void {
        save_file(new Blob([JSON.stringify({ device: device.name, firmware: device.firmware, config: device.config }, null, 4)], { type: 'application/json' }), 'epd-device-config.json')
    }

    /**
     * 导出按发生次序记录的真实连接日志。
     * @returns 无返回值。
     */
    function export_logs(): void {
        const text = logs.map(entry => new Date(entry.time).toLocaleString('zh-CN') + ' [' + entry.level + '] ' + entry.message).join('\n')
        save_file(new Blob([text], { type: 'text/plain;charset=utf-8' }), 'epd-connection.log')
    }

    return <div className="page-content device-console">
        <div className="device-console-heading"><h1>设备中心</h1></div>
        <div className="device-console-settings">
            <section className="device-current" aria-label="当前设备">
                <div className="device-current-top"><span className={'device-current-icon ' + (device.connected ? 'is-connected' : '')}><Bluetooth size={19} /></span><div className="device-current-name"><h2>{device.name || '尚未连接设备'}</h2><p>{model?.name || (device.connected ? '等待确认屏幕型号' : '连接后读取屏幕与固件信息')}</p></div><Badge variant="outline" className={device.connected ? 'device-online-badge' : ''}>{connectionBusy ? '正在连接' : device.connected ? '已连接' : '未连接'}</Badge><div className="device-current-actions">{device.id && !device.connected && <Button variant="outline" onClick={on_reconnect} disabled={controlBusy}><RotateCcw size={14} />重连上次设备</Button>}<Button variant={device.connected ? 'outline' : 'default'} onClick={device.connected ? () => deviceClient.disconnect() : on_connect} disabled={controlBusy}>{connectionBusy ? <Loader2 className="animate-spin" size={14} /> : device.connected ? <Unplug size={14} /> : <Bluetooth size={14} />}{connectionBusy ? '正在连接' : device.connected ? '断开设备' : '连接设备'}</Button></div></div>
                {(device.connected || device.firmware !== null) && <dl className="device-current-facts"><div><dt>固件</dt><dd>{device.firmware === null ? '—' : 'v' + (device.firmware >> 4) + '.' + (device.firmware & 15)}</dd></div><div><dt>分辨率</dt><dd>{model ? model.width + ' × ' + model.height : '待选择型号'}</dd></div><div><dt>写入上限</dt><dd>{device.payloadSize} B</dd></div><div><dt>设备时间</dt><dd>{device.deviceTime ? new Date(device.deviceTime * 1000).toLocaleString('zh-CN') : '未读取'}</dd></div></dl>}
                {device.lastError && <p className="device-state-error" role="alert"><Info size={14} />{device.lastError}</p>}
                {device.connected && !model && <p className="device-state-notice"><Info size={14} />未识别屏幕型号，请展开高级硬件配置并选择实际型号后发送。</p>}
            </section>

            <section className="device-settings-section" aria-labelledby="device-connection-heading">
                <h2 id="device-connection-heading"><Bluetooth size={15} />连接设置</h2>
                <div className="device-setting-row"><div className="device-setting-copy"><label htmlFor="device-filter">按名称筛选</label><p>{filterName ? '只显示 NRF_EPD 开头的设备' : '显示附近全部蓝牙设备，连接时验证 EPD 服务'}</p></div><Switch id="device-filter" checked={filterName} onCheckedChange={on_filter} aria-label="仅显示 NRF_EPD 设备" disabled={controlBusy} /></div>
                <AutoConnectPanel enabled={autoConnect} state={autoState} on_change={on_auto_connect} on_cancel={() => deviceClient.disconnect()} disabled={sending || busy} />

            </section>

            <section className="device-settings-section" aria-labelledby="device-controls-heading"><h2 id="device-controls-heading"><Settings2 size={15} />设备操作</h2><div className="device-operation-buttons"><Button variant="outline" disabled={disabled} onClick={() => set_confirm({ title: '清空屏幕？', description: '将擦除当前显示，并切换到图片模式。已保存的作品不受影响。', action: async () => { await deviceClient.clear(); on_refresh() } })}><SquareDashed size={14} />清空屏幕</Button><Button variant="outline" disabled={disabled} onClick={() => void run(() => deviceClient.sleep_screen(), '屏幕休眠命令已发送')}><Moon size={14} />屏幕休眠</Button><Button variant="outline" disabled={disabled} onClick={() => set_confirm({ title: '重启设备？', description: '蓝牙将断开，设备时间需要重新同步，屏幕内容也可能被固件重新绘制。', action: () => deviceClient.reset_device() })}><RotateCcw size={14} />重新启动</Button></div><p className="device-field-note">屏幕休眠保留当前画面。</p></section>

            <Collapsible className="device-settings-fold"><CollapsibleTrigger asChild><Button type="button" variant="ghost" className="device-fold-trigger"><Cpu size={15} /><span>高级硬件配置</span><small>型号、引脚与配置导出</small><ChevronDown size={15} /></Button></CollapsibleTrigger><CollapsibleContent className="device-fold-content"><p className="device-config-warning"><Info size={14} />仅在确认实际型号和接线后修改，错误配置可能影响屏幕通信。</p><div className="device-hardware-row"><label className="device-field">屏幕驱动<Select value={modelId} onValueChange={set_model_id} disabled={disabled}><SelectTrigger aria-label="屏幕驱动"><SelectValue placeholder="选择实际屏幕型号" /></SelectTrigger><SelectContent>{screenModels.map(item => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select></label><Button variant="outline" disabled={disabled || !modelId} onClick={() => set_confirm({ title: '更新屏幕驱动？', description: '请确认此型号与屏幕一致；配置会写入设备。', action: () => deviceClient.set_model(Number(modelId)) })}>应用屏幕型号</Button></div><label className="device-field">通讯引脚<Input aria-label="设备通讯引脚" value={pins} onChange={event => set_pins(event.target.value)} placeholder={device.config ? device.config.slice(0, 7).join(', ') : 'MOSI, SCLK, CS, DC, RST, BUSY, BS, EN'} disabled={disabled} /></label><div className="device-pins-footer"><p className="device-field-note">按顺序填写 7 个引脚，可附第 8 个 EN；范围 0–47，禁用填 255。</p><div><Button variant="outline" disabled={disabled || !pins.trim()} onClick={() => set_confirm({ title: '更新引脚配置？', description: '请确认引脚接线与输入一致；配置错误会影响屏幕通信。', action: apply_pins })}>写入引脚</Button><Button variant="ghost" disabled={!device.config} onClick={export_config}><FileDown size={14} />导出配置</Button></div></div></CollapsibleContent></Collapsible>

            <Collapsible className="device-settings-fold"><CollapsibleTrigger asChild><Button type="button" variant="ghost" className="device-fold-trigger"><Terminal size={15} /><span>连接日志</span><small>{logs.length ? logs.length + ' 条记录' : '暂无记录'}</small><ChevronDown size={15} /></Button></CollapsibleTrigger><CollapsibleContent className="device-fold-content"><div className="device-log-toolbar"><Button variant="ghost" size="sm" disabled={!logs.length} onClick={export_logs}><FileDown size={13} />导出日志</Button></div><div className="device-log-list">{logs.length ? [...logs].reverse().map(entry => <div className={'device-log-row is-' + entry.level} key={entry.id}><time>{new Date(entry.time).toLocaleTimeString('zh-CN')}</time><span>{entry.message}</span></div>) : <p className="device-log-empty">暂无日志</p>}</div></CollapsibleContent></Collapsible>
        </div>
        <Dialog open={!!confirm} onOpenChange={open => { if (!open) set_confirm(null) }}><DialogContent><DialogHeader><DialogTitle>{confirm?.title}</DialogTitle><DialogDescription>{confirm?.description}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => set_confirm(null)}>取消</Button><Button disabled={disabled} onClick={() => { const action = confirm?.action; set_confirm(null); if (action) void run(action) }}>确认执行</Button></DialogFooter></DialogContent></Dialog>
    </div>
}
