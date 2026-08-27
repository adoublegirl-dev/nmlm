import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const db = require('../src/main/db')
const todos = require('../src/main/services/todos')

beforeEach(() => {
  vi.useRealTimers()
  db.init(':memory:')
  todos.attachEventSender(() => {})
})

describe('todos 阶段待办', () => {
  it('在阶段内且处于提醒窗口时返回阶段提醒', () => {
    const now = new Date('2026-08-11T10:00:00').getTime()
    const r = todos.create({
      title: '推进方案',
      reminderEnabled: true,
      phaseStartAt: new Date('2026-08-10T00:00:00').getTime(),
      phaseEndAt: new Date('2026-08-12T23:59:59').getTime(),
      remindWindowStart: '09:00',
      remindWindowEnd: '18:00',
      remindIntervalMin: 120
    })
    expect(r.ok).toBe(true)
    const due = todos.due(now)
    expect(due.ok).toBe(true)
    expect(due.todos.map((t) => t.id)).toContain(r.todo.id)
  })

  it('阶段提醒遵守固定频率', () => {
    const now = new Date('2026-08-11T10:00:00').getTime()
    const r = todos.create({
      title: '阶段提醒频率',
      reminderEnabled: true,
      phaseStartAt: new Date('2026-08-10T00:00:00').getTime(),
      phaseEndAt: new Date('2026-08-12T23:59:59').getTime(),
      remindWindowStart: '09:00',
      remindWindowEnd: '18:00',
      remindIntervalMin: 120
    })
    todos.markReminded({ id: r.todo.id, remindedAt: now, kind: 'phase' })
    expect(todos.due(now + 60 * 60 * 1000).todos.map((t) => t.id)).not.toContain(r.todo.id)
    expect(todos.due(now + 121 * 60 * 1000).todos.map((t) => t.id)).toContain(r.todo.id)
  })

  it('阶段结束后自动完成，并在已到期/阶段结束列表可见', () => {
    const now = new Date('2026-08-11T10:00:00').getTime()
    const r = todos.create({
      title: '阶段结束自动完成',
      status: 'doing',
      phaseStartAt: new Date('2026-08-01T00:00:00').getTime(),
      phaseEndAt: new Date('2026-08-10T23:59:59').getTime()
    })
    expect(r.ok).toBe(true)
    const done = todos.autoCompleteExpiredPhases(now)
    expect(done.count).toBe(1)
    const list = todos.list({ dueOnly: true, includeDone: true })
    expect(list.todos.find((t) => t.id === r.todo.id)?.status).toBe('done')
    expect(list.todos.find((t) => t.id === r.todo.id)?.phase_completed_at).toBeTruthy()
  })
})

describe('todos 批量操作', () => {
  it('支持批量完成、重开和删除', () => {
    const a = todos.create({ title: 'A' }).todo
    const b = todos.create({ title: 'B' }).todo
    const closed = todos.batchClose({ ids: [a.id, b.id] })
    expect(closed.ok).toBe(true)
    expect(closed.count).toBe(2)
    expect(todos.list({ status: 'done', includeDone: true }).todos.length).toBe(2)

    const reopened = todos.batchReopen({ ids: [a.id, b.id], status: 'todo' })
    expect(reopened.ok).toBe(true)
    expect(todos.list({ includeDone: false }).todos.length).toBe(2)

    const deleted = todos.batchDelete({ ids: [a.id, b.id] })
    expect(deleted.ok).toBe(true)
    expect(deleted.count).toBe(2)
    expect(todos.list({ includeDone: true }).todos.length).toBe(0)
  })
})
