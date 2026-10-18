import type { DemoStyle, TodoTask } from './demo-templates'
import { homeworkSubjects, type HomeworkFont, type HomeworkFrame, type HomeworkSubject } from './homework-scene'

export interface HomeworkTask { id: string; text: string }
export interface SubjectContent { raw: string; tasks: HomeworkTask[] }
export type HomeworkContent = Record<HomeworkSubject, SubjectContent>
export interface HomeworkInput {
    subject: HomeworkSubject
    content: HomeworkContent
    title: string
    date: string
    size: string
    fontSize: number
    fontFamily: HomeworkFont
    margin: number
    frame: boolean
    frameStyle: HomeworkFrame
}
export interface DemoInput {
    todoTitle: string
    tableTitle: string
    todoText: string
    tasks: TodoTask[]
    cells: string[][]
    days: number
    periods: number
    fontSize: number
    fontFamily: DemoStyle['fontFamily']
    color: DemoStyle['color']
    size: string
}

function object(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown, max: number): value is string {
    return typeof value === 'string' && value.length <= max
}

function number(value: unknown, min: number, max: number): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function choice<T extends string>(value: unknown, choices: readonly T[]): value is T {
    return typeof value === 'string' && choices.includes(value as T)
}

/**
 * 校验作业表单结构并仅复制可编辑字段，不恢复渲染缓存或临时排序状态。
 * @param value 浏览器保存的未知 JSON 内容。
 * @returns 可安全编辑的输入副本，格式或范围无效时返回 null。
 */
export function read_homework_input(value: unknown): HomeworkInput | null {
    if (!object(value) || !object(value.content) || !choice(value.subject, homeworkSubjects)
        || !text(value.title, 20) || !text(value.date, 10) || !/^(?:\d{4}-\d{2}-\d{2})?$/.test(value.date)
        || !choice(value.size, ['800x480', '400x300', '880x528']) || !number(value.fontSize, 0, 32)
        || !choice(value.fontFamily, ['pixel-16', 'pixel-12', 'sans-serif']) || !number(value.margin, 0, 32)
        || typeof value.frame !== 'boolean' || !choice(value.frameStyle, ['double', 'corners', 'stitch', 'notebook'])) return null
    const content = {} as HomeworkContent
    for (const subject of homeworkSubjects) {
        const entry = value.content[subject]
        if (!object(entry) || !text(entry.raw, 60000) || !Array.isArray(entry.tasks) || entry.tasks.length > 500) return null
        const tasks: HomeworkTask[] = []
        for (const task of entry.tasks) {
            if (!object(task) || !text(task.id, 128) || !task.id || !text(task.text, 60000)) return null
            tasks.push({ id: task.id, text: task.text })
        }
        if (new Set(tasks.map(task => task.id)).size !== tasks.length) return null
        content[subject] = { raw: entry.raw, tasks }
    }
    return { subject: value.subject, content, title: value.title, date: value.date, size: value.size, fontSize: value.fontSize, fontFamily: value.fontFamily, margin: value.margin, frame: value.frame, frameStyle: value.frameStyle }
}

/**
 * 保留待办完成状态和完整课程矩阵，包括当前隐藏的课程输入。
 * @param value 浏览器保存的未知 JSON 内容。
 * @returns 安全的待办与课表输入副本，结构无效时返回 null。
 */
export function read_demo_input(value: unknown): DemoInput | null {
    if (!object(value) || !text(value.todoTitle, 20) || !text(value.tableTitle, 20) || !text(value.todoText, 60000)
        || !Array.isArray(value.tasks) || value.tasks.length > 500 || !Array.isArray(value.cells) || value.cells.length !== 12
        || !number(value.days, 1, 7) || !number(value.periods, 1, 12) || !number(value.fontSize, 0, 32)
        || !choice(value.fontFamily, ['sans-serif', 'serif', 'monospace', 'pixel-12', 'pixel-16']) || !choice(value.color, ['#000000', '#ff0000'])
        || !choice(value.size, ['800x480', '400x300', '880x528'])) return null
    const tasks: TodoTask[] = []
    for (const task of value.tasks) {
        if (!object(task) || !text(task.text, 60000) || typeof task.completed !== 'boolean') return null
        tasks.push({ text: task.text, completed: task.completed })
    }
    const cells: string[][] = []
    for (const row of value.cells) {
        if (!Array.isArray(row) || row.length !== 7 || !row.every(cell => text(cell, 40))) return null
        cells.push([...row])
    }
    return { todoTitle: value.todoTitle, tableTitle: value.tableTitle, todoText: value.todoText, tasks, cells, days: value.days, periods: value.periods, fontSize: value.fontSize, fontFamily: value.fontFamily, color: value.color, size: value.size }
}
