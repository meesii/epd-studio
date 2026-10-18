import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { has_open_overlay, is_input_target } from '@/lib/input-target'

interface ImagePasteOptions {
    enabled: boolean
    contextKey: string
    on_image: (file: File, is_current: () => boolean) => void | Promise<void>
}

/**
 * 从原生粘贴数据中取第一张图片，优先使用文件项并兼容 files 列表。
 * @param data 本次粘贴事件提供的数据。
 * @returns 图片文件；纯文本、HTML 或空剪贴板返回空值。
 */
function event_image(data: DataTransfer | null): File | null {
    if (!data) return null
    for (const item of Array.from(data.items ?? [])) {
        if (item.kind !== 'file') continue
        const file = item.getAsFile()
        const type = file?.type || item.type
        if (!file || !type.startsWith('image/')) continue
        return file.type ? file : new File([file], file.name || '粘贴图片', { type })
    }
    return Array.from(data.files ?? []).find(file => file.type.startsWith('image/')) ?? null
}

/**
 * 在用户明确点击时读取剪贴板图片，不读取文本或自行请求初始化权限。
 * @returns 第一张图片；剪贴板中没有图片时返回空值。
 */
async function read_image(): Promise<File | null> {
    const items = await navigator.clipboard.read()
    for (const item of items) {
        const type = item.types.find(value => value.startsWith('image/'))
        if (!type) continue
        const blob = await item.getType(type)
        const extension = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/svg+xml': 'svg' } as Record<string, string>)[type] ?? 'img'
        return new File([blob], `粘贴图片.${extension}`, { type })
    }
    return null
}

/**
 * 为工作台与图片直传共享安全粘贴入口，只把文件交给当前页面的解码流程。
 * @param options 启用状态、页面与作品标识以及带过期检查的图片处理回调。
 * @returns 显式读取入口与最新粘贴操作的处理状态。
 */
export function use_image_paste({ enabled, contextKey, on_image }: ImagePasteOptions) {
    const latest = useRef({ enabled, contextKey, on_image })
    const sequence = useRef(0)
    const mounted = useRef(false)
    const composing = useRef(false)
    const [busyToken, set_busy_token] = useState<number | null>(null)
    if (latest.current.enabled !== enabled || latest.current.contextKey !== contextKey) sequence.current += 1
    latest.current = { enabled, contextKey, on_image }

    /**
     * 读取并导入最新一次粘贴，旧操作不能覆盖新图或清除新操作的忙碌状态。
     * @param load 本次用户操作提供的图片读取函数。
     * @param clipboardRead 是否需要在读取失败时提示使用原生粘贴。
     * @returns 图片处理结束后的任务，错误通过提示呈现。
     */
    const accept_image = useCallback(async (load: () => File | null | Promise<File | null>, clipboardRead: boolean): Promise<void> => {
        const token = ++sequence.current
        const context = latest.current.contextKey
        /**
         * 检查页面、作品和请求是否仍有效，供调用者在异步解码后再次确认。
         * @returns 本次操作是否仍允许更新当前画布。
         */
        const is_current = (): boolean => mounted.current && latest.current.enabled && sequence.current === token && latest.current.contextKey === context && !has_open_overlay(document)
        let reading = true
        set_busy_token(token)
        try {
            const file = await load()
            if (!is_current()) return
            if (!file) {
                toast.info('剪贴板中没有图片')
                return
            }
            reading = false
            await latest.current.on_image(file, is_current)
        } catch (error) {
            if (!is_current()) return
            if (clipboardRead && reading) toast.info('无法读取剪贴板，请按 Ctrl+V 粘贴图片')
            else toast.error(error instanceof Error ? error.message : '无法粘贴图片')
        } finally {
            if (mounted.current && sequence.current === token) set_busy_token(null)
        }
    }, [])

    /**
     * 响应显式粘贴按钮，缺少 Clipboard API 时保留 Ctrl+V 的原生回退入口。
     * @returns 本次读取和图片处理完成后的任务。
     */
    const paste_image = useCallback(async (): Promise<void> => {
        if (!mounted.current || !latest.current.enabled || composing.current || has_open_overlay(document)) return
        if (typeof navigator === 'undefined' || typeof navigator.clipboard?.read !== 'function') {
            sequence.current += 1
            set_busy_token(null)
            toast.info('请按 Ctrl+V 粘贴图片')
            return
        }
        await accept_image(read_image, true)
    }, [accept_image])

    useEffect(() => {
        if (typeof window === 'undefined') return
        mounted.current = true
        /**
         * 仅接管非输入区域里的图片粘贴，同步阻止浏览器默认图片行为。
         * @param event 用户触发的原生粘贴事件。
         * @returns 无返回值。
         */
        const paste = (event: ClipboardEvent): void => {
            if (!latest.current.enabled || event.defaultPrevented || composing.current || has_open_overlay(document)) return
            if (is_input_target(document.activeElement) || event.composedPath().some(is_input_target)) return
            let file: File | null
            try { file = event_image(event.clipboardData) }
            catch {
                toast.error('无法读取粘贴图片')
                return
            }
            if (!file) return
            event.preventDefault()
            void accept_image(() => file, false)
        }
        const start_composition = (): void => { composing.current = true }
        const end_composition = (): void => { composing.current = false }
        window.addEventListener('paste', paste)
        window.addEventListener('compositionstart', start_composition)
        window.addEventListener('compositionend', end_composition)
        return () => {
            mounted.current = false
            composing.current = false
            sequence.current += 1
            window.removeEventListener('paste', paste)
            window.removeEventListener('compositionstart', start_composition)
            window.removeEventListener('compositionend', end_composition)
        }
    }, [accept_image])

    return { paste_image, pasting: enabled && busyToken !== null && busyToken === sequence.current }
}
