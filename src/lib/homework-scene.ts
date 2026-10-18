import { create_scene, new_id, validate_dimensions, type Scene } from './studio/model'
import { defaultOptions } from './studio/processing'
import { font_family, pixel_font } from './studio/text-font'
import { layout_natural_text } from './studio/text-layout'
import type { TextMeasureContext } from './studio/text-bounds'

export const homeworkSubjects = ['语文', '数学', '其它'] as const
export type HomeworkSubject = typeof homeworkSubjects[number]
export type HomeworkFrame = 'double' | 'corners' | 'stitch' | 'notebook'
export type HomeworkFont = 'pixel-16' | 'pixel-12' | 'sans-serif'

export interface HomeworkOptions {
    title: string
    date: string
    subjects: Record<HomeworkSubject, string[]>
    width?: number
    height?: number
    fontSize?: number
    fontFamily?: HomeworkFont
    margin?: number
    frame?: boolean
    frameStyle?: HomeworkFrame
}

interface HomeworkGroup {
    subject: HomeworkSubject
    tasks: string[]
}

interface HomeworkRow {
    text: string
    top: number
    textTop: number
    numberTop: number
    height: number
}

interface HomeworkBlock {
    subject: HomeworkSubject
    top: number
    left: number
    width: number
    textLeft: number
    textWidth: number
    rows: HomeworkRow[]
}

/**
 * 优先使用渲染器的系统字体测量，无 Canvas 时保守地为每个字预留一个字号。
 * @returns 可供共用文字排版工具使用的测量上下文。
 */
function make_measure(): TextMeasureContext {
    if (typeof document !== 'undefined') {
        try {
            const context = document.createElement('canvas').getContext('2d')
            if (context && typeof context.measureText === 'function') return context
        } catch { /* 无 Canvas 的预览环境使用下方保守度量。 */ }
    }
    const context: TextMeasureContext = {
        font: '', textAlign: 'left', textBaseline: 'alphabetic',
        measureText(value: string): TextMetrics {
            const size = Number(context.font.match(/([\d.]+)px/)?.[1] ?? 20)
            const width = Array.from(value).length * size
            return {
                width, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width,
                actualBoundingBoxAscent: size * 0.9, actualBoundingBoxDescent: size * 0.25,
            } as TextMetrics
        },
    }
    return context
}

/**
 * 验证三科作业并保留语文、数学两列，仅在其它没有作业时隐藏该列。
 * @param subjects 每个科目的完整作业条目。
 * @returns 含一至四十项有效作业的两个或三个科目列。
 */
function read_groups(subjects: HomeworkOptions['subjects']): HomeworkGroup[] {
    if (!subjects || typeof subjects !== 'object') throw new Error('请填写语文、数学、其它三个科目的作业')
    const groups: HomeworkGroup[] = []
    let count = 0
    for (const subject of homeworkSubjects) {
        const tasks = subjects[subject]
        if (!Array.isArray(tasks)) throw new Error(`${subject}作业需要使用条目列表`)
        if (tasks.length > 40) throw new Error('作业清单需要 1–40 项任务')
        for (const [index, value] of tasks.entries()) {
            if (typeof value !== 'string' || !value.trim() || Array.from(value).length > 600) throw new Error(`${subject}第 ${index + 1} 项需要 1–600 个字`)
        }
        count += tasks.length
        if (subject !== '其它' || tasks.length) groups.push({ subject, tasks: tasks.map(value => value.replace(/\r\n?/g, '\n')) })
    }
    if (count < 1 || count > 40) throw new Error('作业清单需要 1–40 项任务')
    return groups
}

/**
 * 在保留全部字符和显式换行的前提下保护中文标点及可整行容纳的短英文片段。
 * @param context 已设好正文实际字体的测量上下文。
 * @param text 原始条目文字。
 * @param width 每行可用的实际像素宽度。
 * @returns 可直接保存为原生文字图层的完整换行结果。
 */
function wrap_homework(context: TextMeasureContext, text: string, width: number): string[] {
    const opening = /^[（《【“‘〈〔(\[{]$/u
    const closing = /^[，。！？：；、）》】”’〉〕…,.!?;:%％)\]}]$/u
    const line_width = (value: string) => {
        const measure = context.measureText(value)
        return Math.max(measure.width, (measure.actualBoundingBoxLeft ?? 0) + (measure.actualBoundingBoxRight ?? measure.width))
    }
    const fits = (value: string) => line_width(value) <= width
    return text.split('\n').flatMap(paragraph => {
        const chars = Array.from(paragraph)
        if (!chars.length) return ['']
        const words = [...paragraph.matchAll(/[A-Za-z0-9]+(?:[-–—./_][A-Za-z0-9]+)*/g)].map(match => {
            const start = Array.from(paragraph.slice(0, match.index)).length
            return { start, end: start + match[0].length, keep: fits(match[0]) }
        })
        const safe_break = (candidate: number, from = 0) => {
            let before = candidate - 1
            let after = candidate
            while (before >= from && !chars[before].trim()) before--
            while (after < chars.length && !chars[after].trim()) after++
            return !opening.test(chars[before] ?? '') && !closing.test(chars[after] ?? '')
        }
        const keeps_word = (candidate: number) => !words.some(word => word.keep && word.start < candidate && candidate < word.end)
        const lines: string[] = []
        let start = 0
        while (start < chars.length) {
            let end = start + 1
            while (end < chars.length && fits(chars.slice(start, end + 1).join(''))) end++
            if (end === chars.length) {
                lines.push(chars.slice(start).join(''))
                break
            }
            let split = 0
            let punctuation = 0
            for (let candidate = end; candidate > start; candidate--) {
                if (!safe_break(candidate, start)) continue
                if (!punctuation) punctuation = candidate
                if (keeps_word(candidate)) {
                    split = candidate
                    break
                }
            }
            split ||= punctuation || end
            if (width >= 160) {
                for (let candidate = split - 1; candidate > start; candidate--) {
                    if (opening.test(chars[candidate]) && safe_break(candidate, start) && keeps_word(candidate) && line_width(chars.slice(start, candidate).join('')) >= width * 2 / 3) {
                        split = candidate
                        break
                    }
                }
            }
            lines.push(chars.slice(start, split).join(''))
            start = split
        }
        const tail = lines.at(-1)!
        const tailLength = Array.from(tail.trim()).length
        if (lines.length > 1 && tailLength > 0 && tailLength <= 3) {
            const previous = Array.from(lines.at(-2)!)
            const joined = [...previous, ...Array.from(tail)]
            const offset = chars.length - joined.length
            let chosen = 0
            let score = Infinity
            for (let candidate = previous.length; candidate > 0; candidate--) {
                if (!/[，、；,;]/u.test(joined[candidate - 1]) || !safe_break(offset + candidate, offset) || !keeps_word(offset + candidate)) continue
                const last = joined.slice(candidate).join('')
                if (Array.from(last.trim()).length > 3 && fits(last)) { chosen = candidate; break }
            }
            if (!chosen) {
                for (let candidate = 1; candidate < joined.length; candidate++) {
                    const first = joined.slice(0, candidate).join('')
                    const last = joined.slice(candidate).join('')
                    if (Array.from(first.trim()).length < 4 || Array.from(last.trim()).length < 4 || !safe_break(offset + candidate, offset) || !keeps_word(offset + candidate) || !fits(first) || !fits(last)) continue
                    const balance = Math.abs(line_width(first) - line_width(last))
                    if (balance < score) { score = balance; chosen = candidate }
                }
            }
            if (chosen) lines.splice(-2, 2, joined.slice(0, chosen).join(''), joined.slice(chosen).join(''))
        }
        return lines
    })
}

/**
 * 使用与渲染器相同的字体规格测量文字，点阵字始终保持正常字重。
 * @param context 文字测量上下文。
 * @param text 完整文字与显式换行。
 * @param size 实际像素字号。
 * @param family 保存的字体标识。
 * @param weight 普通字体的字重。
 * @returns 自然文字边界。
 */
function measure(context: TextMeasureContext, text: string, size: number, family: string, weight = 400) {
    context.font = `${pixel_font(family) ? 400 : weight} ${size}px ${font_family(family)}`
    context.textAlign = 'left'
    context.textBaseline = 'alphabetic'
    return layout_natural_text(context, text, size)
}

/**
 * 为完整标题与日期安排刊头；长标题可以自然换行，日期始终保持独立。
 * @param context 与最终绘制共用的测量上下文。
 * @param title 完整标题。
 * @param date 完整日期。
 * @param family 正文选用的字体。
 * @param left 内容左边界。
 * @param right 内容右边界。
 * @param top 内容上边界。
 * @returns 刊头文字位置与科目起点。
 */
function measure_header(context: TextMeasureContext, title: string, date: string, family: HomeworkFont, left: number, right: number, top: number) {
    const pixel = family !== 'sans-serif'
    const titleSize = pixel ? 36 : 30
    const titleFont = pixel ? 'pixel-12' : family
    const metaFont = pixel ? 'pixel-12' : 'sans-serif'
    const space = right - left
    let size = titleSize
    if (space < 420) size = 24
    const titleBounds = measure(context, title, size, titleFont, 700)
    const dateBounds = measure(context, date, 12, metaFont)
    const inline = titleBounds.width + dateBounds.width + 36 <= space
    measure(context, '', size, titleFont, 700)
    const titleText = wrap_homework(context, title, Math.max(1, space - 2)).join('\n')
    const titleBox = measure(context, titleText, size, titleFont, 700)
    measure(context, '', 12, metaFont)
    const dateText = wrap_homework(context, date, Math.max(1, space - 2)).join('\n')
    const dateBox = measure(context, dateText, 12, metaFont)
    const dateTop = inline ? top + (titleBox.height - dateBox.height) / 2 : top + titleBox.height + 7
    const lineBottom = Math.max(top + titleBox.height, dateTop + dateBox.height)
    const mottoTop = lineBottom + 6
    const motto = '一件一件来，每天进步一点点。'
    const mottoBox = measure(context, motto, 12, metaFont)
    const showMotto = mottoBox.width <= space
    return { size, titleFont, metaFont, titleText, titleBox, dateText, dateBox, dateLeft: right - dateBox.width, dateTop, motto, mottoTop, showMotto, bottom: (showMotto ? mottoTop + mottoBox.height : lineBottom) + 18 }
}

/**
 * 用真实字体宽度排成等宽科目列，保留所有文字并给序号独立留位。
 * @param groups 依次排列的科目与作业。
 * @param context 文字测量上下文。
 * @param family 正文保存的字体标识。
 * @param size 实际像素字号。
 * @param left 内容左边界。
 * @param right 内容右边界。
 * @param top 科目标题起点。
 * @param gap 作业之间的空隙。
 * @returns 完整条目布局与内容底部。
 */
function measure_blocks(groups: HomeworkGroup[], context: TextMeasureContext, family: HomeworkFont, size: number, left: number, right: number, top: number, gap: number) {
    const columnGap = right - left < 480 ? 16 : 24
    const available = right - left - columnGap * (groups.length - 1)
    const headingSize = right - left < 480 ? 16 : 24
    const headingFont = family === 'sans-serif' ? 'sans-serif' : headingSize === 24 ? 'pixel-12' : 'pixel-16'
    const headingHeight = Math.max(...groups.map(group => measure(context, group.subject, headingSize, headingFont, 700).height))
    const taskTop = top + headingHeight + 22
    const numberFont = family === 'sans-serif' ? 'sans-serif' : 'pixel-silkscreen'
    const numberSize = 16
    const numberWidth = Math.max(22, ...groups.flatMap(group => group.tasks.map((unused, index) => { void unused; return measure(context, String(index + 1).padStart(2, '0'), numberSize, numberFont, 700).width })))
    let clipped = false
    const blocks = groups.map((group, column): HomeworkBlock => {
        const start = left + Math.round(column * available / groups.length) + column * columnGap
        const end = left + Math.round((column + 1) * available / groups.length) + column * columnGap
        const textLeft = start + numberWidth + 10
        const textWidth = end - textLeft
        let rowTop = taskTop
        const rows = group.tasks.map((task, index) => {
            measure(context, '', size, family)
            const text = wrap_homework(context, task, Math.max(1, textWidth - 3)).join('\n')
            const bounds = measure(context, text, size, family)
            if (bounds.width > textWidth) clipped = true
            const firstLine = measure(context, text.split('\n')[0], size, family)
            const number = measure(context, String(index + 1).padStart(2, '0'), numberSize, numberFont, 700)
            const firstHeight = Math.max(firstLine.height, number.height)
            const textOffset = (firstHeight - firstLine.height) / 2
            const row = { text, top: rowTop, textTop: rowTop + textOffset, numberTop: rowTop + (firstHeight - number.height) / 2, height: Math.max(bounds.height + textOffset, firstHeight, 20) }
            rowTop += row.height + gap
            return row
        })
        return { subject: group.subject, top, left: start, width: end - start, textLeft, textWidth, rows }
    })
    const bottom = Math.max(...blocks.map(block => {
        const last = block.rows.at(-1)
        return last ? last.top + last.height : taskTop
    }))
    return { blocks, bottom: clipped ? Infinity : bottom, headingSize, headingFont, headingHeight, numberFont, numberSize, numberWidth, gap }
}

type AddRect = (name: string, left: number, top: number, width: number, height: number, fill: string) => void

/**
 * 以两倍整数像素绘制正在读书的小兔，插画仅占用正文后的空白。
 * @param add_rect 原生矩形构造函数。
 * @param left 插画左边界。
 * @param top 插画上边界。
 * @returns 无返回值。
 */
function draw_rabbit(add_rect: AddRect, left: number, top: number): void {
    const parts: [number, number, number, number, string][] = [
        [9, 0, 5, 12, '#000000'], [21, 0, 5, 12, '#000000'],
        [10, 1, 3, 10, '#ffffff'], [22, 1, 3, 10, '#ffffff'],
        [11, 3, 1, 7, '#ff0000'], [23, 3, 1, 7, '#ff0000'],
        [7, 9, 21, 13, '#000000'], [5, 12, 25, 7, '#000000'],
        [8, 10, 19, 11, '#ffffff'], [6, 13, 23, 5, '#ffffff'],
        [11, 14, 2, 2, '#000000'], [22, 14, 2, 2, '#000000'],
        [9, 17, 3, 1, '#ff0000'], [24, 17, 3, 1, '#ff0000'],
        [17, 17, 2, 1, '#000000'], [16, 19, 4, 1, '#000000'],
        [6, 22, 25, 10, '#ff0000'], [18, 22, 1, 10, '#ffffff'],
        [9, 25, 6, 1, '#ffffff'], [22, 25, 6, 1, '#ffffff'],
        [9, 28, 4, 1, '#ffffff'], [22, 28, 4, 1, '#ffffff'],
        [4, 23, 4, 5, '#000000'], [29, 23, 4, 5, '#000000'],
        [5, 24, 2, 3, '#ffffff'], [30, 24, 2, 3, '#ffffff'],
    ]
    for (const [positionX, positionY, width, height, fill] of parts) add_rect('读书小兔', left + positionX * 2, top + positionY * 2, width * 2, height * 2, fill)
}

/**
 * 用整数实色矩形组成四种直角边框，齿边装饰数量固定受限。
 * @param add_rect 原生矩形构造函数。
 * @param style 边框样式。
 * @param left 外边距。
 * @param top 外边距。
 * @param width 边框总宽度。
 * @param height 边框总高度。
 * @returns 无返回值。
 */
function draw_frame(add_rect: AddRect, style: HomeworkFrame, left: number, top: number, width: number, height: number): void {
    const outline = (inset: number, thick: number, fill: string) => {
        add_rect('边框外线', left + inset, top + inset, width - inset * 2, height - inset * 2, fill)
        add_rect('边框留白', left + inset + thick, top + inset + thick, width - (inset + thick) * 2, height - (inset + thick) * 2, '#ffffff')
    }
    if (style === 'double') {
        outline(0, 2, '#000000')
        outline(6, 1, '#000000')
        for (const positionX of [left + 4, left + width - 9]) for (const positionY of [top + 4, top + height - 9]) add_rect('边框红角', positionX, positionY, 5, 5, '#ff0000')
    } else if (style === 'corners') {
        for (const sideX of [0, 1]) for (const sideY of [0, 1]) {
            const positionX = left + (sideX ? width - 28 : 0)
            const positionY = top + (sideY ? height - 28 : 0)
            add_rect('边框角横', positionX, positionY + (sideY ? 25 : 0), 28, 3, '#000000')
            add_rect('边框角竖', positionX + (sideX ? 25 : 0), positionY, 3, 28, '#000000')
            add_rect('边框像素点', positionX + (sideX ? 17 : 7), positionY + (sideY ? 17 : 7), 4, 4, '#ff0000')
        }
    } else if (style === 'stitch') {
        outline(0, 3, '#000000')
        const step = Math.max(24, Math.ceil((width + height) / 24))
        for (let offset = step; offset < width - 10; offset += step) {
            add_rect('边框上齿', left + offset, top, 8, 2, '#ffffff')
            add_rect('边框下齿', left + offset, top + height - 2, 8, 2, '#ffffff')
        }
        for (let offset = step; offset < height - 10; offset += step) {
            add_rect('边框左齿', left, top + offset, 2, 8, '#ffffff')
            add_rect('边框右齿', left + width - 2, top + offset, 2, 8, '#ffffff')
        }
        outline(7, 1, '#ff0000')
    } else {
        outline(0, 1, '#000000')
        for (const sideX of [0, 1]) for (const sideY of [0, 1]) {
            const positionX = left + (sideX ? width - 54 : 6)
            const positionY = top + (sideY ? height - 17 : 4)
            for (let offset = 0; offset <= 48; offset += 8) add_rect('边框方格竖', positionX + offset, positionY, 1, 13, '#ff0000')
            for (let offset = 0; offset <= 12; offset += 6) add_rect('边框方格横', positionX, positionY + offset, 49, 1, '#ff0000')
        }
    }
}

/**
 * 生成黑白红点阵手账，按实际像素排版，完整保留两列或三列作业。
 * @param options 标题、日期、作业、字体及画面边距与边框设置。
 * @returns 可继续编辑的原生作品；空间不足时明确报错，不压缩点阵字或截断内容。
 */
export function create_homework_scene(options: HomeworkOptions): Scene {
    const title = typeof options.title === 'string' ? options.title.trim() : ''
    const date = typeof options.date === 'string' ? options.date.trim() : ''
    if (!title || Array.from(title).length > 20 || /[\r\n]/.test(title)) throw new Error('标题需要 1–20 个字且不能换行')
    if (!date || Array.from(date).length > 30 || /[\r\n]/.test(date)) throw new Error('日期需要 1–30 个字且不能换行')
    const family = options.fontFamily ?? 'pixel-16'
    if (!['pixel-16', 'pixel-12', 'sans-serif'].includes(family)) throw new Error('请选择支持的作业字体')
    const margin = options.margin ?? 0
    if (!Number.isInteger(margin) || margin < 0 || margin > 32) throw new Error('外边距需要在 0–32 像素之间')
    const frame = options.frame ?? true
    const frameStyle = options.frameStyle ?? 'double'
    if (typeof frame !== 'boolean' || !['double', 'corners', 'stitch', 'notebook'].includes(frameStyle)) throw new Error('请选择支持的边框样式')
    let size = family === 'pixel-16' ? 16 : family === 'pixel-12' ? 12 : options.fontSize ?? 16
    if (family === 'sans-serif' && (!Number.isFinite(size) || size < 14 || size > 32)) throw new Error('字号上限需要在 14–32 之间')
    const width = options.width ?? 800
    const height = options.height ?? 480
    validate_dimensions(width, height)
    if (width < 200 || height < 120) throw new Error('作业清单画布至少需要 200 × 120 像素')
    const groups = read_groups(options.subjects)
    const context = make_measure()
    const inset = margin + 18
    const left = inset
    const right = width - inset
    const top = inset
    const bottom = height - inset
    const header = measure_header(context, title, date, family, left, right, top)
    let gap = 18
    let layout = measure_blocks(groups, context, family, size, left, right, header.bottom, gap)
    while (layout.bottom > bottom && (gap > 10 || family === 'sans-serif' && size > 14)) {
        if (gap > 10) gap -= 2
        else size--
        layout = measure_blocks(groups, context, family, size, left, right, header.bottom, gap)
    }
    if (layout.bottom > bottom) throw new Error(family === 'pixel-12' ? '作业内容放不下：请减小外边距、减少任务或分成多份清单' : '作业内容放不下：请减小外边距、选择点阵黑体 12px，或分成多份清单')
    const scene = create_scene(title, width, height, 'bwr')
    scene.processOptions = { ...defaultOptions, algorithm: 'none' }
    const add_rect: AddRect = (name, positionX, positionY, boxWidth, boxHeight, fill) => {
        scene.elements.push({ id: new_id(), name, type: 'rect', x: Math.round(positionX), y: Math.round(positionY), width: Math.round(boxWidth), height: Math.round(boxHeight), fill, radius: 0, visible: true, locked: false })
    }
    const add_text = (name: string, text: string, positionX: number, positionY: number, fontSize: number, face: string, fill = '#000000', weight = 400) => {
        const bounds = measure(context, text, fontSize, face, weight)
        scene.elements.push({ id: new_id(), name, type: 'text', x: Math.round(positionX), y: Math.round(positionY), width: bounds.width, height: bounds.height, text, fontFamily: face, fontSize, fontWeight: pixel_font(face) ? 400 : weight, fill, align: 'left', verticalAlign: 'top', visible: true, locked: false })
    }
    if (frame) draw_frame(add_rect, frameStyle, margin, margin, width - margin * 2, height - margin * 2)
    add_text('标题', header.titleText, left, top, header.size, header.titleFont, '#000000', 700)
    add_text('日期', header.dateText, header.dateLeft, header.dateTop, 12, header.metaFont)
    if (header.showMotto) add_text('鼓励语', header.motto, left, header.mottoTop, 12, header.metaFont)
    const headerRule = header.bottom - 8
    add_rect('刊头红线', left, headerRule, 48, 3, '#ff0000')
    add_rect('刊头细线', left + 52, headerRule + 2, right - left - 52, 1, '#000000')
    for (const block of layout.blocks) {
        const markHeight = Math.max(12, layout.headingHeight - 4)
        add_rect(`${block.subject}科目标记`, block.left, block.top + 7 + (layout.headingHeight - markHeight) / 2, 3, markHeight, '#ff0000')
        add_text(`${block.subject}科目`, block.subject, block.left + 10, block.top + 7, layout.headingSize, layout.headingFont, '#000000', 700)
        const count = `${block.rows.length} 项`
        const countBounds = measure(context, count, 12, header.metaFont)
        add_text(`${block.subject}项数`, count, block.left + block.width - countBounds.width, block.top + 7 + (layout.headingHeight - countBounds.height) / 2, 12, header.metaFont)
        for (const [index, row] of block.rows.entries()) {
            add_text(`${block.subject}序号${index + 1}`, String(index + 1).padStart(2, '0'), block.left, row.numberTop, layout.numberSize, layout.numberFont, '#ff0000', 700)
            add_text(`${block.subject}作业${index + 1}`, row.text, block.textLeft, row.textTop, size, family)
            if (index < block.rows.length - 1) add_rect(`${block.subject}条目分隔${index + 1}`, block.textLeft, row.top + row.height + Math.floor(gap / 2), block.textWidth, 1, '#000000')
        }
    }
    if (bottom - layout.bottom >= 82 && scene.elements.length + 28 <= 200) {
        draw_rabbit(add_rect, right - 68, bottom - 64)
        const footer = '认真写，开心玩。'
        const bounds = measure(context, footer, 12, header.metaFont)
        add_text('页脚', footer, right - 82 - bounds.width, bottom - 24, 12, header.metaFont)
    } else if (bottom - layout.bottom >= 40) {
        const footer = '认真写，开心玩。'
        const bounds = measure(context, footer, 12, header.metaFont)
        const footerLeft = right - bounds.width
        add_text('页脚', footer, footerLeft, bottom - bounds.height, 12, header.metaFont)
        add_rect('页脚红点', footerLeft - 12, bottom - 9, 4, 4, '#ff0000')
    }
    return scene
}
