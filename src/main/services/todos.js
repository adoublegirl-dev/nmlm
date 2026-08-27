// 待办服务：桌面端、浏览器端、MCP 桥共用。
const { todosRepo } = require('../db')

const STATUSES = new Set(['todo', 'doing', 'done'])
const PRIORITIES = new Set(['low', 'medium', 'high'])
const SOURCES = new Set(['desktop', 'agent', 'mcp'])
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

let emitter = null
function attachEventSender(fn) { emitter = fn }
function emit(type, todo) { if (emitter) emitter({ type, todo }) }

function normalizeDueAt(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : NaN
}
function normalizeBool(v) { return v ? 1 : 0 }
function normalizeInterval(v) { return Math.max(5, Math.min(1440, Math.round(Number(v) || 120))) }
function normalizeTimeText(v, fallback) {
  const text = String(v || fallback || '').trim()
  return TIME_RE.test(text) ? text : null
}
function normalizeIds(ids) {
  const list = Array.isArray(ids) ? ids : [ids]
  return [...new Set(list.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0))]
}

function validatePatch(patch, { requireTitle = false } = {}) {
  const out = { ...patch }
  if (requireTitle || out.title !== undefined) {
    if (!out.title || !String(out.title).trim()) return { ok: false, error: '标题不能为空' }
    out.title = String(out.title).trim()
  }
  if (out.detail !== undefined) out.detail = out.detail == null || out.detail === '' ? null : String(out.detail)
  if (out.status !== undefined && !STATUSES.has(out.status)) return { ok: false, error: '状态必须是待处理 / 进行中 / 已完成' }
  if (out.priority !== undefined && !PRIORITIES.has(out.priority)) return { ok: false, error: '优先级必须是低 / 中 / 高' }
  if (out.source !== undefined && !SOURCES.has(out.source)) return { ok: false, error: '来源必须是 desktop / agent / mcp' }
  if (out.dueAt !== undefined) {
    out.dueAt = normalizeDueAt(out.dueAt)
    if (Number.isNaN(out.dueAt)) return { ok: false, error: '截止时间不合法' }
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
  if (out.phaseStartAt !== undefined) {
    out.phaseStartAt = normalizeDueAt(out.phaseStartAt)
    if (Number.isNaN(out.phaseStartAt)) return { ok: false, error: '阶段开始时间不合法' }
  }
  if (out.phaseEndAt !== undefined) {
    out.phaseEndAt = normalizeDueAt(out.phaseEndAt)
    if (Number.isNaN(out.phaseEndAt)) return { ok: false, error: '阶段结束时间不合法' }
  }
  if (out.phaseStartAt != null && out.phaseEndAt != null && out.phaseEndAt < out.phaseStartAt) return { ok: false, error: '阶段结束不能早于阶段开始' }
  if (out.reminderEnabled !== undefined) out.reminderEnabled = normalizeBool(out.reminderEnabled)
  if (out.remindWindowStart !== undefined) {
    out.remindWindowStart = normalizeTimeText(out.remindWindowStart, '09:00')
    if (!out.remindWindowStart) return { ok: false, error: '每日提醒开始时间不合法' }
  }
  if (out.remindWindowEnd !== undefined) {
    out.remindWindowEnd = normalizeTimeText(out.remindWindowEnd, '18:00')
    if (!out.remindWindowEnd) return { ok: false, error: '每日提醒结束时间不合法' }
  }
  if (out.remindIntervalMin !== undefined) out.remindIntervalMin = normalizeInterval(out.remindIntervalMin)
  if (out.lastPhaseRemindedAt !== undefined) {
    out.lastPhaseRemindedAt = normalizeDueAt(out.lastPhaseRemindedAt)
    if (Number.isNaN(out.lastPhaseRemindedAt)) return { ok: false, error: '阶段提醒时间不合法' }
  }
  if (out.phaseCompletedAt !== undefined) {
    out.phaseCompletedAt = normalizeDueAt(out.phaseCompletedAt)
    if (Number.isNaN(out.phaseCompletedAt)) return { ok: false, error: '阶段完成时间不合法' }
  }
  return { ok: true, patch: out }
}

function list(args = {}) {
  autoCompleteExpiredPhases(Date.now())
  return { ok: true, todos: todosRepo.list(args) }
}

function create({ title, detail = null, status = 'todo', priority = 'medium', dueAt = null, source = 'desktop', reminderEnabled = 0, phaseStartAt = null, phaseEndAt = null, remindWindowStart = '09:00', remindWindowEnd = '18:00', remindIntervalMin = 120 } = {}) {
  const v = validatePatch({ title, detail, status, priority, dueAt, source, reminderEnabled, phaseStartAt, phaseEndAt, remindWindowStart, remindWindowEnd, remindIntervalMin }, { requireTitle: true })
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
  if (!STATUSES.has(status) || status === 'done') return { ok: false, error: '重开状态必须是待处理或进行中' }
  if (!todosRepo.get(id)) return { ok: false, error: '待办不存在' }
  const todo = todosRepo.update(id, { status, remindedAt: null, phaseCompletedAt: null })
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

function batchClose({ ids = [] } = {}) {
  const list = normalizeIds(ids)
  if (!list.length) return { ok: false, error: '请选择待办' }
  const todos = []
  for (const id of list) {
    const t = todosRepo.get(id)
    if (!t) continue
    todos.push(todosRepo.update(id, { status: 'done' }))
  }
  emit('batch-closed', { ids: todos.map((t) => t.id), count: todos.length })
  return { ok: true, count: todos.length, todos }
}

function batchReopen({ ids = [], status = 'todo' } = {}) {
  const list = normalizeIds(ids)
  if (!list.length) return { ok: false, error: '请选择待办' }
  if (!STATUSES.has(status) || status === 'done') return { ok: false, error: '重开状态必须是待处理或进行中' }
  const todos = []
  for (const id of list) {
    const t = todosRepo.get(id)
    if (!t) continue
    todos.push(todosRepo.update(id, { status, remindedAt: null, phaseCompletedAt: null }))
  }
  emit('batch-reopened', { ids: todos.map((t) => t.id), count: todos.length })
  return { ok: true, count: todos.length, todos }
}

function batchDelete({ ids = [] } = {}) {
  const list = normalizeIds(ids)
  if (!list.length) return { ok: false, error: '请选择待办' }
  todosRepo.removeMany(list)
  emit('batch-deleted', { ids: list, count: list.length })
  return { ok: true, count: list.length }
}

function isInWindow(now, startText, endText) {
  const d = new Date(now)
  const minutes = d.getHours() * 60 + d.getMinutes()
  const [sh, sm] = String(startText || '09:00').split(':').map(Number)
  const [eh, em] = String(endText || '18:00').split(':').map(Number)
  const start = sh * 60 + sm
  const end = eh * 60 + em
  return start <= end ? (minutes >= start && minutes <= end) : (minutes >= start || minutes <= end)
}

function phaseDueForReminder(now = Date.now()) {
  const candidates = todosRepo.activePhaseReminders(now)
  return candidates.filter((t) => {
    if (!isInWindow(now, t.remind_window_start, t.remind_window_end)) return false
    const last = Number(t.last_phase_reminded_at || 0)
    const gap = Math.max(5, Number(t.remind_interval_min || 120)) * 60 * 1000
    return !last || now - last >= gap
  })
}

function autoCompleteExpiredPhases(now = Date.now()) {
  const expired = todosRepo.expiredPhases(now)
  const completed = []
  for (const t of expired) {
    const todo = todosRepo.update(t.id, { status: 'done', phaseCompletedAt: t.phase_end_at || now, closedAt: t.phase_end_at || now })
    completed.push(todo)
    emit('phase-completed', todo)
  }
  return { ok: true, count: completed.length, todos: completed }
}

function due(now = Date.now()) {
  autoCompleteExpiredPhases(now)
  return { ok: true, todos: [...todosRepo.dueForReminder(now), ...phaseDueForReminder(now)] }
}

function markReminded({ id, remindedAt = Date.now(), kind = 'due' } = {}) {
  return kind === 'phase' ? update({ id, lastPhaseRemindedAt: remindedAt }) : update({ id, remindedAt })
}

function snooze({ id, minutes = 10 } = {}) {
  const n = Math.max(1, Number(minutes) || 10)
  return update({ id, snoozeUntil: Date.now() + n * 60 * 1000, remindedAt: null })
}

module.exports = { attachEventSender, list, create, update, close, reopen, remove, batchClose, batchReopen, batchDelete, due, markReminded, snooze, autoCompleteExpiredPhases }
