import { useId, useMemo, useState, type CSSProperties } from 'react'
import { AlertTriangle, ArrowUpRight, ExternalLink, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import type { SceneElement, Template } from '@/lib/studio/model'
import { apply_template_fields, template_field_warning, type FieldChanges, type FieldWarning } from '@/lib/studio/template-fields'
import { fit_text_element } from '@/lib/studio/text-bounds'
import { ScenePreview } from './scene-preview'
import './template-setup.css'

type SetupField = { label: string; group: string; element: SceneElement }
type SetupProps = { template: Template; on_close: () => void; on_create: (template: Template) => void }

/**
 * 按唯一图层名称绑定配置字段，防止字段误写到同名图层。
 * @param template 带配置字段的原始模板。
 * @returns 已绑定字段和需要阻止创建的配置错误。
 */
function bind_fields(template: Template): { fields: SetupField[]; error: string } {
    const fields: SetupField[] = []
    const names = new Set<string>()
    for (const field of template.fields ?? []) {
        const matches = template.scene.elements.filter(element => element.name === field.name)
        if (names.has(field.name) || matches.length !== 1 || !['text', 'qr'].includes(matches[0].type) || matches[0].locked) {
            return { fields, error: `“${field.label ?? field.name}”暂时无法配置，请选择其他模板。` }
        }
        names.add(field.name)
        fields.push({ label: field.label ?? field.name, group: field.group ?? '模板内容', element: matches[0] })
    }
    return { fields, error: '' }
}

/**
 * 检查配置内容能否输出，并提示超出模板预留区域的文字。
 * @param element 保留初始预留宽高的模板图层。
 * @param text 用户当前输入，保留空格与换行。
 * @param template 原始模板，用于检查画布边界。
 * @returns 字段错误或可继续编辑的排版提示。
 */
function field_warning(element: SceneElement, text: string, template: Template): FieldWarning | null {
    const warning = template_field_warning(element, text, template.scene)
    if (warning) return warning
    if (element.type !== 'text') return null
    try {
        const fitted = fit_text_element({ ...element, text })
        if (fitted.width > element.width + 0.5 || fitted.height > element.height + 0.5) {
            return { message: '内容超出预留区域，可能遮住相邻内容。可换行、缩短文字，或创建草稿后调整字号和位置。', blocking: false }
        }
        return null
    } catch (error) {
        return { message: error instanceof Error ? error.message : String(error), blocking: true }
    }
}

/**
 * 在独立草稿中配置模板并实时预览，取消或重开不会修改原始模板。
 * @param props 原始模板、关闭回调和创建草稿回调。
 * @returns 按字段分组的配置弹窗及实时作品预览。
 */
export function TemplateSetup({ template, on_close, on_create }: SetupProps) {
    const prefix = useId()
    const [edits, set_edits] = useState<FieldChanges>({})
    const [processed, set_processed] = useState(false)
    const binding = useMemo(() => bind_fields(template), [template])
    const groups = useMemo(() => {
        const result = new Map<string, SetupField[]>()
        for (const field of binding.fields) result.set(field.group, [...(result.get(field.group) ?? []), field])
        return [...result]
    }, [binding])
    const result = useMemo(() => {
        const warnings = new Map(binding.fields.map(field => {
            const value = edits[field.element.id] ?? field.element.text ?? ''
            return [field.element.id, field_warning(field.element, value, template)]
        }))
        const blocked = Boolean(binding.error) || [...warnings.values()].some(warning => warning?.blocking)
        try {
            return { scene: apply_template_fields(template.scene, edits), warnings, blocked, error: binding.error }
        } catch (error) {
            return { scene: null, warnings, blocked: true, error: error instanceof Error ? error.message : String(error) }
        }
    }, [template, binding, edits])
    const warningCount = [...result.warnings.values()].filter(Boolean).length

    /**
     * 将当前配置交给既有草稿流程，保留模板说明与来源。
     * @returns 无返回值；有阻断错误时不创建草稿。
     */
    function create_draft(): void {
        if (!result.scene || result.blocked) return
        on_create({ ...template, scene: result.scene })
    }

    return <Dialog open onOpenChange={open => { if (!open) on_close() }}>
        <DialogContent className="template-setup-dialog">
            <DialogHeader><DialogTitle>配置{template.name}</DialogTitle><DialogDescription>{template.description} 修改后创建草稿，可继续调整排版。</DialogDescription></DialogHeader>
            <div className="template-setup-body">
                <div className="template-setup-settings">
                    {groups.map(([group, fields]) => <fieldset className="template-setup-group" key={group}>
                        <legend>{group}</legend>
                        {fields.map(({ label, element }) => {
                            const value = edits[element.id] ?? element.text ?? ''
                            const warning = result.warnings.get(element.id)
                            const fieldId = `${prefix}-${element.id}`
                            return <div className="template-setup-field" key={element.id}>
                                <label htmlFor={fieldId}><span>{label}</span>{element.type === 'qr' && <span className="template-setup-qr"><QrCode size={13} />二维码内容</span>}</label>
                                <Textarea id={fieldId} value={value} rows={element.type === 'qr' ? 3 : Math.min(5, Math.max(1, (element.text ?? '').split('\n').length))} aria-invalid={warning?.blocking || undefined} aria-describedby={warning ? `${fieldId}-warning` : undefined} onChange={event => set_edits(current => ({ ...current, [element.id]: event.target.value }))} />
                                {warning && <p id={`${fieldId}-warning`} className="template-setup-warning" data-blocking={warning.blocking} role="status"><AlertTriangle size={14} /><span>{warning.message}</span></p>}
                            </div>
                        })}
                    </fieldset>)}
                    {template.note && <p className="template-setup-note">{template.note}</p>}
                    {Boolean(template.sources?.length) && <div className="template-setup-sources"><h3>参考来源</h3>{template.sources?.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer"><span>{source.title}<small>{source.platform}</small></span><ExternalLink size={13} /></a>)}</div>}
                </div>
                <div className="template-setup-preview">
                    <div className="template-setup-caption"><span>实时预览 · {template.scene.width} × {template.scene.height}</span><div role="group" aria-label="预览模式"><button type="button" aria-pressed={!processed} onClick={() => set_processed(false)}>原稿</button><button type="button" aria-pressed={processed} onClick={() => set_processed(true)}>墨水屏</button></div></div>
                    <div className="template-setup-stage">
                        {result.scene && !result.blocked ? <div className="template-setup-paper" style={{ '--template-ratio': template.scene.width / template.scene.height } as CSSProperties}><ScenePreview scene={result.scene} processed={processed} showWarnings /></div> : <div className="template-setup-error" role="alert"><AlertTriangle size={26} /><p>{result.error || '请先修正标出的内容，再查看预览或创建草稿。'}</p></div>}
                    </div>
                    <p className="template-setup-preview-hint">文字保留输入的换行。图片需手动发送到设备。</p>
                </div>
            </div>
            <div className="template-setup-footer"><span role="status">{result.blocked ? '请先修正标出的内容' : warningCount ? `${warningCount} 项排版提示，可创建草稿后调整` : '创建后可继续编辑文字、字号和位置'}</span><div><Button variant="outline" onClick={on_close}>取消</Button><Button disabled={result.blocked || !result.scene} onClick={create_draft}>创建草稿<ArrowUpRight size={14} /></Button></div></div>
        </DialogContent>
    </Dialog>
}
