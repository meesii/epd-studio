import type { Scene, SceneElement } from './model'
import { qr_size } from './renderer'
import { element_box } from './selection'
import { fit_text_element, type TextMeasureContext } from './text-bounds'

export type FieldChanges = Readonly<Record<string, string>>
export type FieldWarning = { message: string; blocking: boolean }
export type WifiSecurity = 'WPA' | 'WEP' | 'nopass'
export type WifiNetwork = { name: string; password: string; security: WifiSecurity; hidden: boolean }

/**
 * 将文字及二维码的待应用内容合并进最新作品，保留锁定图层和其他属性。
 * @param scene 应用时的最新作品。
 * @param changes 以图层标识为键的修改内容。
 * @returns 有改动时返回新作品；无有效修改时保留原引用。
 */
export function apply_template_fields(scene: Scene, changes: FieldChanges): Scene {
    let changed = false
    const elements = scene.elements.map(element => {
        if (element.locked || !['text', 'qr'].includes(element.type) || !Object.hasOwn(changes, element.id)) return element
        const text = changes[element.id]
        if (typeof text !== 'string' || text === (element.text ?? '')) return element
        if (text.length > 10000) throw new Error('每个图层的内容不能超过 10000 个字符')
        changed = true
        return { ...element, text }
    })
    return changed ? { ...scene, elements } : scene
}

/**
 * 用真实字体和二维码模块尺寸检查待应用内容，区分布局提示与无法输出的错误。
 * @param element 原始文字或二维码图层。
 * @param text 待应用内容。
 * @param scene 目标画布尺寸。
 * @param context 可选的字体测量上下文，测试可注入确定性度量。
 * @returns 内容问题；没有发现问题时返回 null。
 */
export function template_field_warning(element: SceneElement, text: string, scene: Pick<Scene, 'width' | 'height'>, context?: TextMeasureContext): FieldWarning | null {
    if (text.length > 10000) return { message: '内容不能超过 10000 个字符。', blocking: true }
    try {
        if (element.type === 'qr') {
            const required = qr_size(text)
            if (Math.min(element.width, element.height) < required) return { message: `二维码至少需要 ${required} × ${required} 像素，请放大图层或缩短内容。`, blocking: true }
        }
        if (element.type === 'text') {
            const fitted = fit_text_element({ ...element, text }, context)
            const bounds = element_box(fitted)
            if (bounds.x < -0.001 || bounds.y < -0.001 || bounds.x + bounds.width > scene.width + 0.001 || bounds.y + bounds.height > scene.height + 0.001) {
                return { message: '文字超出画布，应用后请换行、减小字号或调整位置。', blocking: false }
            }
        }
        return null
    } catch (error) {
        return { message: error instanceof Error ? error.message : String(error), blocking: true }
    }
}

/**
 * 按 ZXing Wi-Fi 格式生成手机可识别的二维码内容，保留网络名与密码的原始空格。
 * @param network 网络名、密码、加密方式及隐藏网络状态。
 * @returns 对特殊字符转义后的 Wi-Fi 配置内容；参数无效时抛出错误。
 * @see https://github.com/zxing/zxing/wiki/Barcode-Contents#wi-fi-network-config-android-ios-11
 */
export function wifi_qr_text(network: WifiNetwork): string {
    if (!network.name) throw new Error('请填写网络名称。')
    if (new TextEncoder().encode(network.name).length > 32) throw new Error('网络名称不能超过 32 字节，请检查中文和特殊字符。')
    if (!['WPA', 'WEP', 'nopass'].includes(network.security)) throw new Error('不支持此加密方式。')
    if (network.security !== 'nopass' && !network.password) throw new Error('请填写网络密码。')
    if (network.security === 'WPA') {
        const length = new TextEncoder().encode(network.password).length
        if (!(length >= 8 && length <= 63) && !/^[\da-f]{64}$/i.test(network.password)) throw new Error('WPA/WPA2 密码需为 8–63 字节，或 64 位十六进制。')
    }
    const escape = (value: string) => value.replace(/[\\;,:\"]/g, character => `\\${character}`)
    const password = network.security === 'nopass' ? '' : `P:${escape(network.password)};`
    return `WIFI:T:${network.security};S:${escape(network.name)};${password}H:${network.hidden ? 'true' : 'false'};;`
}
