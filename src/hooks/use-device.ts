import { useEffect, useState } from 'react'
import { EpdClient, type DeviceSnapshot, type DeviceLog } from '@/lib/ble'
import { AutoReconnectManager, type AutoConnectSnapshot } from '@/lib/auto-reconnect'

let reconnectManager: AutoReconnectManager | undefined

class ManagedEpdClient extends EpdClient {
    /**
     * 在手动选择前停掉自动枚举，保持浏览器用户手势的同步调用路径。
     * @param options 用户选择器的名称过滤设置。
     * @returns 手动连接完成后的任务。
     */
    override connect(options: { filterName?: boolean } = {}): Promise<void> {
        try { reconnectManager?.before_manual_connect() }
        catch (error) { return Promise.reject(error) }
        return super.connect(options)
    }

    /**
     * 避免手动重连与自动 GATT 握手并发。
     * @returns 手动重连完成后的任务。
     */
    override reconnect(): Promise<void> {
        try { reconnectManager?.before_manual_connect() }
        catch (error) { return Promise.reject(error) }
        return super.reconnect()
    }

    /**
     * 明确断开时暂停当前页面的自动连接，刷新偏好保持不变。
     * @returns 无返回值。
     */
    override disconnect(): void {
        reconnectManager?.pause_session(false)
        super.disconnect()
    }
}

export const deviceClient = new ManagedEpdClient()
export const autoReconnect = new AutoReconnectManager(deviceClient, { disconnect: () => EpdClient.prototype.disconnect.call(deviceClient) })
reconnectManager = autoReconnect

/**
 * 修改刷新自动连接的持久偏好。
 * @param enabled 是否允许自动连接。
 * @returns 无返回值。
 */
const set_auto_connect = (enabled: boolean) => autoReconnect.set_enabled(enabled)

if (import.meta.hot) {
    import.meta.hot.dispose(() => { autoReconnect.dispose(); deviceClient.disconnect() })
}

/**
 * 订阅同一蓝牙客户端的连接状态和诊断日志。
 * @returns 当前设备信息及最近日志。
 */
export function use_device() {
    const [device, set_device] = useState<DeviceSnapshot>(deviceClient.snapshot)
    const [logs, set_logs] = useState<DeviceLog[]>([])
    const [automatic, set_automatic] = useState<AutoConnectSnapshot>(autoReconnect.snapshot)
    useEffect(() => deviceClient.subscribe(set_device), [])
    useEffect(() => deviceClient.subscribe_log((entry) => set_logs((current) => [...current.slice(-199), entry])), [])
    useEffect(() => autoReconnect.subscribe(set_automatic), [])
    useEffect(() => { autoReconnect.start() }, [])
    return { device, logs, ...automatic, set_auto_connect }
}
