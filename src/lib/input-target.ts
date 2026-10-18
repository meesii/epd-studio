const inputRoles = new Set([
    'textbox', 'searchbox', 'combobox', 'listbox', 'option', 'slider', 'spinbutton',
    'tab', 'tablist', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
    'tree', 'treeitem', 'grid', 'gridcell', 'radiogroup', 'radio', 'switch', 'toolbar',
])
const popupRoles = new Set(['true', 'menu', 'listbox', 'tree', 'grid', 'dialog'])
const overlaySelector = '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],dialog[open],[popover],[data-slot="popover-content"],[data-slot="context-menu-content"],[data-slot="dropdown-menu-content"],[data-slot="select-content"]'

function target_element(target: EventTarget | null): Element | null {
    const node = target as Node | null
    if (node?.nodeType === 1) return node as Element
    return node?.nodeType === 3 ? node.parentElement : null
}

function parent_element(element: Element): Element | null {
    const tree = element.getRootNode()
    return element.parentElement ?? ('host' in tree ? (tree as ShadowRoot).host : null)
}

/**
 * 识别需要独占方向键或粘贴事件的编辑控件，包含嵌套内容和开放的 Shadow DOM。
 * @param target 浏览器事件目标，也可传入文本节点或当前焦点元素。
 * @returns 目标是否位于原生输入、可编辑内容或具有输入导航语义的控件中。
 */
export function is_input_target(target: EventTarget | null): boolean {
    let element = target_element(target)
    const shadowFocus = element?.shadowRoot?.activeElement
    if (shadowFocus) return is_input_target(shadowFocus)
    let editableDecided = false
    while (element) {
        if (['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'OPTGROUP'].includes(element.tagName)) return true
        const roles = (element.getAttribute('role') ?? '').toLowerCase().split(/\s+/)
        if (roles.some(role => inputRoles.has(role))) return true
        if (popupRoles.has((element.getAttribute('aria-haspopup') ?? '').toLowerCase())) return true
        if (!editableDecided && element.hasAttribute('contenteditable')) {
            const editable = (element.getAttribute('contenteditable') ?? '').toLowerCase()
            if (editable === '' || editable === 'true' || editable === 'plaintext-only') return true
            if (editable === 'false') editableDecided = true
        }
        element = parent_element(element)
    }
    return false
}

/**
 * 检查弹层及其祖先的显式可见性，避免关闭动画或隐藏弹层阻断画布。
 * @param element 候选弹层。
 * @param owner 元素所属文档。
 * @returns 弹层是否处于可交互的打开状态。
 */
function overlay_visible(element: Element, owner: Document): boolean {
    if (element.tagName === 'DIALOG' && !element.hasAttribute('open')) return false
    if (element.hasAttribute('popover')) {
        try { if (!element.matches(':popover-open')) return false } catch { return false }
    }
    let ancestor: Element | null = element
    while (ancestor) {
        if (ancestor.hasAttribute('hidden') || ancestor.hasAttribute('inert') || ancestor.getAttribute('aria-hidden') === 'true' || ancestor.getAttribute('data-state') === 'closed') return false
        const style = owner.defaultView?.getComputedStyle(ancestor)
        if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return false
        if (ancestor.tagName === 'DIALOG' && !ancestor.hasAttribute('open')) return false
        ancestor = parent_element(ancestor)
    }
    return true
}

/**
 * 检查会占用键盘交互的可见弹层，覆盖 Radix 门户和原生对话框。
 * @param owner 当前编辑器所属文档。
 * @returns 是否存在打开的对话框、菜单、列表选择器或浮层。
 */
export function has_open_overlay(owner: Document): boolean {
    return Array.from(owner.querySelectorAll(overlaySelector)).some(element => overlay_visible(element, owner))
}
