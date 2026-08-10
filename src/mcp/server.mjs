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

const todoShape = {
  id: { type: 'number' },
  title: { type: 'string' },
  detail: { type: 'string' },
  status: { type: 'string', enum: ['todo', 'doing', 'done'] },
  priority: { type: 'string', enum: ['low', 'medium', 'high'] },
  dueAt: { type: 'string', description: '截止时间 ISO/本地时间字符串；传空字符串可清空' }
}

const server = new Server({ name: 'nmlm-todo', version: '0.2.0' }, { capabilities: { tools: {} } })

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
          dueAt: todoShape.dueAt
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
      name: 'nmlm_task_current',
      description: '查看当前正在记录的任务片段。',
      inputSchema: { type: 'object', properties: {} }
    }
  ]
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name
  const a = req.params.arguments || {}
  if (name === 'nmlm_todo_add') {
    return text(await call('todos:create', { title: a.title, detail: a.detail || null, priority: a.priority || 'medium', dueAt: parseDueAt(a.dueAt), source: 'agent' }))
  }
  if (name === 'nmlm_todo_list') return text(await call('todos:list', a))
  if (name === 'nmlm_todo_due') return text(await call('todos:due', { now: a.now }))
  if (name === 'nmlm_todo_update') {
    const payload = { ...a }
    if (payload.dueAt !== undefined) payload.dueAt = parseDueAt(payload.dueAt)
    return text(await call('todos:update', payload))
  }
  if (name === 'nmlm_todo_close') return text(await call('todos:close', { id: a.id }))
  if (name === 'nmlm_todo_reopen') return text(await call('todos:reopen', { id: a.id, status: a.status || 'todo' }))
  if (name === 'nmlm_todo_delete') return text(await call('todos:delete', { id: a.id }))
  if (name === 'nmlm_task_current') return text(await call('ledger:current'))
  throw new Error(`未知工具：${name}`)
})

await server.connect(new StdioServerTransport())
