// 待办服务：桌面端、浏览器端、MCP 桥共用。
const { todosRepo } = require('../db')

const STATUSES = new Set(['todo', 'doing', 'done'])
const PRIORITIES = new Set(['low', 'medium', 'high'])
const SOURCES = new Set(['desktop', 'agent', 'mcp'])

let emitter = null
function attachEventSender(fn) { emitter = fn }
function emit(type, todo) { if (emitter) emitter({ type, todo }) }

function normalizeDueAt(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : NaN
}

function validatePatch(patch, { requireTitle = false } = {}) {
  const out = { ...patch }
  if (requireTitle || out.title !== undefined) {
    if (!out.title || !String(out.title).trim()) return { ok: false, error: '标题不能为空' }
    out.title = String(out.title).trim()
  }
  if (out.detail !== undefined) out.detail = out.detail == null || out.detail === '' ? null : String(out.detail)
  if (out.status !== undefined && !STATUSES.has(out.status)) return { ok: false, error: '状态必须是 todo / doing / done' }
  if (out.priority !== undefined && !PRIORITIES.has(out.priority)) return { ok: false, error: '优先级必须是 low / medium / high' }
  if (out.source !== undefined && !SOURCES.has(out.source)) return { ok: false, error: '来源必须是 desktop / agent / mcp' }
  if (out.dueAt !== undefined) {
    out.dueAt = normalizeDueAt(out.dueAt)
    if (Number.isNaN(out.dueAt)) return { ok: false, error: '截止时间不合法' }
    // 截止时间变化后允许再次提醒。
    out.remindedAt = null
  }
  if (out.remindedAt !== undefined) {
    out.remindedAt = normalizeDueAt(out.remindedAt)
    if (Number.isNaN(out.remindedAt)) return { ok: false, error: '提醒时间不合法' }
  }
  if (out.snoozeUntil !== undefined) {
    out.snoozeUntil = normalizeDueAt(out.snoozeUntil)
    if (Number.isNaN(out.snoozeUntil)) return { ok: false, error: '稍后提醒时间不合法' }
  }
  return { ok: true, patch: out }
}

function list(args = {}) {
  return { ok: true, todos: todosRepo.list(args) }
}

function create({ title, detail = null, status = 'todo', priority = 'medium', dueAt = null, source = 'desktop' } = {}) {
  const v = validatePatch({ title, detail, status, priority, dueAt, source }, { requireTitle: true })
  if (!v.ok) return v
  const todo = todosRepo.create(v.patch)
  emit('created', todo)
  return { ok: true, todo }
}

function update({ id, ...patch } = {}) {
  if (!id) return { ok: false, error: '缺少 id' }
  if (!todosRepo.get(id)) return { ok: false, error: '待办不存在' }
  const v = validatePatch(patch)
  if (!v.ok) return v
  const todo = todosRepo.update(id, v.patch)
  emit('updated', todo)
  return { ok: true, todo }
}

function close({ id } = {}) {
  if (!id) return { ok: false, error: '缺少 id' }
  if (!todosRepo.get(id)) return { ok: false, error: '待办不存在' }
  const todo = todosRepo.update(id, { status: 'done' })
  emit('closed', todo)
  return { ok: true, todo }
}

function reopen({ id, status = 'todo' } = {}) {
  if (!id) return { ok: false, error: '缺少 id' }
  if (!STATUSES.has(status) || status === 'done') return { ok: false, error: '重开状态必须是 todo 或 doing' }
  if (!todosRepo.get(id)) return { ok: false, error: '待办不存在' }
  const todo = todosRepo.update(id, { status, remindedAt: null })
  emit('reopened', todo)
  return { ok: true, todo }
}

function remove({ id } = {}) {
  if (!id) return { ok: false, error: '缺少 id' }
  if (!todosRepo.get(id)) return { ok: false, error: '待办不存在' }
  todosRepo.remove(id)
  emit('deleted', { id })
  return { ok: true }
}

function due(now = Date.now()) {
  return { ok: true, todos: todosRepo.dueForReminder(now) }
}

function markReminded({ id, remindedAt = Date.now() } = {}) {
  return update({ id, remindedAt })
}

function snooze({ id, minutes = 10 } = {}) {
  const n = Math.max(1, Number(minutes) || 10)
  return update({ id, snoozeUntil: Date.now() + n * 60 * 1000, remindedAt: null })
}

module.exports = { attachEventSender, list, create, update, close, reopen, remove, due, markReminded, snooze }
