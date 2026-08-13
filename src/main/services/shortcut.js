// 快捷键服务：注册/注销全局快捷键，冲突检测与上报。
const { globalShortcut } = require('electron')
const settings = require('./settings')

const HANDLERS = {} // accelerator -> fn
let LAST_HANDLER_MAP = null

function currentMap() {
  return settings.get('shortcuts')
}

// 注册全部快捷键（启动与配置变更时调用）
function registerAll(handlerMap) {
  LAST_HANDLER_MAP = handlerMap || LAST_HANDLER_MAP
  unregisterAll()
  const map = currentMap()
  const failed = []
  for (const [name, acc] of Object.entries(map)) {
    const fn = handlerMap[name]
    if (!acc || !fn) continue
    if (!register(acc, fn)) failed.push({ name, accelerator: acc })
    else console.log(`[niuma] 快捷键已注册: ${name} -> ${acc}`)
  }
  return failed
}

function register(accelerator, fn) {
  if (HANDLERS[accelerator]) {
    globalShortcut.unregister(accelerator)
    delete HANDLERS[accelerator]
  }
  let ok = false
  try {
    ok = globalShortcut.register(accelerator, fn)
  } catch (e) {
    ok = false
  }
  if (ok) HANDLERS[accelerator] = fn
  return ok
}

function unregisterAll() {
  globalShortcut.unregisterAll()
  for (const k of Object.keys(HANDLERS)) delete HANDLERS[k]
}

function findDuplicate(name, accelerator, map = currentMap()) {
  if (!accelerator) return null
  const normalized = String(accelerator).toLowerCase()
  for (const [key, val] of Object.entries(map || {})) {
    if (key !== name && val && String(val).toLowerCase() === normalized) return key
  }
  return null
}

function updateShortcut(name, accelerator) {
  if (!name) return { ok: false, error: '缺少快捷键名称' }
  const oldMap = { ...(currentMap() || {}) }
  if (!(name in oldMap)) return { ok: false, error: `未知快捷键：${name}` }
  const next = { ...oldMap, [name]: accelerator || '' }
  const dup = findDuplicate(name, accelerator, oldMap)
  if (dup) return { ok: false, error: `快捷键已被「${dup}」占用` }
  settings.set('shortcuts', next)
  const failed = registerAll(LAST_HANDLER_MAP)
  if (failed.length) {
    settings.set('shortcuts', oldMap)
    registerAll(LAST_HANDLER_MAP)
    const hit = failed.find((f) => f.name === name) || failed[0]
    return { ok: false, error: `快捷键注册失败，可能被系统或其他软件占用：${hit.accelerator}` }
  }
  return { ok: true, shortcuts: next }
}

module.exports = { registerAll, register, unregisterAll, currentMap, updateShortcut, findDuplicate }
