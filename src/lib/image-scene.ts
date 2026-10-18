import { create_scene, defaultOptions, new_id, validate_dimensions, type Palette, type ProcessMode, type Scene, type SceneElement } from './studio'

export interface ImageSource {
    src: string
    width: number
    height: number
    name: string
    processMode?: ProcessMode
}

export type ImageFit = 'contain' | 'cover'

function check_source(source: ImageSource): void {
    if (!Number.isFinite(source.width) || !Number.isFinite(source.height) || source.width <= 0 || source.height <= 0) throw new Error('图片尺寸无效')
    if (typeof source.src !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(source.src)) throw new Error('请选择已解码的本地图片')
    if (typeof source.name !== 'string') throw new Error('图片名称无效')
    if (source.processMode !== undefined && !['auto', 'graphic', 'photo'].includes(source.processMode)) throw new Error('图片类型无效')
}

/**
 * 按源图片比例计算整图适应或铺满画布的几何，不裁掉源图片内容。
 * @param scene 目标画布。
 * @param source 原始图片尺寸与内容。
 * @param mode 完整显示或铺满。
 * @returns 居中的图片几何。
 */
function image_box(scene: Scene, source: ImageSource, mode: ImageFit): Pick<SceneElement, 'x' | 'y' | 'width' | 'height'> {
    check_source(source)
    validate_dimensions(scene.width, scene.height)
    if (mode !== 'contain' && mode !== 'cover') throw new Error('图片适配模式无效')
    const scale = mode === 'cover' ? Math.max(scene.width / source.width, scene.height / source.height) : Math.min(scene.width / source.width, scene.height / source.height)
    const width = source.width * scale
    const height = source.height * scale
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('图片比例超出可处理范围')
    return { x: (scene.width - width) / 2, y: (scene.height - height) / 2, width, height }
}

/**
 * 创建独立图片直传会话的空白画布，不读取或写入作品库。
 * @param width 画布宽度。
 * @param height 画布高度。
 * @param palette 设备颜色模式。
 * @returns 新的图片直传画布。
 */
export function create_image_scene(width = 800, height = 480, palette: Palette = 'bwr'): Scene {
    return { ...create_scene('图片直传', width, height, palette), processOptions: { ...defaultOptions } }
}

/**
 * 用新图片替换整个图片会话内容，以完整显示方式居中铺到画布边界。
 * @param scene 当前图片画布。
 * @param source 已解码的本地图片与原始尺寸。
 * @returns 仅包含一个图片图层的新画布，保留像素处理设置。
 */
export function place_image(scene: Scene, source: ImageSource): Scene {
    const box = image_box(scene, source, 'contain')
    const stem = source.name.replace(/\.[^.]+$/, '').trim()
    // 发送历史限制名称为200个UTF-16字符，裁切时保留完整代理对。
    const name = stem.slice(0, 200).replace(/[\uD800-\uDBFF]$/, '') || '图片直传'
    return {
        ...scene, name, updatedAt: Date.now(),
        elements: [{ id: new_id(), type: 'image', name, ...box, visible: true, locked: false, rotation: 0, fill: '#ffffff', src: source.src, fit: 'contain', flipX: false, flipY: false, ...(source.processMode && { processMode: source.processMode }) }],
    }
}

/**
 * 按原始图片比例重新适配，铺满时让图层超出画布，仍保留完整源图供拖动。
 * @param scene 当前图片画布。
 * @param source 与当前图片匹配的原始尺寸；没有图片时为空。
 * @param mode 完整显示或铺满。
 * @returns 重设位置、尺寸和角度后的画布；没有匹配图片时保持原对象。
 */
export function fit_image(scene: Scene, source: ImageSource | null, mode: ImageFit): Scene {
    const photo = scene.elements.find((element) => element.type === 'image' && element.src)
    if (!photo || !source || photo.src !== source.src) return scene
    const box = image_box(scene, source, mode)
    return {
        ...scene, updatedAt: Date.now(),
        elements: scene.elements.map((element) => element.id === photo.id ? { ...element, ...box, rotation: 0, fit: 'contain' } : element),
    }
}

/**
 * 将图片旋转中心放到画布中心，保留尺寸、角度和镜像状态。
 * @param scene 当前图片画布。
 * @returns 居中后的新画布；没有图片时保持原对象。
 */
export function center_image(scene: Scene): Scene {
    const photo = scene.elements.find((element) => element.type === 'image' && element.src)
    if (!photo) return scene
    return {
        ...scene, updatedAt: Date.now(),
        elements: scene.elements.map((element) => element.id === photo.id ? { ...element, x: (scene.width - element.width) / 2, y: (scene.height - element.height) / 2 } : element),
    }
}

/**
 * 更改屏幕尺寸并按原始图片比例重新适配，避免对照片进行横纵不同比例缩放。
 * @param scene 当前图片画布。
 * @param width 新画布宽度。
 * @param height 新画布高度。
 * @param palette 新设备颜色模式。
 * @param source 当前图片的原始尺寸；省略时使用现有图层比例。
 * @param mode 完整显示或铺满，适配时重置图片旋转。
 * @returns 保留图片内容和处理参数的新画布。
 */
export function resize_image_scene(scene: Scene, width: number, height: number, palette: Palette = scene.palette, source?: ImageSource | null, mode: ImageFit = 'contain'): Scene {
    validate_dimensions(width, height)
    if (!['bw', 'bwr', 'bwry'].includes(palette)) throw new Error('屏幕颜色模式无效')
    const resized = { ...scene, width, height, palette, updatedAt: Date.now() }
    const photo = scene.elements.find((element) => element.type === 'image' && element.src)
    const original = source ?? (photo?.src ? { src: photo.src, width: photo.width, height: photo.height, name: photo.name } : null)
    return fit_image(resized, original, mode)
}
