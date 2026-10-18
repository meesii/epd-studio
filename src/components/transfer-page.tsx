import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { format_bytes } from '@/lib/files'
import type { TransferRecord } from '@/lib/storage'
import { ArrowUpRight, Trash2 } from 'lucide-react'
import './transfer-panel.css'

/**
 * 展示真实发送记录，明确区分数据验收与物理屏幕刷新。
 * @param props 发送历史、清空记录与返回创作的操作。
 * @returns 发送任务页面。
 */
export function TransferPage({ records, on_create, on_clear }: { records: TransferRecord[]; on_create: () => void; on_clear: () => Promise<boolean> }) {
    const [clearOpen, set_clear_open] = useState(false)
    const [clearing, set_clearing] = useState(false)
    const [clearError, set_clear_error] = useState(false)
    const sent = records.filter((record) => record.status === 'sent').length

    /**
     * 确认后等待历史写入完成，失败时保留窗口和记录以便重试。
     * @returns 清空请求完成后的任务。
     */
    async function clear_records(): Promise<void> {
        if (clearing) return
        set_clearing(true)
        set_clear_error(false)
        try {
            if (await on_clear()) set_clear_open(false)
            else set_clear_error(true)
        } catch {
            set_clear_error(true)
        } finally {
            set_clearing(false)
        }
    }

    return <div className="page-content transfer-records">
        <div className="transfer-records-heading"><h1>发送记录</h1><div className="transfer-records-actions"><Button variant="outline" disabled={!records.length || clearing} onClick={() => { set_clear_error(false); set_clear_open(true) }}><Trash2 size={15} />清空记录</Button><Button variant="outline" onClick={on_create}>返回创作 <ArrowUpRight size={15} /></Button></div></div>
        {records.length > 0 && <p className="transfer-records-summary">共 {records.length} 次 · 成功 {sent} 次 · {format_bytes(records.reduce((sum, item) => sum + item.bytes, 0))}</p>}
        <div className="transfer-history-scroll" tabIndex={0} aria-label="发送记录表格"><table className="transfer-history-table">
            <caption className="sr-only">发送记录</caption>
            <thead><tr><th scope="col">作品 / 设备</th><th scope="col">发送时间</th><th scope="col">数据 / 用时</th><th scope="col">结果</th></tr></thead>
            <tbody>{records.length ? records.map(record => <tr key={record.id}>
                <td className="transfer-history-work"><b title={record.sceneName}>{record.sceneName}</b><small>{record.deviceName || '未连接设备'}</small></td>
                <td className="transfer-history-time">{new Date(record.time).toLocaleString('zh-CN')}</td>
                <td>{format_bytes(record.bytes)}<small>{(record.durationMs / 1000).toFixed(1)} 秒</small></td>
                <td className="transfer-history-result"><Badge variant={record.status === 'sent' ? 'secondary' : 'destructive'}>{record.status === 'sent' ? '已请求刷新' : record.status === 'cancelled' ? '已取消' : '发送失败'}</Badge><small>{record.status === 'sent' ? record.verified ? 'CRC 校验通过' : '兼容传输 · 无 CRC 回执' : record.error}</small></td>
            </tr>) : <tr><td colSpan={4} className="transfer-history-empty">暂无发送记录</td></tr>}</tbody>
        </table></div>
        {records.length > 0 && <p className="transfer-records-note">已请求刷新不代表实体屏幕已完成刷新。</p>}
        <AlertDialog open={clearOpen} onOpenChange={open => { if (!clearing) set_clear_open(open) }}>
            <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>清空发送记录？</AlertDialogTitle><AlertDialogDescription>清空后无法恢复。正在发送的任务会继续，作品和设备设置不会删除。</AlertDialogDescription></AlertDialogHeader>
                {clearError && <p role="alert" className="text-sm text-destructive">清空失败，请重试。</p>}
                <AlertDialogFooter><AlertDialogCancel disabled={clearing}>取消</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={clearing} onClick={event => { event.preventDefault(); void clear_records() }}>{clearing ? '正在清空…' : '确认清空'}</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
}
