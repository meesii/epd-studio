import type { Scene, SceneElement, Template } from './model'
import { defaultOptions } from './processing'
import { practicalTemplates } from './practical-templates'
import { configurableTemplates } from './configurable-templates'

const inkColor = '#000000'
const whiteColor = '#ffffff'
let counter = 0
const base = (name: string, type: SceneElement['type'], positionX: number, positionY: number, width: number, height: number, fill = inkColor): SceneElement => ({ id: `tpl-layer-${++counter}`, name, type, x: positionX, y: positionY, width, height, fill, visible: true, locked: false })
const text = (name: string, value: string, positionX: number, positionY: number, width: number, height: number, fontSize = 22, fill = inkColor, fontWeight = 400, align: SceneElement['align'] = 'left', fontFamily = 'sans-serif'): SceneElement => ({ ...base(name, 'text', positionX, positionY, width, height, fill), text: value, fontSize, fontWeight, align, fontFamily, verticalAlign: 'middle' })
const rect = (name: string, positionX: number, positionY: number, width: number, height: number, fill = inkColor, radius = 0): SceneElement => ({ ...base(name, 'rect', positionX, positionY, width, height, fill), radius })
const line = (name: string, positionX: number, positionY: number, width: number, height: number, fill = inkColor): SceneElement => base(name, 'line', positionX, positionY, width, height, fill)
const scene = (id: string, name: string, elements: SceneElement[]): Scene => ({ id: `template-${id}`, name, width: 800, height: 480, palette: 'bwr', background: whiteColor, elements, updatedAt: Date.now(), processOptions: { ...defaultOptions, algorithm: 'threshold' } })

const now = new Date()
const chinaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
const [year, month, day] = chinaDate.split('-').map(Number)
const dayOfWeek = new Date(year, month - 1, day).getDay()
const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const monthEn = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

const daily = scene('daily', '今日简报', [
    text('刊头', 'THE DAILY / 日 常 札 记', 48, 30, 520, 30, 16, inkColor, 600),
    text('期号', 'VOL. 01', 634, 30, 118, 30, 16, inkColor, 600, 'right'),
    line('顶部分隔线', 48, 78, 704, 2),
    text('日期', String(day).padStart(2, '0'), 48, 110, 266, 180, 168, inkColor, 700),
    text('月份与星期', `${monthEn[month - 1]} · ${weekdays[dayOfWeek]}`, 48, 305, 266, 38, 23, inkColor, 600),
    rect('年份底色', 48, 360, 86, 40),
    text('年份', String(year), 48, 360, 86, 40, 18, whiteColor, 600, 'center'),
    text('小标记', '把今天收藏。', 152, 360, 162, 40, 16),
    line('竖分隔线', 338, 113, 2, 286),
    text('主标题', '把日子，\n过成喜欢的样子。', 382, 120, 370, 132, 40, inkColor, 600),
    text('焦点标签', 'TODAY’S FOCUS', 382, 290, 370, 28, 14, inkColor, 600),
    text('今日主题', '留一点时间，给自己', 382, 329, 370, 42, 25, inkColor, 600),
    text('今日心情', '阅读 · 散步 · 好好吃饭', 382, 377, 370, 30, 17),
    line('底部分隔线', 48, 428, 704, 2),
    text('落款', 'LESS SCREEN. MORE LIFE.', 48, 444, 540, 24, 13, inkColor, 500),
    rect('落款标记', 738, 449, 14, 14),
])

const weekElements: SceneElement[] = [
    text('英文小标题', 'MAKE ROOM FOR WHAT MATTERS', 48, 30, 640, 28, 16, inkColor, 400, 'left', 'pixel-tiny5'),
    text('标题', '每周计划', 48, 76, 492, 74, 48, inkColor, 700),
    text('右上角标', 'WEEK / 01', 568, 76, 184, 74, 24, inkColor, 400, 'right', 'pixel-12'),
    line('标题分隔线', 48, 157, 704, 2),
]
const plans = ['整理一周的灵感', '专注一件重要的事', '给生活留一点空白', '读完手边的好书', '与朋友慢慢吃饭', '走进自然，放松一下']
for (let index = 0; index < 6; index++) {
    const positionX = 48 + (index % 3) * 244
    const positionY = 186 + Math.floor(index / 3) * 105
    weekElements.push(text(`星期${index + 1}`, ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][index], positionX, positionY, 216, 28, 16, inkColor, 400, 'left', 'pixel-silkscreen'))
    weekElements.push(text(`计划${index + 1}`, plans[index], positionX, positionY + 35, 216, 40, 19))
    weekElements.push(line(`格线${index + 1}`, positionX, positionY + 80, 216, 1))
}
weekElements.push(rect('周日底栏', 48, 420, 704, 36), text('周日留白', 'SUN / 好好休息，也是一件正经事。', 64, 420, 672, 36, 16, whiteColor, 400, 'left', 'pixel-16'))
const weekly = scene('weekly', '每周计划', weekElements)

const badge = scene('badge', '访客名牌', [
    text('品牌标识', 'EPD / STUDIO', 48, 34, 460, 30, 18, inkColor, 700),
    text('访客标记', 'VISITOR', 592, 34, 160, 30, 16, inkColor, 600, 'right'),
    line('顶部横线', 48, 86, 704, 2),
    text('问候', '你好，', 48, 123, 490, 90, 62, inkColor, 700),
    text('姓名', '我是林予安。', 48, 218, 490, 82, 54, inkColor, 700),
    text('身份', 'PRODUCT DESIGNER', 48, 323, 480, 36, 19, inkColor, 600),
    { ...base('个人名片二维码', 'qr', 592, 145, 160, 160), text: 'BEGIN:VCARD\nVERSION:3.0\nFN:林予安\nTITLE:Product Designer\nEND:VCARD' },
    text('二维码说明', 'NICE TO MEET YOU', 578, 323, 188, 36, 12, inkColor, 500, 'center'),
    rect('底栏', 0, 394, 800, 86),
    text('底栏文案', '设计，让日常发生。', 48, 394, 704, 86, 28, whiteColor, 600),
])

const monthCn = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
const calendarElements: SceneElement[] = [
    text('年份', `${year} / ${monthEn[month - 1]}`, 48, 30, 480, 28, 16, inkColor, 400, 'left', 'pixel-16'),
    text('月份标题', monthCn[month - 1], 48, 74, 520, 70, 48, inkColor, 400, 'left', 'pixel-16'),
    text('月份数字', String(month).padStart(2, '0'), 594, 74, 158, 70, 64, inkColor, 400, 'right', 'pixel-16'),
    line('月份分隔线', 48, 154, 704, 2),
]
const columnWidth = 100
for (let index = 0; index < 7; index++) calendarElements.push(text(`星期标题${index}`, ['一', '二', '三', '四', '五', '六', '日'][index], 50 + index * columnWidth, 173, 100, 28, 16, inkColor, 400, 'center', 'pixel-16'))
const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7
const daysInMonth = new Date(year, month, 0).getDate()
for (let date = 1; date <= daysInMonth; date++) {
    const index = date - 1 + firstWeekday
    const column = index % 7
    const row = Math.floor(index / 7)
    const positionX = 50 + column * columnWidth
    const positionY = 215 + row * 34
    if (date === day) calendarElements.push(rect('今日底色', positionX + 31, positionY, 38, 31, inkColor, 2))
    calendarElements.push(text(`日期${date}`, String(date), positionX, positionY, 100, 31, 24, date === day ? whiteColor : inkColor, 400, 'center', 'pixel-12'))
}
calendarElements.push(line('页脚分隔线', 48, 428, 704, 2), text('页脚文案', '把时间，留给值得的事。', 48, 445, 704, 26, 15, inkColor, 400, 'center'))
const calendar = scene('calendar', '极简月历', calendarElements)

const reading = scene('reading', '阅读时刻', [
    rect('书脊背景', 0, 0, 144, 480),
    text('书脊小标', 'READ\nMORE.\nLIVE\nMORE.', 24, 42, 96, 190, 27, whiteColor, 700, 'center'),
    line('书脊短线', 34, 376, 76, 2, whiteColor),
    text('书脊编号', '01', 34, 406, 76, 46, 29, whiteColor, 700, 'center'),
    text('分类', '给自己的一段安静时光', 200, 40, 550, 30, 17, inkColor, 500),
    text('主标题', '阅读，\n让生活有回声。', 200, 116, 552, 150, 46, inkColor, 600),
    rect('装饰短线', 200, 281, 68, 4),
    text('引文', '“慢慢走，欣赏啊。”', 200, 323, 552, 48, 29, inkColor, 500),
    text('引文出处', '—— 朱光潜《谈美》', 200, 380, 550, 30, 17),
    line('页脚横线', 200, 430, 552, 2),
    text('页脚标签', 'A MOMENT OF QUIET / 片刻宁静', 200, 447, 552, 24, 12, inkColor, 500),
])

const artElements: SceneElement[] = [
    text('展览期号', 'EPD GALLERY / NO. 006', 48, 30, 510, 30, 16, inkColor, 400, 'left', 'pixel-silkscreen'),
    text('右上标签', 'PIXEL ART', 584, 30, 168, 30, 16, inkColor, 400, 'right', 'pixel-silkscreen'),
    rect('画框', 48, 82, 704, 304),
    rect('画框内部', 51, 85, 698, 298, whiteColor),
]
for (let positionY = 0; positionY < 8; positionY++) {
    for (let positionX = 0; positionX < 22; positionX++) {
        let filled = (positionX - 16) ** 2 + (positionY - 1.4) ** 2 <= 2.6
        const leftRidge = 6 - Math.floor(positionX * 0.42)
        const rightRidge = 4 + Math.floor(Math.abs(positionX - 15) * 0.5)
        if (positionY >= Math.min(leftRidge, rightRidge) && positionY < 6) filled = true
        if (positionY === 6 && positionX % 3 !== 1) filled = true
        if (positionY === 7 && positionX >= 14 && positionX <= 18) filled = true
        if (filled) artElements.push(rect(`像素 ${positionX + 1}-${positionY + 1}`, 70 + positionX * 30, 106 + positionY * 32, 30, 32))
    }
}
artElements.push(text('作品标题', '山 静 日 长', 48, 406, 470, 56, 32, inkColor, 400, 'left', 'pixel-16'), text('作品说明', 'SLOW LANDSCAPE\n22 x 8 PIXELS', 522, 406, 230, 56, 16, inkColor, 400, 'right', 'pixel-tiny5'))
const gallery = scene('gallery', '像素画廊', artElements)

export const templates: Template[] = [
    { id: 'daily', name: '今日简报', category: '日常', description: '日期、心情与今日焦点，让每一天都有留白。', scene: daily },
    { id: 'weekly', name: '每周计划', category: '工作', description: '为重要的事留出时间，轻盈安排一周。', scene: weekly },
    { id: 'badge', name: '访客名牌', category: '工作', description: '打个招呼，用一张电子名片开启对话。', scene: badge },
    { id: 'calendar', name: '极简月历', category: '日常', description: '清晰的月历、醒目的今天，桌面的时间坐标。', scene: calendar },
    { id: 'reading', name: '阅读时刻', category: '日常', description: '一句好句子，留给屏幕之外的生活。', scene: reading },
    { id: 'gallery', name: '像素画廊', category: '影像', description: '逐像素雕刻的小风景，每个色块都能编辑。', scene: gallery },
    ...practicalTemplates,
    ...configurableTemplates,
]
