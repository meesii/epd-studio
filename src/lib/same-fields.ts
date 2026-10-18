/**
 * 按字段内容比较作品参数，避免嵌套图层设置因快照复制而被误判为修改。
 * @param first 第一份可编辑字段。
 * @param second 第二份可编辑字段。
 * @returns 所有字段及嵌套参数是否相同；缺失与 undefined 保持兼容。
 */
export function same_fields(first: object | undefined, second: object | undefined): boolean {
    if (first === second) return true
    if (!first || !second) return false
    const fields = new Set([...Object.keys(first), ...Object.keys(second)])
    for (const field of fields) {
        const left = Reflect.get(first, field)
        const right = Reflect.get(second, field)
        if (left === right) continue
        if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || !same_fields(left, right)) return false
    }
    return true
}
