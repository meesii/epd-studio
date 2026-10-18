import { useState } from 'react'
import { EyeOff, ListTodo, LockKeyhole, QrCode, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { Scene } from '@/lib/studio/model'
import { apply_template_fields, template_field_warning, wifi_qr_text, type FieldChanges, type WifiSecurity } from '@/lib/studio/template-fields'
import './template-fields.css'

type TemplateFieldsProps = {
    scene: Scene
    selectedIds: readonly string[]
    disabled?: boolean
    on_change: (change: (current: Scene) => Scene, record?: boolean) => boolean
}

/**
 * 在本地生成 Wi-Fi 内容，只有显式填入后才修改批量编辑草稿。
 * @param props 接收生成内容的回调。
 * @returns 网络配置表单。
 */
function WifiFields({ on_fill }: { on_fill: (value: string) => void }) {
    const [name, set_name] = useState('')
    const [password, set_password] = useState('')
    const [security, set_security] = useState<WifiSecurity>('WPA')
    const [hidden, set_hidden] = useState(false)
    let value = ''
    let error = ''
    try { value = wifi_qr_text({ name, password, security, hidden }) }
    catch (failure) { error = failure instanceof Error ? failure.message : String(failure) }
    return <Collapsible className="wifi-fields">
        <CollapsibleTrigger asChild><Button type="button" variant="ghost" className="wifi-fields-toggle"><Wifi size={14} />生成 Wi-Fi 内容</Button></CollapsibleTrigger>
        <CollapsibleContent>
            <div className="wifi-fields-form">
                <label className="field-label">网络名称（SSID）<Input value={name} maxLength={32} autoComplete="off" onChange={event => set_name(event.target.value)} /></label>
                <label className="field-label">加密方式<Select value={security} onValueChange={next => set_security(next as WifiSecurity)}><SelectTrigger aria-label="Wi-Fi 加密方式"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="WPA">WPA / WPA2</SelectItem><SelectItem value="WEP">WEP</SelectItem><SelectItem value="nopass">无密码</SelectItem></SelectContent></Select></label>
                {security !== 'nopass' && <label className="field-label">网络密码<Input type="password" value={password} maxLength={128} autoComplete="new-password" onChange={event => set_password(event.target.value)} /></label>}
                <label className="wifi-hidden"><span>隐藏网络</span><Switch aria-label="隐藏网络" checked={hidden} onCheckedChange={set_hidden} /></label>
                {name && (password || security === 'nopass') && error && <p role="status" className="template-field-warning">{error}</p>}
                <p className="template-fields-hint">内容在本地生成。二维码四周请留足白边，扫码兼容性以手机相机为准。</p>
                <Button type="button" variant="outline" size="sm" disabled={!value} onClick={() => on_fill(value)}><QrCode size={14} />填入待应用内容</Button>
            </div>
        </CollapsibleContent>
    </Collapsible>
}

/**
 * 按图层名称集中编辑文案和二维码，暂存输入并用一次事务提交当前范围。
 * @param props 当前作品、选区、禁用状态及带撤销历史的作品变更回调。
 * @returns 创作工具入口及批量编辑对话框。
 */
export function TemplateFields({ scene, selectedIds, disabled, on_change }: TemplateFieldsProps) {
    const [open, set_open] = useState(false)
    const [scope, set_scope] = useState<'all' | 'selected'>('all')
    const [edits, set_edits] = useState<FieldChanges>({})
    const [failed, set_failed] = useState(false)
    const allFields = scene.elements.filter(element => element.type === 'text' || element.type === 'qr')
    const selectedFields = allFields.filter(element => selectedIds.includes(element.id))
    const fields = scope === 'selected' ? selectedFields : allFields
    const changedFields = fields.filter(element => !element.locked && Object.hasOwn(edits, element.id) && edits[element.id] !== (element.text ?? ''))
    const warnings = new Map(changedFields.map(element => [element.id, template_field_warning(element, edits[element.id], scene)]))
    const blocked = [...warnings.values()].some(warning => warning?.blocking)

    /**
     * 每次打开都读取最新图层；关闭时丢弃尚未应用的输入。
     * @param next 对话框是否打开。
     * @returns 无返回值。
     */
    function change_open(next: boolean): void {
        set_open(next)
        set_scope('all')
        set_edits({})
        set_failed(false)
    }

    /**
     * 仅提交当前范围内被实际修改的可编辑图层，保持失败时的输入供重试。
     * @returns 无返回值。
     */
    function apply(): void {
        if (!changedFields.length || blocked) return
        const changes = Object.fromEntries(changedFields.map(element => [element.id, edits[element.id]]))
        const accepted = on_change(current => current.id === scene.id ? apply_template_fields(current, changes) : current, true)
        if (accepted) change_open(false)
        else set_failed(true)
    }

    return <>
        <button className="template-fields-trigger" disabled={disabled || !allFields.length} onClick={() => change_open(true)}><ListTodo /><span>批量改文字</span></button>
        <Dialog open={open} onOpenChange={change_open}>
            <DialogContent className="template-fields-dialog">
                <DialogHeader><DialogTitle>批量改文字</DialogTitle><DialogDescription>按图层名称集中修改文字和二维码，应用后可一次撤销。</DialogDescription></DialogHeader>
                <div className="template-fields-scope" role="group" aria-label="批量编辑范围"><Button variant={scope === 'all' ? 'secondary' : 'outline'} size="sm" aria-pressed={scope === 'all'} onClick={() => set_scope('all')}>全部文字（{allFields.length}）</Button><Button variant={scope === 'selected' ? 'secondary' : 'outline'} size="sm" aria-pressed={scope === 'selected'} disabled={!selectedFields.length} onClick={() => set_scope('selected')}>已选图层（{selectedFields.length}）</Button></div>
                <p className="template-fields-hint">只应用当前范围的修改。文字按原字号展开，可手动换行；隐藏图层仍可编辑。</p>
                <div className="template-fields-list">
                    {fields.map(element => {
                        const warning = warnings.get(element.id)
                        return <div key={element.id} className="template-field" data-layer-id={element.id}>
                            <label className="field-label"><span className="template-field-label"><b>{element.name}</b><span>{element.type === 'qr' && <span><QrCode size={12} />二维码</span>}{!element.visible && <span><EyeOff size={12} />已隐藏</span>}{element.locked && <span><LockKeyhole size={12} />已锁定</span>}</span></span><Textarea aria-label={`修改${element.name}`} value={Object.hasOwn(edits, element.id) ? edits[element.id] : element.text ?? ''} disabled={element.locked} maxLength={10000} rows={element.type === 'qr' || element.text?.includes('\n') ? 3 : 2} onChange={event => { set_edits(current => ({ ...current, [element.id]: event.target.value })); set_failed(false) }} /></label>
                            {warning && <p className="template-field-warning" role="status">{warning.message}</p>}
                            {element.type === 'qr' && !element.locked && <WifiFields on_fill={value => { set_edits(current => ({ ...current, [element.id]: value })); set_failed(false) }} />}
                        </div>
                    })}
                    {!fields.length && <p className="template-fields-hint">当前范围没有文字或二维码图层。</p>}
                </div>
                {failed && <p className="template-field-warning" role="alert">应用失败，内容仍保留，可调整后重试。</p>}
                <DialogFooter><Button variant="outline" onClick={() => change_open(false)}>取消</Button><Button disabled={!changedFields.length || blocked} onClick={apply}>应用当前范围 {changedFields.length} 项</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    </>
}
