// 设置服务：默认值合并 + 读写 + 变更广播。
const { DEFAULT_SETTINGS } = require('../../shared/constants')
const { settingsRepo } = require('../db')

let cache = null

function load() {
  if (cache) return cache
  const stored = settingsRepo.all()
  cache = deepMerge(structuredClone(DEFAULT_SETTINGS), stored)
  return cache
}

function reload() {
  cache = null
  return load()
}

function getAll() {
  return load()
}

function get(keyPath) {
  return keyPath.split('.').reduce((o, k) => (o == null ? o : o[k]), load())
}

function set(keyPath, value) {
  const keys = keyPath.split('.')
  const root = keys[0]
  const target = load()
  let node = target
  for (let i = 0; i < keys.length - 1; i++) {
    if (node[keys[i]] == null || typeof node[keys[i]] !== 'object') node[keys[i]] = {}
    node = node[keys[i]]
  }
  node[keys[keys.length - 1]] = value
  settingsRepo.set(root, target[root])
  broadcast(root, value)
  return value
}

function setRaw(key, value) {
  settingsRepo.set(key, value)
  cache = null
  return load()
}

let emitter = null
function attachEventSender(fn) {
  emitter = fn
}
function broadcast(key, value) {
  if (emitter) emitter({ key, value })
}

function deepMerge(base, override) {
  const out = Array.isArray(base) ? [...base] : { ...base }
  for (const [k, v] of Object.entries(override || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
      out[k] = deepMerge(base[k], v)
    } else {
      out[k] = v
    }
  }
  return out
}

// 崩溃恢复：应用启动时调用，将未完成记录归档
function recoverUnfinished(now = Date.now()) {
  const { entriesRepo, tagsRepo } = require('../db')
  const unfinished = entriesRepo.allUnfinished()
  for (const e of unfinished) {
    const other = tagsRepo.findOtherTag()
    entriesRepo.finish(e.id, {
      endTime: now,
      durationSec: Math.max(0, Math.floor((now - e.start_time) / 1000)),
      tagId: other ? other.id : null,
      detail: '[崩溃恢复]',
      windowTitle: null,
      isFragment: 0
    })
  }
  return unfinished.length
}

module.exports = { getAll, get, set, setRaw, reload, attachEventSender, recoverUnfinished }
