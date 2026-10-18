import type { Template } from './model'
import { layers, make_template, black, white, red, manualNote } from './template-layout'

const weather = layers('weather-travel')
const weatherTravel = make_template({
    id: 'weather-travel', name: '出行天气', category: '日常',
    description: '城市、气温、降雨和出行提醒，出门前看一眼。',
    fields: ['城市', '气温', '天气状况', '高低温', '示例日期', '降雨概率', '风力', '出行提醒', '数据标记'].map(name => ({ name })),
    note: `${manualNote} 请按实际预报修改城市、日期、气温及提醒。`,
    sources: [{ title: '7.5寸电子墨水屏桌面台历，万年历，天气站', url: 'https://www.bilibili.com/video/BV1Rk4y1u74R/', platform: '哔哩哔哩' }],
}, [
    weather.text('城市', '杭州 · 出行天气', 48, 30, 500, 48, 32, black, 700),
    weather.text('数据标记', '示例天气', 600, 30, 152, 48, 16, red, 400, 'right', 'pixel-16'),
    weather.line('标题分隔线', 48, 94, 704),
    weather.text('气温', '22°', 48, 124, 280, 122, 96, black, 400, 'left', 'pixel-16'),
    weather.text('天气状况', '多云', 48, 262, 250, 50, 32, black, 400, 'left', 'pixel-16'),
    weather.text('高低温', '18° / 25°', 48, 330, 250, 34, 24, black, 400, 'left', 'pixel-12'),
    weather.text('示例日期', '10月17日  周六', 48, 387, 250, 30, 16, black, 400, 'left', 'pixel-16'),
    weather.line('天气竖分隔线', 334, 132, 2, 272),
    weather.text('降雨标签', '降雨概率', 380, 130, 168, 30, 16, black, 400, 'left', 'pixel-16'),
    weather.text('降雨概率', '20%', 380, 172, 168, 52, 40, black, 400, 'left', 'pixel-tiny5'),
    weather.text('风力标签', '风向 / 风力', 588, 130, 164, 30, 16, black, 400, 'left', 'pixel-16'),
    weather.text('风力', '东北风 2级', 588, 172, 164, 52, 24, black, 400, 'left', 'pixel-12'),
    weather.line('指标分隔线', 380, 250, 372),
    weather.rect('出行提醒标记', 380, 284, 6, 110, red),
    weather.text('提醒标题', '出门清单', 406, 278, 330, 36, 24, red, 700),
    weather.text('出行提醒', '带一把折叠伞\n早晚添件外套', 406, 330, 330, 72, 24),
    weather.line('底部分隔线', 48, 438, 704),
    weather.text('手动更新提示', '静态天气卡 · 按预报手动更新后发送', 48, 450, 704, 22, 15),
])

const agenda = layers('daily-agenda')
const agendaItems = [
    { time: '09:30', title: '项目晨会', detail: '会议室 A · 对齐今天的重点' },
    { time: '14:00', title: '方案评审', detail: '带上原型 · 预留讨论时间' },
    { time: '17:30', title: '整理与复盘', detail: '更新待办 · 为明天留好起点' },
]
const dailyAgenda = make_template({
    id: 'daily-agenda', name: '今日日程', category: '工作',
    description: '会议时间、地点与今日重点，适合办公桌边常驻。',
    fields: [
        ...['主标题', '示例日期', '今日重点', '数据标记'].map(name => ({ name, group: '基本信息' })),
        ...Array.from(agendaItems.keys()).flatMap(index => ['时间', '事项', '地点备注'].map(label => ({ name: `日程${index + 1}${label}`, label, group: `日程 ${index + 1}` }))),
    ],
    note: `${manualNote} 本模板不连接钉钉、飞书或 Outlook。`,
    sources: [{ title: '同步钉钉、飞书、Outlook日程的墨水屏日历设备', url: 'https://www.bilibili.com/video/BV14o4y1w7Pq/', platform: '哔哩哔哩' }],
}, [
    agenda.text('主标题', '今日日程', 48, 30, 430, 56, 40, black, 700),
    agenda.text('示例日期', '10月17日 · 周六', 510, 30, 242, 56, 24, black, 400, 'right', 'pixel-12'),
    agenda.text('数据标记', '示例安排', 600, 77, 152, 24, 16, red, 700, 'right'),
    agenda.line('标题分隔线', 48, 114, 704),
    ...agendaItems.flatMap((item, index) => {
        const y = 142 + index * 88
        return [
            agenda.text(`日程${index + 1}时间`, item.time, 48, y, 124, 38, 24, index === 0 ? red : black, 400, 'left', 'pixel-12'),
            agenda.text(`日程${index + 1}事项`, item.title, 200, y, 552, 38, 24, black, 400, 'left', 'pixel-12'),
            agenda.text(`日程${index + 1}地点备注`, item.detail, 200, y + 40, 552, 26, 16, black, 400, 'left', 'pixel-16'),
            agenda.line(`日程${index + 1}分隔线`, 48, y + 76, 704, 1),
        ]
    }),
    agenda.rect('今日重点底色', 48, 419, 704, 40),
    agenda.text('今日重点', '今日重点  /  把评审结论落成下一步行动', 64, 419, 672, 40, 24, white, 400, 'left', 'pixel-12'),
])

const goal = layers('countdown')
const countdown = make_template({
    id: 'countdown', name: '目标倒数日', category: '学习',
    description: '目标日期、剩余天数和本周行动，让重要日子看得见。',
    fields: ['主标题', '目标名称', '剩余天数', '目标日期', '近期行动', '示例基准日', '数据标记'].map(name => ({ name })),
    note: `${manualNote} 基准日 2026.10.17、目标日期 2026.11.16 与剩余 30 天须一起修改，数字不会自动递减。`,
    sources: [{ title: 'jcalendar 墨水屏日历：倒计日与事件提醒', url: 'https://github.com/JADE-Jerry/jcalendar', platform: 'GitHub' }],
}, [
    goal.text('主标题', '向目标，再近一点', 48, 30, 590, 48, 32, black, 700),
    goal.text('数据标记', '示例', 652, 30, 100, 48, 16, red, 400, 'right', 'pixel-16'),
    goal.line('标题分隔线', 48, 96, 704),
    goal.text('目标名称', '距离 读完这本书', 48, 124, 500, 42, 28, black, 600),
    goal.text('剩余天数', '30', 48, 176, 240, 174, 144, red, 400, 'right', 'pixel-tiny5', 'bottom'),
    goal.text('天数单位', '天', 304, 176, 78, 174, 32, black, 400, 'left', 'pixel-16', 'bottom'),
    goal.line('目标竖分隔线', 414, 186, 2, 204),
    goal.text('目标日期标签', '目标日期', 454, 190, 298, 28, 18),
    goal.text('目标日期', '2026.11.16', 454, 232, 298, 42, 24, black, 400, 'left', 'pixel-12'),
    goal.text('近期行动标签', '本周行动', 454, 300, 298, 28, 18),
    goal.text('近期行动', '每天阅读 20 页', 454, 344, 298, 36, 24, black, 600),
    goal.text('示例基准日', '示例基准：2026.10.17', 48, 378, 340, 28, 18),
    goal.line('底部分隔线', 48, 432, 704),
    goal.text('手动更新提示', '静态倒数牌 · 修改目标日期时，请一起更新天数', 48, 448, 704, 24, 16),
])

const focusLayers = layers('focus')
const focus = make_template({
    id: 'focus', name: '专注勿扰牌', category: '学习',
    description: '专注任务、时段和联系办法，摆在桌边减少打扰。',
    fields: ['勿扰状态', '专注时长', '当前任务', '联系办法'].map(name => ({ name })),
    note: `${manualNote} 25:00 为示例时长，模板不提供自动倒计时或番茄钟提醒。`,
    sources: [{ title: '墨派【Mopad】4.2墨水屏番茄时钟', url: 'https://www.bilibili.com/video/BV1m14y1n7mK', platform: '哔哩哔哩' }],
}, [
    focusLayers.rect('勿扰状态底色', 48, 32, 704, 74, red),
    focusLayers.text('勿扰状态', '专注中 · 请勿打扰', 64, 32, 672, 74, 32, white, 400, 'center', 'pixel-16'),
    focusLayers.text('时长标签', '本轮专注时长', 48, 138, 704, 30, 20, black, 500, 'center'),
    focusLayers.text('专注时长', '25:00', 48, 182, 704, 118, 96, black, 400, 'center', 'pixel-tiny5'),
    focusLayers.text('当前任务', '当前任务：完成阅读笔记', 48, 328, 704, 40, 24, black, 400, 'center', 'pixel-12'),
    focusLayers.line('联系分隔线', 48, 392, 704),
    focusLayers.text('联系办法', '急事请留言 · 休息时统一回复', 48, 410, 704, 30, 22, black, 500, 'center'),
    focusLayers.text('手动更新提示', '静态专注牌 · 时长与状态需手动编辑', 48, 450, 704, 22, 15, black, 400, 'center'),
])

const badge = layers('meeting-badge')
const meetingBadge = make_template({
    id: 'meeting-badge', name: '中文会议席卡', category: '工作',
    description: '大字姓名、职务、会议主题和资料二维码，一席一牌。',
    fields: ['会议主题', '姓名', '职务', '单位', '会议资料二维码', '二维码替换提示', '席卡说明'].map(name => ({ name })),
    note: `${manualNote} 姓名与单位均为示例；请替换为自己的资料链接。`,
    sources: [{ title: '告别纸质桌牌！电子墨水屏桌牌', url: 'https://www.bilibili.com/video/BV1NiQxBLEdU/', platform: '哔哩哔哩' }],
}, [
    badge.rect('会议标题标记', 48, 35, 6, 36, red),
    badge.text('会议主题', '产品共创交流会', 72, 28, 680, 50, 30, black, 700),
    badge.line('标题分隔线', 48, 98, 704),
    badge.text('姓名', '林予安', 48, 148, 484, 112, 88, black, 700),
    badge.text('职务', '产品负责人', 48, 286, 480, 48, 32, black, 600),
    badge.text('单位', '示例科技 · 产品设计部', 48, 354, 480, 34, 23),
    badge.line('二维码竖分隔线', 542, 158, 2, 236),
    ...badge.qr('会议资料二维码', 'https://example.com/meeting', 592, 204),
    badge.text('二维码替换提示', '替换为会议资料二维码', 568, 400, 208, 28, 18, black, 400, 'center'),
    badge.line('底部分隔线', 48, 442, 704),
    badge.text('席卡说明', '示例席卡 · 欢迎交流', 48, 452, 704, 22, 15),
])

const room = layers('meeting-room')
const meetingRoom = make_template({
    id: 'meeting-room', name: '会议室门牌', category: '工作',
    description: '当前状态、会议安排与下一场预约，门口信息一目了然。',
    fields: ['会议室名称', '会议室容量', '当前状态', '空闲时段', '下一场时间', '下一场主题', '下一场部门', '预约入口二维码', '二维码替换提示', '示例状态提示'].map(name => ({ name })),
    note: `${manualNote} 空闲状态与预约示例须手动核对；二维码替换为自己的预约入口。`,
    sources: [{ title: 'MRS会议室智能信息门牌', url: 'https://meeting.ink/', platform: 'Meeting.ink' }],
}, [
    room.text('会议室名称', '知行会议室', 48, 28, 480, 54, 38, black, 700),
    room.text('会议室容量', '3F · 8人', 566, 28, 186, 54, 16, black, 400, 'right', 'pixel-16'),
    room.line('标题分隔线', 48, 102, 704),
    room.rect('当前状态底色', 48, 134, 236, 218),
    room.text('当前状态标签', '当前状态', 66, 159, 200, 30, 20, white, 400, 'center'),
    room.text('当前状态', '空闲', 64, 213, 204, 70, 48, white, 400, 'center', 'pixel-16'),
    room.text('空闲时段', '可用至 14:00', 66, 305, 200, 28, 20, white, 500, 'center'),
    room.text('下一场标签', '下一场预约', 324, 140, 236, 30, 20, red, 700),
    room.text('下一场时间', '14:00–15:00', 324, 190, 236, 38, 24, black, 400, 'left', 'pixel-12'),
    room.text('下一场主题', '产品方案评审', 324, 250, 236, 36, 24, black, 600),
    room.text('下一场部门', '产品设计部', 324, 304, 236, 30, 20),
    ...room.qr('预约入口二维码', 'https://example.com/book', 608, 212, 144),
    room.text('二维码替换提示', '替换为预约二维码', 584, 392, 192, 28, 17, black, 400, 'center'),
    room.line('底部分隔线', 48, 438, 704),
    room.text('示例状态提示', '示例状态与预约 · 请核对实际安排后手动更新', 48, 450, 704, 22, 15),
])

const price = layers('price-tag')
const priceTag = make_template({
    id: 'price-tag', name: '生鲜价签', category: '门店',
    description: '品名、产地、规格、单价与促销期，适合门店小批量更新。',
    fields: ['促销标题', '商品名称', '商品产地', '商品规格', '商品单价', '价格单位', '商品详情二维码', '二维码替换提示', '促销期与示例提示'].map(name => ({ name })),
    note: `${manualNote} 商品、价格、产地与促销期均为示例，发布前按实际商品核对。`,
    sources: [{ title: '汉朔 Stellar 电子价签：商品与价格信息展示', url: 'https://www.hanshow.com/zh-cn/company', platform: '汉朔官网' }],
}, [
    price.rect('促销标题底色', 48, 28, 704, 58, red),
    price.text('促销标题', '今日鲜选 · 限时好价', 64, 28, 672, 58, 24, white, 400, 'left', 'pixel-12'),
    price.text('商品名称', '红富士苹果', 48, 113, 480, 62, 44, black, 700),
    price.text('商品产地', '产地：山东烟台', 48, 194, 480, 32, 23),
    price.text('商品规格', '规格：散装 · 约80mm', 48, 238, 480, 30, 22),
    price.text('价格符号', '¥', 48, 280, 52, 112, 48, red, 400, 'left', 'pixel-16', 'bottom'),
    price.text('商品单价', '5.98', 112, 280, 388, 112, 96, red, 400, 'left', 'pixel-tiny5', 'bottom'),
    price.text('价格单位', '元 / 500g', 48, 400, 480, 28, 24, black, 400, 'left', 'pixel-12'),
    ...price.qr('商品详情二维码', 'https://example.com/product', 592, 214),
    price.text('二维码替换提示', '替换为商品详情二维码', 568, 412, 208, 26, 17, black, 400, 'center'),
    price.line('底部分隔线', 48, 446, 704),
    price.text('促销期与示例提示', '示例价格 · 活动期：10.17–10.23 · 以门店公示为准', 48, 456, 704, 20, 14),
])

const up = layers('bilibili-up')
const bilibiliUp = make_template({
    id: 'bilibili-up', name: 'UP主桌面牌', category: '工作',
    description: '频道介绍、粉丝里程碑和主页入口，适合创作者桌面。',
    fields: ['频道类型', '频道名称', '频道简介', '粉丝数', '频道主页二维码', '二维码替换提示', '统计日期与更新提示', '数据标记'].map(name => ({ name })),
    note: `${manualNote} 粉丝数为示例数据，不调用 B 站接口；请替换频道名、统计日期和主页二维码。`,
    sources: [
        { title: 'bilibili粉丝数量展示器app', url: 'https://powersee.github.io/2021/02/bilibili-fans/', platform: 'Powersee' },
        { title: '改装B站10w粉丝奖牌', url: 'https://www.bilibili.com/video/BV1S7411i7FL/', platform: '哔哩哔哩' },
    ],
}, [
    up.text('频道类型', 'B站 / UP主桌面牌', 48, 30, 520, 34, 23, black, 700),
    up.text('数据标记', '示例数据', 600, 30, 152, 34, 16, red, 400, 'right', 'pixel-16'),
    up.line('标题分隔线', 48, 91, 704),
    up.text('频道名称', '墨水屏手作', 48, 120, 492, 60, 42, black, 700),
    up.text('频道简介', '记录折腾，也分享收获', 48, 196, 492, 34, 24),
    up.text('粉丝数标签', '粉丝里程碑', 48, 270, 480, 28, 18),
    up.text('粉丝数', '10,000', 48, 312, 484, 84, 72, red, 400, 'left', 'pixel-tiny5'),
    ...up.qr('频道主页二维码', 'https://example.com/your-space', 592, 204),
    up.text('二维码替换提示', '替换为你的主页二维码', 568, 400, 208, 28, 18, black, 400, 'center'),
    up.line('底部分隔线', 48, 440, 704),
    up.text('统计日期与更新提示', '示例统计：2026.10.17 · 手动更新后发送', 48, 452, 704, 22, 15),
])

export const practicalTemplates: Template[] = [weatherTravel, dailyAgenda, countdown, focus, meetingBadge, meetingRoom, priceTag, bilibiliUp]
