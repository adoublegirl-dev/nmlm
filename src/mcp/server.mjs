#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const API = process.env.NMLM_API || 'http://127.0.0.1:37129/api/call'

async function call(channel, args = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, args })
  })
  if (!res.ok) throw new Error(`桌面服务不可用或鉴权失败：HTTP ${res.status}`)
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || '调用失败')
  return json
}

function text(obj) {
  return { content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] }
}

const server = new Server({ name: 'nmlm-todo', version: '0.1.0' }, { capabilities: { tools: {} } })

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
          dueAt: { type: 'string', description: '截止时间，ISO 字符串，如 2026-08-10T18:00:00' }
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
          includeDone: { type: 'boolean', default: false }
        }
      }
    },
    {
      name: 'nmlm_todo_update',
      description: '更新牛马联盟待办。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          title: { type: 'string' },
          detail: { type: 'string' },
          status: { type: 'string', enum: ['todo', 'doing', 'done'] },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          dueAt: { type: 'string', description: '截止时间 ISO 字符串；传空字符串可清空' }
        },
        required: ['id']
      }
    },
    {
      name: 'nmlm_todo_close',
      description: '完成牛马联盟待办。',
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
    const dueAt = a.dueAt ? new Date(a.dueAt).getTime() : null
    return text(await call('todos:create', { title: a.title, detail: a.detail || null, priority: a.priority || 'medium', dueAt, source: 'agent' }))
  }
  if (name === 'nmlm_todo_list') return text(await call('todos:list', a))
  if (name === 'nmlm_todo_update') {
    const payload = { ...a }
    if (payload.dueAt !== undefined) payload.dueAt = payload.dueAt ? new Date(payload.dueAt).getTime() : null
    return text(await call('todos:update', payload))
  }
  if (name === 'nmlm_todo_close') return text(await call('todos:close', { id: a.id }))
  if (name === 'nmlm_task_current') return text(await call('ledger:current'))
  throw new Error(`未知工具：${name}`)
})

await server.connect(new StdioServerTransport())
