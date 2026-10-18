import type { SceneElement, Template } from './model'
import { black, white, red, manualNote, layers, make_template } from './template-layout'

const meal = layers('weekly-meals')
const meals = [
    { day: '周一', breakfast: '鸡蛋 · 牛奶', lunch: '番茄牛肉面', dinner: '清蒸鱼 · 时蔬' },
    { day: '周二', breakfast: '燕麦 · 香蕉', lunch: '香菇鸡肉饭', dinner: '番茄炒蛋 · 米饭' },
    { day: '周三', breakfast: '豆浆 · 包子', lunch: '时蔬炒面', dinner: '冬瓜排骨汤' },
    { day: '周四', breakfast: '酸奶 · 面包', lunch: '土豆炖牛肉', dinner: '虾仁豆腐 · 米饭' },
    { day: '周五', breakfast: '小米粥 · 鸡蛋', lunch: '鸡肉沙拉', dinner: '菌菇汤 · 饺子' },
    { day: '周六', breakfast: '三明治 · 牛奶', lunch: '家常炒饭', dinner: '全家一起下厨' },
    { day: '周日', breakfast: '馄饨 · 水果', lunch: '青椒肉丝饭', dinner: '清理冰箱食材' },
]
const mealElements: SceneElement[] = [
    meal.text('主标题', '一周餐单', 32, 24, 500, 44, 32, black, 400, 'left', 'pixel-16'),
    meal.text('周期', '本周', 568, 24, 200, 44, 24, red, 400, 'right', 'pixel-12'),
    meal.text('餐单说明', '提前想好吃什么，把时间留给好好吃饭。', 32, 76, 736, 24, 16, black, 400, 'left', 'pixel-16'),
    meal.rect('表头底色', 32, 112, 736, 38),
    meal.text('星期表头', '星期', 36, 112, 68, 38, 16, white, 400, 'center', 'pixel-16'),
    ...['早餐', '午餐', '晚餐'].map((title, index) => meal.text(`${title}表头`, title, 120 + index * 220, 112, 196, 38, 24, white, 400, 'center', 'pixel-12')),
    ...meals.flatMap((item, index) => {
        const rowY = 150 + index * 38
        return [
            meal.text(`星期${index + 1}`, item.day, 36, rowY, 68, 38, 16, black, 400, 'center', 'pixel-16'),
            ...[item.breakfast, item.lunch, item.dinner].map((value, column) => meal.text(`${item.day}${['早餐', '午餐', '晚餐'][column]}`, value, 120 + column * 220, rowY, 196, 38, 20, black, 400, 'center')),
            meal.line(`餐单行线${index + 1}`, 32, rowY + 38, 736, 1),
        ]
    }),
    ...[32, 108, 328, 548, 768].map((position, index) => meal.line(`餐单竖线${index + 1}`, position, 150, 1, 266)),
    meal.text('采购备注', '采购备注：先查冰箱库存，再补齐本周食材。', 32, 434, 736, 24, 16, black, 400, 'left', 'pixel-16'),
]
const weeklyMeals = make_template({
    id: 'weekly-meals', name: '一周餐单', category: '日常',
    description: '按星期配置早午晚餐和采购备注，冰箱旁的一周安排。',
    note: `${manualNote} 可在配置面板填写每天三餐；餐单只记录你的安排，不自动推荐菜谱或生成采购单。`,
    sources: [{ title: 'Weekly Meal Planner：逐日配置早午晚餐', url: 'https://trmnl.com/recipes/30089', platform: 'TRMNL 社区' }],
    fields: [
        { name: '主标题', label: '标题', group: '基本信息' },
        { name: '周期', label: '周次或日期范围', group: '基本信息' },
        { name: '餐单说明', label: '说明', group: '基本信息' },
        { name: '星期表头', group: '表头' },
        ...['早餐', '午餐', '晚餐'].map(title => ({ name: `${title}表头`, label: title, group: '表头' })),
        ...meals.flatMap((item, index) => [
            { name: `星期${index + 1}`, label: '星期', group: item.day },
            ...['早餐', '午餐', '晚餐'].map(title => ({ name: `${item.day}${title}`, label: title, group: item.day })),
        ]),
        { name: '采购备注', label: '采购备注', group: '备注' },
    ],
}, mealElements)

const matrix = layers('priority-matrix')
const quadrants = [
    { title: '立即做', label: '重要且紧急', tasks: '提交本周总结\n确认明天会议资料', fill: red },
    { title: '安排做', label: '重要不紧急', tasks: '预留每周学习时间\n整理家庭重要资料', fill: black },
    { title: '委派做', label: '紧急不重要', tasks: '请同事代取资料\n协调本周值日安排', fill: black },
    { title: '删减掉', label: '不重要不紧急', tasks: '关闭无关消息提醒\n减少漫无目的刷屏', fill: black },
]
const matrixElements: SceneElement[] = [
    matrix.text('主标题', '四象限待办', 32, 24, 500, 44, 32, black, 400, 'left', 'pixel-16'),
    matrix.text('计划周期', '本周重点', 568, 24, 200, 44, 24, red, 400, 'right', 'pixel-12'),
    matrix.text('计划说明', '先分清重要与紧急，再决定把时间花在哪里。', 32, 76, 736, 24, 16, black, 400, 'left', 'pixel-16'),
    ...quadrants.flatMap((item, index) => {
        const boxX = 32 + index % 2 * 376
        const boxY = 116 + Math.floor(index / 2) * 160
        return [
            matrix.rect(`象限${index + 1}边框`, boxX, boxY, 360, 148),
            matrix.rect(`象限${index + 1}内底`, boxX + 1, boxY + 1, 358, 146, white),
            matrix.rect(`象限${index + 1}标题底色`, boxX, boxY, 360, 40, item.fill),
            matrix.text(`象限${index + 1}标题`, item.title, boxX + 16, boxY, 120, 40, 24, white, 400, 'left', 'pixel-12'),
            matrix.text(`象限${index + 1}分类`, item.label, boxX + 144, boxY, 200, 40, 16, white, 400, 'right', 'pixel-16'),
            matrix.text(`象限${index + 1}任务`, item.tasks, boxX + 16, boxY + 52, 328, 80, 24, black, 400, 'left', 'pixel-12', 'top'),
        ]
    }),
    matrix.text('复盘提醒', '复盘提醒：完成后手动更新任务，把重要事项提前安排。', 32, 440, 736, 24, 16, black, 400, 'left', 'pixel-16'),
]
const priorityMatrix = make_template({
    id: 'priority-matrix', name: '四象限待办', category: '工作',
    description: '按重要与紧急程度配置四组任务，让下一步更清楚。',
    note: `${manualNote} 每个象限建议填写两行重点任务；不连接 Todoist，也不会自动判断优先级。`,
    sources: [{ title: 'Eisenhower Matrix：重要与紧急四象限', url: 'https://www.todoist.com/templates/eisenhower-matrix', platform: 'Todoist 官方' }],
    fields: [
        { name: '主标题', label: '标题', group: '基本信息' },
        { name: '计划周期', label: '计划周期', group: '基本信息' },
        { name: '计划说明', label: '说明', group: '基本信息' },
        ...quadrants.flatMap((item, index) => [
            { name: `象限${index + 1}标题`, label: '行动名称', group: item.title },
            { name: `象限${index + 1}分类`, label: '分类', group: item.title },
            { name: `象限${index + 1}任务`, label: '任务（每行一项）', group: item.title },
        ]),
        { name: '复盘提醒', label: '复盘提醒', group: '备注' },
    ],
}, matrixElements)

const chores = layers('home-routines')
const routines = [
    { task: '厨房台面清洁', owner: '轮值 A', repeat: '每天', next: '晚饭后' },
    { task: '客厅地面清洁', owner: '轮值 B', repeat: '每两天', next: '周二晚间' },
    { task: '衣物清洗晾晒', owner: '轮值 A', repeat: '周一 / 周四', next: '周四晚间' },
    { task: '更换床品', owner: '一起完成', repeat: '每周', next: '周日午后' },
    { task: '检查日用品', owner: '轮值 B', repeat: '每周', next: '周日采购前' },
]
const routineColumns = [
    { title: '家务事项', x: 32, width: 280 },
    { title: '负责人', x: 312, width: 120 },
    { title: '频率', x: 432, width: 140 },
    { title: '下次安排', x: 572, width: 196 },
]
const routineElements: SceneElement[] = [
    chores.text('主标题', '家务轮值表', 32, 24, 500, 44, 32, black, 400, 'left', 'pixel-16'),
    chores.text('轮值周期', '本周', 568, 24, 200, 44, 24, red, 400, 'right', 'pixel-12'),
    chores.text('分工说明', '分工写清楚，家务不遗漏。', 32, 76, 736, 24, 16, black, 400, 'left', 'pixel-16'),
    chores.rect('表头底色', 32, 112, 736, 40),
    ...routineColumns.map(column => chores.text(`${column.title}表头`, column.title, column.x + 8, 112, column.width - 16, 40, 16, white, 400, 'center', 'pixel-16')),
    ...routines.flatMap((item, index) => {
        const rowY = 152 + index * 50
        return [
            ...[item.task, item.owner, item.repeat, item.next].map((value, column) => chores.text(`家务${index + 1}${routineColumns[column].title}`, value, routineColumns[column].x + 12, rowY, routineColumns[column].width - 24, 50, column === 0 ? 24 : 16, black, 400, 'center', column === 0 ? 'pixel-12' : 'pixel-16')),
            chores.line(`家务行线${index + 1}`, 32, rowY + 50, 736, 1),
        ]
    }),
    ...[32, 312, 432, 572, 768].map((position, index) => chores.line(`家务竖线${index + 1}`, position, 152, 1, 250)),
    chores.text('换班备注', '换班备注：有事请提前换班，完成后相互告知。', 32, 428, 736, 32, 16, black, 400, 'left', 'pixel-16'),
]
const homeRoutines = make_template({
    id: 'home-routines', name: '周期家务', category: '日常',
    description: '配置家务、负责人、频率和下次安排，适合家庭长期轮值。',
    note: `${manualNote} 频率和下次安排为可编辑文字；不会自动轮换负责人、递推日期或推送提醒。`,
    sources: [{ title: 'Recurring Items：手动配置周期任务与提醒', url: 'https://trmnl.com/recipes/260208', platform: 'TRMNL 社区' }],
    fields: [
        { name: '主标题', label: '标题', group: '基本信息' },
        { name: '轮值周期', label: '轮值周期', group: '基本信息' },
        { name: '分工说明', label: '说明', group: '基本信息' },
        ...routineColumns.map(column => ({ name: `${column.title}表头`, label: column.title, group: '表头' })),
        ...routines.flatMap((item, index) => routineColumns.map(column => ({ name: `家务${index + 1}${column.title}`, label: column.title, group: `家务 ${index + 1} · ${item.task}` }))),
        { name: '换班备注', label: '换班备注', group: '备注' },
    ],
}, routineElements)

const shortcut = layers('shortcut-reference')
const shortcutGroups = [
    { title: '日常编辑', items: [{ action: '复制', keys: 'Ctrl + C' }, { action: '粘贴', keys: 'Ctrl + V' }, { action: '撤销', keys: 'Ctrl + Z' }, { action: '全选', keys: 'Ctrl + A' }] },
    { title: '查找与窗口', items: [{ action: '查找', keys: 'Ctrl + F' }, { action: '保存', keys: 'Ctrl + S' }, { action: '切换窗口', keys: 'Alt + Tab' }, { action: '显示桌面', keys: 'Win + D' }] },
]
const shortcutElements: SceneElement[] = [
    shortcut.text('主标题', '常用快捷键', 32, 24, 500, 44, 32, black, 400, 'left', 'pixel-16'),
    shortcut.text('适用环境', 'Windows / 常用', 548, 24, 220, 44, 16, red, 400, 'right', 'pixel-16'),
    shortcut.text('使用说明', '把经常查找的操作，放在抬眼就能看到的地方。', 32, 76, 736, 24, 16, black, 400, 'left', 'pixel-16'),
    ...shortcutGroups.flatMap((group, groupIndex) => {
        const columnX = 32 + groupIndex * 376
        return [
            shortcut.rect(`快捷键组${groupIndex + 1}标题底色`, columnX, 120, 360, 44),
            shortcut.text(`快捷键组${groupIndex + 1}标题`, group.title, columnX + 16, 120, 328, 44, 24, white, 400, 'left', 'pixel-12'),
            ...group.items.flatMap((item, index) => {
                const rowY = 176 + index * 54
                return [
                    shortcut.text(`快捷键${groupIndex * 4 + index + 1}操作`, item.action, columnX + 12, rowY, 144, 44, 24, black, 400, 'left', 'pixel-12'),
                    shortcut.text(`快捷键${groupIndex * 4 + index + 1}按键`, item.keys, columnX + 164, rowY, 184, 44, 16, black, 400, 'right', 'pixel-16'),
                    shortcut.line(`快捷键${groupIndex * 4 + index + 1}分隔线`, columnX, rowY + 48, 360, 1),
                ]
            }),
        ]
    }),
    shortcut.rect('提示底色', 32, 420, 736, 40),
    shortcut.text('快捷键备注', '提示：快捷键依应用和系统而异，可按自己的习惯修改。', 48, 420, 704, 40, 16, white, 400, 'left', 'pixel-16'),
]
const shortcutReference = make_template({
    id: 'shortcut-reference', name: '快捷键速查', category: '工作',
    description: '分组配置常用操作和快捷键，也可替换为命令或速查笔记。',
    note: `${manualNote} 默认内容适用于常见 Windows 操作；请按所用软件修改，模板只展示文字，不会执行命令。`,
    sources: [{ title: 'Custom Cheatsheet：可配置命令、快捷键与速查笔记', url: 'https://trmnl.com/recipes/custom-cheatsheet-197356', platform: 'TRMNL 社区' }],
    fields: [
        { name: '主标题', label: '标题', group: '基本信息' },
        { name: '适用环境', label: '系统或软件', group: '基本信息' },
        { name: '使用说明', label: '说明', group: '基本信息' },
        ...shortcutGroups.flatMap((group, groupIndex) => [
            { name: `快捷键组${groupIndex + 1}标题`, label: '分组标题', group: group.title },
            ...group.items.flatMap((item, index) => [
                { name: `快捷键${groupIndex * 4 + index + 1}操作`, label: `${item.action}：操作名称`, group: group.title },
                { name: `快捷键${groupIndex * 4 + index + 1}按键`, label: `${item.action}：按键`, group: group.title },
            ]),
        ]),
        { name: '快捷键备注', label: '备注', group: '备注' },
    ],
}, shortcutElements)

export const configurableTemplates: Template[] = [weeklyMeals, priorityMatrix, homeRoutines, shortcutReference]
