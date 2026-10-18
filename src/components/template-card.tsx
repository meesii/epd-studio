import type { ReactNode } from 'react'
import { ArrowUpRight, LockKeyhole } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import './template-library.css'

interface TemplateCardProps {
    name: string
    description: string
    tags: string[]
    children: ReactNode
    action: string
    on_click?: () => void
    tone?: 'sage' | 'sand' | 'stone'
    kind?: 'firmware' | 'image'
    active?: boolean
    disabled?: boolean
    hint?: string
}

/**
 * 用统一尺寸的封面、说明与标签呈现不同来源的模板。
 * @param props 模板文案、预览、操作与可用状态。
 * @returns 可作为模板网格直接子项的单张卡片。
 */
export function TemplateCard({ name, description, tags, children, action, on_click, tone = 'sage', kind = 'image', active = false, disabled = false, hint }: TemplateCardProps) {
    return <article className={`library-card ${active ? 'is-active' : ''}`} data-kind={kind} title={hint}>
        <button type="button" className={`library-cover library-tone-${tone}`} onClick={on_click} disabled={disabled} aria-label={action}>
            <div className="library-cover-art">{children}</div>
            {active && <span className="library-current">当前使用</span>}
            <span className="library-action">{action}{disabled ? <LockKeyhole size={12} /> : <ArrowUpRight size={13} />}</span>
        </button>
        <div className="library-card-info">
            <h3>{name}</h3>
            <p title={description}>{description}</p>
            <div className="library-card-tags">{tags.map(tag => <Badge key={tag} variant="outline">{tag}</Badge>)}</div>
        </div>
    </article>
}
