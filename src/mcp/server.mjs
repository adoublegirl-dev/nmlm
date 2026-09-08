#!/usr/bin/env node
// 零外部依赖 MCP stdio server：可由 Node 或 ELECTRON_RUN_AS_NODE 直接启动。
// stdout 只输出 JSON-RPC；诊断信息必须写入 stderr，避免污染 MCP 协议流。
import http from 'node:http'
import https from 'node:https'
import readline from 'node:readline'

const API = process.env.NMLM_API || 'http://127.0.0.1:37129/api/call'
const SERVER_INFO = { name: 'nmlm', version: '0.3.1' }
const SUPPORTED_PROTOCOLS = new Set(['2024-11-05', '2025-03-26', '2025-06-18'])

function requestJson(urlText, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlText)
    const body = JSON.stringify(payload)
    const transport = url.protocol === 'https:' ? https : http
    const req = transport.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 5000
    }, (res) => {
      let raw = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { raw += chunk })
      res.on('end', () => {
        if ((res.statusCode || 500) < 200 || (res.statusCode || 500) >= 300) {
          return reject(new Error(`桌面服务不可用或鉴权失败：HTTP ${res.statusCode}`))
        }
        try { resolve(JSON.parse(raw)) } catch (_) { reject(new Error('桌面服务返回了无法解析的数据')) }
      })
    })
    req.on('timeout', () => req.destroy(new Error('连接桌面服务超时')))
    req.on('error', (error) => reject(new Error(`牛马联盟桌面服务不可用：请先启动桌面端，或用 NMLM_API 指向实际 /api/call 地址。${error.message}`)))
    req.end(body)
  })
}

async function call(channel, args = {}) {
  const json = await requestJson(API, { channel, args })
  if (!json.ok) throw new Error(json.error || '调用失败')
  return json
}

function text(obj, isError = false) {
  return {
    content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }],
    ...(isError ? { isError: true } : {})
  }
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
  if (a.date && a.start == null && a.end == null) return dayRange(a.date)
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

const todoIdsShape = { ids: { type: 'array', items: { type: 'number' }, description: '待办 id 列表' } }

function todoPayloadFromArgs(a = {}) {
  const payload = { ...a }
  if (payload.dueAt !== undefined) payload.dueAt = parseDueAt(payload.dueAt)
  if (payload.phaseStartAt !== undefined) payload.phaseStartAt = parseDueAt(payload.phaseStartAt)
  if (payload.phaseEndAt !== undefined) payload.phaseEndAt = parseDueAt(payload.phaseEndAt)
  return payload
}

const TOOLS = [
  {
    name: 'nmlm_todo_add',
    description: '向牛马联盟桌面端添加待办。桌面端需正在运行。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '待办标题' }, detail: { type: 'string', description: '详细描述' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' }, dueAt: todoShape.dueAt,
        reminderEnabled: todoShape.reminderEnabled, phaseStartAt: todoShape.phaseStartAt, phaseEndAt: todoShape.phaseEndAt,
        remindWindowStart: todoShape.remindWindowStart, remindWindowEnd: todoShape.remindWindowEnd,
        remindIntervalMin: todoShape.remindIntervalMin
      },
      required: ['title']
    }
  },
  {
    name: 'nmlm_todo_list', description: '查看牛马联盟待办列表。',
    inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['todo', 'doing', 'done'] }, includeDone: { type: 'boolean', default: false }, dueOnly: { type: 'boolean', default: false }, limit: { type: 'number', default: 100 } } }
  },
  {
    name: 'nmlm_todo_due', description: '查看已经到期且未完成的牛马联盟待办。',
    inputSchema: { type: 'object', properties: { now: { type: 'number', description: '可选，毫秒时间戳' } } }
  },
  { name: 'nmlm_todo_update', description: '更新牛马联盟待办。', inputSchema: { type: 'object', properties: todoShape, required: ['id'] } },
  { name: 'nmlm_todo_close', description: '完成牛马联盟待办。', inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] } },
  { name: 'nmlm_todo_reopen', description: '重开已完成的牛马联盟待办。', inputSchema: { type: 'object', properties: { id: { type: 'number' }, status: { type: 'string', enum: ['todo', 'doing'], default: 'todo' } }, required: ['id'] } },
  { name: 'nmlm_todo_delete', description: '删除牛马联盟待办。', inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] } },
  { name: 'nmlm_todo_batch_close', description: '批量完成牛马联盟待办。', inputSchema: { type: 'object', properties: todoIdsShape, required: ['ids'] } },
  { name: 'nmlm_todo_batch_reopen', description: '批量重开已完成待办。', inputSchema: { type: 'object', properties: { ...todoIdsShape, status: { type: 'string', enum: ['todo', 'doing'], default: 'todo' } }, required: ['ids'] } },
  { name: 'nmlm_todo_batch_delete', description: '批量物理删除牛马联盟待办。调用前应让用户确认，删除后不可恢复。', inputSchema: { type: 'object', properties: todoIdsShape, required: ['ids'] } },
  { name: 'nmlm_task_current', description: '查看当前正在记录的任务片段。', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'nmlm_ledger_list',
    description: '查询牛马联盟正式台账。台账是用户确认后的正式工时记录，活动轨迹只作辅助线索。',
    inputSchema: { type: 'object', properties: { date: { type: 'string', description: '可选，某一天，如 2026-08-11；提供后默认查询该日' }, start: { type: ['string', 'number'], description: '可选，开始时间字符串或毫秒时间戳' }, end: { type: ['string', 'number'], description: '可选，结束时间字符串或毫秒时间戳' }, includeCurrent: { type: 'boolean', default: true }, limit: { type: 'number', default: 100 } } }
  },
  {
    name: 'nmlm_evidence_list',
    description: '查询牛马联盟证据库索引。只读查询，不导入、不修改 raw 原始证据。',
    inputSchema: { type: 'object', properties: { date: { type: 'string', description: '可选，某一天，如 2026-08-11；提供后默认查询该日' }, start: { type: ['string', 'number'], description: '可选，开始时间字符串或毫秒时间戳' }, end: { type: ['string', 'number'], description: '可选，结束时间字符串或毫秒时间戳' }, status: { type: 'string', description: '可选，按状态过滤' }, type: { type: 'string', description: '可选，按类型过滤' }, ledgerEntryId: { type: 'number', description: '可选，只看关联某条台账的证据' }, limit: { type: 'number', default: 100 } } }
  }
]

async function executeTool(name, a = {}) {
  if (name === 'nmlm_todo_add') return call('todos:create', { ...todoPayloadFromArgs(a), detail: a.detail || null, priority: a.priority || 'medium', source: 'agent' })
  if (name === 'nmlm_todo_list') return call('todos:list', a)
  if (name === 'nmlm_todo_due') return call('todos:due', { now: a.now })
  if (name === 'nmlm_todo_update') return call('todos:update', todoPayloadFromArgs(a))
  if (name === 'nmlm_todo_close') return call('todos:close', { id: a.id })
  if (name === 'nmlm_todo_reopen') return call('todos:reopen', { id: a.id, status: a.status || 'todo' })
  if (name === 'nmlm_todo_delete') return call('todos:delete', { id: a.id })
  if (name === 'nmlm_todo_batch_close') return call('todos:batchClose', { ids: a.ids || [] })
  if (name === 'nmlm_todo_batch_reopen') return call('todos:batchReopen', { ids: a.ids || [], status: a.status || 'todo' })
  if (name === 'nmlm_todo_batch_delete') return call('todos:batchDelete', { ids: a.ids || [] })
  if (name === 'nmlm_task_current') return call('ledger:current')
  if (name === 'nmlm_ledger_list') {
    const range = resolveRange(a)
    if (range.end <= range.start) throw new Error('结束时间必须晚于开始时间')
    const result = await call('ledger:list', range)
    const entries = applyLimit((result.entries || []).filter((entry) => a.includeCurrent !== false || entry.end_time), a.limit)
    return { ok: true, range, entries }
  }
  if (name === 'nmlm_evidence_list') {
    const range = resolveRange(a)
    if (range.end <= range.start) throw new Error('结束时间必须晚于开始时间')
    const result = await call('evidence:list', range)
    let items = result.screenshots || result.items || []
    if (a.status) items = items.filter((item) => item.status === a.status || item.review_status === a.status)
    if (a.type) items = items.filter((item) => item.type === a.type || item.source_type === a.type)
    if (a.ledgerEntryId != null) items = items.filter((item) => Number(item.ledger_entry_id) === Number(a.ledgerEntryId))
    return { ok: true, range, evidence: applyLimit(items, a.limit), note: '只读查询结果；MCP 不提供证据导入，raw 原始证据不会被修改。' }
  }
  throw new Error(`未知工具：${name}`)
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function sendResult(id, result) { send({ jsonrpc: '2.0', id, result }) }
function sendError(id, code, message) { send({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }) }

async function handleMessage(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    if (message?.id != null) sendError(message.id, -32600, 'Invalid Request')
    return
  }
  const { id, method, params = {} } = message
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return
  if (method === 'exit') return process.exit(0)
  if (id == null) return

  if (method === 'initialize') {
    const requested = params.protocolVersion
    sendResult(id, {
      protocolVersion: SUPPORTED_PROTOCOLS.has(requested) ? requested : '2024-11-05',
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions: '牛马联盟桌面端需保持运行；本连接可管理待办，并只读查询正式台账和证据索引。'
    })
    return
  }
  if (method === 'ping') return sendResult(id, {})
  if (method === 'tools/list') return sendResult(id, { tools: TOOLS })
  if (method === 'tools/call') {
    try {
      const result = await executeTool(params.name, params.arguments || {})
      return sendResult(id, text(result))
    } catch (error) {
      return sendResult(id, text(error.message || String(error), true))
    }
  }
  if (method === 'shutdown') return sendResult(id, null)
  sendError(id, -32601, `Method not found: ${method}`)
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false })
let queue = Promise.resolve()
input.on('line', (line) => {
  if (!line.trim()) return
  queue = queue.then(async () => {
    let message
    try { message = JSON.parse(line.replace(/^\uFEFF/, '')) } catch (_) { return sendError(null, -32700, 'Parse error') }
    await handleMessage(message)
  }).catch((error) => console.error('[nmlm-mcp]', error))
})
