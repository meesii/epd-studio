export type FirmwareMode = 1 | 2

export const firmwareModes = [
    {
        mode: 1,
        name: '日历模式',
        english: 'LUNAR CALENDAR',
        cadence: '每天午夜自动刷新',
        description: '一整月的安排，和农历、节气一起留在桌上。',
        features: ['农历与节气', '节日与班休', '日期与星期'],
    },
    {
        mode: 2,
        name: '时钟模式',
        english: 'DESK CLOCK',
        cadence: '每分钟自动刷新',
        description: '大字时间、日期和农历，让抬头的一刻更清晰。',
        features: ['大字时分', '农历与日期', '设备温度与电量'],
    },
] as const

/**
 * 从固件配置第 12 字节读取当前模式，未知值不推断为可用模式。
 * @param config 固件返回的配置字节。
 * @returns 图片模式 0、已实现的内置模式 1/2，或未知状态 null。
 */
export function read_firmware_mode(config: readonly number[] | null): 0 | FirmwareMode | null {
    const mode = config?.[11]
    return mode === 0 || mode === 1 || mode === 2 ? mode : null
}

/**
 * 从固件配置第 13 字节读取星期起始日，缺失或异常时使用周一。
 * @param config 固件返回的配置字节。
 * @returns 0–6 的星期编号，0 为周日。
 */
export function read_firmware_week(config: readonly number[] | null): number {
    const week = config?.[12]
    return typeof week === 'number' && Number.isInteger(week) && week >= 0 && week <= 6 ? week : 1
}
