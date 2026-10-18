import { block_packet, characteristicUuid, command, parse_status, serviceUuid, validate_complete_status, versionUuid } from './protocol'
import { screenModels } from './models'
import type { BluetoothProvider, DeviceLog, DeviceSnapshot, EpdBluetoothDevice, EpdCharacteristic, EpdClientOptions, TransferLayer, TransferProgress, TransferResult } from './types'

export { screenModels } from './models'
export { crc16, block_packet, parse_status, validate_complete_status } from './protocol'
export type { DeviceProfile, DeviceSnapshot, TransferProgress, TransferResult, TransferLayer, DeviceLog, EpdClientOptions, BluetoothProvider, EpdBluetoothDevice, EpdCharacteristic } from './types'

class ProtocolTimeoutError extends Error {}
function abort_error() { return new DOMException('发送已取消；已发出的刷新命令无法撤回', 'AbortError') }
function error_message(error: unknown): string { return error instanceof Error ? error.message : String(error) }
function check_abort(signal?: AbortSignal) { if (signal?.aborted) throw abort_error() }
interface Waiter { accept(data: Uint8Array): void; cancel(error: Error): void }

/**
 * 管理 EPD 固件的串行蓝牙连接与传输。
 * 固件 RAM 按顺序追加写入，因此只重试当前块，禁止乱序补写。
 */
export class EpdClient {
    private state: DeviceSnapshot = {
        id: '', name: '', connected: false, firmware: null, modelId: null,
        payloadSize: 20, config: null, deviceTime: null, lastError: null,
    }
    private readonly listeners = new Set<(snapshot: DeviceSnapshot) => void>()
    private readonly logListeners = new Set<(entry: DeviceLog) => void>()
    private readonly waiters = new Set<Waiter>()
    private readonly steps = new Set<(reason: Error) => void>()
    private device: EpdBluetoothDevice | null = null
    private characteristic: EpdCharacteristic | null = null
    private connecting = false
    private transferring = false
    private expectedDisconnect = false
    private epoch = 0
    private session = 0
    private logId = 0
    private queue: Promise<unknown> = Promise.resolve()
    private readonly options: Required<Omit<EpdClientOptions, 'bluetooth'>> & Pick<EpdClientOptions, 'bluetooth'>

    /**
     * 创建客户端；测试可注入蓝牙适配器和较短的响应等待时间。
     * @param options 蓝牙适配器和协议超时配置。
     */
    constructor(options: EpdClientOptions = {}) {
        this.options = { ackTimeoutMs: 1800, statusTimeoutMs: 2500, handshakeTimeoutMs: 4000, ...options }
    }

    get snapshot(): DeviceSnapshot { return this.state }
    /**
     * 指示连接或发送是否占用了串行蓝牙通道，供重连管理器避免重叠操作。
     * @returns 客户端是否正在连接或传送画面。
     */
    get isBusy(): boolean { return this.connecting || this.transferring }
    /**
     * 订阅设备状态变更。
     * @param listener 接收最新状态的观察函数。
     * @returns 取消订阅函数。
     */
    subscribe(listener: (snapshot: DeviceSnapshot) => void): () => void {
        this.listeners.add(listener)
        return () => { this.listeners.delete(listener) }
    }
    /**
     * 订阅连接及协议诊断日志。
     * @param listener 接收日志的观察函数。
     * @returns 取消订阅函数。
     */
    subscribe_log(listener: (entry: DeviceLog) => void): () => void {
        this.logListeners.add(listener)
        return () => { this.logListeners.delete(listener) }
    }

    private patch(patch: Partial<DeviceSnapshot>) {
        this.state = { ...this.state, ...patch }
        for (const listener of this.listeners) { try { listener(this.state) } catch { /* Observer errors cannot interrupt BLE. */ } }
    }
    private log(level: DeviceLog['level'], message: string) {
        const entry: DeviceLog = { id: `ble-${Date.now()}-${++this.logId}`, time: Date.now(), level, message }
        for (const listener of this.logListeners) { try { listener(entry) } catch { /* Isolate observers. */ } }
    }
    private report(error: unknown) {
        this.patch({ lastError: error_message(error) })
        this.log(error instanceof DOMException && error.name === 'AbortError' ? 'warn' : 'error', error_message(error))
    }
    /**
     * 复用一条串行队列，避免并发 GATT 写入。
     * @param operation 待执行的设备操作。
     * @returns 该操作的完成任务，失败不会阻塞后续操作。
     */
    private enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.queue.then(operation)
        this.queue = result.catch(() => undefined)
        return result
    }
    private control(operation: () => Promise<void>): Promise<void> {
        if (this.transferring) return Promise.reject(new Error('正在传送画面，请等待完成或先取消发送'))
        if (this.connecting) return Promise.reject(new Error('设备正在连接，请稍候'))
        return this.enqueue(operation).catch(error => { this.report(error); throw error })
    }

    /**
     * 在首次 await 之前打开设备选择器，保留浏览器要求的用户点击授权。
     * @param options 默认只显示 NRF_EPD 开头的设备；filterName=false 可显示全部设备。
     * @returns 完成通知订阅与 INIT 应用层确认后结束的连接任务。
     */
    async connect(options: { filterName?: boolean } = {}): Promise<void> {
        if (this.connecting || this.transferring) throw new Error('设备当前正忙，请稍候')
        if (this.state.connected) return
        const bluetooth = this.options.bluetooth ?? (typeof navigator !== 'undefined'
            ? (navigator as unknown as { bluetooth?: BluetoothProvider }).bluetooth : undefined)
        if (!bluetooth) throw new Error('当前浏览器不支持 Web Bluetooth，请使用电脑端 Chrome 或 Edge，并通过 localhost 或 HTTPS 打开')
        this.connecting = true
        const requestEpoch = this.epoch
        try {
            const filter = options.filterName === false ? { acceptAllDevices: true } : { filters: [{ namePrefix: 'NRF_EPD' }] }
            const selected = await bluetooth.requestDevice({ ...filter, optionalServices: [serviceUuid] })
            if (requestEpoch !== this.epoch) throw new Error('连接已取消')
            this.set_device(selected)
            await this.open()
        } catch (error) {
            this.cleanup_failed_connection()
            this.report(error)
            throw error
        } finally { this.connecting = false }
    }

    /**
     * 重新连接当前已授权设备；没有设备记录时打开选择器。
     * @returns 完成固件握手后结束的连接任务。
     */
    async reconnect(): Promise<void> {
        if (!this.device) return this.connect()
        return this.connect_known_device(this.device)
    }

    /**
     * 连接浏览器已经授权的设备对象，不打开选择器；仍执行完整固件握手。
     * @param device 由 getDevices 或先前授权获得的蓝牙设备。
     * @returns 完成固件握手后结束的任务，失败时保留断开状态。
     */
    async connect_known_device(device: EpdBluetoothDevice): Promise<void> {
        if (this.connecting || this.transferring) throw new Error('设备当前正忙，请稍候')
        if (this.state.connected) {
            if (this.state.id !== device.id) throw new Error('请先断开当前设备，再连接另一台墨水屏')
            return
        }
        this.connecting = true
        try { this.set_device(device); await this.open() }
        catch (error) { this.cleanup_failed_connection(); this.report(error); throw error }
        finally { this.connecting = false }
    }

    private set_device(device: EpdBluetoothDevice) {
        this.device?.removeEventListener('gattserverdisconnected', this.on_disconnected)
        this.device = device
        device.addEventListener('gattserverdisconnected', this.on_disconnected)
        this.patch({ id: device.id, name: device.name || '未命名墨水屏' })
    }

    /**
     * 分阶段建立连接，允许配置延迟到达，但必须收到 INIT 的应用层回包。
     * @returns 初始化完成后结束的任务。
     */
    private async open(): Promise<void> {
        const device = this.device
        if (!device?.gatt) throw new Error('设备没有可用的 GATT 服务')
        const epoch = ++this.epoch
        this.expectedDisconnect = false
        this.patch({ connected: false, firmware: null, modelId: null, config: null, deviceTime: null, payloadSize: 20, lastError: null })
        this.log('info', `正在连接 ${device.name || '墨水屏'}；请关闭手机上的连接`)
        const server = await this.step('连接 GATT', () => device.gatt!.connect(), epoch, 18000)
        const service = await this.step('发现 EPD 服务', () => server.getPrimaryService(serviceUuid), epoch)
        const characteristic = await this.step('获取通信特征', () => service.getCharacteristic(characteristicUuid), epoch)
        if (typeof characteristic.writeValueWithResponse !== 'function') throw new Error('浏览器缺少可靠的 GATT 响应写入能力，请更新 Chrome 或 Edge')
        this.characteristic?.removeEventListener('characteristicvaluechanged', this.on_notification)
        this.characteristic = characteristic
        characteristic.addEventListener('characteristicvaluechanged', this.on_notification)

        // 固件断连回调会访问驱动；先初始化可避免后续通知订阅失败时访问空驱动。
        await this.step('初始化屏幕驱动', () => this.write(new Uint8Array([command.init])), epoch, 15000)
        try {
            const version = await this.step('获取版本特征', () => service.getCharacteristic(versionUuid), epoch)
            const value = await this.step('读取固件版本', () => version.readValue(), epoch, 6000)
            if (value.byteLength < 1) throw new Error('固件版本为空')
            this.patch({ firmware: value.getUint8(0) })
            this.log('info', `固件版本：0x${value.getUint8(0).toString(16)}`)
        } catch (error) {
            this.assert_epoch(epoch)
            if (error instanceof ProtocolTimeoutError) throw error
            this.log('warn', `固件版本读取失败，将使用带响应的兼容传输：${error_message(error)}`)
        }
        await this.step('启用蓝牙通知', () => characteristic.startNotifications(), epoch, 15000)
        // 不把配置通知当成连接门槛；CCCD 复用或延迟都可能使本次缺少配置。
        const response = this.wait_for(data => /^(mtu=\d+|t=\d+)$/.test(new TextDecoder().decode(data)), this.options.handshakeTimeoutMs, undefined, true)
        try {
            this.log('info', '确认应用层通信：发送 INIT，等待 MTU 或设备时间回包')
            await this.step('发送 INIT 通信确认', () => this.write(new Uint8Array([command.init])), epoch, 15000)
            response.start()
            await response.promise
        } catch (error) {
            if (error instanceof ProtocolTimeoutError) throw new ProtocolTimeoutError('INIT 应用层确认超时：没有收到 MTU 或设备时间通知，请唤醒设备后重连')
            throw error
        } finally { response.cancel() }
        this.assert_epoch(epoch)
        this.patch({ connected: true, lastError: null })
        if (!this.state.config) this.log('warn', '应用层通信已确认，但未收到可识别配置；请在设备中心手动选择实际屏幕型号，不会自动猜测')
        this.log('info', `已连接 ${this.state.name} · 固件 ${this.state.firmware === null ? '未知' : `0x${this.state.firmware.toString(16)}`} · 写入上限 ${this.state.payloadSize} B`)
    }

    /**
     * 为单个原生蓝牙阶段提供独立超时与诊断，断连时立即结束等待。
     * @param label 当前阶段的中文名称。
     * @param operation 原生蓝牙操作。
     * @param epoch 当前连接代次。
     * @param timeout 阶段超时毫秒数。
     * @returns 当前阶段结果，旧连接的迟到结果不会继续推进握手。
     */
    private async step<T>(label: string, operation: () => Promise<T>, epoch: number, timeout = 12000): Promise<T> {
        this.log('info', `${label}…`)
        let timer: ReturnType<typeof setTimeout> | undefined
        let cancel: ((reason: Error) => void) | undefined
        const pending = new Promise<never>((resolve, reject) => {
            void resolve
            cancel = reject
            this.steps.add(reject)
            timer = setTimeout(() => reject(new ProtocolTimeoutError(`${label}超时（${timeout / 1000} 秒）`)), timeout)
        })
        try {
            const result = await Promise.race([operation(), pending])
            this.assert_epoch(epoch)
            this.log('info', `${label}完成`)
            return result
        } finally {
            clearTimeout(timer)
            if (cancel) this.steps.delete(cancel)
        }
    }

    private assert_epoch(epoch: number) {
        if (epoch !== this.epoch || !this.device?.gatt?.connected) throw new Error('设备连接已中断，请重新连接')
    }
    private cleanup_failed_connection() {
        this.expectedDisconnect = true
        this.device?.gatt?.disconnect()
        this.detach(new Error('蓝牙连接未完成'))
    }
    /**
     * 断开连接并立即拒绝所有等待中的设备响应。
     * @returns 无返回值。
     */
    disconnect(): void {
        this.expectedDisconnect = true
        this.device?.gatt?.disconnect()
        this.detach(new Error('蓝牙连接已断开'))
        this.log('info', '蓝牙已断开')
    }
    private readonly on_disconnected = () => {
        const reason = new Error('蓝牙连接已断开；请唤醒设备后重新连接并重新发送整幅画面')
        this.detach(reason)
        if (!this.expectedDisconnect) { this.patch({ lastError: reason.message }); this.log('warn', reason.message) }
    }
    private detach(reason: Error) {
        ++this.epoch
        this.characteristic?.removeEventListener('characteristicvaluechanged', this.on_notification)
        this.characteristic = null
        for (const waiter of [...this.waiters]) waiter.cancel(reason)
        for (const cancel of [...this.steps]) cancel(reason)
        this.patch({ connected: false })
    }

    /**
     * 通过核心引脚及型号识别配置，允许保留未知的尾随扩展字段。
     * @param data 收到的通知数据。
     * @returns 是否为已知版本的固件配置。
     */
    private is_config(data: Uint8Array): boolean {
        // 实机固件存在 14 字节扩展配置；只检查已知核心字段，不截断扩展内容。
        return data.length >= 8 && data.length <= 32 && data[7] >= 1 && data[7] <= 12
            && data.slice(0, 7).every(pin => pin <= 47 || pin === 255)
            && !/^(mtu=|t=)/.test(new TextDecoder().decode(data))
    }
    private readonly on_notification = (event: Event) => {
        const value = (event.target as unknown as EpdCharacteristic | null)?.value
        if (!value) return
        const data = new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice()
        const text = new TextDecoder().decode(data)
        if (/^mtu=\d+$/.test(text)) {
            const mtu = Number(text.slice(4))
            if (Number.isFinite(mtu) && mtu >= 20) this.patch({ payloadSize: Math.min(244, mtu) })
            else this.log('warn', `忽略无效的设备 MTU：${text}`)
            if (this.connecting) this.log('info', `收到 MTU 通知：${text}`)
        } else if (/^t=\d+$/.test(text)) {
            this.patch({ deviceTime: Number(text.slice(2)) + new Date().getTimezoneOffset() * 60 })
            if (this.connecting) this.log('info', `收到设备时间通知：${text}`)
        } else if (data[0] !== 0xa0 && data[0] !== 0xa1 && this.is_config(data)) {
            this.patch({ config: [...data], modelId: data[7] })
            this.log('info', `收到配置通知（${data.length} B）：${this.hex(data)}`)
        } else if (data[0] !== 0xa0 && data[0] !== 0xa1) {
            this.log('warn', `未识别通知（${data.length} B）：${this.hex(data)}`)
        }
        for (const waiter of [...this.waiters]) waiter.accept(data)
    }

    private hex(data: Uint8Array): string {
        return [...data.slice(0, 32)].map(byte => byte.toString(16).padStart(2, '0')).join(' ') + (data.length > 32 ? ' …' : '')
    }

    /**
     * 提前安装一次性响应监听，避免快速通知先于写入 Promise 完成。
     * @param predicate 匹配目标响应的条件。
     * @param timeout 超时毫秒数。
     * @param signal 可选的用户取消信号。
     * @param deferTimeout 为 true 时由调用方在原生写入结束后启动响应计时。
     * @returns 响应 Promise 和清理等待器的函数。
     */
    private wait_for(predicate: (data: Uint8Array) => boolean, timeout: number, signal?: AbortSignal, deferTimeout = false) {
        let cancel!: (reason?: Error) => void
        let start!: () => void
        const promise = new Promise<Uint8Array>((resolve, reject) => {
            let done = false
            let timer: ReturnType<typeof setTimeout> | undefined
            const finish = (data?: Uint8Array, error?: Error) => {
                if (done) return
                done = true
                clearTimeout(timer)
                signal?.removeEventListener('abort', on_abort)
                this.waiters.delete(waiter)
                if (error) reject(error)
                else if (data) resolve(data)
            }
            const on_abort = () => finish(undefined, abort_error())
            const waiter: Waiter = {
                accept: data => { if (predicate(data)) finish(data) },
                cancel: error => finish(undefined, error),
            }
            start = () => {
                if (done || timer) return
                timer = setTimeout(() => finish(undefined, new ProtocolTimeoutError('等待设备确认超时')), timeout)
            }
            cancel = reason => finish(undefined, reason ?? new Error('等待已结束'))
            this.waiters.add(waiter)
            signal?.addEventListener('abort', on_abort, { once: true })
            if (signal?.aborted) on_abort()
            if (!deferTimeout) start()
        })
        // A write may fail before we start awaiting the response; keep that rejection handled.
        void promise.catch(() => undefined)
        return { promise, cancel: (reason?: Error) => cancel(reason), start: () => start() }
    }

    /**
     * 串行写入并检查取消和连接代次；仅具备应用层 ACK 的 CRC 块可省去 GATT 响应。
     * @param data 完整特征值写入数据。
     * @param signal 可选的用户取消信号。
     * @param mode 使用带响应写入，或由逐块 CRC ACK 保障的无响应写入。
     * @returns 原生写入完成且连接仍有效后的任务，不替代 CRC 块的 ACK 校验。
     */
    private async write(data: Uint8Array, signal?: AbortSignal, mode: 'response' | 'crcAck' = 'response'): Promise<void> {
        check_abort(signal)
        const characteristic = this.characteristic
        if (!characteristic || !this.device?.gatt?.connected) throw new Error('请先连接墨水屏')
        const epoch = this.epoch
        const value = new Uint8Array(data).buffer
        if (mode === 'crcAck' && characteristic.properties?.writeWithoutResponse === true && characteristic.writeValueWithoutResponse) {
            await characteristic.writeValueWithoutResponse(value)
        } else await characteristic.writeValueWithResponse(value)
        this.assert_epoch(epoch)
        check_abort(signal)
    }

    /**
     * 设置星期起始日、同步电脑时间并启动固件内置模式。
     * @param mode 1 为日历，2 为时钟。
     * @param weekStart 星期第一天，0 为周日，1 为周一。
     * @returns 模式命令写入后结束的任务，不表示屏幕已完成刷新。
     */
    set_mode(mode: 1 | 2, weekStart: number): Promise<void> {
        return this.control(async () => {
            if ((mode !== 1 && mode !== 2) || !Number.isInteger(weekStart) || weekStart < 0 || weekStart > 6) throw new Error('无效的显示模式或星期起始日')
            const offset = -new Date().getTimezoneOffset() / 60
            if (!Number.isInteger(offset)) throw new Error('当前固件仅支持整小时时区，请先升级固件以支持此时区')
            const seconds = Math.floor(Date.now() / 1000)
            if (this.state.config?.[12] !== weekStart) await this.write(new Uint8Array([command.setWeekStart, weekStart]))
            await this.write(new Uint8Array([command.setTime, (seconds >>> 24) & 255, (seconds >>> 16) & 255, (seconds >>> 8) & 255, seconds & 255, offset & 255, mode]))
            const config = this.state.config ? [...this.state.config] : null
            if (config) { config[11] = mode; config[12] = weekStart }
            this.patch({ config, deviceTime: seconds, lastError: null })
            this.log('info', `已校时并请求切换为${mode === 1 ? '内置日历' : '内置时钟'}；刷新完成需在屏幕确认`)
        })
    }
    /**
     * 初始化驱动并请求清屏，固件同时切换到图片模式。
     * @returns 清屏命令写入后结束的任务。
     */
    clear(): Promise<void> {
        return this.control(async () => {
            await this.write(new Uint8Array([command.init]))
            await this.write(new Uint8Array([command.clear, 1]))
            this.patch_mode(0)
            this.log('info', '已请求清屏；固件没有屏幕刷新完成回执')
        })
    }
    /**
     * 请求屏幕休眠；内置计时模式仍可能再次唤醒屏幕。
     * @returns 休眠命令写入后结束的任务。
     */
    sleep_screen(): Promise<void> {
        return this.control(async () => { await this.write(new Uint8Array([command.sleepScreen])); this.log('info', '已请求屏幕休眠；设备内置定时模式仍可再次唤醒屏幕') })
    }
    /**
     * 请求设备休眠，之后需要硬件唤醒。
     * @returns 命令写入任务；设备断连可能先于写入确认。
     */
    sleep_device(): Promise<void> {
        return this.control(async () => { await this.write(new Uint8Array([command.sleepDevice])); this.log('info', '已请求设备休眠，需通过硬件唤醒') })
    }
    /**
     * 请求 MCU 重启，之后需要重新连接及校时。
     * @returns 命令写入任务；设备断连可能先于写入确认。
     */
    reset_device(): Promise<void> {
        return this.control(async () => { await this.write(new Uint8Array([command.resetDevice])); this.log('info', '已请求设备重启，请稍后重新连接') })
    }
    /**
     * 初始化并保存指定驱动型号，调用方须确认其与实际屏幕一致。
     * @param id 固件屏幕型号编号。
     * @returns 驱动初始化命令写入后结束的任务。
     */
    set_model(id: number): Promise<void> {
        return this.control(async () => {
            if (!screenModels.some(model => model.id === id)) throw new Error('无效的屏幕型号')
            await this.write(new Uint8Array([command.init, id]))
            const config = this.state.config ? [...this.state.config] : null
            if (config) config[7] = id
            this.patch({ modelId: id, config, lastError: null })
            this.log('info', `已请求设置屏幕型号：${screenModels.find(model => model.id === id)?.name}`)
        })
    }
    /**
     * 保存固件支持的显示屏引脚，255 表示禁用。
     * @param pins 按 MOSI、SCLK、CS、DC、RST、BUSY、BS、可选 EN 排列。
     * @returns 引脚配置命令写入后结束的任务。
     */
    update_pins(pins: number[]): Promise<void> {
        return this.control(async () => {
            if ((pins.length !== 7 && pins.length !== 8) || pins.some(pin => !Number.isInteger(pin) || (pin !== 255 && (pin < 0 || pin > 47)))) throw new Error('引脚需要 7 或 8 个值，每个值为 0–47 或 255（禁用）')
            await this.write(new Uint8Array([command.setPins, ...pins]))
            const config = this.state.config ? [...this.state.config] : null
            if (config) { config.splice(0, 7, ...pins.slice(0, 7)); if (pins.length === 8) config[10] = pins[7] }
            this.patch({ config, lastError: null })
            this.log('info', '引脚配置已写入设备；请确保与实际接线一致')
        })
    }
    private patch_mode(mode: number) {
        if (this.state.config) { const config = [...this.state.config]; config[11] = mode; this.patch({ config }) }
    }

    /**
     * 顺序发送各图层；支持时逐块验证 CRC，全部成功后才请求刷新。
     * @param layers 已按驱动格式编码的图层，每层 cfg 低四位为 15（黑色）或 0（彩色）。
     * @param on_progress 接收发送阶段、字节数和速度。
     * @param signal 可选的用户取消信号；刷新命令提交后无法取消。
     * @returns 数据验证结果；refreshConfirmed 始终为 false，因为固件没有屏幕完成回执。
     */
    async transfer(layers: TransferLayer[], on_progress: (progress: TransferProgress) => void, signal?: AbortSignal): Promise<TransferResult> {
        if (this.transferring || this.connecting) throw new Error('设备当前正忙，请等待当前任务完成')
        if (!layers.length || layers.some(layer => !layer.data.length || ![0, 15].includes(layer.cfg & 15))) throw new Error('没有有效的画面数据')
        this.transferring = true
        return this.enqueue(async () => {
            const start = performance.now()
            const totalBytes = layers.reduce((sum, layer) => sum + layer.data.length, 0)
            let sentBytes = 0
            let activeLayer = layers[0].name
            let refreshSubmitted = false
            const progress = (stage: TransferProgress['stage']) => {
                const elapsed = Math.max(0.001, (performance.now() - start) / 1000)
                on_progress({ stage, layer: activeLayer, sentBytes, totalBytes, percent: Math.round(sentBytes / totalBytes * 100), speed: sentBytes / elapsed })
            }
            try {
                check_abort(signal)
                progress('preparing')
                await this.write(new Uint8Array([command.init]), signal)
                const mtu = this.state.payloadSize
                const crcPayload = mtu - 8
                const useCrc = (this.state.firmware ?? 0) >= 0x20 && layers.every(layer => Math.ceil(layer.data.length / crcPayload) <= 512)
                const payload = mtu - (useCrc ? 8 : 2)
                const fastWrite = this.characteristic?.properties?.writeWithoutResponse === true && typeof this.characteristic.writeValueWithoutResponse === 'function'
                this.log(useCrc ? 'info' : 'warn', useCrc ? `使用 CRC16 逐块确认传输（${fastWrite ? '无响应写入 + 固件 ACK' : 'GATT 带响应写入 + 固件 ACK'}）；有效载荷 ${payload} B，按顺序写入，超时仅重试当前块` : `使用 GATT 带响应的兼容传输；有效载荷 ${payload} B，固件版本或 512 块上限不支持本次 CRC 校验`)
                for (const layer of layers) {
                    activeLayer = layer.name
                    const blocks = Math.ceil(layer.data.length / payload)
                    let session = 0
                    if (useCrc) {
                        session = this.session = (this.session + 1) & 255
                        await this.write(new Uint8Array([command.resetTransfer, session]), signal)
                        const reset = parse_status(await this.query_status(signal))
                        if (reset.session !== session || reset.total !== 0 || reset.received !== 0 || reset.active || reset.bitmap.length) throw new Error('设备传输会话重置失败，请重新连接')
                    }
                    for (let block = 0; block < blocks; block++) {
                        check_abort(signal)
                        const data = layer.data.subarray(block * payload, Math.min(layer.data.length, (block + 1) * payload))
                        const cfg = (block === 0 ? 0 : 0xf0) | (layer.cfg & 15)
                        if (useCrc) await this.write_block(block_packet(block, blocks, cfg, data), block, signal)
                        else { const packet = new Uint8Array(data.length + 2); packet.set([command.writeImage, cfg]); packet.set(data, 2); await this.write(packet, signal) }
                        sentBytes += data.length
                        progress('sending')
                    }
                    if (useCrc) {
                        progress('verifying')
                        const status = parse_status(await this.query_status(signal))
                        if (status.bitmap.length !== Math.min(Math.ceil(blocks / 8), mtu - 7)) throw new Error('设备传输校验失败：返回位图长度与 MTU 不一致')
                        validate_complete_status(status, blocks, session)
                        this.log('info', `${layer.name}：${blocks} 块已全部通过 CRC 与会话状态校验`)
                    }
                }
                check_abort(signal)
                progress('refreshing')
                check_abort(signal)
                // REFRESH 发出后无法撤销；此后取消信号不能把已提交的刷新误报为取消。
                refreshSubmitted = true
                await this.write(new Uint8Array([command.refresh]))
                this.patch_mode(0)
                this.patch({ lastError: null })
                this.log('info', `画面数据已${useCrc ? '校验并' : ''}发送，刷新请求已提交；屏幕实际完成需目视确认`)
                return { bytes: totalBytes, durationMs: performance.now() - start, verified: useCrc, refreshConfirmed: false as const }
            } catch (error) {
                this.report(error)
                this.log('warn', refreshSubmitted
                    ? '刷新命令可能已到达设备，但未能确认写入结果；请观察实体屏幕，暂勿再次发送'
                    : '本次发送未完成；下次将从整幅画面开始，不会按位图乱序补写')
                throw error
            }
        }).finally(() => { this.transferring = false })
    }

    /**
     * 查询当前会话状态，并在命令写入前注册响应等待器。
     * @param signal 可选的用户取消信号。
     * @returns 设备状态通知的原始数据。
     */
    private async query_status(signal?: AbortSignal): Promise<Uint8Array> {
        const response = this.wait_for(data => data[0] === 0xa1, this.options.statusTimeoutMs, signal, true)
        try { await this.write(new Uint8Array([command.queryStatus]), signal); response.start(); return await response.promise }
        finally { response.cancel() }
    }
    /**
     * 等待当前块 ACK，仅对 ACK 超时或 CRC NACK 重试相同块。
     * @param packet 包含校验值的完整数据包。
     * @param block 当前块编号。
     * @param signal 可选的用户取消信号。
     * @returns 收到当前块有效 ACK 后结束的任务。
     */
    private async write_block(packet: Uint8Array, block: number, signal?: AbortSignal): Promise<void> {
        for (let attempt = 0; attempt < 3; attempt++) {
            check_abort(signal)
            const response = this.wait_for(data => data[0] === 0xa0 && data.length >= 3 && (data[1] | (data[2] << 8)) === block, this.options.ackTimeoutMs, signal, true)
            try {
                await this.write(packet, signal, 'crcAck')
                response.start()
                const ack = await response.promise
                if (ack.length !== 4) throw new Error(`第 ${block + 1} 块确认报文格式错误`)
                if (ack[3] === 0) return
                if (ack[3] !== 1) throw new Error(`设备拒绝第 ${block + 1} 块（状态 0x${ack[3].toString(16)}），未执行刷新`)
                if (attempt === 2) throw new Error(`第 ${block + 1} 块 CRC 连续校验失败，未执行刷新`)
                this.log('warn', `第 ${block + 1} 块 CRC 校验失败，正在重试同一块（${attempt + 1}/2）`)
            } catch (error) {
                if (!(error instanceof ProtocolTimeoutError) || attempt === 2) throw error
                this.log('warn', `第 ${block + 1} 块确认超时，正在重试同一块（${attempt + 1}/2）`)
            } finally { response.cancel() }
        }
    }
}
