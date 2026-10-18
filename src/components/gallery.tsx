import { useState } from 'react'
import { ArrowUpRight, BookOpen, Copy, Download, FilePlus2, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScenePreview } from './scene-preview'
import { templates, type Scene, type Template } from '@/lib/studio'
import type { DeviceSnapshot } from '@/lib/ble'
import type { FirmwareMode } from '@/lib/firmware-modes'
import { matches_template } from '@/lib/template-search'
import { FirmwareTemplates, get_firmware_cards } from './firmware-templates'
import { DemoTemplates, get_demo_cards } from './demo-templates'
import { HomeworkTemplate, get_homework_cards } from './homework-template'
import { TemplateCard } from './template-card'
import { TemplateSetup } from './template-setup'

type GalleryProps = { scenes: Scene[]; on_open: (id: string) => void; on_new: () => void; on_duplicate: (scene: Scene) => void; on_export: (scene: Scene) => void; on_delete: (scene: Scene) => void }

const templateDetails: Record<string, string> = {
    daily: '日期、心情与今日焦点',
    weekly: '一周安排与备注',
    badge: '姓名、身份与二维码',
    calendar: '月历与日期标记',
    reading: '阅读摘句与进度',
    gallery: '像素山景与文字标题',
}

/**
 * 展示本地作品并提供搜索、复制、导出与删除入口。
 * @param props 作品列表和工作区操作。
 * @returns 作品管理页面。
 */
export function WorksGallery(props: GalleryProps) {
    const [query, set_query] = useState('')
    const scenes = [...props.scenes].sort((first, second) => second.updatedAt - first.updatedAt).filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))
    return <div className="page-content">
        <div className="page-title-row"><div><h1>我的作品</h1></div><Button onClick={props.on_new}><FilePlus2 size={15} />新建草稿</Button></div>
        <div className="gallery-filter"><div className="search-field"><Search size={16} /><Input aria-label="搜索作品" placeholder="搜索作品" value={query} onChange={(event) => set_query(event.target.value)} /></div><span>{scenes.length} 份作品</span></div>
        {scenes.length ? <div className="works-grid">{scenes.map((scene) => <article className="work-card" key={scene.id}><button className="work-cover" onClick={() => props.on_open(scene.id)} aria-label={`打开 ${scene.name}`}><ScenePreview scene={scene} /><span className="cover-open"><ArrowUpRight size={18} /></span></button><div className="work-info"><button className="work-name" onClick={() => props.on_open(scene.id)}>{scene.name}</button><span>{scene.width} × {scene.height} · {new Date(scene.updatedAt).toLocaleDateString('zh-CN')}</span><div className="work-actions"><Button variant="ghost" size="sm" onClick={() => props.on_duplicate(scene)}><Copy size={13} />复制为草稿</Button><Button variant="ghost" size="icon-sm" title="导出作品" aria-label={`导出 ${scene.name}`} onClick={() => props.on_export(scene)}><Download size={14} /></Button><Button variant="ghost" size="icon-sm" className="text-destructive" title="删除作品" aria-label={`删除 ${scene.name}`} onClick={() => props.on_delete(scene)}><Trash2 size={14} /></Button></div></div></article>)}</div> : <div className="empty-page"><BookOpen size={36} /><h2>{query ? '未找到匹配作品' : '暂无作品'}</h2><p>{query ? '试试其他名称。' : '创建草稿并保存后显示在这里。'}</p><Button variant="outline" onClick={props.on_new}>新建草稿</Button></div>}
    </div>
}

/**
 * 将设备内置模式和可编辑图片放进同一网格，用标签和分类说明各自行为。
 * @param props 图片草稿回调、固件模式回调与设备状态。
 * @returns 模板选择页面。
 */
export function TemplateGallery({ on_use, on_mode, device, busy }: { on_use: (template: Template) => void; on_mode: (mode: FirmwareMode, weekStart: number) => void; device: DeviceSnapshot; busy: boolean }) {
    const [category, set_category] = useState('全部')
    const [query, set_query] = useState('')
    const [setup, set_setup] = useState<Template | null>(null)
    const choices = templates.filter(item => (category === '全部' || category === '可编辑图片' || item.category === category) && matches_template(query, [item.name, item.description, templateDetails[item.id], item.category, item.note, '可编辑图片', item.fields?.length ? '可配置' : '', ...(item.sources?.flatMap(source => [source.title, source.platform]) ?? [])]))
    const count = choices.length + get_firmware_cards(category, query).length + get_demo_cards(category, query).length + get_homework_cards(category, query).length
    return <div className="page-content"><div className="page-title-row"><div><h1>本地模板</h1><p>内置模式自动刷新，图片模板需手动发送。</p></div></div>
        <div className="template-library-filter"><div className="category-row" aria-label="模板分类">{['全部', '设备内置', '可编辑图片', '日常', '工作', '学习', '门店', '影像'].map(item => <Button key={item} variant={category === item ? 'default' : 'ghost'} aria-pressed={category === item} onClick={() => set_category(item)}>{item}</Button>)}</div><div className="template-library-search"><div className="search-field"><Search size={14} aria-hidden="true" /><Input aria-label="搜索模板" placeholder="搜索模板、用途或来源" value={query} onChange={event => set_query(event.target.value)} /></div><span className="template-library-count" role="status">{count} 份模板</span></div></div>
        <div className="template-library-grid" aria-label="本地模板">
            <FirmwareTemplates device={device} busy={busy} on_mode={on_mode} filter={category} query={query} />
            <DemoTemplates filter={category} query={query} on_create={scene => on_use({ id: `demo-${scene.id}`, name: scene.name, category: '工作', description: '原 demo 网页图片模板', scene })} />
            <HomeworkTemplate filter={category} query={query} on_create={scene => on_use({ id: `homework-${scene.id}`, name: scene.name, category: '学习', description: '微信群文字作业清单', scene })} />
            {choices.map((template, index) => <TemplateCard key={template.id} name={template.name} description={templateDetails[template.id] ?? template.description} tags={[template.fields?.length ? '可配置' : '可编辑', '图片', template.category]} action={`${template.fields?.length ? '配置' : '使用'} ${template.name} 模板`} tone={(['sage', 'sand', 'stone'] as const)[index % 3]} on_click={() => template.fields?.length ? set_setup(template) : on_use(template)}><ScenePreview scene={template.scene} /></TemplateCard>)}
        </div>
        {count === 0 && <div className="empty-page"><Search size={28} /><h2>未找到匹配模板</h2><p>试试其他关键词或分类。</p></div>}
        {setup && <TemplateSetup key={setup.id} template={setup} on_close={() => set_setup(null)} on_create={template => { on_use(template); set_setup(null) }} />}
    </div>
}
