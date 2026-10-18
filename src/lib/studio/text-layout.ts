export interface TextLine {
    text: string
    x: number
    baseline: number
    ascent: number
    descent: number
    visible: boolean
    clipped: boolean
}

export interface TextLayout {
    lines: TextLine[]
    lineHeight: number
    requiredHeight: number
    clipped: boolean
}

type MeasureContext = Pick<CanvasRenderingContext2D, 'measureText'>

export interface NaturalTextLayout extends TextLayout {
    width: number
    height: number
}

function metric(value: number | undefined, fallback: number): number {
    return Number.isFinite(value) ? Math.max(0, value!) : fallback
}

function ink_width(measure: TextMetrics): number {
    return Math.max(measure.width, (measure.actualBoundingBoxLeft ?? 0) + (measure.actualBoundingBoxRight ?? measure.width))
}

/**
 * 测量自然文字边界，仅在显式换行处分行，不受旧文本框宽高限制。
 * @param context 已设置字体且左对齐的测量上下文。
 * @param text 完整文字，保留空行及首尾空格。
 * @param fontSize 文字字号。
 * @param align 不同长度文本行在自然边界内的对齐方式。
 * @returns 与实际字形、固定 1.4 倍行距一致的边界和绘制基线。
 */
export function layout_natural_text(context: MeasureContext, text: string, fontSize: number, align: 'left' | 'center' | 'right' = 'left'): NaturalTextLayout {
    if (!Number.isFinite(fontSize) || fontSize <= 0) throw new Error('文字字号必须为正数')
    const content = text.replace(/\r\n?/g, '\n').split('\n')
    const reference = context.measureText('国MgÅpq')
    const referenceAscent = metric(reference.actualBoundingBoxAscent, fontSize * 0.85) || fontSize * 0.85
    const referenceDescent = metric(reference.actualBoundingBoxDescent, fontSize * 0.22)
    const padding = Math.max(1, fontSize * 0.035)
    const measures = content.map(line => {
        const measure = context.measureText(line)
        const blank = !line.trim()
        const minX = Math.min(0, -(measure.actualBoundingBoxLeft ?? 0))
        const maxX = Math.max(metric(measure.width, 0), measure.actualBoundingBoxRight ?? measure.width)
        return {
            minX, width: Math.max(0, maxX - minX),
            ascent: blank ? referenceAscent : metric(measure.actualBoundingBoxAscent, referenceAscent),
            descent: blank ? referenceDescent : metric(measure.actualBoundingBoxDescent, referenceDescent),
        }
    })
    const maxAscent = Math.max(...measures.map(measure => measure.ascent))
    const maxDescent = Math.max(...measures.map(measure => measure.descent))
    const lineHeight = Math.max(fontSize * 1.4, maxAscent + maxDescent + padding * 2)
    const width = Math.ceil(Math.max(fontSize * 0.35, ...measures.map(measure => measure.width)) + padding * 2)
    const firstBaseline = padding + measures[0].ascent
    const height = Math.ceil(firstBaseline + (content.length - 1) * lineHeight + measures.at(-1)!.descent + padding)
    const factor = align === 'right' ? 1 : align === 'center' ? 0.5 : 0
    const lines = content.map((line, index): TextLine => ({
        text: line,
        x: padding + (width - padding * 2 - measures[index].width) * factor - measures[index].minX,
        baseline: firstBaseline + index * lineHeight,
        ascent: measures[index].ascent,
        descent: measures[index].descent,
        visible: true,
        clipped: false,
    }))
    return { width, height, lines, lineHeight, requiredHeight: height, clipped: false }
}

/**
 * 按实际字体宽度逐字换行，同时保留文本中的显式换行。
 * @param context 已设置字体和左对齐的测量上下文。
 * @param text 原始文字。
 * @param width 每行最大宽度。
 * @returns 换行后的文本行。
 */
export function wrap_text(context: MeasureContext, text: string, width: number): string[] {
    const lines: string[] = []
    for (const paragraph of text.split('\n')) {
        let current = ''
        for (const char of Array.from(paragraph)) {
            if (current && ink_width(context.measureText(current + char)) > width) {
                lines.push(current)
                current = char
            } else current += char
        }
        lines.push(current)
    }
    return lines
}

/**
 * 使用真实字形上升部、下降部安排字母基线，避免 top 基线和字体回退导致上裁。
 * @param context 已设置字体、alphabetic 基线和左对齐的测量上下文。
 * @param text 文本内容。
 * @param width 文本框宽度。
 * @param height 文本框高度。
 * @param fontSize 字号。
 * @param align 文本的水平对齐方式。
 * @returns 每行的基线、所需高度和是否超出文本框。
 */
export function layout_text(context: MeasureContext, text: string, width: number, height: number, fontSize: number, align: 'left' | 'center' | 'right' = 'left'): TextLayout {
    const content = wrap_text(context, text, width)
    const measures = content.map(line => context.measureText(line))
    const reference = context.measureText('国MgÅpq')
    const fallbackAscent = metric(reference.actualBoundingBoxAscent, fontSize * 0.85) || fontSize * 0.85
    const fallbackDescent = metric(reference.actualBoundingBoxDescent, fontSize * 0.22)
    const ascents = measures.map(measure => metric(measure.actualBoundingBoxAscent, fallbackAscent))
    const descents = measures.map(measure => metric(measure.actualBoundingBoxDescent, fallbackDescent))
    const maxAscent = Math.max(fallbackAscent, ...ascents)
    const maxDescent = Math.max(fallbackDescent, ...descents)
    const firstAscent = ascents[0] || fallbackAscent
    const lastDescent = descents[descents.length - 1]
    const leading = fontSize * 1.4
    const inkHeight = maxAscent + maxDescent
    const padding = Math.max(0, Math.min(
        Math.max(1, fontSize * 0.035),
        (height - firstAscent - lastDescent - (content.length - 1) * leading) / 2,
        (height - firstAscent - lastDescent - (content.length - 1) * inkHeight) / (content.length * 2),
    ))
    const lineHeight = Math.max(fontSize * 1.4, maxAscent + maxDescent + padding * 2)
    const firstBaseline = padding + firstAscent
    const lines = content.map((line, index): TextLine => {
        const measure = measures[index]
        const baseline = firstBaseline + index * lineHeight
        const desiredX = align === 'center' ? (width - measure.width) / 2 : align === 'right' ? width - measure.width : 0
        const minX = measure.actualBoundingBoxLeft ?? 0
        const maxX = width - (measure.actualBoundingBoxRight ?? measure.width)
        const textX = minX <= maxX ? Math.max(minX, Math.min(maxX, desiredX)) : desiredX
        const inkTop = baseline - ascents[index]
        const inkBottom = baseline + descents[index]
        const clipped = line.trim().length > 0 && (inkTop < -1e-7 || inkBottom > height + 1e-7 || textX < minX - 1e-7 || textX > maxX + 1e-7)
        return {
            text: line,
            x: textX,
            baseline,
            ascent: ascents[index],
            descent: descents[index],
            visible: inkBottom >= 0 && inkTop < height,
            clipped,
        }
    })
    const requiredHeight = Math.max(...lines.map(line => line.baseline + line.descent)) + padding
    return { lines, lineHeight, requiredHeight, clipped: lines.some(line => line.clipped) }
}
