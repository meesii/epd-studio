import type { ProcessOptions, Scene, SceneElement } from './studio'

export interface TransferRecord {
    id: string
    sceneName: string
    deviceName: string
    time: number
    status: 'sent' | 'failed' | 'cancelled'
    bytes: number
    durationMs: number
    verified: boolean
    error?: string
    thumbnail?: string
}

export interface Workspace {
    version: 1
    scenes: Scene[]
    activeSceneId: string | null
    history: TransferRecord[]
    deviceAliases: Record<string, string>
}

const maxFileSize = 10 * 1024 * 1024
const maxImageSize = 8 * 1024 * 1024
const DATABASE = 'epd-studio'
const STORE = 'workspace'
const KEY = 'current'

function invalid(message: string): never {
    throw new Error(`工作区数据无效：${message}`)
}

function object(value: unknown, path: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${path} 必须是对象`)
    return value as Record<string, unknown>
}

function string(value: unknown, path: string, max = 200, allowEmpty = false): string {
    if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) {
        invalid(`${path} 必须是长度不超过 ${max} 的${allowEmpty ? '' : '非空'}文本`)
    }
    return value
}

function number(value: unknown, path: string, min: number, max: number, integer = false): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
        invalid(`${path} 必须是 ${min}–${max} 范围内的${integer ? '整数' : '数值'}`)
    }
    return value
}

function boolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') invalid(`${path} 必须是布尔值`)
    return value
}

function choice<T extends string>(value: unknown, values: readonly T[], path: string): T {
    if (typeof value !== 'string' || !values.includes(value as T)) invalid(`${path} 的值不受支持`)
    return value as T
}

function color(value: unknown, path: string): string {
    const result = string(value, path, 128)
    if (/url\s*\(|var\s*\(|[;<>]/i.test(result)) invalid(`${path} 必须是纯色`)
    return result
}

/**
 * 只接受内嵌栅格图片，避免导入作品时请求远程资源。
 * @param value 待检查的图片数据。
 * @param path 用于错误提示的字段路径。
 * @returns 与图片文件头匹配的数据地址。
 */
function image(value: unknown, path: string): string {
    const result = string(value, path, maxImageSize)
    const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(result)
    if (!match || match[2].length % 4 !== 0) invalid(`${path} 只支持内嵌 PNG、JPEG、WebP 或 GIF 图片`)
    let bytes: string
    try {
        bytes = atob(match[2].slice(0, 48))
    } catch {
        invalid(`${path} 的图片编码不正确`)
    }
    const format = match[1]
    const valid = format === 'png' ? bytes.startsWith('\x89PNG\r\n\x1a\n')
        : format === 'jpeg' ? bytes.startsWith('\xff\xd8\xff')
        : format === 'gif' ? bytes.startsWith('GIF87a') || bytes.startsWith('GIF89a')
        : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP'
    if (!valid) invalid(`${path} 的图片内容与类型不匹配`)
    return result
}

/**
 * 检查图层内容并只保留渲染器支持的属性。
 * @param value 待检查的图层。
 * @param index 图层在作品中的位置。
 * @returns 独立的安全图层副本。
 */
function element(value: unknown, index: number): SceneElement {
    const path = `图层 ${index + 1}`
    const input = object(value, path)
    const type = choice(input.type, ['text', 'rect', 'line', 'image', 'qr'] as const, `${path}.type`)
    const result: SceneElement = {
        id: string(input.id, `${path}.id`, 128),
        type,
        name: string(input.name, `${path}.name`),
        x: number(input.x, `${path}.x`, -20000, 20000),
        y: number(input.y, `${path}.y`, -20000, 20000),
        width: number(input.width, `${path}.width`, 0.01, 20000),
        height: number(input.height, `${path}.height`, 0.01, 20000),
        visible: boolean(input.visible, `${path}.visible`),
        locked: boolean(input.locked, `${path}.locked`),
        fill: color(input.fill, `${path}.fill`),
    }
    if (input.rotation !== undefined) result.rotation = number(input.rotation, `${path}.rotation`, -36000, 36000)
    if (input.text !== undefined) result.text = string(input.text, `${path}.text`, 50000, true)
    if (input.fontSize !== undefined) result.fontSize = number(input.fontSize, `${path}.fontSize`, 1, 2000)
    if (input.fontWeight !== undefined) result.fontWeight = number(input.fontWeight, `${path}.fontWeight`, 1, 1000)
    if (input.fontFamily !== undefined) result.fontFamily = string(input.fontFamily, `${path}.fontFamily`, 200)
    if (input.align !== undefined) result.align = choice(input.align, ['left', 'center', 'right'] as const, `${path}.align`)
    if (input.verticalAlign !== undefined) result.verticalAlign = choice(input.verticalAlign, ['top', 'middle', 'bottom'] as const, `${path}.verticalAlign`)
    if (input.src !== undefined) result.src = image(input.src, `${path}.src`)
    if (input.fit !== undefined) result.fit = choice(input.fit, ['contain', 'cover'] as const, `${path}.fit`)
    if (input.processOptions !== undefined) result.processOptions = process_options(input.processOptions, `${path}.processOptions`)
    if (input.processMode !== undefined) result.processMode = choice(input.processMode, ['auto', 'graphic', 'photo'] as const, `${path}.processMode`)
    if (input.flipX !== undefined) result.flipX = boolean(input.flipX, `${path}.flipX`)
    if (input.flipY !== undefined) result.flipY = boolean(input.flipY, `${path}.flipY`)
    if (input.stroke !== undefined) result.stroke = color(input.stroke, `${path}.stroke`)
    if (input.strokeWidth !== undefined) result.strokeWidth = number(input.strokeWidth, `${path}.strokeWidth`, 0, 2000)
    if (input.radius !== undefined) result.radius = number(input.radius, `${path}.radius`, 0, 20000)
    return result
}

/**
 * 检查像素处理参数，使作品重载后的输出保持一致。
 * @param value 待检查的像素处理设置。
 * @param path 用于定位画布或图层的字段路径。
 * @returns 仅包含受支持字段的设置副本。
 */
function process_options(value: unknown, path = '像素处理设置'): ProcessOptions {
    const input = object(value, path)
    const result: ProcessOptions = {
        algorithm: choice(input.algorithm, ['none', 'floyd', 'atkinson', 'bayer', 'burkes', 'adaptive', 'threshold'] as const, `${path}.algorithm`),
        contrast: number(input.contrast, `${path}.contrast`, 0, 3),
        brightness: number(input.brightness, `${path}.brightness`, -100, 100),
    }
    if (input.engine !== undefined) result.engine = choice(input.engine, ['epdoptimize', 'opendisplay'] as const, `${path}.engine`)
    if (input.threshold !== undefined) result.threshold = number(input.threshold, `${path}.threshold`, 0, 255)
    if (input.redSaturation !== undefined) result.redSaturation = number(input.redSaturation, `${path}.redSaturation`, 0, 1)
    if (input.ditherStrength !== undefined) result.ditherStrength = number(input.ditherStrength, `${path}.ditherStrength`, 0, 1)
    return result
}

/**
 * 检查作品结构、尺寸与图层 ID，丢弃不支持的属性。
 * @param value 待检查的作品数据。
 * @returns 可用于编辑、保存与渲染的作品副本。
 */
export function validate_scene(value: unknown): Scene {
    const input = object(value, '作品')
    if (!Array.isArray(input.elements) || input.elements.length > 200) invalid('每个作品最多包含 200 个图层')
    const elements = input.elements.map(element)
    if (new Set(elements.map(item => item.id)).size !== elements.length) invalid('同一作品的图层 ID 不能重复')
    const result: Scene = {
        id: string(input.id, '作品.id', 128),
        name: string(input.name, '作品.name'),
        width: number(input.width, '作品.width', 1, 2000, true),
        height: number(input.height, '作品.height', 1, 2000, true),
        palette: choice(input.palette, ['bw', 'bwr', 'bwry'] as const, '作品.palette'),
        background: color(input.background, '作品.background'),
        elements,
        updatedAt: number(input.updatedAt, '作品.updatedAt', 0, 8.64e15),
    }
    if (input.processOptions !== undefined) result.processOptions = process_options(input.processOptions)
    return result
}

/**
 * 检查发送记录中的状态、数值与缩略图。
 * @param value 待检查的发送记录。
 * @param index 记录在历史中的位置。
 * @returns 发送记录副本。
 */
function record(value: unknown, index: number): TransferRecord {
    const path = `发送记录 ${index + 1}`
    const input = object(value, path)
    const result: TransferRecord = {
        id: string(input.id, `${path}.id`, 128),
        sceneName: string(input.sceneName, `${path}.sceneName`),
        deviceName: string(input.deviceName, `${path}.deviceName`),
        time: number(input.time, `${path}.time`, 0, 8.64e15),
        status: choice(input.status, ['sent', 'failed', 'cancelled'] as const, `${path}.status`),
        bytes: number(input.bytes, `${path}.bytes`, 0, Number.MAX_SAFE_INTEGER, true),
        durationMs: number(input.durationMs, `${path}.durationMs`, 0, Number.MAX_SAFE_INTEGER),
        verified: boolean(input.verified, `${path}.verified`),
    }
    if (input.error !== undefined) result.error = string(input.error, `${path}.error`, 5000, true)
    if (input.thumbnail !== undefined) result.thumbnail = image(input.thumbnail, `${path}.thumbnail`)
    return result
}

/**
 * 检查工作区版本、引用完整性及内容数量。
 * @param value 待检查的工作区。
 * @returns 只包含受支持属性的完整工作区副本。
 */
export function validate_workspace(value: unknown): Workspace {
    const input = object(value, '工作区')
    if (input.version !== 1) invalid('工作区版本不受支持')
    if (!Array.isArray(input.scenes) || input.scenes.length > 100) invalid('工作区最多包含 100 个作品')
    if (!Array.isArray(input.history) || input.history.length > 1000) invalid('工作区最多包含 1000 条发送记录')
    const scenes = input.scenes.map(validate_scene)
    if (new Set(scenes.map(scene => scene.id)).size !== scenes.length) invalid('作品 ID 不能重复')
    const activeSceneId = input.activeSceneId === null ? null : string(input.activeSceneId, '工作区.activeSceneId', 128)
    if (activeSceneId !== null && !scenes.some(scene => scene.id === activeSceneId)) invalid('当前作品不存在')
    const history = input.history.map(record)
    if (new Set(history.map(item => item.id)).size !== history.length) invalid('发送记录 ID 不能重复')
    const aliases = object(input.deviceAliases, '设备别名')
    if (Object.keys(aliases).length > 200) invalid('最多保存 200 个设备别名')
    const deviceAliases: Record<string, string> = {}
    for (const [key, value] of Object.entries(aliases)) {
        string(key, '设备标识', 200)
        if (['__proto__', 'constructor', 'prototype'].includes(key)) invalid('设备标识不受支持')
        deviceAliases[key] = string(value, '设备别名', 200)
    }
    return { version: 1, scenes, activeSceneId, history, deviceAliases }
}

function empty_workspace(): Workspace {
    return { version: 1, scenes: [], activeSceneId: null, history: [], deviceAliases: {} }
}

function storage_error(error: unknown, operation: string): Error {
    const reason = error instanceof Error ? error.message : String(error ?? '未知错误')
    return new Error(`无法${operation}本地工作区：${reason}。请确认浏览器允许网站存储；可导出备份后重试。`)
}

/**
 * 打开本地数据库，并在其他标签页阻塞升级时给出明确错误。
 * @returns 可执行工作区事务的数据库连接。
 */
function open_database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('当前环境不支持 IndexedDB'))
            return
        }
        const request = indexedDB.open(DATABASE, 1)
        let blocked = false
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
        }
        request.onsuccess = () => {
            if (blocked) { request.result.close(); return }
            request.result.onversionchange = () => request.result.close()
            resolve(request.result)
        }
        request.onerror = () => reject(request.error ?? new Error('数据库打开失败'))
        request.onblocked = () => {
            blocked = true
            reject(new Error('数据库被其他标签页占用，请关闭旧版标签页'))
        }
    })
}

/**
 * 读取本地工作区；只有首次打开时返回空数据，损坏数据与存储错误会抛出。
 * @returns 已校验的工作区。
 */
export async function load_workspace(): Promise<Workspace> {
    let database: IDBDatabase | undefined
    try {
        database = await open_database()
        const data = await new Promise<unknown>((resolve, reject) => {
            const transaction = database!.transaction(STORE, 'readonly')
            const request = transaction.objectStore(STORE).get(KEY)
            let result: unknown
            request.onsuccess = () => { result = request.result }
            transaction.oncomplete = () => resolve(result)
            transaction.onerror = () => reject(transaction.error ?? new Error('数据库读取失败'))
            transaction.onabort = () => reject(transaction.error ?? new Error('数据库读取已中断'))
        })
        return data === undefined ? empty_workspace() : validate_workspace(data)
    } catch (error) {
        throw storage_error(error, '读取')
    } finally {
        database?.close()
    }
}

/**
 * 将完整工作区写入单个事务，提交成功后才视为保存完成。
 * @param workspace 需要保存的工作区。
 * @returns 在数据库完成提交后结束的任务。
 */
export async function save_workspace(workspace: Workspace): Promise<void> {
    const snapshot = validate_workspace(workspace)
    let database: IDBDatabase | undefined
    try {
        database = await open_database()
        await new Promise<void>((resolve, reject) => {
            const transaction = database!.transaction(STORE, 'readwrite')
            transaction.objectStore(STORE).put(snapshot, KEY)
            transaction.oncomplete = () => resolve()
            transaction.onerror = () => reject(transaction.error ?? new Error('数据库写入失败'))
            transaction.onabort = () => reject(transaction.error ?? new Error('数据库写入已中断'))
        })
    } catch (error) {
        throw storage_error(error, '保存')
    } finally {
        database?.close()
    }
}

function json_blob(value: unknown): Blob {
    const result = new Blob([JSON.stringify(value, null, 4)], { type: 'application/json' })
    if (result.size > maxFileSize) throw new Error('导出文件超过 10 MB，请缩小图片或分别导出作品')
    return result
}

/**
 * 在副本中补齐临时空名称，供保存与导出共用且不影响输入框。
 * @param scene 正在编辑或导出的作品。
 * @returns 保留原内容并具有可保存名称的作品副本。
 */
export function named_scene(scene: Scene): Scene {
    return {
        ...scene,
        name: scene.name.trim() ? scene.name : '未命名作品',
        elements: scene.elements.map((item) => item.name.trim() ? item : { ...item, name: '未命名图层' }),
    }
}

/**
 * 导出带格式标识和版本号的作品 JSON 文件内容。
 * @param scene 需要导出的作品。
 * @returns 可下载并再次导入的 JSON Blob。
 */
export function export_scene(scene: Scene): Blob {
    return json_blob({ format: 'epd-studio-scene', version: 1, scene: validate_scene(named_scene(scene)) })
}

/**
 * 导出作品、历史和设备别名的完整备份。
 * @param workspace 需要备份的工作区。
 * @returns 可下载并再次导入的 JSON Blob。
 */
export function export_workspace(workspace: Workspace): Blob {
    const snapshot = { ...workspace, scenes: workspace.scenes.map(named_scene) }
    return json_blob({ format: 'epd-studio-workspace', version: 1, workspace: validate_workspace(snapshot) })
}

/**
 * 在读取前检查文件大小，并将 JSON 解析错误转为可读提示。
 * @param file 用户选择的 JSON 文件。
 * @returns 尚未检查具体格式的顶层对象。
 */
async function read_file(file: File): Promise<Record<string, unknown>> {
    if (file.size > maxFileSize) throw new Error('导入文件不能超过 10 MB')
    let value: unknown
    try {
        value = JSON.parse(await file.text())
    } catch {
        throw new Error('无法读取导入文件，请选择有效的 EPD Studio JSON 文件')
    }
    return object(value, '导入文件')
}

/**
 * 导入作品文件并检查格式、版本与全部作品内容。
 * @param file 用户选择的作品文件。
 * @returns 可编辑的作品副本。
 */
export async function import_scene(file: File): Promise<Scene> {
    const input = await read_file(file)
    if (input.format !== 'epd-studio-scene' || input.version !== 1) throw new Error('请选择版本 1 的 EPD Studio 作品文件')
    return validate_scene(input.scene)
}

/**
 * 导入完整备份并检查作品、历史和设备别名。
 * @param file 用户选择的备份文件。
 * @returns 可用于替换当前工作区的安全副本。
 */
export async function import_workspace(file: File): Promise<Workspace> {
    const input = await read_file(file)
    if (input.format !== 'epd-studio-workspace' || input.version !== 1) throw new Error('请选择版本 1 的 EPD Studio 工作区备份')
    return validate_workspace(input.workspace)
}
