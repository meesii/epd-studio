import { useId, useMemo, useState, type CSSProperties } from 'react'
import { ArrowUpRight, Check, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { create_timetable_scene, create_todo_scene, timetableDays, timetable_font_size, type DemoStyle, type TodoTask } from '@/lib/demo-templates'
import type { Scene } from '@/lib/studio'
import { matches_template } from '@/lib/template-search'
import { use_template_input } from '@/hooks/use-template-input'
import { read_demo_input, type DemoInput } from '@/lib/template-inputs'
import { ScenePreview } from './scene-preview'
import { TemplateCard } from './template-card'
import './demo-templates.css'

const initialTasks: TodoTask[] = [
    { text: '整理今天最重要的三件事', completed: true },
    { text: '留一段时间，专注手边的工作', completed: false },
    { text: '读几页书，记下一点灵感', completed: false },
    { text: '出门走走，看看真实的世界', completed: false },
    { text: '好好吃饭，也好好休息', completed: false },
]

const demoCards = [
    { kind: 'todo' as const, name: '今日待办', description: '任务内容、完成状态与文字样式', action: '配置待办模板', tone: 'sand' as const },
    { kind: 'timetable' as const, name: '每周课表', description: '天数、节次、课程与文字样式', action: '配置课表模板', tone: 'sage' as const },
]

/**
 * 为图库计数和可配置图片共用分类与搜索结果。
 * @param filter 当前模板分类。
 * @param query 模板名称、说明或行为关键词。
 * @returns 当前可见的待办与课表卡片。
 */
export function get_demo_cards(filter = '全部', query = '') {
    return ['全部', '可编辑图片', '工作'].includes(filter) ? demoCards.filter(card => matches_template(query, [card.name, card.description, '可配置', '可编辑图片', '工作'])) : []
}

/**
 * 创建独立课程编辑矩阵；尚未显示的天数和节次仍保留用户编辑空间。
 * @returns 十二节、七天的初始课程矩阵。
 */
function initial_cells(): string[][] {
    const examples = [['语文', '数学', '英语', '语文', '数学'], ['数学', '英语', '语文', '科学', '英语'], ['英语', '科学', '体育', '数学', '美术'], ['美术', '体育', '科学', '音乐', '阅读']]
    return Array.from({ length: 12 }, (unused, row) => { void unused; return Array.from({ length: 7 }, (empty, column) => { void empty; return examples[row]?.[column] ?? '' }) })
}

/**
 * 提供原演示页的待办和课表编辑器，生成静态图片作品后才交给工作台。
 * @param props 创建新草稿的回调；组件不会保存作品或操作蓝牙。
 * @returns 两张图片模板卡及带实时预览的编辑对话框。
 */
export function DemoTemplates({ on_create, filter = '全部', query = '' }: { on_create: (scene: Scene) => void; filter?: string; query?: string }) {
    const taskId = useId()
    const [kind, set_kind] = useState<'todo' | 'timetable' | null>(null)
    const [input, set_input] = use_template_input<DemoInput>('daily', () => ({ todoTitle: '今日待办', tableTitle: '这一周，好好学习', todoText: initialTasks.map(task => task.text).join('\n'), tasks: initialTasks.map(task => ({ ...task })), cells: initial_cells(), days: 5, periods: 6, fontSize: 20, fontFamily: 'pixel-16', color: '#000000', size: '800x480' }), read_demo_input)
    const { todoTitle, tableTitle, todoText, tasks, cells, days, periods, fontSize, fontFamily, color, size } = input
    const [processed, set_processed] = useState(false)
    const [width, height] = size.split('x').map(Number)
    const cards = get_demo_cards(filter, query)
    const sampleTodo = useMemo(() => create_todo_scene({ title: '今日待办', tasks: initialTasks, fontSize: 20, color: '#ff0000' }), [])
    const sampleTable = useMemo(() => create_timetable_scene({ title: '这一周，好好学习', days: 5, periods: 6, cells: initial_cells().slice(0, 6).map(row => row.slice(0, 5)), color: '#000000' }), [])
    const result = useMemo(() => {
        const style: DemoStyle = { title: kind === 'todo' ? todoTitle : tableTitle, width, height, fontSize, fontFamily, color }
        try {
            return { scene: kind === 'todo' ? create_todo_scene({ ...style, tasks }) : create_timetable_scene({ ...style, days, periods, cells: cells.slice(0, periods).map(row => row.slice(0, days)) }), error: '' }
        } catch (error) { return { scene: null, error: error instanceof Error ? error.message : String(error) } }
    }, [kind, todoTitle, tableTitle, width, height, fontSize, fontFamily, color, tasks, days, periods, cells])

    /**
     * 解析多行待办，按原文字匹配保留完成状态，空行只用于编辑留白。
     * @param value 多行任务文本，每行一项。
     * @returns 无返回值。
     */
    function change_tasks(value: string): void {
        set_input('todoText', value)
        const pool = new Map<string, boolean[]>()
        for (const task of tasks) pool.set(task.text, [...(pool.get(task.text) ?? []), task.completed])
        set_input('tasks', value.split(/\r?\n/).map(text => text.trim()).filter(Boolean).map(text => ({ text, completed: pool.get(text)?.shift() ?? false })))
    }

    /**
     * 将验证通过的当前图层交给父级草稿流程，不在组件内保存或发送。
     * @returns 无返回值。
     */
    function create_draft(): void {
        if (!result.scene) return
        on_create(result.scene)
        set_kind(null)
    }

    return <>
        {cards.map(card => <TemplateCard key={card.kind} name={card.name} description={card.description} tags={['可配置', '图片', '工作']} action={card.action} tone={card.tone} on_click={() => { set_kind(card.kind); set_processed(false) }}><ScenePreview scene={card.kind === 'todo' ? sampleTodo : sampleTable} /></TemplateCard>)}
        <Dialog open={kind !== null} onOpenChange={open => { if (!open) set_kind(null) }}><DialogContent className="demo-template-dialog">
            <DialogHeader><DialogTitle>{kind === 'todo' ? '待办模板' : '课表模板'}</DialogTitle><DialogDescription>静态图片，设备不会自动更新；修改后需重新发送。</DialogDescription></DialogHeader>
            <div className="demo-dialog-body">
                <div className="demo-template-settings">
                    <label className="field-label">{kind === 'todo' ? '清单标题' : '课表标题'}<Input maxLength={20} value={kind === 'todo' ? todoTitle : tableTitle} onChange={event => kind === 'todo' ? set_input('todoTitle', event.target.value) : set_input('tableTitle', event.target.value)} /></label>
                    {kind === 'todo' ? <><label className="field-label">任务内容<Textarea aria-label="待办任务，每行一项" value={todoText} onChange={event => change_tasks(event.target.value)} rows={6} /><small>每行一项，最多 8 项，每项 80 字。</small></label><div className="demo-task-checks"><div><span>完成状态</span><b>{tasks.filter(task => task.completed).length} / {tasks.length}</b></div>{tasks.map((task, index) => <label key={index} htmlFor={`${taskId}-${index}`}><Checkbox id={`${taskId}-${index}`} checked={task.completed} onCheckedChange={checked => set_input('tasks', current => current.map((entry, taskIndex) => taskIndex === index ? { ...entry, completed: checked === true } : entry))} /><span>{task.text}</span>{task.completed && <Check size={13} />}</label>)}</div></> : <>
                        <div className="demo-setting-pair"><label className="field-label">每周天数<Select value={String(days)} onValueChange={value => set_input('days', Number(value))}><SelectTrigger aria-label="课表天数"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 7 }, (unused, index) => { void unused; return <SelectItem key={index} value={String(index + 1)}>{index + 1} 天</SelectItem> })}</SelectContent></Select></label><label className="field-label">每天节数<Select value={String(periods)} onValueChange={value => set_input('periods', Number(value))}><SelectTrigger aria-label="课表节数"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 12 }, (unused, index) => { void unused; return <SelectItem key={index} value={String(index + 1)}>{index + 1} 节</SelectItem> })}</SelectContent></Select></label></div>
                        <div className="demo-cell-heading">编辑课程<small>每格最多 40 字，可换行</small></div><div className="demo-cell-editor"><table><thead><tr><th>节次</th>{timetableDays.slice(0, days).map(day => <th key={day}>{day}</th>)}</tr></thead><tbody>{cells.slice(0, periods).map((row, rowIndex) => <tr key={rowIndex}><th>{rowIndex + 1}</th>{row.slice(0, days).map((value, columnIndex) => <td key={columnIndex}><Textarea aria-label={`${timetableDays[columnIndex]}第${rowIndex + 1}节课程`} value={value} maxLength={40} rows={2} onChange={event => set_input('cells', current => current.map((entries, entryIndex) => entryIndex === rowIndex ? entries.map((entry, cellIndex) => cellIndex === columnIndex ? event.target.value : entry) : entries))} /></td>)}</tr>)}</tbody></table></div><p className="demo-setting-hint">缩小天数或节数会隐藏相应课程，重新调大可恢复；生成仅包含当前范围。</p>
                    </>}
                    <div className="demo-settings-divider"><span>排版与墨水</span></div>
                    <div className="demo-setting-pair"><label className="field-label">字体<Select value={fontFamily} onValueChange={value => set_input('fontFamily', value as DemoStyle['fontFamily'])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pixel-16">点阵圆体 · 16px</SelectItem><SelectItem value="pixel-12">点阵黑体 · 12px</SelectItem><SelectItem value="sans-serif">现代黑体</SelectItem><SelectItem value="serif">书卷宋体</SelectItem><SelectItem value="monospace">等宽字体</SelectItem></SelectContent></Select></label><label className="field-label">{kind === 'timetable' ? '字号上限' : '任务字号'}<Input aria-label="模板字号" type="number" min={8} max={32} step={1} value={fontSize} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) set_input('fontSize', value) }} /></label></div>
                    <div className="demo-setting-pair"><label className="field-label">文字颜色<Select value={color} onValueChange={value => set_input('color', value as DemoStyle['color'])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="#000000">黑色墨水</SelectItem><SelectItem value="#ff0000">红色墨水</SelectItem></SelectContent></Select></label><label className="field-label">画布尺寸<Select value={size} onValueChange={value => set_input('size', value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="800x480">800 × 480</SelectItem><SelectItem value="400x300">400 × 300</SelectItem><SelectItem value="880x528">880 × 528</SelectItem></SelectContent></Select></label></div>
                    {kind === 'timetable' && <p className="demo-setting-hint">实际字号 {Number((timetable_font_size({ periods, fontSize, fontFamily, width, height }) * Math.min(width / 800, height / 480)).toFixed(1))} px，密集课表会自动缩小文字。</p>}
                    {fontFamily?.startsWith('pixel-') && <p className="demo-setting-hint">点阵字按原生整数倍显示，小字号改用 12px 点阵黑体；放不下时请减少内容或放大画布。</p>}
                </div>
                <div className="demo-template-preview"><div className="demo-preview-caption"><span><i />{width} × {height} · 黑白红三色</span><div><button className={!processed ? 'active' : ''} onClick={() => set_processed(false)}>原稿</button><button className={processed ? 'active' : ''} onClick={() => set_processed(true)}>墨水屏</button></div></div><div className="demo-preview-stage">{result.scene ? <div className="demo-template-paper" style={{ aspectRatio: `${width} / ${height}`, '--demo-ratio': width / height } as CSSProperties}><ScenePreview scene={result.scene} processed={processed} showWarnings /></div> : <div className="demo-template-error" role="alert"><ClipboardList size={27} /><b>内容无法放入画布</b><p>{result.error}</p></div>}</div></div>
            </div>
            <div className="demo-dialog-footer"><span>生成草稿，不会自动保存或发送</span><div><Button variant="outline" onClick={() => set_kind(null)}>返回模板</Button><Button disabled={!result.scene} onClick={create_draft}>放入工作台<ArrowUpRight size={14} /></Button></div></div>
        </DialogContent></Dialog>
    </>
}
