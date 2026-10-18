export const serviceUuid = '62750001-d828-918d-fb46-b6c11c675aec'
export const characteristicUuid = '62750002-d828-918d-fb46-b6c11c675aec'
export const versionUuid = '62750003-d828-918d-fb46-b6c11c675aec'

export const command = {
    setPins: 0x00, init: 0x01, clear: 0x02, refresh: 0x05, sleepScreen: 0x06,
    setTime: 0x20, setWeekStart: 0x21, writeImage: 0x30, writeBlock: 0x31,
    queryStatus: 0x32, resetTransfer: 0x33, resetDevice: 0x91, sleepDevice: 0x92,
} as const

/**
 * 计算固件使用的反射 CCITT CRC，初值 FFFF，不执行末尾异或。
 * @param data 待校验的有效载荷。
 * @returns 16 位 CRC 校验值。
 */
export function crc16(data: Uint8Array): number {
    let crc = 0xffff
    for (const byte of data) {
        crc ^= byte
        for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (crc >>> 1) ^ 0x8408 : crc >>> 1
    }
    return crc & 0xffff
}

/**
 * 构造固件 0x31 数据包，块号与 CRC 均为小端格式。
 * @param block 从 0 开始的块号。
 * @param total 当前图层的总块数，最大 512。
 * @param cfg 图层标记及首块标记。
 * @param payload 当前块有效载荷。
 * @returns 可以直接写入特征值的数据包。
 */
export function block_packet(block: number, total: number, cfg: number, payload: Uint8Array): Uint8Array {
    if (!Number.isInteger(block) || !Number.isInteger(total) || total < 1 || total > 512 || block < 0 || block >= total) {
        throw new Error('无效的数据块编号')
    }
    if (payload.length < 1 || payload.length > 236) throw new Error('CRC 数据块有效载荷应为 1–236 字节')
    const packet = new Uint8Array(payload.length + 8)
    packet.set([command.writeBlock, block & 0xff, block >>> 8, total & 0xff, total >>> 8, cfg])
    packet.set(payload, 6)
    const crc = crc16(payload)
    packet[packet.length - 2] = crc & 0xff
    packet[packet.length - 1] = crc >>> 8
    return packet
}

export interface TransferStatus {
    total: number
    received: number
    session: number
    active: boolean
    bitmap: Uint8Array
}

/**
 * 解析并检查固件传输状态通知，拒绝畸形计数及位图。
 * @param data 0xA1 状态通知。
 * @returns 结构化会话状态。
 */
export function parse_status(data: Uint8Array): TransferStatus {
    if (data[0] !== 0xa1 || data.length < 7 || data[6] > 1) throw new Error('设备返回了无效的传输状态')
    const total = data[1] | (data[2] << 8)
    const received = data[3] | (data[4] << 8)
    if (total > 512 || received > total || data.length > 71) throw new Error('设备返回了无效的传输计数')
    const expectedBitmapLength = Math.ceil(total / 8)
    if (data.length - 7 > expectedBitmapLength) throw new Error('设备返回了无效的位图长度')
    return { total, received, session: data[5], active: Boolean(data[6]), bitmap: data.slice(7) }
}

/**
 * 验证会话及计数，并检查 MTU 允许返回的所有位图位。
 * @param status 设备返回的会话状态。
 * @param total 本图层预期的总块数。
 * @param session 本图层使用的会话编号。
 * @returns 校验成功时无返回值；任何不一致均抛出错误。
 */
export function validate_complete_status(status: TransferStatus, total: number, session: number): void {
    if (status.session !== session || status.total !== total || status.received !== total || !status.active) {
        throw new Error('设备传输校验失败：会话或已接收块数不一致，请重新发送整幅画面')
    }
    if (status.bitmap.length === 0) throw new Error('设备传输校验失败：缺少块位图')
    for (let byte = 0; byte < status.bitmap.length; byte++) {
        const usedBits = Math.min(8, total - byte * 8)
        const mask = (1 << usedBits) - 1
        if (status.bitmap[byte] !== mask) throw new Error('设备传输校验失败：存在缺失的数据块，请重新发送整幅画面')
    }
}
