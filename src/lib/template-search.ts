/**
 * 按空格分隔的关键词匹配模板说明，忽略大小写及首尾空白。
 * @param query 用户输入的搜索词。
 * @param values 模板名称、说明、标签及来源等可搜索内容。
 * @returns 每个关键词都能匹配时返回 true；空搜索显示全部。
 */
export function matches_template(query: string, values: readonly (string | undefined)[]): boolean {
    const terms = query.trim().toLowerCase().split(/\s+/)
    const value = values.filter(Boolean).join(' ').toLowerCase()
    const content = /bilibili|b站|哔哩哔哩/.test(value) ? `${value} bilibili b站 哔哩哔哩` : value
    return terms.every(term => content.includes(term))
}
