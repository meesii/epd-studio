import { Bluetooth, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { AutoConnectState } from '@/lib/auto-reconnect'
import './auto-connect-panel.css'

/**
 * 显示按浏览器能力降级的自动重连偏好，允许用户取消本次握手。
 * @param props 已保存偏好、真实连接状态和用户操作。
 * @returns 设备中心的自动连接设置。
 */
export function AutoConnectPanel({ enabled, state, on_change, on_cancel, disabled }: { enabled: boolean; state: AutoConnectState; on_change: (enabled: boolean) => void; on_cancel: () => void; disabled: boolean }) {
    return <section className="device-setting-row device-auto-row" aria-label="自动连接设置">
        <div className="device-setting-copy">
            <label htmlFor="device-auto-connect">刷新后自动连接</label>
            <div className={`device-auto-status is-${state.status}`} role="status">{state.status === 'connecting' ? <Loader2 size={13} className="animate-spin" /> : <Bluetooth size={13} />}<span>{state.message}{state.status === 'connecting' && state.attempt > 0 && <small>第 {state.attempt} / 2 次尝试</small>}</span></div>
        </div>
        <div className="device-auto-controls">{state.status === 'connecting' && <Button variant="outline" size="sm" onClick={on_cancel} disabled={disabled}>取消自动连接</Button>}<Switch id="device-auto-connect" checked={enabled} onCheckedChange={on_change} aria-label="刷新后自动连接" disabled={disabled} /></div>
    </section>
}
