import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { resolve_options, type ProcessAlgorithm, type ProcessOptions } from '@/lib/studio'

type ProcessSettingsProps = {
    options: ProcessOptions
    on_change: (options: ProcessOptions) => void
    disabled?: boolean
    fixedAlgorithm?: ProcessAlgorithm
    rangeClassName?: string
}

const algorithms = [
    { value: 'atkinson', label: 'Atkinson · 推荐' },
    { value: 'floyd', label: 'Floyd–Steinberg' },
    { value: 'burkes', label: 'Burkes' },
    { value: 'bayer', label: 'Bayer · 有序抖动' },
    { value: 'none', label: '无抖动 · 颜色量化' },
] as const

const ranges = [
    { key: 'contrast', label: '对比度', min: 0, max: 3, step: 0.05 },
    { key: 'brightness', label: '亮度', min: -100, max: 100, step: 1 },
] as const

/**
 * 为工作台与图片直传提供同一组真实引擎参数，旧设置仅解析显示而不自动改写。
 * @param props 作品设置、变更回调、禁用状态、固定算法及滑块布局样式。
 * @returns 共享的引擎、算法和色调控件。
 */
export function ProcessSettings({ options, on_change, disabled = false, fixedAlgorithm, rangeClassName = 'range-field' }: ProcessSettingsProps) {
    const current = resolve_options(options)
    return <>
        <label className="field-label">处理引擎<Select value={current.engine} onValueChange={value => on_change({ ...options, engine: value as ProcessOptions['engine'] })} disabled={disabled}><SelectTrigger aria-label="处理引擎"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="epdoptimize">EPD Optimize 1.3.0</SelectItem><SelectItem value="opendisplay">OpenDisplay 6.1.1</SelectItem></SelectContent></Select></label>
        <label className="field-label">抖动算法<Select value={fixedAlgorithm ?? current.algorithm} onValueChange={value => { if (fixedAlgorithm === undefined) on_change({ ...options, algorithm: value as ProcessOptions['algorithm'] }) }} disabled={disabled || fixedAlgorithm !== undefined}><SelectTrigger aria-label="抖动算法"><SelectValue /></SelectTrigger><SelectContent>{algorithms.map(algorithm => <SelectItem key={algorithm.value} value={algorithm.value}>{algorithm.label}</SelectItem>)}</SelectContent></Select></label>
        {ranges.map(field => <label className={rangeClassName} key={field.key}><span>{field.label}<b>{current[field.key]}</b></span><Slider aria-label={field.label} value={[current[field.key]]} min={field.min} max={field.max} step={field.step} disabled={disabled} onValueChange={values => on_change({ ...options, [field.key]: values[0] })} /></label>)}
    </>
}
