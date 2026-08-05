// 快捷工具服务：入口 CRUD + 一键打开浏览器。
const { shell } = require('electron')
const settings = require('./settings')

function list() {
  return settings.get('tools') || []
}

function open(id) {
  const tool = list().find((t) => t.id === id)
  if (!tool) return { ok: false, error: '工具不存在' }
  const url = String(tool.url || '')
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: '仅支持 http/https 地址' }
  shell.openExternal(url)
  return { ok: true }
}

function create({ name, url, group = '效率' }) {
  if (!name || !/^https?:\/\//i.test(String(url || ''))) {
    return { ok: false, error: '参数不合法' }
  }
  const tools = list()
  const tool = { id: `t${Date.now().toString(36)}`, name, url, group }
  tools.push(tool)
  settings.set('tools', tools)
  return { ok: true, tool }
}

function update(id, patch) {
  const tools = list()
  const idx = tools.findIndex((t) => t.id === id)
  if (idx < 0) return { ok: false, error: '工具不存在' }
  const url = patch.url !== undefined ? patch.url : tools[idx].url
  if (!/^https?:\/\//i.test(String(url || ''))) return { ok: false, error: '仅支持 http/https 地址' }
  tools[idx] = { ...tools[idx], ...patch }
  settings.set('tools', tools)
  return { ok: true, tool: tools[idx] }
}

function remove(id) {
  const tools = list().filter((t) => t.id !== id)
  settings.set('tools', tools)
  return { ok: true }
}

module.exports = { list, open, create, update, remove }
