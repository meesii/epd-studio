import { useCallback, useEffect, useState, type SetStateAction } from 'react'

type InputChange<T> = <Key extends keyof T>(key: Key, value: SetStateAction<T[Key]>) => void
const maxInputLength = 256 * 1024

/**
 * 记住模板表单输入；读取失败、旧格式和存储不可用时继续使用初始值。
 * @param name 模板表单的固定名称，不随本次挂载变化。
 * @param initial 首次打开表单时创建默认输入。
 * @param read 校验并复制保存的数据，无效数据返回 null。
 * @param paused 临时排序期间暂停写入，避免保存尚未确认的顺序。
 * @returns 当前输入及支持函数更新的字段修改方法。
 */
export function use_template_input<T>(name: string, initial: () => T, read: (value: unknown) => T | null, paused = false): [T, InputChange<T>] {
    const key = `epd-template-input:v1:${name}`
    const [input, set_input] = useState<T>(() => {
        try {
            const stored = window.localStorage.getItem(key)
            if (stored && stored.length <= maxInputLength) {
                const restored = read(JSON.parse(stored))
                if (restored) return restored
            }
        } catch { /* 浏览器可能禁用存储，输入仍然可以在当前页面使用。 */ }
        return initial()
    })

    useEffect(() => {
        if (paused) return
        try {
            const stored = JSON.stringify(input)
            if (stored.length <= maxInputLength) window.localStorage.setItem(key, stored)
        } catch { /* 存储空间不足时不影响编辑和生成作品。 */ }
    }, [input, key, paused])

    const change = useCallback<InputChange<T>>((field, value) => {
        set_input(current => ({ ...current, [field]: typeof value === 'function' ? (value as (previous: T[typeof field]) => T[typeof field])(current[field]) : value }))
    }, [])
    return [input, change]
}
