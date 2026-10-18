export interface DeviceProfile {
    id: number
    name: string
    width: number
    height: number
    colors: 'bw' | 'bwr' | 'bwry'
    refreshSeconds: number
}

export interface DeviceSnapshot {
    id: string
    name: string
    connected: boolean
    firmware: number | null
    modelId: number | null
    // 包含协议头的特征值写入上限，不能直接作为图像有效载荷大小。
    payloadSize: number
    config: number[] | null
    // 已从固件的本地时间戳换算为 UTC Unix 秒数。
    deviceTime: number | null
    lastError: string | null
}

export interface TransferProgress {
    stage: 'preparing' | 'sending' | 'verifying' | 'refreshing'
    layer: string
    sentBytes: number
    totalBytes: number
    percent: number
    speed: number
}

export interface TransferResult {
    bytes: number
    durationMs: number
    verified: boolean
    refreshConfirmed: false
}

export interface DeviceLog {
    id: string
    time: number
    level: 'info' | 'error' | 'warn'
    message: string
}

export interface TransferLayer { name: string; cfg: number; data: Uint8Array }

// Minimal structural Web Bluetooth surface also permits deterministic mock transports.
export interface EpdCharacteristic extends EventTarget {
    value?: DataView | null
    properties?: { writeWithoutResponse?: boolean }
    startNotifications(): Promise<unknown>
    stopNotifications?(): Promise<unknown>
    readValue(): Promise<DataView>
    writeValueWithResponse(value: ArrayBuffer): Promise<void>
    writeValueWithoutResponse?(value: ArrayBuffer): Promise<void>
}

export interface EpdBluetoothDevice extends EventTarget {
    id: string
    name?: string
    gatt?: {
        connected: boolean
        connect(): Promise<{
            getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<EpdCharacteristic> }>
        }>
        disconnect(): void
    }
}

export interface BluetoothProvider {
    requestDevice(options: { filters?: { namePrefix: string }[]; acceptAllDevices?: boolean; optionalServices: string[] }): Promise<EpdBluetoothDevice>
    getDevices?(): Promise<EpdBluetoothDevice[]>
}

export interface EpdClientOptions {
    bluetooth?: BluetoothProvider
    ackTimeoutMs?: number
    statusTimeoutMs?: number
    handshakeTimeoutMs?: number
}
