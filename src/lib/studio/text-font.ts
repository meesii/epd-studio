import type { SceneElement } from './model'

export const canvasFont = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif'

type PixelFont = { id: string; family: string; size: number; label: string; latinOnly?: boolean }

export const pixelFonts: readonly PixelFont[] = [
    { id: 'pixel-12', family: 'Epd Fusion Pixel 12', size: 12, label: '点阵黑体 · 12px' },
    { id: 'pixel-16', family: 'Epd RoundPix 16', size: 16, label: '点阵圆体 · 16px' },
    { id: 'pixel-silkscreen', family: 'Epd Silkscreen 8', size: 8, label: 'Silkscreen 大写 · 8px', latinOnly: true },
    { id: 'pixel-press-start', family: 'Epd Press Start 8', size: 8, label: 'Press Start 2P · 8px', latinOnly: true },
    { id: 'pixel-tiny5', family: 'Epd Tiny5 8', size: 8, label: 'Tiny5 · 8px', latinOnly: true },
]

/**
 * 根据保存的字体标识或实际字体族取得点阵字体的原生规格。
 * @param family 字体标识或字体族名称；普通字体也可传入。
 * @returns 对应的点阵字体信息，普通字体返回 undefined。
 */
export function pixel_font(family?: string): (typeof pixelFonts)[number] | undefined {
    return pixelFonts.find(font => font.id === family || font.family === family)
}

/**
 * 检查指定点阵字体是否实际加载，避免系统回退字体被误认为加载成功。
 * @param family 保存的字体标识或实际字体族名称。
 * @returns 普通字体始终为 true；点阵字体仅在对应 FontFace 已加载时为 true。
 */
export function pixel_font_ready(family?: string): boolean {
    const font = pixel_font(family)
    if (!font) return true
    if (typeof document === 'undefined' || !document.fonts) return false
    let loaded = false
    document.fonts.forEach(face => {
        if (face.family.replace(/^["']|["']$/g, '') === font.family && face.status === 'loaded') loaded = true
    })
    return loaded
}

/**
 * 在应用挂载前并行加载本地点阵字体，单款失败不会阻断其他字体。
 * @returns 所有加载尝试结束后的任务；调用方通过 pixel_font_ready 检查可用性。
 */
export async function load_pixel_fonts(): Promise<void> {
    if (typeof document === 'undefined' || !document.fonts) return
    const fonts = document.fonts
    await Promise.allSettled(pixelFonts.map(async font => {
        await fonts.load(`400 ${font.size}px "${font.family}"`)
    }))
}

/**
 * 将通用字体映射到桌面中文字体，供测量与绘制使用同一份字体规则。
 * @param family 图层字体；省略时使用现代黑体。
 * @returns 可用于 Canvas font 属性的字体族。
 */
export function font_family(family?: string): string {
    const pixel = pixel_font(family)
    if (pixel) return `"${pixel.family}", ${canvasFont}`
    if (!family || family === 'sans-serif') return canvasFont
    if (family === 'serif') return '"Noto Serif CJK SC", "Source Han Serif SC", SimSun, "Songti SC", serif'
    if (family === 'monospace') return '"Cascadia Mono", Consolas, "Microsoft YaHei", monospace'
    return family
}

/**
 * 生成测量和绘制共用的完整字体设置。
 * @param element 待处理的文字图层。
 * @returns 包含字重、字号和字体族的 Canvas 字体。
 */
export function text_font(element: SceneElement): string {
    const weight = pixel_font(element.fontFamily) ? 400 : element.fontWeight ?? 400
    return `${weight} ${element.fontSize ?? 20}px ${font_family(element.fontFamily)}`
}
