import { useEffect, useRef, useState } from 'react'
import { render_scene, render_scene_output, defaultOptions, type Scene, type ProcessOptions } from '@/lib/studio'

type PreviewProps = { scene: Scene; processed?: boolean; options?: ProcessOptions; className?: string; showWarnings?: boolean; on_error?: (message: string) => void }

/**
 * 将作品绘制到独立画布，预览和输出共享同一图像处理流程。
 * @param props 作品、处理参数和可选错误回调。
 * @returns 可缩放的作品预览。
 */
export function ScenePreview({ scene, processed = false, options, className = '', showWarnings = false, on_error }: PreviewProps) {
    const host = useRef<HTMLDivElement>(null)
    const canvas = useRef<HTMLCanvasElement>(null)
    const [failed, set_failed] = useState(false)
    const [warnings, set_warnings] = useState<string[]>([])
    const [displayScale, set_display_scale] = useState(1)
    const processOptions = options ?? scene.processOptions ?? defaultOptions
    const renderScale = processed ? 1 : displayScale
    useEffect(() => {
        if (processed) return
        const update_scale = () => {
            const width = host.current?.getBoundingClientRect().width ?? scene.width
            const requested = Math.ceil(width * (window.devicePixelRatio || 1) / scene.width * 4) / 4
            const limit = Math.min(4, Math.sqrt(16000000 / (scene.width * scene.height)))
            set_display_scale(Math.max(1, Math.min(limit, requested)))
        }
        update_scale()
        const observer = new ResizeObserver(update_scale)
        if (host.current) observer.observe(host.current)
        window.addEventListener('resize', update_scale)
        return () => { observer.disconnect(); window.removeEventListener('resize', update_scale) }
    }, [scene.width, scene.height, processed])
    useEffect(() => {
        let active = true
        const buffer = document.createElement('canvas')
        const on_warnings = (messages: string[]) => { if (active) set_warnings(messages) }
        const rendering = processed
            ? render_scene_output(buffer, scene, processOptions, on_warnings)
            : render_scene(buffer, scene, renderScale, on_warnings)
        rendering.then(() => {
            if (!active || !canvas.current) return
            canvas.current.width = buffer.width
            canvas.current.height = buffer.height
            const target = canvas.current.getContext('2d')!
            target.imageSmoothingEnabled = !processed
            target.drawImage(buffer, 0, 0)
            set_failed(false)
        }).catch((error: Error) => {
            if (active) { set_failed(true); set_warnings([]); on_error?.(error.message) }
        })
        return () => { active = false }
    }, [scene, processed, processOptions, on_error, renderScale])
    return <div ref={host} data-view={processed ? 'output' : 'design'} className={`scene-preview ${className}`} style={{ aspectRatio: `${scene.width} / ${scene.height}` }}>
        <canvas ref={canvas} data-view={processed ? 'output' : 'design'} data-render-scale={renderScale} style={{ imageRendering: processed ? 'pixelated' : 'auto' }} aria-label={`${scene.name} · ${scene.width} × ${scene.height} 像素预览`} />
        {failed && <span className="preview-error">预览失败，请检查素材</span>}
        {!processed && showWarnings && !failed && warnings.length > 0 && <span role="status" title={warnings.join('\n')} className="pointer-events-none absolute inset-x-2 bottom-2 rounded border border-amber-300 bg-amber-50/95 px-2 py-1 text-[11px] leading-4 text-amber-900 shadow-sm">文字超出画布，请移动、换行或减小字号。</span>}
    </div>
}
