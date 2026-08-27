#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const API = process.env.NMLM_API || 'http://127.0.0.1:37129/api/call'

async function call(channel, args = {}) {
  let res
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, args })
    })
  } catch (e) {
    throw new Error(`牛马联盟桌面服务不可用：请先启动桌面端，或用 NMLM_API 指向实际 /api/call 地址。${e.message}`)
  }
  if (!res.ok) throw new Error(`桌面服务不可用或鉴权失败：HTTP ${res.status}`)
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || '调用失败')
  return json
}

function text(obj) {
  return { content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] }
}

function parseDueAt(v) {
  if (v === undefined) return undefined
  if (!v) return null
  const n = new Date(v).getTime()
  if (!Number.isFinite(n)) throw new Error('dueAt 不是合法时间')
  return n
}

function parseTime(v, label) {
  if (v == null || v === '') return undefined
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`${label} 不是合法时间`)
    return v
  }
  const n = new Date(v).getTime()
  if (!Number.isFinite(n)) throw new Error(`${label} 不是合法时间`)
  return n
}

function dayRange(dateLike) {
  const d = dateLike ? new Date(dateLike) : new Date()
  if (!Number.isFinite(d.getTime())) throw new Error('date 不是合法日期')
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return { start, end: start + 86400000 }
}

function resolveRange(a = {}) {
  if (a.date && (a.start == null && a.end == null)) return dayRange(a.date)
  const today = dayRange()
  return {
    start: parseTime(a.start, 'start') ?? today.start,
    end: parseTime(a.end, 'end') ?? today.end
  }
}

function applyLimit(items, limit = 100) {
  const n = Math.max(1, Math.min(500, Number(limit || 100)))
  return items.slice(0, n)
}

const todoShape = {
  id: { type: 'number' },
  title: { type: 'string' },
  detail: { type: 'string' },
  status: { type: 'string', enum: ['todo', 'doing', 'done'] },
  priority: { type: 'string', enum: ['low', 'medium', 'high'] },
  dueAt: { type: 'string', description: '截止时间 ISO/本地时间字符串；传空字符串可清空' },
  reminderEnabled: { type: 'boolean', description: '是否启用阶段提醒' },
  phaseStartAt: { type: 'string', description: '阶段开始时间 ISO/本地时间字符串；传空字符串可清空' },
  phaseEndAt: { type: 'string', description: '阶段结束时间 ISO/本地时间字符串；传空字符串可清空' },
  remindWindowStart: { type: 'string', description: '每日提醒开始时间，HH:mm，例如 09:00' },
  remindWindowEnd: { type: 'string', description: '每日提醒结束时间，HH:mm，例如 18:00' },
  remindIntervalMin: { type: 'number', description: '阶段提醒频率，单位分钟' }
}

const todoIdsShape = {
  ids: { type: 'array', items: { type: 'number' }, description: '待办 id 列表' }
}

function todoPayloadFromArgs(a = {}) {
  const payload = { ...a }
  if (payload.dueAt !== undefined) payload.dueAt = parseDueAt(payload.dueAt)
  if (payload.phaseStartAt !== undefined) payload.phaseStartAt = parseDueAt(payload.phaseStartAt)
  if (payload.phaseEndAt !== undefined) payload.phaseEndAt = parseDueAt(payload.phaseEndAt)
  return payload
}

const server = new Server({ name: 'nmlm', version: '0.2.1' }, { capabilities: { tools: {} } })

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'nmlm_todo_add',
      description: '向牛马联盟桌面启动器添加待办。桌面服务需正在运行。',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '待办标题' },
          detail: { type: 'string', description: '详细描述' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
          dueAt: todoShape.dueAt,
          reminderEnabled: todoShape.reminderEnabled,
          phaseStartAt: todoShape.phaseStartAt,
          phaseEndAt: todoShape.phaseEndAt,
          remindWindowStart: todoShape.remindWindowStart,
          remindWindowEnd: todoShape.remindWindowEnd,
          remindIntervalMin: todoShape.remindIntervalMin
        },
        required: ['title']
      }
    },
    {
      name: 'nmlm_todo_list',
      description: '查看牛马联盟待办列表。',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['todo', 'doing', 'done'] },
          includeDone: { type: 'boolean', default: false },
          dueOnly: { type: 'boolean', default: false },
          limit: { type: 'number', default: 100 }
        }
      }
    },
    {
      name: 'nmlm_todo_due',
      description: '查看已经到期且未完成的牛马联盟待办。',
      inputSchema: { type: 'object', properties: { now: { type: 'number', description: '可选，毫秒时间戳' } } }
    },
    {
      name: 'nmlm_todo_update',
      description: '更新牛马联盟待办。',
      inputSchema: {
        type: 'object',
        properties: todoShape,
        required: ['id']
      }
    },
    {
      name: 'nmlm_todo_close',
      description: '完成牛马联盟待办。',
      inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] }
    },
    {
      name: 'nmlm_todo_reopen',
      description: '重开已完成的牛马联盟待办。',
      inputSchema: { type: 'object', properties: { id: { type: 'number' }, status: { type: 'string', enum: ['todo', 'doing'], default: 'todo' } }, required: ['id'] }
    },
    {
      name: 'nmlm_todo_delete',
      description: '删除牛马联盟待办。',
      inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] }
    },
    {
      name: 'nmlm_todo_batch_close',
      description: '批量完成牛马联盟待办。',
      inputSchema: { type: 'object', properties: todoIdsShape, required: ['ids'] }
    },
    {
      name: 'nmlm_todo_batch_reopen',
      description: '批量重开牛马联盟待办。',
      inputSchema: { type: 'object', properties: { ...todoIdsShape, status: { type: 'string', enum: ['todo', 'doing'], default: 'todo' } }, required: ['ids'] }
    },
    {
      name: 'nmlm_todo_batch_delete',
      description: '批量物理删除牛马联盟待办。调用前应让用户确认，删除后不可恢复。',
      inputSchema: { type: 'object', properties: todoIdsShape, required: ['ids'] }
    },
    {
      name: 'nmlm_task_current',
      description: '查看当前正在记录的任务片段。',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'nmlm_ledger_list',
      description: '查询牛马联盟正式台账。台账是用户确认后的正式工时记录，活动轨迹只作辅助线索。',
      inputSchema: {
        type: 'object',
        properties: {
          date: { type: 'string', description: '可选，某一天，如 2026-08-11；提供后默认查询该日' },
          start: { type: ['string', 'number'], description: '可选，开始时间 ISO/本地时间字符串或毫秒时间戳' },
          end: { type: ['string', 'number'], description: '可选，结束时间 ISO/本地时间字符串或毫秒时间戳' },
          includeCurrent: { type: 'boolean', default: true },
          limit: { type: 'number', default: 100 }
        }
      }
    },
    {
      name: 'nmlm_evidence_list',
      description: '查询牛马联盟证据库索引。只读查询，不导入、不修改 raw 原始证据。',
      inputSchema: {
        type: 'object',
        properties: {
          date: { type: 'string', description: '可选，某一天，如 2026-08-11；提供后默认查询该日' },
          start: { type: ['string', 'number'], description: '可选，开始时间 ISO/本地时间字符串或毫秒时间戳' },
          end: { type: ['string', 'number'], description: '可选，结束时间 ISO/本地时间字符串或毫秒时间戳' },
          status: { type: 'string', description: '可选，按状态过滤，如 captured/imported/pending_review/reviewed/invalid/unsupported' },
          type: { type: 'string', description: '可选，按类型过滤，如 screenshot/image/pdf/docx/video/archive/unknown' },
          ledgerEntryId: { type: 'number', description: '可选，只看关联某条台账的证据' },
          limit: { type: 'number', default: 100 }
        }
      }
    }
  ]
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name
  const a = req.params.arguments || {}
  if (name === 'nmlm_todo_add') {
    return text(await call('todos:create', { ...todoPayloadFromArgs(a), detail: a.detail || null, priority: a.priority || 'medium', source: 'agent' }))
  }
  if (name === 'nmlm_todo_list') return text(await call('todos:list', a))
  if (name === 'nmlm_todo_due') return text(await call('todos:due', { now: a.now }))
  if (name === 'nmlm_todo_update') return text(await call('todos:update', todoPayloadFromArgs(a)))
  if (name === 'nmlm_todo_close') return text(await call('todos:close', { id: a.id }))
  if (name === 'nmlm_todo_reopen') return text(await call('todos:reopen', { id: a.id, status: a.status || 'todo' }))
  if (name === 'nmlm_todo_delete') return text(await call('todos:delete', { id: a.id }))
  if (name === 'nmlm_todo_batch_close') return text(await call('todos:batchClose', { ids: a.ids || [] }))
  if (name === 'nmlm_todo_batch_reopen') return text(await call('todos:batchReopen', { ids: a.ids || [], status: a.status || 'todo' }))
  if (name === 'nmlm_todo_batch_delete') return text(await call('todos:batchDelete', { ids: a.ids || [] }))
  if (name === 'nmlm_task_current') return text(await call('ledger:current'))
  if (name === 'nmlm_ledger_list') {
    const range = resolveRange(a)
    if (range.end <= range.start) throw new Error('结束时间必须晚于开始时间')
    const r = await call('ledger:list', range)
    const entries = applyLimit((r.entries || []).filter((e) => a.includeCurrent !== false || e.end_time), a.limit)
    return text({ ok: true, range, entries })
  }
  if (name === 'nmlm_evidence_list') {
    const range = resolveRange(a)
    if (range.end <= range.start) throw new Error('结束时间必须晚于开始时间')
    const r = await call('evidence:list', range)
    let items = r.screenshots || r.items || []
    if (a.status) items = items.filter((x) => x.status === a.status || x.review_status === a.status)
    if (a.type) items = items.filter((x) => x.type === a.type || x.source_type === a.type)
    if (a.ledgerEntryId != null) items = items.filter((x) => Number(x.ledger_entry_id) === Number(a.ledgerEntryId))
    return text({ ok: true, range, evidence: applyLimit(items, a.limit), note: '只读查询结果；MCP 不提供证据导入，raw 原始证据不会被修改。' })
  }
  throw new Error(`未知工具：${name}`)
})

await server.connect(new StdioServerTransport())
