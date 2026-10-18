import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ProcessMode } from '@/lib/studio'

type ImagePurposeProps = {
    mode?: ProcessMode | 'mixed'
    on_change: (mode: 'photo' | 'graphic') => void
    disabled?: boolean
}

/**
 * 在工作台和图片直传中选择图片类型，旧自动模式按照片显示。
 * @param props 当前类型、图层变更回调及禁用状态。
 * @returns 图片类型选择框。
 */
export function ImagePurpose({ mode, on_change, disabled = false }: ImagePurposeProps) {
    const current = mode === 'mixed' ? 'mixed' : mode === 'graphic' ? 'graphic' : 'photo'
    return <label className="field-label">图片类型<Select value={current} onValueChange={value => on_change(value === 'graphic' ? 'graphic' : 'photo')} disabled={disabled}><SelectTrigger aria-label="图片类型"><SelectValue /></SelectTrigger><SelectContent>{current === 'mixed' && <SelectItem value="mixed" disabled>多个值</SelectItem>}<SelectItem value="photo">照片 / 渐变</SelectItem><SelectItem value="graphic">图标 / 纯色</SelectItem></SelectContent></Select></label>
}
