import { LockKeyhole, RotateCw } from 'lucide-react'
import type { PointerEvent } from 'react'
import type { Scene, SceneElement } from '@/lib/studio'
import type { CanvasAction } from '@/hooks/use-canvas-gesture'
import type { ResizeHandle } from '@/lib/studio/transform'
import { is_line_element, line_size } from '@/lib/studio/line-geometry'
import { selection_box } from '@/lib/studio/selection'

const handles: { direction: ResizeHandle; label: string }[] = [
    { direction: 'nw', label: '左上角缩放' }, { direction: 'n', label: '上边缩放' },
    { direction: 'ne', label: '右上角缩放' }, { direction: 'e', label: '右边缩放' },
    { direction: 'se', label: '右下角缩放' }, { direction: 's', label: '下边缩放' },
    { direction: 'sw', label: '左下角缩放' }, { direction: 'w', label: '左边缩放' },
]

/**
 * 为图层提供缩放和旋转入口；文字缩放改变字号，锁定图层只显示边界。
 * @param props 当前图层、画布尺寸和控制柄的指针事件。
 * @returns 与画面同中心旋转的图层选框。
 */
export function CanvasSelection({ element, scene, on_start }: { element: SceneElement; scene: Scene; on_start: (event: PointerEvent<HTMLButtonElement>, action: Exclude<CanvasAction, 'move'>) => void }) {
    const line = is_line_element(element)
    const lineHandles: { direction: ResizeHandle; label: string }[] = line_size(element).vertical
        ? [{ direction: 'n', label: '线条起点' }, { direction: 's', label: '线条终点' }]
        : [{ direction: 'w', label: '线条起点' }, { direction: 'e', label: '线条终点' }]
    return <div className={`selection-box transform-selection ${element.locked ? 'locked' : ''}`} style={{ left: `${element.x / scene.width * 100}%`, top: `${element.y / scene.height * 100}%`, width: `${element.width / scene.width * 100}%`, height: `${element.height / scene.height * 100}%`, transform: `rotate(${element.rotation ?? 0}deg)` }}>
        {element.locked ? <span className="selection-lock"><LockKeyhole size={11} />已锁定</span> : <>
            {(line ? lineHandles : handles).map(handle => <button key={handle.direction} type="button" className={`resize-handle handle-${handle.direction}`} aria-label={handle.label} title={element.type === 'text' ? `${handle.label} · 拖动调整字号` : line ? `${handle.label} · 拖动调整长度` : `${handle.label} · Shift 切换比例锁定`} onPointerDown={event => on_start(event, handle.direction)} />)}
            <button type="button" className="rotation-handle" aria-label="拖动旋转图层" title="拖动旋转 · Shift 按 15° 吸附" onPointerDown={event => on_start(event, 'rotate')}><RotateCw size={12} strokeWidth={1.5} /></button>
        </>}
    </div>
}

/**
 * 显示组内图层及整个选区的边界，整组操作只移动位置。
 * @param props 选中的图层和画布尺寸。
 * @returns 可见图层的独立边界与整体选框。
 */
export function CanvasGroupSelection({ elements, scene }: { elements: readonly SceneElement[]; scene: Scene }) {
    const visible = elements.filter(element => element.visible)
    const bounds = selection_box(visible)
    if (!bounds) return null
    return <>
        {visible.map(element => <div key={element.id} data-selected-layer={element.id} className={`selection-box group-member ${element.locked ? 'locked' : ''}`} style={{ left: `${element.x / scene.width * 100}%`, top: `${element.y / scene.height * 100}%`, width: `${element.width / scene.width * 100}%`, height: `${element.height / scene.height * 100}%`, transform: `rotate(${element.rotation ?? 0}deg)` }} />)}
        <div className="selection-box group-bounds" data-selection-group="" style={{ left: `${bounds.x / scene.width * 100}%`, top: `${bounds.y / scene.height * 100}%`, width: `${bounds.width / scene.width * 100}%`, height: `${bounds.height / scene.height * 100}%` }}><span className="group-count">已选 {elements.length} 层</span></div>
    </>
}
