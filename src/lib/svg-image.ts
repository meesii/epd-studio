const svgNamespace = 'http://www.w3.org/2000/svg'

/**
 * 将 SVG 的绝对长度换算为 CSS 像素；百分比交给 viewBox 确定比例。
 * @param value SVG 的宽度或高度属性。
 * @returns 有效的正数像素长度，没有绝对长度时返回 null。
 */
function svg_length(value: string | null): number | null {
    if (!value) return null
    const match = value.trim().match(/^([+]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(px|pt|pc|in|cm|mm|q)?$/i)
    if (!match) return null
    const units: Record<string, number> = { px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6 }
    const size = Number(match[1]) * (units[match[2]?.toLowerCase() ?? 'px'])
    return Number.isFinite(size) && size > 0 ? size : null
}

/**
 * 检查 SVG 内的图片与样式引用，只允许当前文件的片段和内嵌位图。
 * @param value 去除引号前的引用地址。
 * @returns 引用是否无需加载外部资源。
 */
function local_reference(value: string): boolean {
    const reference = value.trim().replace(/^(['"])([\s\S]*)\1$/, '$2')
    return /^#[^\s]*$/.test(reference) || /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z\d+/=\s]+$/i.test(reference)
}

/**
 * 校验静态 SVG，并在独立文档内确定最多 2000 像素的光栅化尺寸。
 * 不把 SVG 插入页面；阻止脚本、动画和依赖网络的资源进入图片解码流程。
 * @param source 用户文件的完整 SVG 文本。
 * @returns 可交给图片解码器的 SVG 文本及目标像素尺寸。
 */
export function prepare_svg(source: string): { source: string; width: number; height: number } {
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('SVG 不支持外部文档声明，请导出为独立的静态 SVG')
    const document = new DOMParser().parseFromString(source, 'image/svg+xml')
    const root = document.documentElement
    if (!root || root.localName !== 'svg' || root.namespaceURI !== svgNamespace || document.getElementsByTagName('parsererror').length) throw new Error('SVG 文件格式无效')
    const blocked = new Set(['script', 'foreignobject', 'animate', 'animatemotion', 'animatetransform', 'set', 'discard', 'handler'])
    for (const element of [root, ...root.querySelectorAll('*')]) {
        if (blocked.has(element.localName.toLowerCase())) throw new Error('请导入不含脚本、动画或 HTML 内容的静态 SVG')
        const styles = element.localName.toLowerCase() === 'style' ? [element.textContent ?? ''] : []
        for (const attribute of element.attributes) {
            if (/^on/i.test(attribute.localName) || attribute.name === 'xml:base') throw new Error('SVG 包含不支持的动态内容')
            if (attribute.localName === 'href' && !local_reference(attribute.value)) throw new Error('SVG 包含外部资源，请先将资源嵌入文件')
            styles.push(attribute.value)
        }
        for (const value of styles) {
            if (/@import|@font-face|\\/i.test(value)) throw new Error('SVG 包含外部或无法识别的样式，请导出为独立 SVG')
            for (const match of value.matchAll(/url\(\s*([^)]*)\)/gi)) {
                if (!local_reference(match[1])) throw new Error('SVG 包含外部资源，请先将资源嵌入文件')
            }
        }
    }
    const boxValues = root.getAttribute('viewBox')?.trim().split(/[\s,]+/)
    const viewBox = boxValues?.every(value => /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) ? boxValues.map(Number) : undefined
    const validBox = viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0
    let width = svg_length(root.getAttribute('width'))
    let height = svg_length(root.getAttribute('height'))
    if (validBox) {
        if (width && !height) height = width * viewBox[3] / viewBox[2]
        else if (height && !width) width = height * viewBox[2] / viewBox[3]
        else if (!width && !height) { width = viewBox[2]; height = viewBox[3] }
    }
    if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) throw new Error('SVG 需要有效的宽高或 viewBox')
    if (root.hasAttribute('viewBox') && !validBox) throw new Error('SVG 的 viewBox 尺寸无效')
    if (!validBox) root.setAttribute('viewBox', `0 0 ${width} ${height}`)
    const longest = Math.max(width, height)
    width = Math.max(1, Math.round(width / longest * 2000))
    height = Math.max(1, Math.round(height / longest * 2000))
    root.setAttribute('width', String(width))
    root.setAttribute('height', String(height))
    return { source: new XMLSerializer().serializeToString(root), width, height }
}

/**
 * 在图片上下文中解码静态 SVG，输出兼容现有作品存储的透明 PNG。
 * @param file 用户选择的本地 SVG 文件。
 * @returns PNG 数据地址和像素尺寸。
 */
export async function read_svg_image(file: File): Promise<{ src: string; width: number; height: number }> {
    const prepared = prepare_svg(await file.text())
    const url = URL.createObjectURL(new Blob([prepared.source], { type: 'image/svg+xml' }))
    const image = new Image()
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
        await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve()
            image.onerror = () => reject(new Error('SVG 无法解码，请重新导出为静态 SVG'))
            timeout = setTimeout(() => reject(new Error('SVG 解码超时，请简化图片后重试')), 15000)
            image.src = url
        })
        const canvas = document.createElement('canvas')
        canvas.width = prepared.width
        canvas.height = prepared.height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('浏览器无法创建画布')
        context.imageSmoothingQuality = 'high'
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        return { src: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
    } finally {
        clearTimeout(timeout)
        image.onload = null
        image.onerror = null
        image.src = ''
        URL.revokeObjectURL(url)
    }
}
