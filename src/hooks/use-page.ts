import { useCallback, useEffect, useRef, useState } from 'react'

export type Page = 'studio' | 'image' | 'works' | 'templates' | 'devices' | 'transfers'
const pageNames = new Set<Page>(['studio', 'image', 'works', 'templates', 'devices', 'transfers'])

/**
 * 从地址读取页面，未知路径回到工作台；hash 路由无需服务器配置刷新回退。
 * @returns 当前地址对应的页面。
 */
function read_page(): Page {
    const name = window.location.hash.replace(/^#\/?/, '').split(/[?\/]/, 1)[0] as Page
    return pageNames.has(name) ? name : 'studio'
}

/**
 * 同步页面、可分享的地址以及浏览器前进后退，并在切换前清理编辑会话。
 * @param on_change 实际离开当前页面时执行的同步操作。
 * @returns 当前页面与导航方法。
 */
export function use_page(on_change: (previous: Page, next: Page) => void) {
    const [page, update_page] = useState<Page>(read_page)
    const current = useRef(page)
    const beforeChange = useRef(on_change)
    beforeChange.current = on_change

    /**
     * 以同步引用协调多次导航，避免连续浏览器事件重复清理草稿。
     * @param next 目标页面。
     * @returns 无返回值。
     */
    const show_page = useCallback((next: Page): void => {
        if (current.current === next) return
        beforeChange.current(current.current, next)
        current.current = next
        update_page(next)
    }, [])

    useEffect(() => {
        const on_location = () => {
            const next = read_page()
            if (window.location.hash !== `#/${next}`) window.history.replaceState(null, '', `#/${next}`)
            show_page(next)
        }
        on_location()
        window.addEventListener('popstate', on_location)
        window.addEventListener('hashchange', on_location)
        return () => {
            window.removeEventListener('popstate', on_location)
            window.removeEventListener('hashchange', on_location)
        }
    }, [show_page])

    /**
     * 记录一次页面导航，刷新地址仍落到该页。
     * @param next 目标页面。
     * @returns 无返回值。
     */
    const set_page = useCallback((next: Page): void => {
        if (current.current === next) return
        show_page(next)
        window.history.pushState(null, '', `#/${next}`)
    }, [show_page])

    return [page, set_page] as const
}
