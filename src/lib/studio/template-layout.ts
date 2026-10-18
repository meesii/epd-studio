import type { SceneElement, Template } from './model'
import { defaultOptions } from './processing'

export const black = '#000000'
export const white = '#ffffff'
export const red = '#ff0000'
export const manualNote = '静态模板，配置后手动发送；内容不会自动联网更新。'

/**
 * 为模板生成独立图层，以明确的文本框中心和边缘作为对齐锚点。
 * @param templateId 模板的唯一标识。
 * @returns 文字、矩形、分隔线和带白色静区的二维码工厂。
 */
export function layers(templateId: string) {
    const base = (name: string, type: SceneElement['type'], x: number, y: number, width: number, height: number, fill = black): SceneElement => ({
        id: `${templateId}-${name}`, name, type, x, y, width, height, fill, visible: true, locked: false,
    })
    const text = (name: string, value: string, x: number, y: number, width: number, height: number, fontSize = 22, fill = black, fontWeight = 400, align: SceneElement['align'] = 'left', fontFamily = 'sans-serif', verticalAlign: SceneElement['verticalAlign'] = 'middle'): SceneElement => ({
        ...base(name, 'text', x, y, width, height, fill), text: value, fontSize, fontWeight, fontFamily, align, verticalAlign,
    })
    const rect = (name: string, x: number, y: number, width: number, height: number, fill = black): SceneElement => base(name, 'rect', x, y, width, height, fill)
    const line = (name: string, x: number, y: number, width: number, height = 2, fill = black): SceneElement => base(name, 'line', x, y, width, height, fill)
    const qr = (name: string, value: string, x: number, y: number, size = 160): SceneElement[] => [
        rect(`${name}白色静区`, x - 24, y - 24, size + 48, size + 48, white),
        { ...base(name, 'qr', x, y, size, size), text: value },
    ]
    return { text, rect, line, qr }
}

/**
 * 将配置字段、真实场景来源与原生图层组装成可编辑模板。
 * @param info 模板名称、字段与来源。
 * @param elements 独立且可编辑的图层。
 * @returns 800 × 480 三色模板。
 */
export function make_template(info: Omit<Template, 'scene'>, elements: SceneElement[]): Template {
    return {
        ...info,
        scene: {
            id: `template-${info.id}`, name: info.name, width: 800, height: 480, palette: 'bwr', background: white,
            updatedAt: 0, elements, processOptions: { ...defaultOptions, algorithm: 'threshold' },
        },
    }
}
