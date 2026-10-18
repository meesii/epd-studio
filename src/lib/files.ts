import { read_svg_image } from './svg-image'

/**
 * 通过浏览器下载本地生成的文件，完成后释放临时地址。
 * @param blob 待下载的数据。
 * @param name 下载文件名。
 * @returns 无返回值。
 */
export function save_file(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 将本地位图或静态 SVG 转换为可存储的 PNG，拒绝过大文件与不可解码图片。
 * @param file 用户选择的图片。
 * @returns 包含 PNG 数据地址和图片尺寸的对象。
 */
export async function read_image(file: File): Promise<{ src: string; width: number; height: number; processMode?: 'graphic' }> {
    if (file.size > 15 * 1024 * 1024) throw new Error('请选择小于 15 MB 的图片')
    if (file.type === 'image/svg+xml' || (!file.type && /\.svg$/i.test(file.name))) return { ...await read_svg_image(file), processMode: 'graphic' }
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'].includes(file.type)) {
        throw new Error('支持 PNG、JPEG、WebP、GIF、BMP 和 SVG 图片')
    }
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法创建画布')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return { src: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
}

/**
 * 格式化传输字节数。
 * @param bytes 字节数。
 * @returns 适合界面显示的文件大小。
 */
export function format_bytes(bytes: number): string {
    return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${Math.round(bytes)} B`
}
