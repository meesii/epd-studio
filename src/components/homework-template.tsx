import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from 'react'
import { ArrowUpRight, ChevronDown, ClipboardList, ClipboardPaste, Columns2, Columns3, GripVertical, NotebookPen, Plus, SlidersHorizontal, Trash2, WandSparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { parse_homework } from '@/lib/homework-parser'
import { create_homework_scene, homeworkSubjects, type HomeworkFont, type HomeworkSubject } from '@/lib/homework-scene'
import { use_template_input } from '@/hooks/use-template-input'
import { read_homework_input, type HomeworkContent, type HomeworkInput, type HomeworkTask } from '@/lib/template-inputs'
import { matches_template } from '@/lib/template-search'
import { new_id, type Scene } from '@/lib/studio'
import { ScenePreview } from './scene-preview'
import { TemplateCard } from './template-card'
import './homework-template.css'

interface TaskSort { subject: HomeworkSubject; id: string; mode: 'mouse' | 'keyboard'; order: string[] }
interface TaskDrop { id: string; before: boolean }

const homeworkCard = { name: '作业清单', description: '粘贴老师消息，整理三科编号作业', category: '学习' }
const frameChoices = [
    { value: 'double', label: '双线画框' },
    { value: 'corners', label: '像素角标' },
    { value: 'stitch', label: '邮票齿边' },
    { value: 'notebook', label: '方格手账' },
] as const
const sampleSubjects = {
    语文: ['复习《zh ch sh r》，朗读拼音王国 p9–10，3 遍。', '订正听写与随堂练习，家长签字。', '预习《y w》。'],
    数学: ['完成口算练习，检查并订正错题。', '复习今天学习的内容。'],
    其它: ['准备好下周要用的学习用品。'],
}

/**
 * 获取当前分类和关键词匹配的作业配置卡片。
 * @param filter 当前模板分类。
 * @param query 模板搜索关键词。
 * @returns 作业模板匹配结果。
 */
export function get_homework_cards(filter = '全部', query = '') {
    return ['全部', '可编辑图片', '学习'].includes(filter) && matches_template(query, [homeworkCard.name, homeworkCard.description, '语文', '数学', '其它', '微信', '可配置', '图片', '学习']) ? [homeworkCard] : []
}

/**
 * 创建独立的科目输入与条目，避免切换科目时共用草稿。
 * @returns 三科空白配置。
 */
function empty_content(): HomeworkContent {
    return { 语文: { raw: '', tasks: [] }, 数学: { raw: '', tasks: [] }, 其它: { raw: '', tasks: [] } }
}

/**
 * 以本地日期初始化作业日期，避免 UTC 跨天。
 * @returns 日期输入框使用的年月日。
 */
function current_date(): string {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * 根据换行与可用宽度调整输入框，长作业最多显示三行。
 * @param props 作业的可访问名称、文字与编辑回调。
 * @returns 随文字收缩和增长的作业输入框。
 */
function HomeworkTaskInput({ label, value, on_change }: { label: string; value: string; on_change: (text: string) => void }) {
    const inputRef = useRef<HTMLTextAreaElement>(null)
    useLayoutEffect(() => {
        const input = inputRef.current
        if (!input) return
        const fit = () => {
            input.style.height = '0px'
            input.style.height = `${Math.max(24, Math.min(64, input.scrollHeight))}px`
            input.style.overflowY = input.scrollHeight > 64 ? 'auto' : 'hidden'
        }
        fit()
        window.addEventListener('resize', fit)
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
        observer?.observe(input)
        return () => { window.removeEventListener('resize', fit); observer?.disconnect() }
    }, [value])
    return <Textarea ref={inputRef} aria-label={label} value={value} rows={1} maxLength={600} onChange={event => on_change(event.target.value)} />
}

/**
 * 将微信群文字整理为可配置的三科作业，预览后生成独立草稿。
 * @param props 图库筛选参数和新草稿回调。
 * @returns 作业清单卡片与配置对话框。
 */
export function HomeworkTemplate({ on_create, filter = '全部', query = '' }: { on_create: (scene: Scene) => void; filter?: string; query?: string }) {
    const [open, set_open] = useState(false)
    const [processed, set_processed] = useState(true)
    const [sort, set_sort] = useState<TaskSort | null>(null)
    const [input, set_input] = use_template_input<HomeworkInput>('homework', () => ({ subject: '语文', content: empty_content(), title: '今日作业', date: current_date(), size: '800x480', fontSize: 16, fontFamily: 'pixel-16', margin: 0, frame: true, frameStyle: 'double' }), read_homework_input, sort !== null)
    const { subject, content, title, date, size, fontSize, fontFamily, margin, frame, frameStyle } = input
    const [drop, set_drop] = useState<TaskDrop | null>(null)
    const [sortMessage, set_sort_message] = useState('')
    const sortRef = useRef<TaskSort | null>(null)
    const sortFocus = useRef<string | null>(null)
    const listRef = useRef<HTMLOListElement>(null)
    const sortHelp = useId()
    const dateId = useId()
    const [width, height] = size.split('x').map(Number)
    const total = homeworkSubjects.reduce((count, name) => count + content[name].tasks.length, 0)
    const columnCount = content.其它.tasks.length ? 3 : 2
    const ColumnIcon = columnCount === 3 ? Columns3 : Columns2
    const active = content[subject]
    const activeFontSize = fontFamily === 'pixel-16' ? 16 : fontFamily === 'pixel-12' ? 12 : fontSize
    const sample = useMemo(() => create_homework_scene({ title: '今日作业', date: '2026-10-18', subjects: sampleSubjects, fontFamily: 'pixel-16', fontSize: 16 }), [])
    const result = useMemo(() => {
        if (!total) return { scene: null, error: '' }
        try {
            const subjects = Object.fromEntries(homeworkSubjects.map(name => [name, content[name].tasks.map(task => task.text)])) as Record<HomeworkSubject, string[]>
            return { scene: create_homework_scene({ title, date, subjects, width, height, fontSize: activeFontSize, fontFamily, margin, frame, frameStyle }), error: '' }
        } catch (error) { return { scene: null, error: error instanceof Error ? error.message : String(error) } }
    }, [title, date, content, width, height, activeFontSize, fontFamily, margin, frame, frameStyle, total])

    useLayoutEffect(() => {
        const id = sort?.mode === 'keyboard' ? sort.id : sortFocus.current
        if (!id) return
        const handle = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[data-sort-id]') ?? [])].find(button => button.dataset.sortId === id)
        handle?.focus({ preventScroll: true })
        sortFocus.current = null
    }, [sort, active.tasks])

    /**
     * 结束排序；取消时按抓取前的顺序恢复仍然存在的条目。
     * @param cancel 是否放弃本次排序。
     * @returns 无返回值。
     */
    function stop_sort(cancel = false): void {
        const currentSort = sortRef.current
        if (!currentSort) return
        if (cancel) set_input('content', current => {
            const entries = current[currentSort.subject]
            const tasks = [...entries.tasks].sort((first, second) => {
                const firstIndex = currentSort.order.indexOf(first.id)
                const secondIndex = currentSort.order.indexOf(second.id)
                return (firstIndex < 0 ? Infinity : firstIndex) - (secondIndex < 0 ? Infinity : secondIndex)
            })
            return { ...current, [currentSort.subject]: { ...entries, tasks } }
        })
        if (currentSort.mode === 'keyboard') sortFocus.current = currentSort.id
        sortRef.current = null
        set_sort(null)
        set_drop(null)
        set_sort_message(cancel ? '已取消排序' : '排序已更新')
    }

    /**
     * 抓取指定条目并记录原顺序，使鼠标和键盘共用排序状态。
     * @param id 要排序的条目标识。
     * @param mode 当前输入方式。
     * @returns 无返回值。
     */
    function start_sort(id: string, mode: TaskSort['mode']): void {
        const currentSort: TaskSort = { subject, id, mode, order: active.tasks.map(task => task.id) }
        sortRef.current = currentSort
        set_sort(currentSort)
        set_drop(null)
        set_sort_message('已抓取作业，使用方向键移动，空格键放下，Escape 取消')
    }

    /**
     * 将当前科目的原消息整理为编号条目，不影响其它科目。
     * @param raw 老师的纯文本消息。
     * @returns 无返回值。
     */
    function organize(raw: string): void {
        stop_sort(true)
        const tasks = parse_homework(raw).map(text => ({ id: new_id(), text }))
        set_input('content', current => ({ ...current, [subject]: { raw, tasks } }))
    }

    /**
     * 更新当前科目的可编辑条目，原始消息保留供重新整理。
     * @param change 条目列表的变更函数。
     * @returns 无返回值。
     */
    function change_tasks(change: (tasks: HomeworkTask[]) => HomeworkTask[]): void {
        stop_sort(true)
        set_input('content', current => ({ ...current, [subject]: { ...current[subject], tasks: change(current[subject].tasks) } }))
    }

    /**
     * 按稳定标识移动条目，避免编辑或换科后使用过期下标。
     * @param id 要移动的条目标识。
     * @param target 目标位置。
     * @returns 无返回值。
     */
    function move_task(id: string, target: number): void {
        set_input('content', current => {
            const entries = current[subject]
            const index = entries.tasks.findIndex(task => task.id === id)
            if (index < 0 || target < 0 || target >= entries.tasks.length || index === target) return current
            const tasks = [...entries.tasks]
            const [task] = tasks.splice(index, 1)
            tasks.splice(target, 0, task)
            return { ...current, [subject]: { ...entries, tasks } }
        })
    }

    /**
     * 用空格抓取和放下，方向键排序，Escape 恢复抓取前顺序。
     * @param event 排序手柄上的键盘事件。
     * @param id 手柄所属条目的标识。
     * @returns 无返回值。
     */
    function sort_key(event: KeyboardEvent<HTMLButtonElement>, id: string): void {
        const grabbed = sortRef.current?.id === id && sortRef.current.subject === subject && sortRef.current.mode === 'keyboard'
        if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault()
            grabbed ? stop_sort() : start_sort(id, 'keyboard')
        } else if (grabbed && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            event.preventDefault()
            const index = active.tasks.findIndex(task => task.id === id)
            const target = index + (event.key === 'ArrowUp' ? -1 : 1)
            if (target < 0 || target >= active.tasks.length) return
            move_task(id, target)
            set_sort_message(`已移至第 ${target + 1} 项，共 ${active.tasks.length} 项`)
        } else if (grabbed && event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            stop_sort(true)
        } else if (grabbed && event.key === 'Tab') stop_sort()
    }

    /**
     * 在目标条目的上下半区显示插入位置，并在放下时更新顺序。
     * @param event 目标条目上的原生拖拽事件。
     * @param id 目标条目的标识。
     * @param commit 是否已经放下条目。
     * @returns 无返回值。
     */
    function drop_task(event: DragEvent<HTMLLIElement>, id: string, commit = false): void {
        const currentSort = sortRef.current
        if (!currentSort || currentSort.mode !== 'mouse' || currentSort.subject !== subject) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        const bounds = event.currentTarget.getBoundingClientRect()
        const before = event.clientY < bounds.top + bounds.height / 2
        if (!commit) { set_drop(currentSort.id === id ? null : { id, before }); return }
        const source = active.tasks.findIndex(task => task.id === currentSort.id)
        const target = active.tasks.findIndex(task => task.id === id)
        if (currentSort.id !== id && source >= 0 && target >= 0) {
            const position = target + (before ? 0 : 1)
            move_task(currentSort.id, source < position ? position - 1 : position)
        }
        stop_sort()
    }

    /**
     * 将验证通过的完整作品交给工作台，不提前保存或发送。
     * @returns 无返回值。
     */
    function create_draft(): void {
        if (!result.scene) return
        stop_sort()
        on_create(result.scene)
        set_open(false)
    }

    return <>
        {get_homework_cards(filter, query).map(card => <TemplateCard key={card.name} name={card.name} description={card.description} tags={['可配置', '图片', '学习']} action="配置作业清单" tone="stone" on_click={() => set_open(true)}><ScenePreview scene={sample} /></TemplateCard>)}
        <Dialog open={open} onOpenChange={next => { if (!next) stop_sort(true); set_open(next) }}>
            <DialogContent className="homework-dialog" onEscapeKeyDown={event => { if (sortRef.current) { event.preventDefault(); stop_sort(true) } }}>
                <DialogHeader>
                    <div className="homework-heading">
                        <span className="homework-heading-icon"><NotebookPen size={23} strokeWidth={1.6} /></span>
                        <div><DialogTitle>作业清单</DialogTitle><DialogDescription>把老师的群消息，变成清楚的每日作业。</DialogDescription></div>
                    </div>
                </DialogHeader>
                <div className="homework-body">
                    <div className="homework-settings">
                        <section className="homework-layout-options" aria-label="排版设置">
                            <h3><SlidersHorizontal size={14} />排版设置</h3>
                            <div className="homework-fields homework-layout-grid">
                                <label className="field-label">画布尺寸<Select value={size} onValueChange={value => set_input('size', value)}><SelectTrigger aria-label="作业画布尺寸"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="800x480">800 × 480</SelectItem><SelectItem value="400x300">400 × 300</SelectItem><SelectItem value="880x528">880 × 528</SelectItem></SelectContent></Select></label>
                                <label className="field-label">字体<Select value={fontFamily} onValueChange={value => set_input('fontFamily', value as HomeworkFont)}><SelectTrigger aria-label="作业字体"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pixel-16">点阵圆体 16</SelectItem><SelectItem value="pixel-12">点阵黑体 12</SelectItem><SelectItem value="sans-serif">系统黑体</SelectItem></SelectContent></Select></label>
                                <label className="field-label">外边距 · px<Input aria-label="作业外边距" type="number" min={0} max={32} step={1} value={margin} onChange={event => set_input('margin', Number(event.target.value))} /></label>
                                <label className="field-label">{fontFamily === 'sans-serif' ? '字号上限' : '原生字号'}<Input aria-label="作业字号" type="number" min={fontFamily === 'pixel-12' ? 12 : 14} max={32} step={1} disabled={fontFamily !== 'sans-serif'} value={activeFontSize} onChange={event => set_input('fontSize', Number(event.target.value))} /></label>
                            </div>
                            <div className="homework-frame-toggle"><span>画面边框</span><Switch aria-label="作业画面边框" size="sm" checked={frame} onCheckedChange={value => set_input('frame', value)} /></div>
                            <fieldset className="homework-frame-options" disabled={!frame}>
                                <legend className="sr-only">作业边框样式</legend>
                                <RadioGroup aria-label="作业边框样式" value={frameStyle} disabled={!frame} onValueChange={value => set_input('frameStyle', value as HomeworkInput['frameStyle'])}>{frameChoices.map(choice => <label key={choice.value} htmlFor={`${sortHelp}-${choice.value}`} className="homework-frame-choice">
                                    <RadioGroupItem id={`${sortHelp}-${choice.value}`} aria-label={choice.label} value={choice.value} className="homework-frame-radio" />
                                    <span className={`homework-frame-sample is-${choice.value}`} aria-hidden="true"><i /></span>
                                    <span>{choice.label}</span>
                                </label>)}</RadioGroup>
                            </fieldset>
                        </section>
                        <div className="homework-document-fields homework-fields">
                            <label className="field-label">清单标题<Input aria-label="作业清单标题" maxLength={20} value={title} onChange={event => set_input('title', event.target.value)} /></label>
                            <div className="field-label"><label htmlFor={dateId}>作业日期</label><DatePicker id={dateId} label="作业日期" value={date} on_change={value => set_input('date', value)} /></div>
                        </div>
                        <Tabs value={subject} onValueChange={value => { stop_sort(true); set_input('subject', value as HomeworkSubject) }}>
                            <TabsList className="homework-subjects" aria-label="作业科目">{homeworkSubjects.map(name => <TabsTrigger key={name} value={name} aria-label={name}><span className="homework-subject-dot" aria-hidden="true" />{name}<span className="homework-subject-count" aria-hidden="true">{content[name].tasks.length}</span></TabsTrigger>)}</TabsList>
                            <TabsContent value={subject} className="homework-subject-content">
                                <Collapsible className="homework-source" defaultOpen>
                                    <CollapsibleTrigger asChild><Button type="button" variant="ghost" className="homework-source-trigger"><span><ClipboardPaste size={15} />老师消息</span><ChevronDown size={14} /></Button></CollapsibleTrigger>
                                    <CollapsibleContent>
                                    <label className="homework-source-label"><span className="sr-only">{subject}老师消息</span><Textarea aria-label={`${subject}老师消息`} value={active.raw} rows={5} placeholder={`在这里粘贴${subject}老师的消息…\n\n1️⃣ 朗读课文三遍\n2️⃣ 订正课堂练习，家长签字`} onChange={event => organize(event.target.value)} /></label>
                                    <div className="homework-parse-actions"><span role="status">{active.tasks.length ? `已识别 ${active.tasks.length} 项作业` : '自动识别序号与补充说明'}</span><Button size="sm" variant="ghost" disabled={!active.raw.trim()} onClick={() => organize(active.raw)}><WandSparkles />整理为作业</Button></div>
                                    </CollapsibleContent>
                                </Collapsible>
                                <div className="homework-list-heading"><span>作业条目 <small>{active.tasks.length}</small></span><Button className="homework-add" variant="ghost" size="sm" aria-label={`添加${subject}作业`} disabled={total >= 40} onClick={() => change_tasks(tasks => [...tasks, { id: new_id(), text: '' }])}><Plus />添加</Button></div>
                                <span id={sortHelp} className="sr-only">空格键抓取或放下，方向键移动，Escape 取消排序。</span>
                                <span className="sr-only" role="status" aria-live="polite">{sortMessage}</span>
                                <ol ref={listRef} className="homework-task-list" aria-label={`${subject}作业条目`}>
                                    {active.tasks.map((task, index) => <li key={task.id} className={`${sort?.id === task.id ? 'is-sorting' : ''} ${drop?.id === task.id ? drop.before ? 'drop-before' : 'drop-after' : ''}`} onDragOver={event => drop_task(event, task.id)} onDrop={event => drop_task(event, task.id, true)}>
                                        <Button type="button" className="homework-sort-handle" variant="ghost" size="icon-sm" draggable aria-label={`拖拽${subject}第 ${index + 1} 项`} aria-describedby={sortHelp} aria-pressed={sort?.id === task.id} data-sort-id={task.id} title="拖拽排序" onKeyDown={event => sort_key(event, task.id)} onDragStart={event => { start_sort(task.id, 'mouse'); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id) }} onDragEnd={() => stop_sort()}><GripVertical /></Button>
                                        <span className="homework-task-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                                        <HomeworkTaskInput label={`${subject}第 ${index + 1} 项作业`} value={task.text} on_change={text => change_tasks(tasks => tasks.map(item => item.id === task.id ? { ...item, text } : item))} />
                                        <div className="homework-task-actions">
                                            <Button type="button" variant="ghost" size="icon-sm" aria-label={`删除${subject}第 ${index + 1} 项`} title="删除" onClick={() => change_tasks(tasks => tasks.filter(item => item.id !== task.id))}><Trash2 /></Button>
                                        </div>
                                    </li>)}
                                </ol>
                                {!active.tasks.length && <div className="homework-list-empty"><span /><p>粘贴后，作业会按顺序出现在这里。</p><span /></div>}
                            </TabsContent>
                        </Tabs>
                    </div>
                    <div className="homework-preview">
                        <div className="homework-preview-caption"><div className="homework-preview-title"><span>实时预览</span><small>{width} × {height}</small></div><div className="homework-preview-mode" role="group" aria-label="作业预览模式"><button type="button" aria-pressed={!processed} onClick={() => set_processed(false)}>原稿</button><button type="button" aria-pressed={processed} onClick={() => set_processed(true)}>墨水屏</button></div></div>
                        <div className="homework-preview-stage">
                            {result.scene ? <div className="homework-paper" style={{ aspectRatio: `${width} / ${height}`, '--homework-ratio': width / height } as CSSProperties}><ScenePreview scene={result.scene} processed={processed} showWarnings /></div> : <div className={`homework-empty ${result.error ? 'has-error' : ''}`} role={result.error ? 'alert' : undefined}>{result.error ? <ClipboardList size={28} /> : <div className="homework-empty-sheet" aria-hidden="true"><div /><div /><section>{['语文', '数学'].map(name => <div key={name}><b>{name}</b><i /><i /><i /></div>)}</section></div>}<b>{result.error ? '再调整一下内容' : '从一条老师消息开始'}</b><p>{result.error || '选好科目，粘贴文字，作业就会整齐地排在这里。'}</p></div>}
                        </div>
                        <div className="homework-preview-footer"><div className="homework-subject-summary" aria-label="科目概览">{homeworkSubjects.filter(name => name !== '其它' || content[name].tasks.length).map(name => <span key={name}><i />{name}<b>{content[name].tasks.length}</b></span>)}</div><span className="homework-column-count"><ColumnIcon size={14} />{columnCount} 列排版</span></div>
                    </div>
                </div>
                <div className="homework-footer"><span className={`homework-ready ${result.error ? 'has-error' : ''}`}><i />{result.error ? '请调整内容后继续' : total ? `已整理 ${total} 项作业` : '等待粘贴作业'}</span><div><Button variant="ghost" onClick={() => { stop_sort(true); set_open(false) }}>返回模板</Button><Button disabled={!result.scene} onClick={create_draft}>放入工作台<ArrowUpRight size={14} /></Button></div></div>
            </DialogContent>
        </Dialog>
    </>
}
