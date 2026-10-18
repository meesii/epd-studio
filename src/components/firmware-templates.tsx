import { useEffect, useState } from 'react'
import { Bluetooth, CalendarDays, Check, Clock3, Info, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { DeviceSnapshot } from '@/lib/ble'
import { firmwareModes, read_firmware_mode, read_firmware_week, type FirmwareMode } from '@/lib/firmware-modes'
import { matches_template } from '@/lib/template-search'
import { TemplateCard } from './template-card'
import './firmware-templates.css'

interface FirmwareTemplatesProps {
    device: DeviceSnapshot
    busy: boolean
    on_mode: (mode: FirmwareMode, weekStart: number) => void
    filter?: string
    query?: string
}

const firmwareCards = firmwareModes.map(mode => ({ ...mode, description: mode.mode === 1 ? '农历、节气、节日与星期' : '时间、日期、温度与电量' }))

/**
 * 为图库和卡片共用内置模式的分类与搜索结果。
 * @param filter 当前模板分类。
 * @param query 模板名称、说明或行为关键词。
 * @returns 当前可见的内置模式。
 */
export function get_firmware_cards(filter = '全部', query = '') {
    return ['全部', '设备内置', '日常'].includes(filter) ? firmwareCards.filter(card => matches_template(query, [card.name, card.description, card.cadence, '设备内置', '日常', '自动刷新'])) : []
}

/**
 * 将内置模式作为统一模板网格的直接子项，仅在对话框确认后交给 App 连接校时。
 * @param props 设备配置、互斥状态、分类与内置模式启用回调。
 * @returns 两张可配置卡片及 Portal 设置对话框。
 */
export function FirmwareTemplates({ device, busy, on_mode, filter = '全部', query = '' }: FirmwareTemplatesProps) {
    const storedWeek = read_firmware_week(device.config)
    const [week, set_week] = useState(String(storedWeek))
    const [selectedMode, set_selected_mode] = useState<FirmwareMode | null>(null)
    const selected = firmwareModes.find(mode => mode.mode === selectedMode)
    const currentMode = read_firmware_mode(device.config)
    const currentName = currentMode === 0 ? '图片模式' : firmwareModes.find(mode => mode.mode === currentMode)?.name ?? '模式未知'
    const modeState = device.config ? (device.connected ? '当前' : '上次记录') + ' · ' + currentName : device.connected ? '等待读取固件配置' : '连接后读取当前模式'
    const cards = get_firmware_cards(filter, query)

    useEffect(() => { set_week(String(storedWeek)) }, [device.id, storedWeek])

    /**
     * 在真实点击事件内直接调用连接入口，保留浏览器蓝牙选择器所需的用户手势。
     * @returns 无返回值。
     */
    function enable_mode(): void {
        if (!selected || busy) return
        on_mode(selected.mode, Number(week))
        set_selected_mode(null)
    }

    return <>
        {cards.map(mode => {
            const Icon = mode.mode === 1 ? CalendarDays : Clock3
            return <TemplateCard key={mode.mode} name={mode.name} description={mode.description} tags={['设备内置', '自动刷新']} action={busy ? '设备忙碌，请稍候' : '设置' + mode.name} kind="firmware" tone={mode.mode === 1 ? 'sage' : 'sand'} active={device.connected && currentMode === mode.mode} disabled={busy} hint={busy ? '设备忙碌或刷新冷却中，请稍候再启用。' : undefined} on_click={() => set_selected_mode(mode.mode)}>
                <div className="firmware-cover-graphic"><Icon size={43} strokeWidth={1.25} /><b>{mode.cadence}</b><small>样式由固件决定</small></div>
            </TemplateCard>
        })}
        <Dialog open={selectedMode !== null} onOpenChange={open => { if (!open) set_selected_mode(null) }}>
            <DialogContent className="firmware-template-dialog">
                <DialogHeader><DialogTitle>{selected?.name ?? '内置模板设置'}</DialogTitle><DialogDescription>{selected?.cadence}，样式由固件决定。</DialogDescription></DialogHeader>
                <div className="firmware-dialog-state"><span className={'firmware-state-dot ' + (device.connected ? 'online' : '')} /><b>{device.connected ? '已连接' : '尚未连接'}</b><span>{modeState}</span></div>
                <div className="firmware-dialog-features">{selected?.features.map(feature => <span key={feature}>{feature}</span>)}</div>
                <label className="firmware-week-field"><span><CalendarDays size={14} />星期起始日</span><Select value={week} onValueChange={set_week} disabled={busy}><SelectTrigger aria-label="内置模板星期起始日"><SelectValue /></SelectTrigger><SelectContent>{['周日', '周一', '周二', '周三', '周四', '周五', '周六'].map((name, index) => <SelectItem key={name} value={String(index)}>{name}</SelectItem>)}</SelectContent></Select></label>
                <div className="firmware-dialog-notes"><Info size={15} /><p>启用时同步电脑时间，断开蓝牙后继续运行。{selectedMode === 2 ? '每分钟整屏刷新，耗电高于日历。' : ''}重启后需重新校时，农历与班休数据以固件为准。</p></div>
                <div className="firmware-dialog-actions"><Button variant="outline" onClick={() => set_selected_mode(null)}>返回模板</Button><Button disabled={busy || !selected} aria-label={(device.connected ? '同步并启用' : '连接并启用') + (selected?.name ?? '')} onClick={enable_mode}>{busy ? <Loader2 className="animate-spin" size={14} /> : device.connected ? <Check size={14} /> : <Bluetooth size={14} />}{busy ? '设备忙碌，请稍候' : device.connected ? '同步并启用' : '连接并启用'}</Button></div>
            </DialogContent>
        </Dialog>
    </>
}
