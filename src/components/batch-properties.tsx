import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { resolve_layer_options, type ProcessOptions, type Scene, type SceneElement } from '@/lib/studio'
import { line_size, set_line_size } from '@/lib/studio/line-geometry'
import { patch_selection } from '@/lib/studio/selection'
import { pixel_font, pixel_font_ready, pixelFonts } from '@/lib/studio/text-font'
import { ImagePurpose } from './image-purpose'
import './batch-properties.css'

type BatchPropertiesProps = {
    scene: Scene
    elements: SceneElement[]
    options: ProcessOptions
    disabled?: boolean
    on_change: (change: (current: Scene) => Scene, record?: boolean) => boolean
}

type Choice = { value: string; label: string; disabled?: boolean }
const typeNames = { text: '文字', rect: '形状', line: '线条', image: '图片', qr: '二维码' }
const colorValues = ['#ffffff', '#171717', '#d43630', '#efbf35']

/**
 * 取得所有成员共有的属性值，混合值保持为空而不以首个图层代替。
 * @param items 参与比较的对象。
 * @param read 读取带默认值的属性。
 * @returns 统一值；成员之间不一致时返回 undefined。
 */
function common_value<Item, Value>(items: readonly Item[], read: (item: Item) => Value): Value | undefined {
    const first = items[0] === undefined ? undefined : read(items[0])
    return items.every(item => Object.is(read(item), first)) ? first : undefined
}

/**
 * 显示可包含混合值的批量选择框，仅用户明确选择时修改图层。
 * @param props 属性名称、共有值、候选项及提交回调。
 * @returns 具有明确混合值占位的选择框。
 */
function BatchSelect({ label, value, choices, on_change, disabled = false }: { label: string; value?: string; choices: readonly Choice[]; on_change: (value: string) => void; disabled?: boolean }) {
    return <label className="field-label">{label}<Select value={value ?? 'mixed'} onValueChange={on_change} disabled={disabled}><SelectTrigger aria-label={`批量${label}`}><SelectValue /></SelectTrigger><SelectContent>
        {value === undefined && <SelectItem value="mixed" disabled>混合</SelectItem>}
        {choices.map(choice => <SelectItem key={choice.value} value={choice.value} disabled={choice.disabled}>{choice.label}</SelectItem>)}
    </SelectContent></Select></label>
}

/**
 * 为数值混合的图层提供空值输入，不将清空操作误写为零。
 * @param props 属性名称、共有值、范围及提交回调。
 * @returns 数值输入框，混合值显示占位提示。
 */
function BatchNumber({ label, value, on_change, min = -2000, max = 2000, step = 1, disabled = false }: { label: string; value?: number; on_change: (value: number) => void; min?: number; max?: number; step?: number; disabled?: boolean }) {
    const formatted = value === undefined ? '' : String(Math.round(value * 100) / 100)
    const [draft, set_draft] = useState(formatted)
    useEffect(() => set_draft(formatted), [formatted])

    /**
     * 完成输入后只提交一次有效值，清空及无效输入恢复原值。
     * @returns 无返回值。
     */
    function commit(): void {
        const next = Number(draft)
        if (!draft.trim() || !Number.isFinite(next)) { set_draft(formatted); return }
        const clamped = Math.min(max, Math.max(min, next))
        set_draft(String(clamped))
        if (clamped !== value) on_change(clamped)
    }

    return <label className="number-field"><span>{label}</span><Input type="number" aria-label={`批量${label}`} value={draft} placeholder="混合" min={min} max={max} step={step} disabled={disabled} onChange={event => set_draft(event.target.value)} onBlur={commit} onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); commit() }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); set_draft(formatted) }
    }} /></label>
}

/**
 * 为同类型选区编辑共有属性，每次操作作为一次历史提交并保留各成员的其他值。
 * @param props 当前作品、选区、画布渲染设置及更新回调。
 * @returns 同类型的批量属性控件；混合类型时不展示。
 */
export function BatchProperties({ scene, elements, options, disabled = false, on_change }: BatchPropertiesProps) {
    const editable = elements.filter(element => !element.locked)
    const type = common_value(editable, element => element.type)
    if (editable.length < 2 || !type) return null
    const ids = editable.map(element => element.id)
    const common = <Value,>(read: (element: SceneElement) => Value) => common_value(editable, read)
    const fontFamily = common(element => element.fontFamily ?? 'sans-serif')
    const pixel = pixel_font(fontFamily)
    const fontSize = common(element => element.fontSize ?? 20)
    const sizes = pixel ? [...Array(Math.floor(300 / pixel.size)).keys()].map(index => (index + 1) * pixel.size) : []
    const renderMode = common(element => element.processOptions ? 'custom' : 'default')
    const renderOptions = editable.map(element => resolve_layer_options(element, options))
    const graphicOnly = type === 'image' && editable.every(element => element.processMode === 'graphic')
    const colors = colorValues.slice(0, scene.palette === 'bw' ? 2 : scene.palette === 'bwr' ? 3 : 4)

    /**
     * 只修改当前作品中仍未锁定、仍为原类型的成员，拒绝过期控件更新。
     * @param change 固定属性补丁或基于各成员原值的属性更新。
     * @returns 无返回值。
     */
    function patch(change: Partial<SceneElement> | ((element: SceneElement) => Partial<SceneElement>)): void {
        if (disabled) return
        on_change(current => current.id !== scene.id ? current : patch_selection(current, ids, element => element.type !== type ? {} : typeof change === 'function' ? change(element) : change), true)
    }

    /**
     * 修改一个渲染参数时保留每个成员原有的其他参数。
     * @param change 本次明确修改的渲染属性。
     * @returns 无返回值。
     */
    function patch_options(change: Partial<ProcessOptions>): void {
        patch(element => ({ processOptions: { ...(element.processOptions ?? resolve_layer_options(element, options)), ...change } }))
    }

    /**
     * 切换字体时按每个成员原有字号分别选择原生点阵整数倍。
     * @param family 用户选中的字体。
     * @returns 无返回值；未加载点阵字体保持原设置。
     */
    function change_font(family: string): void {
        const selected = pixel_font(family)
        if (!selected) { patch({ fontFamily: family }); return }
        if (!pixel_font_ready(selected.id)) return
        patch(element => ({ fontFamily: selected.id, fontWeight: 400, fontSize: Math.max(1, Math.min(Math.floor(300 / selected.size), Math.round((element.fontSize ?? 20) / selected.size))) * selected.size }))
    }

    const swatches = (label: string, value: string | undefined, on_color: (color: string) => void) => <label className="field-label">{label}{value === undefined && <span className="batch-mixed">混合</span>}<div className="swatch-row">{colors.map(color => <button key={color} type="button" className={`color-swatch ${value === color ? 'active' : ''}`} style={{ background: color }} aria-label={`批量${label} ${color}`} aria-pressed={value === color} disabled={disabled} onClick={() => on_color(color)}>{value === color && <Check size={12} color={color === '#171717' ? '#ffffff' : '#171717'} />}</button>)}</div></label>

    return <fieldset className="batch-properties" disabled={disabled} aria-label={`批量${typeNames[type]}属性`}>
        <legend>{typeNames[type]}属性 <span>应用到 {editable.length} 个图层</span></legend>
        {type === 'text' && <>
            <BatchSelect label="字体" value={fontFamily} on_change={change_font} disabled={disabled} choices={[
                { value: 'sans-serif', label: '现代黑体' }, { value: 'serif', label: '经典宋体' }, { value: 'monospace', label: '等宽字体' },
                ...pixelFonts.map(font => ({ value: font.id, label: font.label, disabled: !pixel_font_ready(font.id) })),
            ]} />
            <div className="property-grid">
                {pixel ? <BatchSelect label="字号" value={fontSize === undefined ? undefined : String(fontSize)} on_change={value => patch({ fontSize: Number(value) })} disabled={disabled} choices={[
                    ...(fontSize !== undefined && !sizes.includes(fontSize) ? [{ value: String(fontSize), label: `当前 ${fontSize} px`, disabled: true }] : []),
                    ...sizes.map(value => ({ value: String(value), label: `${value} px` })),
                ]} /> : <BatchNumber label="字号" value={fontSize} min={4} max={300} on_change={value => patch(element => {
                    const selected = pixel_font(element.fontFamily)
                    return { fontSize: selected ? Math.max(1, Math.min(Math.floor(300 / selected.size), Math.round(value / selected.size))) * selected.size : value }
                })} />}
                <BatchSelect label="字重" value={common(element => String(pixel_font(element.fontFamily) ? 400 : element.fontWeight ?? 400))} on_change={value => patch(element => pixel_font(element.fontFamily) ? {} : { fontWeight: Number(value) })} disabled={disabled || editable.every(element => Boolean(pixel_font(element.fontFamily)))} choices={[
                    { value: '400', label: '常规' }, { value: '500', label: '中等' }, { value: '600', label: '半粗' }, { value: '700', label: '粗体' },
                ]} />
            </div>
            <BatchSelect label="文字对齐" value={common(element => element.align ?? 'left')} on_change={value => patch({ align: value as SceneElement['align'] })} disabled={disabled} choices={[{ value: 'left', label: '左对齐' }, { value: 'center', label: '居中对齐' }, { value: 'right', label: '右对齐' }]} />
        </>}
        {type === 'image' && <>
            <ImagePurpose mode={common(element => element.processMode === 'graphic' ? 'graphic' : 'photo') ?? 'mixed'} on_change={processMode => patch({ processMode })} disabled={disabled} />
            <BatchSelect label="图片适配" value={common(element => element.fit ?? 'contain')} on_change={value => patch({ fit: value as SceneElement['fit'] })} disabled={disabled} choices={[{ value: 'contain', label: '完整显示' }, { value: 'cover', label: '填满画框 · 中心裁剪' }]} />
            <div className="property-grid"><BatchSelect label="水平镜像" value={common(element => element.flipX ? 'on' : 'off')} on_change={value => patch({ flipX: value === 'on' })} disabled={disabled} choices={[{ value: 'off', label: '关闭' }, { value: 'on', label: '开启' }]} /><BatchSelect label="垂直翻转" value={common(element => element.flipY ? 'on' : 'off')} on_change={value => patch({ flipY: value === 'on' })} disabled={disabled} choices={[{ value: 'off', label: '关闭' }, { value: 'on', label: '开启' }]} /></div>
        </>}
        {(type === 'text' || type === 'line' || type === 'rect') && swatches(type === 'text' ? '文字颜色' : type === 'line' ? '线条颜色' : '填充颜色', common(element => element.fill), fill => patch({ fill }))}
        {type === 'rect' && <>
            {swatches('边框颜色', common(element => element.stroke ?? '#171717'), stroke => patch(element => ({ stroke, strokeWidth: element.strokeWidth || 1 })))}
            <div className="property-grid"><BatchNumber label="边框宽度" value={common(element => element.stroke ? element.strokeWidth ?? 0 : 0)} min={0} max={100} on_change={strokeWidth => patch(element => ({ strokeWidth, stroke: element.stroke ?? '#171717' }))} /><BatchNumber label="圆角" value={common(element => element.radius ?? 0)} min={0} max={100} on_change={radius => patch({ radius })} /></div>
        </>}
        {type !== 'text' && <div className="property-grid">
            {type === 'line' ? <><BatchNumber label="长度" value={common(element => line_size(element).length)} min={0.01} step={0.01} on_change={length => patch(element => set_line_size(element, { length }))} /><BatchNumber label="线宽" value={common(element => line_size(element).thickness)} min={0.01} step={0.01} on_change={thickness => patch(element => set_line_size(element, { thickness }))} /></> : <><BatchNumber label="宽度" value={common(element => element.width)} min={1} on_change={width => patch({ width })} /><BatchNumber label="高度" value={common(element => element.height)} min={1} on_change={height => patch({ height })} /></>}
        </div>}
        <BatchNumber label="旋转 °" value={common(element => element.rotation ?? 0)} min={-180} max={180} on_change={rotation => patch({ rotation })} />
        <BatchSelect label="渲染设置" value={renderMode} on_change={value => patch(element => ({ processOptions: value === 'custom' ? element.processOptions ?? resolve_layer_options(element, options) : undefined }))} disabled={disabled} choices={[{ value: 'default', label: '默认设置' }, { value: 'custom', label: '单独设置' }]} />
        {editable.some(element => element.processOptions) && <div className="batch-render-settings" role="group" aria-label="批量渲染参数">
            <BatchSelect label="处理引擎" value={common_value(renderOptions, value => value.engine)} on_change={engine => patch_options({ engine: engine as ProcessOptions['engine'] })} disabled={disabled} choices={[{ value: 'epdoptimize', label: 'EPD Optimize 1.3.0' }, { value: 'opendisplay', label: 'OpenDisplay 6.1.1' }]} />
            <BatchSelect label="抖动算法" value={common_value(renderOptions, value => value.algorithm)} on_change={algorithm => patch_options({ algorithm: algorithm as ProcessOptions['algorithm'] })} disabled={disabled || graphicOnly} choices={[{ value: 'atkinson', label: 'Atkinson · 推荐' }, { value: 'floyd', label: 'Floyd–Steinberg' }, { value: 'burkes', label: 'Burkes' }, { value: 'bayer', label: 'Bayer · 有序抖动' }, { value: 'none', label: '无抖动 · 颜色量化' }]} />
            <div className="property-grid"><BatchNumber label="对比度" value={common_value(renderOptions, value => value.contrast)} min={0} max={3} step={0.05} on_change={contrast => patch_options({ contrast })} /><BatchNumber label="亮度" value={common_value(renderOptions, value => value.brightness)} min={-100} max={100} on_change={brightness => patch_options({ brightness })} /></div>
        </div>}
    </fieldset>
}
