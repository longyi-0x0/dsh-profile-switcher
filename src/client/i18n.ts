import type { ApiErrorCode, RuntimeErrorCode } from '../shared/protocol'

/** Locale namespace registered with the Host locale service. */
export const NS = 'profile-switcher'

/** Translator injected by the slot system when a registration declares `locale`. */
export type Translate = (key: string) => string

/** Every failure the Client can render. Host codes are carried through unchanged. */
export type ClientErrorCode =
  | ApiErrorCode
  | RuntimeErrorCode
  | 'request-failed'
  | 'unsupported-host'
  | 'unauthorized'
  | 'embed-failed'
  | 'embed-timeout'
  | 'guest-gone'
  | 'server-stopped'
  | 'popup-blocked'

/** English dictionary; its keys are the compile-time `MessageKey` union. */
export const en = {
  'button.tip': 'Switch profile',
  'button.profileFallback': 'profile',
  'menu.title': 'Switch profile',
  'menu.loading': 'Reading profiles…',
  'menu.empty': 'No other profiles found',
  'menu.retry': 'Retry',
  'menu.current': 'Current',
  'menu.running': 'Running',
  'menu.starting': 'Starting',
  'menu.error': 'Failed',
  'menu.currentUnknown': 'Unknown profile',
  'menu.new': 'New profile',
  'menu.newTitle': 'New profile in {home}',
  'menu.newPlaceholder': 'profile name',
  'menu.newName': 'Profile name',
  'menu.nameHint':
    'Start with a letter or digit; then up to 64 letters, digits, dots, dashes, or underscores',
  'menu.create': 'Create',
  'menu.creating': 'Creating…',
  'menu.cancel': 'Cancel',
  'menu.delete': 'Delete {name}',
  'menu.deleteConfirm': 'Delete?',
  'menu.deleteConfirmLabel': 'Confirm deleting {name}',
  'menu.deleting': 'Deleting {name}…',
  'embed.starting': 'Starting {name}…',
  'embed.loading': 'Opening {name}…',
  'embed.failed': 'Could not open {name}',
  'embed.back': 'Back to default',
  'embed.openExternal': 'Open in browser',
  'embed.newWindow': 'Open in new window',
  'embed.cancelHint': 'Use the top-left button to go back',
  'embed.retry': 'Retry',
  'embed.region': 'Embedded profile interface',
  'notice.webFallback': 'Opened in the browser; this environment cannot embed another profile',
  'notice.windowFallback': 'Could not open a new window; the target opened in the browser',
  'error.notFound': 'Profile not found',
  'error.isCurrent': 'This profile is already in use',
  'error.profileExists': 'A profile with that name already exists',
  'error.notReady': 'The profile is still starting; try again in a moment',
  'error.profileReserved': 'The desktop profile is managed by the app and cannot be changed',
  'error.createFailed': 'Could not create the profile',
  'error.deleteFailed': 'Could not delete the profile',
  'error.invalidName': 'Invalid profile name',
  'error.unknownHome': 'Unknown profile directory',
  'error.launcherMissing':
    'No dsh launcher was found; check the installation or set config.dshPath',
  'error.tooMany': 'Too many profiles are running at once',
  'error.requestFailed': 'Request failed',
  'error.unsupportedHost': 'This Harness version does not support the plugin; upgrade DSH',
  'error.unauthorized': 'The session expired; refresh the page and try again',
  'error.spawnFailed': 'Could not start the profile server',
  'error.startTimeout': 'Timed out while starting; try again',
  'error.exited': 'The profile server exited',
  'error.stopped': 'The profile server stopped',
  'error.embedFailed': 'The embedded window failed to open',
  'error.embedTimeout': 'The embedded window took too long to load',
  'error.guestGone': 'The embedded page exited',
  'error.serverStopped': 'The target server stopped; try again',
  'error.popupBlocked': 'The browser blocked the new window; allow pop-ups and retry',
  'error.payloadTooLarge': 'The request body was too large',
  'error.invalidJson': 'The request body was not valid JSON',
  'error.internal': 'Internal plugin error',
  'diagnostic.launcherMissing': 'No dsh launcher found; profile switching is unavailable',
  'diagnostic.currentUnknown': 'Could not identify the current profile',
  'diagnostic.noHomes': 'No DSH home was found',
  'diagnostic.noProfiles': 'No switchable profiles were found',
} as const

/** Chinese dictionary; must cover every key of {@link en}. */
export const zh: Record<MessageKey, string> = {
  'button.tip': '切换配置',
  'button.profileFallback': '配置',
  'menu.title': '切换配置',
  'menu.loading': '正在读取配置…',
  'menu.empty': '没有找到其他配置',
  'menu.retry': '重试',
  'menu.current': '当前',
  'menu.running': '运行中',
  'menu.starting': '启动中',
  'menu.error': '启动失败',
  'menu.currentUnknown': '未知配置',
  'menu.new': '新建配置',
  'menu.newTitle': '在 {home} 新建配置',
  'menu.newPlaceholder': '配置名',
  'menu.newName': '配置名',
  'menu.nameHint': '字母或数字开头，可含字母、数字、点、横线、下划线，最长 64 个字符',
  'menu.create': '新建',
  'menu.creating': '正在新建…',
  'menu.cancel': '取消',
  'menu.delete': '删除 {name}',
  'menu.deleteConfirm': '确认删除?',
  'menu.deleteConfirmLabel': '确认删除 {name}',
  'menu.deleting': '正在删除 {name}…',
  'embed.starting': '正在启动 {name}…',
  'embed.loading': '正在打开 {name}…',
  'embed.failed': '无法打开 {name}',
  'embed.back': '返回默认配置',
  'embed.openExternal': '在浏览器打开',
  'embed.newWindow': '在新窗口打开',
  'embed.cancelHint': '可点击左上角返回',
  'embed.retry': '重试',
  'embed.region': '已内嵌的配置界面',
  'notice.webFallback': '已在浏览器中打开；当前环境不支持内嵌其他配置',
  'notice.windowFallback': '无法打开新窗口，已改为在浏览器中打开',
  'error.notFound': '找不到这个配置',
  'error.isCurrent': '这个配置正在使用中',
  'error.profileExists': '同名配置已存在',
  'error.notReady': '配置还在启动中，请稍后重试',
  'error.profileReserved': 'desktop 配置由应用管理，不能修改',
  'error.createFailed': '无法创建配置',
  'error.deleteFailed': '无法删除配置',
  'error.invalidName': '配置名称不合法',
  'error.unknownHome': '未知的配置目录',
  'error.launcherMissing': '无法定位 dsh 启动器，请检查安装或设置 config.dshPath',
  'error.tooMany': '同时运行的配置数量已达上限',
  'error.requestFailed': '请求失败',
  'error.unsupportedHost': '当前 Harness 版本不支持该插件，请升级 DSH',
  'error.unauthorized': '会话已失效，请刷新页面后重试',
  'error.spawnFailed': '无法启动配置服务器',
  'error.startTimeout': '启动超时，请稍后重试',
  'error.exited': '配置服务器已退出',
  'error.stopped': '配置服务器已停止',
  'error.embedFailed': '内嵌窗口打开失败',
  'error.embedTimeout': '内嵌窗口加载超时',
  'error.guestGone': '内嵌页面已退出',
  'error.serverStopped': '目标服务器已停止，请重试',
  'error.popupBlocked': '浏览器阻止了新窗口，请允许弹窗后重试',
  'error.payloadTooLarge': '请求内容过大',
  'error.invalidJson': '请求格式错误',
  'error.internal': '插件内部错误',
  'diagnostic.launcherMissing': '未找到 dsh 启动器，配置切换不可用',
  'diagnostic.currentUnknown': '无法识别当前配置',
  'diagnostic.noHomes': '没有找到任何 DSH home',
  'diagnostic.noProfiles': '没有找到可切换的配置',
}

/** Translation key union. */
export type MessageKey = keyof typeof en

/** Error code to dictionary key. */
const ERROR_KEYS: Record<ClientErrorCode, MessageKey> = {
  'invalid-json': 'error.invalidJson',
  'invalid-body': 'error.invalidJson',
  'payload-too-large': 'error.payloadTooLarge',
  'unknown-home': 'error.unknownHome',
  'invalid-profile-name': 'error.invalidName',
  'profile-not-found': 'error.notFound',
  'profile-is-current': 'error.isCurrent',
  'profile-exists': 'error.profileExists',
  'profile-not-ready': 'error.notReady',
  'profile-reserved': 'error.profileReserved',
  'profile-create-failed': 'error.createFailed',
  'profile-delete-failed': 'error.deleteFailed',
  'too-many-profiles': 'error.tooMany',
  'launcher-unavailable': 'error.launcherMissing',
  'internal-error': 'error.internal',
  'spawn-failed': 'error.spawnFailed',
  'start-timeout': 'error.startTimeout',
  exited: 'error.exited',
  stopped: 'error.stopped',
  'request-failed': 'error.requestFailed',
  'unsupported-host': 'error.unsupportedHost',
  unauthorized: 'error.unauthorized',
  'embed-failed': 'error.embedFailed',
  'embed-timeout': 'error.embedTimeout',
  'guest-gone': 'error.guestGone',
  'server-stopped': 'error.serverStopped',
  'popup-blocked': 'error.popupBlocked',
}

/**
 * Resolve one message, falling back to the bundled English dictionary and then to
 * the key itself. Interpolation uses `{name}` placeholders.
 *
 * @param translate - translator injected by the slot system (may be absent).
 * @param key - message key.
 * @param params - interpolation values.
 * @returns localized text.
 */
export function message(
  translate: Translate | undefined,
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>,
): string {
  let text: string | undefined
  if (translate !== undefined) {
    try {
      text = translate(key)
    } catch {
      text = undefined
    }
  }
  if (typeof text !== 'string' || text === '' || text === key) text = en[key]
  if (params !== undefined) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value))
    }
  }
  return text
}

/**
 * Localize a Client error code.
 * @param translate - translator.
 * @param code - error code.
 * @returns localized message.
 */
export function errorMessage(translate: Translate | undefined, code: ClientErrorCode): string {
  return message(translate, ERROR_KEYS[code])
}

/**
 * Normalize an unknown error's code into a renderable code.
 * @param code - candidate code.
 * @returns a known code, or `request-failed`.
 */
export function asClientErrorCode(code: string | undefined): ClientErrorCode {
  if (code !== undefined && code in ERROR_KEYS) return code as ClientErrorCode
  return 'request-failed'
}

/** Diagnostic code to dictionary key. Unknown codes are not rendered. */
const DIAGNOSTIC_KEYS: Partial<Record<string, MessageKey>> = {
  'launcher-missing': 'diagnostic.launcherMissing',
  'current-profile-unknown': 'diagnostic.currentUnknown',
  'no-homes': 'diagnostic.noHomes',
  'no-profiles': 'diagnostic.noProfiles',
}

/**
 * Localize a Host diagnostic code.
 * @param translate - translator.
 * @param code - diagnostic code.
 * @returns localized text, or null when the code is unknown.
 */
export function diagnosticMessage(translate: Translate | undefined, code: string): string | null {
  const key = DIAGNOSTIC_KEYS[code]
  return key === undefined ? null : message(translate, key)
}
