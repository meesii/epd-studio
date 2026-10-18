import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const project_root = fileURLToPath(new URL('../', import.meta.url))
const config_path = path.join(project_root, 'tsconfig.json')
const config = ts.readConfigFile(config_path, ts.sys.readFile)
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, project_root)
if (parsed.errors.length) throw new Error(parsed.errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'))
const program = ts.createProgram(parsed.fileNames, parsed.options)
const checker = program.getTypeChecker()
const source_files = new Set(parsed.fileNames.map(file => path.resolve(file)))
const native_interfaces = {
    'src/lib/ble/types.ts': {
        EpdCharacteristic: new Set(['startNotifications', 'stopNotifications', 'readValue', 'writeValueWithResponse', 'writeValueWithoutResponse']),
        EpdBluetoothDevice: new Set(['connect', 'disconnect', 'getPrimaryService', 'getCharacteristic']),
        BluetoothProvider: new Set(['requestDevice', 'getDevices']),
    },
    'src/lib/auto-reconnect.ts': {
        PreferenceStore: new Set(['getItem', 'setItem']),
    },
}
const violations = []

/**
 * 识别浏览器结构适配接口和第三方对象约定的成员名，避免要求修改外部 API。
 * @param {ts.Node} node 待检查的具名声明。
 * @returns {boolean} 该声明是否使用外部接口规定的名称。
 */
function is_external_name(node) {
    const file = path.relative(project_root, node.getSourceFile().fileName).replaceAll('\\', '/')
    for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
        if (ts.isInterfaceDeclaration(ancestor) && native_interfaces[file]?.[ancestor.name.text]?.has(node.name.text)) return true
    }
    if ((ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node) || ts.isShorthandPropertyAssignment(node)) && ts.isObjectLiteralExpression(node.parent)) {
        const context = checker.getContextualType(node.parent)
        const member = context && checker.getNonNullableType(context).getProperty(node.name.text)
        return member?.declarations?.some(declaration => !source_files.has(path.resolve(declaration.getSourceFile().fileName))) ?? false
    }
    return false
}

/**
 * 按实际可调用类型检查声明，覆盖高阶函数、状态 setter、自有回调属性及可选函数。
 * @param {ts.Node} node 当前语法节点。
 * @param {ts.SourceFile} source 所属源文件。
 * @returns {void} 违规项会加入检查结果。
 */
function check_node(node, source) {
    const named = ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node)
        || ts.isVariableDeclaration(node) || ts.isBindingElement(node) || ts.isParameter(node) || ts.isPropertyDeclaration(node)
        || ts.isPropertySignature(node) || ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)
    if (named && node.name && ts.isIdentifier(node.name)) {
        const name = node.name.text
        const callable = checker.getNonNullableType(checker.getTypeAtLocation(node.name)).getCallSignatures().length > 0
        if (callable && !/^[A-Z]/.test(name) && !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(name) && !is_external_name(node)) {
            const location = source.getLineAndCharacterOfPosition(node.name.getStart(source))
            violations.push(`${path.relative(project_root, source.fileName)}:${location.line + 1}:${location.character + 1} ${name}`)
        }
    }
    ts.forEachChild(node, child => check_node(child, source))
}

for (const source of program.getSourceFiles()) {
    if (source_files.has(path.resolve(source.fileName))) check_node(source, source)
}
if (violations.length) {
    console.error('以下自有函数应使用 snake_case：\n' + violations.join('\n'))
    process.exitCode = 1
} else {
    console.log('函数命名检查通过。')
}
