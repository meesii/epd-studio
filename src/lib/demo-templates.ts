import { create_scene, defaultOptions, new_id, validate_dimensions, type Scene, type SceneElement } from './studio'
import { pixel_font } from './studio/text-font'

export interface DemoStyle {
    title: string
    width?: number
    height?: number
    fontSize?: number
    fontFamily?: 'sans-serif' | 'serif' | 'monospace' | 'pixel-12' | 'pixel-16'
    color?: '#000000' | '#ff0000'
}

export interface TodoTask { text: string; completed: boolean }
export interface TodoOptions extends DemoStyle { tasks: TodoTask[] }
export interface TimetableOptions extends DemoStyle { days: number; periods: number; cells: string[][] }

export const timetableDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/**
 * 将点阵字按最终画布尺寸取原生整数倍，小字号改用原生 12px 点阵黑体。
 * @param size 基准画布中的可用字号。
 * @param family 请求使用的字体。
 * @param scale 最终画布相对基准画布的缩放比例。
 * @returns 基准坐标下的实际字号与字体。
 */
function template_font(size: number, family: string, scale: number) {
    const pixel = pixel_font(family)
    if (!pixel) return { fontSize: size, fontFamily: family }
    const multiple = Math.floor((size * scale + 1e-7) / pixel.size)
    return multiple >= 1
        ? { fontSize: multiple * pixel.size / scale, fontFamily: family }
        : { fontSize: 12 / scale, fontFamily: 'pixel-12' }
}

/**
 * 检查模板参数并准备可以独立编辑的原生图层作品。
 * @param options 通用模板样式。
 * @returns 固定设计坐标的作品及文字和形状构造函数。
 */
function make_template(options: DemoStyle) {
    const title = options.title.trim()
    if (!title || Array.from(title).length > 20) throw new Error('标题需要 1–20 个字')
    const requestedSize = options.fontSize ?? 20
    if (!Number.isFinite(requestedSize) || requestedSize < 8 || requestedSize > 32) throw new Error('字号需要在 8–32 之间')
    if (options.color && !['#000000', '#ff0000'].includes(options.color)) throw new Error('模板支持黑色或红色文字')
    const width = options.width ?? 800
    const height = options.height ?? 480
    validate_dimensions(width, height)
    if (width < 200 || height < 120) throw new Error('模板画布至少需要 200 × 120 像素')
    const scale = Math.min(width / 800, height / 480)
    const family = options.fontFamily ?? 'pixel-16'
    const fontSize = template_font(requestedSize, family, scale).fontSize
    const scene = create_scene(title, 800, 480, 'bwr')
    scene.processOptions = { ...defaultOptions, algorithm: 'threshold' }
    const color = options.color ?? '#000000'
    const add_shape = (type: 'rect' | 'line', name: string, positionX: number, positionY: number, boxWidth: number, boxHeight: number, fill = '#000000', stroke?: string): SceneElement => {
        const element: SceneElement = { id: new_id(), name, type, x: positionX, y: positionY, width: boxWidth, height: boxHeight, fill, visible: true, locked: false, ...(stroke && { stroke, strokeWidth: 1.5 }) }
        scene.elements.push(element)
        return element
    }
    const add_rect = (name: string, positionX: number, positionY: number, boxWidth: number, boxHeight: number, fill = '#000000', stroke?: string) => add_shape('rect', name, positionX, positionY, boxWidth, boxHeight, fill, stroke)
    const add_line = (name: string, positionX: number, positionY: number, boxWidth: number, boxHeight: number, fill = '#000000') => add_shape('line', name, positionX, positionY, boxWidth, boxHeight, fill)
    const add_text = (name: string, content: string, positionX: number, positionY: number, boxWidth: number, boxHeight: number, size = fontSize, fill = '#000000', weight = 400, align: SceneElement['align'] = 'left', face: string = family): SceneElement => {
        const font = template_font(size, face, scale)
        const element: SceneElement = { id: new_id(), name, type: 'text', x: positionX, y: positionY, width: boxWidth, height: boxHeight, fill, text: content, ...font, fontWeight: pixel_font(font.fontFamily) ? 400 : weight, align, verticalAlign: 'middle', visible: true, locked: false }
        scene.elements.push(element)
        return element
    }
    /**
     * 按等比缩放与居中留白生成目标尺寸，避免非等比例画布拉伸字号。
     * @returns 使用独立图层对象的目标作品。
     */
    const finish = (): Scene => {
        const offsetX = (width - 800 * scale) / 2
        const offsetY = (height - 480 * scale) / 2
        return {
            ...scene, width, height,
            elements: scene.elements.map(element => {
                const positionX = offsetX + element.x * scale
                const positionY = offsetY + element.y * scale
                const shape = element.type !== 'text'
                return {
                    ...element,
                    x: shape ? Math.round(positionX) : positionX,
                    y: shape ? Math.round(positionY) : positionY,
                    width: shape ? Math.max(1, Math.round(element.width * scale)) : element.width * scale,
                    height: shape ? Math.max(1, Math.round(element.height * scale)) : element.height * scale,
                    ...(element.fontSize && { fontSize: element.fontSize * scale }),
                    ...(element.strokeWidth && { strokeWidth: Math.max(1, Math.round(element.strokeWidth * scale)) }),
                }
            }),
        }
    }
    add_text('刊头', 'A LITTLE ORDER. A BETTER DAY.', 48, 28, 610, 24, 16, color, 400, 'left', 'pixel-tiny5')
    add_text('标题', title, 48, 64, 552, 52, Math.min(38, Math.floor(548 / Array.from(title).length)), '#000000', 700)
    add_line('标题下横线', 48, 127, 704, 2, color)
    add_line('页脚横线', 48, 440, 704, 1)
    return { scene, color, fontSize, add_rect, add_line, add_text, finish }
}

/**
 * 为无 Canvas 环境采用保守的每字一字号宽度换行，完整保留输入内容。
 * @param value 原始文字。
 * @param width 可用文字宽度。
 * @param fontSize 字号。
 * @returns 显式换行后的全部文字行。
 */
function wrap_lines(value: string, width: number, fontSize: number): string[] {
    const capacity = Math.max(1, Math.floor(width / fontSize))
    return value.split('\n').flatMap(paragraph => {
        const chars = Array.from(paragraph)
        if (!chars.length) return ['']
        return Array.from({ length: Math.ceil(chars.length / capacity) }, (unused, index) => { void unused; return chars.slice(index * capacity, (index + 1) * capacity).join('') })
    })
}

/**
 * 生成保留可编辑文字、复选框及完成计数的待办图片模板。
 * @param options 标题、任务和通用排版参数；最多八项，超出空间会明确报错。
 * @returns 黑白红作品，不修改输入任务或连接设备。
 */
export function create_todo_scene(options: TodoOptions): Scene {
    if (!Array.isArray(options.tasks) || options.tasks.length < 1 || options.tasks.length > 8) throw new Error('待办清单需要 1–8 项任务')
    const template = make_template(options)
    const completed = options.tasks.filter(task => task.completed).length
    const rowHeight = 282 / options.tasks.length
    template.add_text('完成计数', `${completed} / ${options.tasks.length}`, 614, 64, 138, 52, 24, template.color, 600, 'right', 'pixel-12')
    for (const [index, task] of options.tasks.entries()) {
        if (!task.text.trim() || Array.from(task.text).length > 80) throw new Error(`第 ${index + 1} 项需要 1–80 个字`)
        const lines = wrap_lines(task.text.trim(), 648, template.fontSize)
        const textHeight = lines.length * template.fontSize * 1.4
        const checkSize = Math.min(24, template.fontSize + 2)
        const contentHeight = Math.max(textHeight, checkSize)
        if (contentHeight + 10 > rowHeight) throw new Error(`第 ${index + 1} 项放不下：请缩短文字、减小字号或减少任务数`)
        const rowTop = 143 + index * rowHeight
        const positionY = rowTop + (rowHeight - 10 - contentHeight) / 2
        const checkY = positionY + (contentHeight - checkSize) / 2
        template.add_rect(`任务${index + 1}复选框`, 49, checkY, checkSize, checkSize, task.completed ? template.color : '#ffffff', template.color)
        if (task.completed) template.add_text(`任务${index + 1}勾选`, '✓', 49, checkY, checkSize, checkSize, checkSize - 5, '#ffffff', 700, 'center', 'sans-serif')
        template.add_text(`任务${index + 1}`, lines.join('\n'), 94, positionY, 648, contentHeight, template.fontSize, template.color, task.completed ? 600 : 400)
        if (index < options.tasks.length - 1) template.add_line(`任务${index + 1}分隔线`, 94, rowTop + rowHeight - 5, 648, 1)
    }
    template.add_text('页脚', '一次一件事，把今天过好。', 48, 448, 620, 30, 12, '#000000', 400, 'left', 'pixel-12')
    template.add_text('完成比例', `${Math.round(completed / options.tasks.length * 100)}%`, 662, 448, 90, 30, 12, template.color, 600, 'right', 'pixel-12')
    return template.finish()
}

/**
 * 计算密集课表能容纳的字号，界面应明确说明字号为上限。
 * @param options 课表节数及希望使用的字号。
 * @returns 保证一行课程可完整显示的实际字号。
 */
export function timetable_font_size(options: Pick<TimetableOptions, 'periods' | 'fontSize' | 'fontFamily' | 'width' | 'height'>): number {
    const size = Math.min(options.fontSize ?? 18, Math.floor((250 / options.periods - 5) / 1.4))
    const scale = Math.min((options.width ?? 800) / 800, (options.height ?? 480) / 480)
    return template_font(size, options.fontFamily ?? 'pixel-16', scale).fontSize
}

/**
 * 生成由共享表格线与独立文字构成的课表，密集行列仍不超过图层上限。
 * @param options 一至七天、一至十二节、与当前行列完全匹配的课程内容及样式。
 * @returns 黑白红可编辑作品；无法放下的单元格会报错而不截断内容。
 */
export function create_timetable_scene(options: TimetableOptions): Scene {
    if (!Number.isInteger(options.days) || options.days < 1 || options.days > 7 || !Number.isInteger(options.periods) || options.periods < 1 || options.periods > 12) throw new Error('课表支持 1–7 天、1–12 节课')
    if (options.cells.length !== options.periods || options.cells.some(row => row.length !== options.days)) throw new Error('课程内容的行列数与当前课表不一致')
    const template = make_template({ ...options, fontSize: options.fontSize ?? 18 })
    const fontSize = timetable_font_size(options)
    const startY = 145
    const headerHeight = 34
    const rowHeight = 250 / options.periods
    if (fontSize * 1.4 > rowHeight - 5) throw new Error('当前画布放不下这些节次：请减少节数或选择更大的画布，保证点阵字清晰')
    const cellWidth = 640 / options.days
    const actualSize = fontSize
    template.add_text('课表规格', `${options.days} 天 / ${options.periods} 节`, 600, 64, 152, 52, 12, template.color, 600, 'right', 'pixel-12')
    template.add_rect('星期栏底色', 48, startY, 704, headerHeight, template.color)
    template.add_text('节次标题', '节次', 48, startY, 64, headerHeight, 12, '#ffffff', 600, 'center', 'pixel-12')
    for (let column = 0; column < options.days; column++) {
        const positionX = 112 + column * cellWidth
        template.add_text(`星期${column + 1}`, timetableDays[column], positionX, startY, cellWidth, headerHeight, Math.min(16, actualSize + 2), '#ffffff', 600, 'center')
        template.add_line(`竖线${column + 1}`, positionX, startY + headerHeight, 1, 250)
    }
    template.add_line('表格左边', 48, startY + headerHeight, 1, 250)
    template.add_line('表格右边', 751, startY + headerHeight, 1, 250)
    for (let row = 0; row < options.periods; row++) {
        const positionY = startY + headerHeight + row * rowHeight
        template.add_text(`第${row + 1}节`, String(row + 1).padStart(2, '0'), 48, positionY, 64, rowHeight, Math.min(14, actualSize), template.color, 600, 'center', 'pixel-12')
        template.add_line(`横线${row + 1}`, 48, positionY + rowHeight - 1, 704, 1)
        for (let column = 0; column < options.days; column++) {
            const value = options.cells[row][column].trim()
            if (!value) continue
            if (Array.from(value).length > 40) throw new Error(`${timetableDays[column]}第 ${row + 1} 节最多 40 个字`)
            const lines = wrap_lines(value, cellWidth - 12, actualSize)
            if (lines.length * actualSize * 1.4 > rowHeight - 5) throw new Error(`${timetableDays[column]}第 ${row + 1} 节放不下：请缩短课程、减小字号或减少节数`)
            template.add_text(`${timetableDays[column]}·第${row + 1}节`, lines.join('\n'), 118 + column * cellWidth, positionY, cellWidth - 12, rowHeight, actualSize, template.color, 400, 'center')
        }
    }
    template.add_text('页脚', '好好学习，也记得好好生活。', 48, 448, 704, 30, 12, '#000000', 400, 'left', 'pixel-12')
    return template.finish()
}
