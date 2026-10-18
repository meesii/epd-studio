import { useRef, useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { format, isValid, parseISO } from 'date-fns'
import { useDayPicker, type DropdownProps } from 'react-day-picker'
import { zhCN } from 'react-day-picker/locale'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface DatePickerProps {
    id?: string
    label: string
    value: string
    on_change: (value: string) => void
    disabled?: boolean
    className?: string
}

/**
 * 用 shadcn 下拉框导航月份，避免日历内部再次出现原生 select。
 * @param props 日历提供的选项、当前值和年月类型。
 * @returns 中文年月下拉框。
 */
function CalendarSelect({ options, value, disabled, part }: DropdownProps & { part: 'month' | 'year' }) {
    const { goToMonth: go_to_month, months } = useDayPicker()
    return <Select value={String(value)} disabled={disabled} onValueChange={next => {
        const month = new Date(months[0].date)
        if (part === 'month') month.setMonth(Number(next))
        else month.setFullYear(Number(next))
        go_to_month(month)
    }}>
        <SelectTrigger size="sm" aria-label={part === 'month' ? '选择月份' : '选择年份'} className="relative border-0 px-1.5 text-xs shadow-none"><SelectValue /></SelectTrigger>
        <SelectContent position="popper" className="max-h-64 min-w-20">
            {options?.map(option => <SelectItem key={option.value} value={String(option.value)} disabled={option.disabled}>{option.label}</SelectItem>)}
        </SelectContent>
    </Select>
}

function MonthSelect(props: DropdownProps) { return <CalendarSelect {...props} part="month" /> }
function YearSelect(props: DropdownProps) { return <CalendarSelect {...props} part="year" /> }

/**
 * 以本地年月日读写日期，保持与模板草稿的 YYYY-MM-DD 存储格式兼容。
 * @param props 可访问标签、日期值、变更回调及触发按钮属性。
 * @returns 带中文日历、年月选择、今天和清除操作的日期选择器。
 */
export function DatePicker({ id, label, value, on_change, disabled, className }: DatePickerProps) {
    const [open, set_open] = useState(false)
    const popupRef = useRef<HTMLDivElement>(null)
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseISO(value) : undefined
    const selected = parsed && isValid(parsed) ? parsed : undefined
    const today = new Date()
    const year = selected?.getFullYear() ?? today.getFullYear()

    function select_date(date: Date | undefined) {
        on_change(date ? format(date, 'yyyy-MM-dd') : '')
        set_open(false)
    }

    return <Popover open={open} onOpenChange={set_open}>
        <PopoverTrigger asChild>
            <Button id={id} type="button" variant="outline" disabled={disabled} aria-label={`${label}：${selected ? format(selected, 'yyyy年M月d日') : '未选择'}`} data-slot="date-picker-trigger" className={cn('h-9 w-full justify-between bg-card px-2.5 font-normal tabular-nums', !selected && 'text-muted-foreground', className)}>
                <span>{selected ? format(selected, 'yyyy/MM/dd') : '选择日期'}</span><CalendarIcon className="size-4 text-muted-foreground" />
            </Button>
        </PopoverTrigger>
        <PopoverContent ref={popupRef} align="start" className="w-auto p-0" collisionPadding={12} aria-label={`选择${label}`} onOpenAutoFocus={event => {
            event.preventDefault()
            popupRef.current?.querySelector<HTMLButtonElement>('[data-focused="true"] button')?.focus()
        }}>
            <Calendar mode="single" locale={zhCN} selected={selected} defaultMonth={selected ?? today} onSelect={select_date} required captionLayout="dropdown" startMonth={new Date(Math.min(1900, year), 0)} endMonth={new Date(Math.max(2100, year), 11)} autoFocus className="[--cell-size:--spacing(9)]" components={{ MonthsDropdown: MonthSelect, YearsDropdown: YearSelect }} labels={{ labelPrevious: () => '上个月', labelNext: () => '下个月', labelGrid: date => format(date, 'yyyy年M月') }} />
            <div className="flex items-center justify-between border-t p-2">
                <Button type="button" variant="ghost" size="sm" disabled={!value} onClick={() => select_date(undefined)}>清除</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => select_date(new Date())}>今天</Button>
            </div>
        </PopoverContent>
    </Popover>
}
