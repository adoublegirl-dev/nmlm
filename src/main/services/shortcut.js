// 快捷键服务：注册/注销全局快捷键，冲突检测与上报。
const { globalShortcut } = require('electron')
const settings = require('./settings')

const HANDLERS = {} // accelerator -> fn

function currentMap() {
  return settings.get('shortcuts')
}

// 注册全部快捷键（启动与配置变更时调用）
function registerAll(handlerMap) {
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
  const ok = globalShortcut.register(accelerator, fn)
  if (ok) HANDLERS[accelerator] = fn
  return ok
}

function unregisterAll() {
  globalShortcut.unregisterAll()
  for (const k of Object.keys(HANDLERS)) delete HANDLERS[k]
}

module.exports = { registerAll, register, unregisterAll, currentMap }
