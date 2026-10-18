import type { Palette } from '../model'

export const graphicColors = {
    black: { r: 0, g: 0, b: 0 },
    white: { r: 255, g: 255, b: 255 },
    red: { r: 255, g: 0, b: 0 },
    yellow: { r: 255, g: 255, b: 0 },
    green: { r: 0, g: 255, b: 0 },
    cyan: { r: 0, g: 255, b: 255 },
    blue: { r: 0, g: 0, b: 255 },
    magenta: { r: 255, g: 0, b: 255 },
}

/**
 * 将开源内核量化后的标准图标色转换为设备墨色，未提供的彩色墨水使用黑色。
 * @param color 已量化到 RGB 八色调色板的颜色。
 * @param palette 设备支持的墨色。
 * @returns 对应的设备标准色。
 */
export function graphic_ink(color: { r: number; g: number; b: number }, palette: Palette) {
    if (color.r === color.g && color.g === color.b) return color
    if (palette !== 'bw' && color.r === 255 && color.g === 0 && color.b === 0) return color
    if (palette === 'bwry' && color.r === 255 && color.g === 255 && color.b === 0) return color
    return graphicColors.black
}
