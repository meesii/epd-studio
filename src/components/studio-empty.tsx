import { ArrowUpRight, FilePlus2, FolderOpen, Grid2X2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import './studio-empty.css'

type StudioEmptyProps = {
    savedCount: number
    on_new: () => void
    on_template: () => void
    on_works: () => void
    on_import: () => void
}

/**
 * 为未打开作品的工作台提供清晰的新建、模板、已保存作品和导入入口。
 * @param props 作品数量及各创作入口。
 * @returns 工作台空状态。
 */
export function StudioEmpty({ savedCount, on_new, on_template, on_works, on_import }: StudioEmptyProps) {
    return <section className="studio-empty" aria-labelledby="studio-empty-title">
        <div className="studio-empty-art" aria-hidden="true"><div className="studio-empty-sheet"><span /><i /><i /><div><b /><b /><b /></div></div><span className="studio-empty-plus">+</span><span className="studio-empty-size">800 × 480</span></div>
        <div className="studio-empty-heading"><h2 id="studio-empty-title">让下一份灵感，出现在屏幕上</h2><p>新建画布，从模板开始，或继续编辑已保存的作品。</p></div>
        <div className="studio-empty-actions">
            <button className="studio-empty-action primary" onClick={on_new}><span className="studio-empty-action-icon"><FilePlus2 size={22} /></span><span><strong>新建作品</strong><small>从空白画布开始</small></span><ArrowUpRight size={17} /></button>
            <button className="studio-empty-action" onClick={on_template}><span className="studio-empty-action-icon"><Grid2X2 size={22} /></span><span><strong>浏览模板</strong><small>选一个喜欢的版式</small></span><ArrowUpRight size={17} /></button>
            <button className="studio-empty-action" onClick={on_works}><span className="studio-empty-action-icon"><FolderOpen size={22} /></span><span><strong>我的作品</strong><small>{savedCount ? `${savedCount} 份作品，随时继续` : '已保存的作品会在这里'}</small></span><ArrowUpRight size={17} /></button>
        </div>
        <Button variant="ghost" className="studio-empty-import" onClick={on_import}><Upload size={14} />导入作品文件</Button>
    </section>
}
