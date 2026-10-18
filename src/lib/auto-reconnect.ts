import type { BluetoothProvider, DeviceSnapshot, EpdBluetoothDevice } from './ble'

export type AutoConnectStatus = 'idle' | 'disabled' | 'unsupported' | 'no-device' | 'connecting' | 'connected' | 'unavailable' | 'paused'
export interface AutoConnectState { status: AutoConnectStatus; attempt: number; message: string }
export interface AutoConnectSnapshot { autoConnect: boolean; autoState: AutoConnectState }

interface ReconnectClient {
    readonly snapshot: DeviceSnapshot
    readonly isBusy: boolean
    subscribe(listener: (snapshot: DeviceSnapshot) => void): () => void
    connect_known_device(device: EpdBluetoothDevice): Promise<void>
    disconnect(): void
}

interface PreferenceStore { getItem(key: string): string | null; setItem(key: string, value: string): void }
interface ReconnectOptions {
    storage?: PreferenceStore | null
    bluetooth?: () => Pick<BluetoothProvider, 'getDevices'> | null
    disconnect?: () => void
    timeoutMs?: number
    listTimeoutMs?: number
    retryMs?: number
}

const preferenceKey = 'epd-studio-bluetooth'

function browser_storage(): PreferenceStore | null {
    try { return typeof localStorage === 'undefined' ? null : localStorage }
    catch { return null }
}

function browser_bluetooth(): Pick<BluetoothProvider, 'getDevices'> | null {
    return typeof navigator === 'undefined' ? null : (navigator as Navigator & { bluetooth?: BluetoothProvider }).bluetooth ?? null
}

/**
 * 约束异步枚举和连接的等待时间，并在关闭开关或手动断开时立即退出。
 * @param task 已开始的浏览器操作。
 * @param timeout 最长等待时间。
 * @param signal 本次启动任务的取消信号。
 * @param on_timeout 连接超时时中断客户端握手。
 * @returns 浏览器操作结果。
 */
function limited<T>(task: Promise<T>, timeout: number, signal: AbortSignal, on_timeout?: () => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>
        let settled = false
        const finish = (error?: unknown, value?: T) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            signal.removeEventListener('abort', aborted)
            if (error) reject(error)
            else resolve(value as T)
        }
        const aborted = () => finish(new DOMException('自动连接已取消', 'AbortError'))
        if (signal.aborted) { task.catch(() => {}); aborted(); return }
        signal.addEventListener('abort', aborted, { once: true })
        timer = setTimeout(() => {
            try { on_timeout?.() } catch { /* 原生断开失败也必须结束本次有限等待。 */ }
            finish(new DOMException('设备暂未响应', 'TimeoutError'))
        }, timeout)
        task.then((value) => finish(undefined, value), (error) => finish(error))
    })
}

/**
 * 仅对最近成功连接且仍被浏览器授权的设备做一次启动重连流程。
 * @param client 共享 BLE 客户端。
 * @param options 可替换的浏览器能力与有限重试设置。
 * @returns 不弹选择器、不持续轮询的连接管理器。
 */
export class AutoReconnectManager {
    private readonly client: ReconnectClient
    private readonly storage: PreferenceStore | null
    private readonly bluetooth: () => Pick<BluetoothProvider, 'getDevices'> | null
    private readonly disconnect_auto: () => void
    private readonly timeoutMs: number
    private readonly listTimeoutMs: number
    private readonly retryMs: number
    private readonly listeners = new Set<(snapshot: AutoConnectSnapshot) => void>()
    private readonly unsubscribe: () => void
    private state: AutoConnectSnapshot = { autoConnect: true, autoState: { status: 'idle', attempt: 0, message: '刷新时尝试连接最近已授权设备' } }
    private lastDeviceId: string | null = null
    private started = false
    private paused = false
    private disposed = false
    private attempting = false
    private controller: AbortController | null = null

    /**
     * 读取本地偏好并观察成功连接，不在构造时访问蓝牙设备。
     * @param client 共享 BLE 客户端。
     * @param options 浏览器能力与超时配置。
     */
    constructor(client: ReconnectClient, options: ReconnectOptions = {}) {
        this.client = client
        this.storage = options.storage === undefined ? browser_storage() : options.storage
        this.bluetooth = options.bluetooth ?? browser_bluetooth
        this.disconnect_auto = options.disconnect ?? (() => client.disconnect())
        this.timeoutMs = options.timeoutMs ?? 15000
        this.listTimeoutMs = options.listTimeoutMs ?? 4000
        this.retryMs = options.retryMs ?? 1500
        try {
            const saved = JSON.parse(this.storage?.getItem(preferenceKey) ?? 'null') as { version?: number; enabled?: boolean; lastDeviceId?: unknown } | null
            if (saved?.version === 1) {
                this.state.autoConnect = typeof saved.enabled === 'boolean' ? saved.enabled : true
                this.lastDeviceId = typeof saved.lastDeviceId === 'string' && saved.lastDeviceId.length > 0 && saved.lastDeviceId.length <= 2000 ? saved.lastDeviceId : null
            }
        } catch { /* 存储被禁用或旧数据损坏时，不猜测需要连接的设备。 */ }
        if (!this.state.autoConnect) this.status('disabled', '已关闭刷新自动连接')
        this.unsubscribe = client.subscribe((snapshot) => this.on_device(snapshot))
    }

    get snapshot(): AutoConnectSnapshot { return this.state }

    /**
     * 订阅偏好与自动连接状态，立即提供当前值。
     * @param listener 状态接收函数。
     * @returns 取消订阅函数。
     */
    subscribe(listener: (snapshot: AutoConnectSnapshot) => void): () => void {
        this.listeners.add(listener)
        listener(this.state)
        return () => this.listeners.delete(listener)
    }

    private status(status: AutoConnectStatus, message: string, attempt = 0): void {
        if (this.disposed) return
        this.state = { ...this.state, autoState: { status, message, attempt } }
        for (const listener of this.listeners) listener(this.state)
    }

    private save_preference(): void {
        try { this.storage?.setItem(preferenceKey, JSON.stringify({ version: 1, enabled: this.state.autoConnect, lastDeviceId: this.lastDeviceId })) }
        catch { /* 偏好不可写时仍可手动连接，不能因此触发蓝牙授权弹窗。 */ }
    }

    private on_device(snapshot: DeviceSnapshot): void {
        if (this.disposed) return
        if (snapshot.connected) {
            if (snapshot.id && snapshot.id !== this.lastDeviceId) {
                this.lastDeviceId = snapshot.id
                this.save_preference()
            }
            if (this.state.autoConnect) this.status('connected', '已连接；下次刷新可尝试自动重连')
        } else if (this.state.autoState.status === 'connected') {
            this.status(this.paused ? 'paused' : 'unavailable', this.paused ? '本次已暂停自动连接，可手动重连' : '设备已断开，请唤醒后手动重连')
        }
    }

    /**
     * 每个页面实例只启动一次，React StrictMode 或多个订阅者不会重复连接。
     * @returns 无返回值。
     */
    start(): void {
        if (this.started || this.disposed) return
        this.started = true
        if (!this.state.autoConnect) { this.status('disabled', '已关闭刷新自动连接'); return }
        if (this.paused) { this.status('paused', '本次已暂停自动连接，可手动重连'); return }
        if (this.client.snapshot.connected) { this.on_device(this.client.snapshot); return }
        if (this.client.isBusy) { this.status('paused', '设备正在执行手动任务，请稍候手动重连'); return }
        let bluetooth: Pick<BluetoothProvider, 'getDevices'> | null
        try { bluetooth = this.bluetooth() }
        catch { this.status('unsupported', '浏览器未开放已授权设备访问，请手动连接'); return }
        if (!bluetooth?.getDevices) { this.status('unsupported', '当前浏览器不支持刷新自动连接，请手动连接'); return }
        if (!this.lastDeviceId) { this.status('no-device', '尚未记录成功连接的设备，请先手动连接一次'); return }
        this.controller = new AbortController()
        void this.run(bluetooth, this.lastDeviceId, this.controller.signal)
    }

    /**
     * 更改跨刷新的自动连接偏好；关闭时中止本次自动握手，保留已有正常连接。
     * @param enabled 是否允许刷新时自动连接。
     * @returns 无返回值。
     */
    set_enabled(enabled: boolean): void {
        if (enabled === this.state.autoConnect || this.disposed) return
        this.state = { ...this.state, autoConnect: enabled }
        this.save_preference()
        if (!enabled) {
            this.pause_session(true)
            this.status('disabled', '已关闭刷新自动连接')
        } else {
            this.paused = false
            this.started = false
            this.start()
        }
    }

    /**
     * 在用户操作中同步停掉枚举与退避，保留 requestDevice 所需的用户手势。
     * @returns 正在自动握手时抛出忙错误，避免手动连接与 GATT 并发。
     */
    before_manual_connect(): void {
        if (this.attempting) throw new Error('正在自动连接，请先取消自动连接或稍候再试')
        this.pause_session(false)
    }

    /**
     * 暂停本次页面中的自动连接，不改跨刷新偏好。
     * @param disconnect 是否需要终止正在进行的自动 GATT 握手。
     * @returns 无返回值。
     */
    pause_session(disconnect = true): void {
        this.paused = true
        this.controller?.abort()
        if (disconnect && this.attempting) this.disconnect_auto()
        if (!this.state.autoConnect) this.status('disabled', '已关闭刷新自动连接')
        else this.status('paused', '本次已暂停自动连接，可手动重连；刷新仍按开关设置尝试')
    }

    /**
     * 清理页面或热更新中的监听和挂起任务。
     * @returns 无返回值。
     */
    dispose(): void {
        this.pause_session(true)
        this.unsubscribe()
        this.listeners.clear()
        this.disposed = true
    }

    /**
     * 枚举既有授权并在有限退避内连接最近设备，任何取消都会结束本次启动流程。
     * @param bluetooth 当前浏览器的既有授权访问能力。
     * @param id 最近一次成功连接的设备 ID。
     * @param signal 本次页面启动流程的取消信号。
     * @returns 状态已更新后的任务。
     */
    private async run(bluetooth: Pick<BluetoothProvider, 'getDevices'>, id: string, signal: AbortSignal): Promise<void> {
        try {
            this.status('idle', '正在读取浏览器已授权设备')
            const devices = await limited(bluetooth.getDevices!(), this.listTimeoutMs, signal)
            if (signal.aborted) return
            const device = devices.find((item) => item.id === id)
            if (!device) { this.status('no-device', '最近设备已不在授权列表，请点击连接重新授权'); return }
            let lastAttempt = 0
            for (let attempt = 1; attempt <= 2; attempt++) {
                if (signal.aborted || !this.state.autoConnect) return
                if (this.client.snapshot.connected) { this.on_device(this.client.snapshot); return }
                if (this.client.isBusy) { this.status('paused', '设备当前有其他任务，请稍候手动重连'); return }
                this.status('connecting', '正在连接最近已授权设备，请保持设备唤醒', attempt)
                lastAttempt = attempt
                this.attempting = true
                let error: unknown
                try {
                    await limited(this.client.connect_known_device(device), this.timeoutMs, signal, this.disconnect_auto)
                } catch (reason) { error = reason }
                finally { this.attempting = false }
                if (signal.aborted) return
                if (!error && this.client.snapshot.connected) { this.on_device(this.client.snapshot); return }
                if (attempt === 2 || (error instanceof DOMException && ['SecurityError', 'NotSupportedError', 'NotAllowedError'].includes(error.name))) break
                this.status('idle', '设备暂未响应，稍后仅重试一次；也可直接手动连接', attempt)
                await limited(new Promise<void>((resolve) => setTimeout(resolve, this.retryMs)), this.retryMs + 100, signal)
            }
            this.status('unavailable', '未能自动连接，请唤醒设备后点击重连；不会继续后台重试', lastAttempt)
        } catch (error) {
            if (signal.aborted) return
            this.status(error instanceof DOMException && error.name === 'SecurityError' ? 'unsupported' : 'unavailable', '无法读取或连接已授权设备，请手动连接')
        }
    }
}
