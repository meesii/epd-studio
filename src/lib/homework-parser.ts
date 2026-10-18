const numberText = '零〇一二三四五六七八九十两'
const symbolNumbers = '①-⑳⑴-⒇❶-❿➀-➉➊-➓⓵-⓾㉑-㉟㊱-㊿'
const strongPattern = new RegExp(`^(?:[0-9]\\uFE0F?\\u20E3|[🔟${symbolNumbers}])`, 'u')
const markerPattern = new RegExp(`[0-9]\\uFE0F?\\u20E3\\uFE0F?|🔟|[${symbolNumbers}]|[（(]\\s*(?:\\d{1,2}|[${numberText}]{1,3})\\s*[)）]|(?:\\d{1,2}|[${numberText}]{1,3})[、.．。)）]`, 'gu')
const numberValues: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

type Marker = { start: number; end: number; number: number }

/**
 * 读取序号值，供内联普通序号的递增检查使用。
 * @param token 包含括号、标点或表情的序号。
 * @returns 对应的整数；未知序号返回零。
 */
function read_number(token: string): number {
    const digits = token.match(/\d+/)?.[0]
    if (digits) return Number(digits)
    if (token === '🔟') return 10
    const code = token.codePointAt(0) ?? 0
    for (const [start, end, first] of [[0x2460, 0x2473, 1], [0x2474, 0x2487, 1], [0x2776, 0x277f, 1], [0x2780, 0x2789, 1], [0x278a, 0x2793, 1], [0x24f5, 0x24fe, 1], [0x3251, 0x325f, 21], [0x32b1, 0x32bf, 36]] as const) {
        if (code >= start && code <= end) return code - start + first
    }
    const chinese = token.replace(new RegExp(`[^${numberText}]`, 'gu'), '')
    const parts = chinese.split('十')
    if (parts.length === 2) return (numberValues[parts[0]!] ?? 1) * 10 + (numberValues[parts[1]!] ?? 0)
    return numberValues[chinese] ?? 0
}

function is_heading(value: string): boolean {
    const text = value.replace(/^[【\[「『\s]+|[】\]」』：:\s]+$/gu, '')
    return /^(?:(?:今日|今天|本周|周末|假期)的?)?(?:(?:语文|数学|英语|其它|其他)(?:作业|学习任务|学习建议)|学习建议|学习任务|作业)(?:清单|安排)?$/u.test(text)
}

/**
 * 找出可信的条目边界，普通内联序号必须在明显边界处连续递增。
 * @param line 已去除首尾空白的一行文字。
 * @returns 保留原始位置的序号列表。
 */
function find_markers(line: string): Marker[] {
    const markers: Marker[] = []
    const matches = [...line.matchAll(markerPattern)]
    for (const [index, match] of matches.entries()) {
        const start = match.index
        const end = start + match[0].length
        const rest = line.slice(end)
        if (/[.．。]$/u.test(match[0]) && /^\d/u.test(rest)) continue
        if (/、$/u.test(match[0]) && /^\d{1,2}\s*[、，,]/u.test(rest)) continue
        const strong = strongPattern.test(match[0])
        const before = matches[index - 1]
        const after = matches[index + 1]
        const adjacent = before && /^[\s、，,]*$/u.test(line.slice(before.index + before[0].length, start)) || after && /^[\s、，,]*$/u.test(line.slice(end, after.index))
        if (strong && adjacent || /(?:按(?:照)?|第|序号|编号)\s*$/u.test(line.slice(0, start))) continue
        const number = read_number(match[0])
        const previous = markers.at(-1)
        const startsLine = start === 0 || is_heading(line.slice(0, start).trim())
        const clearBreak = /[\s；;。！？!?]/u.test(line[start - 1] ?? '')
        const follows = previous && number === previous.number + 1
        if (!startsLine && !(strong && (clearBreak || follows)) && !(follows && clearBreak)) continue
        markers.push({ start, end, number })
    }
    return markers
}

/**
 * 将微信群作业文字整理为无序号的条目，编号任务的后续说明合并到同一项。
 * @param value 粘贴的纯文本；图片占位行和常见标题会被忽略。
 * @returns 保留页码、遍数、标点等要求的作业条目，可按数组顺序重新编号。
 */
export function parse_homework(value: string): string[] {
    const items: string[] = []
    let numbered = false
    for (const source of value.replace(/\r\n?|\u2028|\u2029/gu, '\n').split('\n')) {
        const line = source.replace(/[\u200b\ufeff]/gu, '').replace(/[\t\u00a0\u3000 ]+/gu, ' ').trim()
        if (!line || is_heading(line) || /^(?:(?:image|\[图片\]|【图片】)\s*)+$/iu.test(line)) continue
        const markers = find_markers(line)
        const prefix = line.slice(0, markers[0]?.start ?? line.length).trim()
        if (prefix && !is_heading(prefix)) {
            if (numbered && items.length) items[items.length - 1] = `${items.at(-1)} ${prefix}`.trim()
            else items.push(prefix)
        }
        for (const [index, marker] of markers.entries()) {
            items.push(line.slice(marker.end, markers[index + 1]?.start ?? line.length).trim())
            numbered = true
        }
    }
    return items.filter(Boolean)
}
