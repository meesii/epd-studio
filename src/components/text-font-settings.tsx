import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { SceneElement } from '@/lib/studio'
import { pixel_font, pixel_font_ready, pixelFonts } from '@/lib/studio/text-font'

type TextFontSettingsProps = {
    element: SceneElement
    on_change: (value: Partial<SceneElement>) => void
}

/**
 * 保留普通字体设置，并为已加载的像素字体提供明确的整数倍字号选择。
 * @param props 当前文字图层与显式属性修改回调。
 * @returns 字号、字重、字体选择及像素字体使用提示。
 */
export function TextFontSettings({ element, on_change }: TextFontSettingsProps) {
    const [, refresh_fonts] = useState(0)
    const pixel = pixel_font(element.fontFamily)
    const size = element.fontSize ?? 20
    const sizes = pixel ? [...Array(Math.floor(300 / pixel.size)).keys()].map(index => (index + 1) * pixel.size) : []
    useEffect(() => {
        if (typeof document === 'undefined' || !document.fonts) return
        const fonts = document.fonts
        let active = true
        const refresh = () => { if (active) refresh_fonts(value => value + 1) }
        void fonts.ready.then(refresh).catch(refresh)
        fonts.addEventListener?.('loadingdone', refresh)
        fonts.addEventListener?.('loadingerror', refresh)
        return () => {
            active = false
            fonts.removeEventListener?.('loadingdone', refresh)
            fonts.removeEventListener?.('loadingerror', refresh)
        }
    }, [])

    /**
     * 仅在用户选择像素字体时调整到最近的可用字号，读取旧图层时不改写任何属性。
     * @param family 用户选择的字体标识。
     * @returns 无返回值；字体未加载时不修改图层。
     */
    function change_font(family: string): void {
        const selected = pixel_font(family)
        if (!selected) { on_change({ fontFamily: family }); return }
        if (!pixel_font_ready(selected.id)) return
        const multiple = Math.max(1, Math.min(Math.floor(300 / selected.size), Math.round(size / selected.size)))
        on_change({ fontFamily: selected.id, fontSize: selected.size * multiple, fontWeight: 400 })
    }

    return <>
        <div className="property-grid">
            {pixel ? <label className="field-label">字号<Select value={String(size)} onValueChange={value => { const next = Number(value); if (sizes.includes(next)) on_change({ fontSize: next }) }}><SelectTrigger aria-label="字号"><SelectValue /></SelectTrigger><SelectContent>
                {!sizes.includes(size) && <SelectItem value={String(size)} disabled>当前 {size} px</SelectItem>}
                {sizes.map(value => <SelectItem key={value} value={String(value)}>{value} px</SelectItem>)}
            </SelectContent></Select></label> : <label className="number-field"><span>字号</span><Input type="number" aria-label="字号" value={Math.round(size * 10) / 10} min={4} max={300} step={1} onChange={event => { const next = Number(event.target.value); if (Number.isFinite(next)) on_change({ fontSize: Math.min(300, Math.max(4, next)) }) }} /></label>}
            <label className="field-label">字重<Select value={String(pixel ? 400 : element.fontWeight ?? 400)} onValueChange={value => { if (!pixel) on_change({ fontWeight: Number(value) }) }} disabled={Boolean(pixel)}><SelectTrigger aria-label="字重"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="400">常规</SelectItem>{!pixel && <><SelectItem value="500">中等</SelectItem><SelectItem value="600">半粗</SelectItem><SelectItem value="700">粗体</SelectItem></>}</SelectContent></Select></label>
        </div>
        <label className="field-label">字体<Select value={pixel?.id ?? element.fontFamily ?? 'sans-serif'} onValueChange={change_font}><SelectTrigger aria-label="字体"><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="sans-serif">现代黑体</SelectItem><SelectItem value="serif">经典宋体</SelectItem><SelectItem value="monospace">等宽字体</SelectItem>
            {pixelFonts.map(font => <SelectItem key={font.id} value={font.id} disabled={!pixel_font_ready(font.id)}>{font.label}</SelectItem>)}
        </SelectContent></Select></label>
        {pixel && <p className="help-copy">按{pixel.size}px整数倍显示更清晰；旋转或缩放到其他字号会破坏点阵。{pixel.latinOnly && '适合英文；中文使用系统字体，不保证点阵效果。'}</p>}
    </>
}
