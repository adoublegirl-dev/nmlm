// 待办服务：桌面端、浏览器端、MCP 桥共用。
const { todosRepo } = require('../db')

let emitter = null
function attachEventSender(fn) { emitter = fn }
function emit(type, todo) { if (emitter) emitter({ type, todo }) }

function list(args = {}) {
  return { ok: true, todos: todosRepo.list(args) }
}

function create({ title, detail = null, priority = 'medium', dueAt = null, source = 'desktop' } = {}) {
  if (!title || !String(title).trim()) return { ok: false, error: '标题不能为空' }
  const todo = todosRepo.create({ title: String(title).trim(), detail, priority, dueAt, source })
  emit('created', todo)
  return { ok: true, todo }
}

function update({ id, ...patch } = {}) {
  if (!id) return { ok: false, error: '缺少 id' }
  const todo = todosRepo.update(id, patch)
  emit('updated', todo)
  return { ok: true, todo }
}

function close({ id } = {}) {
  if (!id) return { ok: false, error: '缺少 id' }
  const todo = todosRepo.update(id, { status: 'done' })
  emit('closed', todo)
  return { ok: true, todo }
}

function remove({ id } = {}) {
  if (!id) return { ok: false, error: '缺少 id' }
  todosRepo.remove(id)
  emit('deleted', { id })
  return { ok: true }
}

function due(now = Date.now()) {
  return { ok: true, todos: todosRepo.dueForReminder(now) }
}

module.exports = { attachEventSender, list, create, update, close, remove, due }
