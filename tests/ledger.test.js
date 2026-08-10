import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'

// 用原生 require 加载 CJS 服务层，保证与模块内部 require 共享同一实例缓存
const require = createRequire(import.meta.url)

const db = require('../src/main/db')
const ledger = require('../src/main/services/ledger')
const report = require('../src/main/services/report')
const todos = require('../src/main/services/todos')
const { startOfDay, endOfDay, formatDuration, dayRange } = require('../src/main/utils/time')

const { entriesRepo } = db

// 每个用例用独立内存库；窗口采集替换为空实现（避免真调 PowerShell 与缓存干扰）
beforeEach(() => {
  db.init(':memory:')
  ledger.attachEventSender(() => {})
  require('../src/main/utils/window').getActiveWindow = () => Promise.resolve(null)
})

describe('ledger 状态机', () => {
  it('start 创建进行中记录', async () => {
    const r = await ledger.start()
    expect(r.ok).toBe(true)
    expect(r.entry.end_time).toBeNull()
    expect(ledger.current().id).toBe(r.entry.id)
  })

  it('重复 start 报错', async () => {
    await ledger.start()
    const r2 = await ledger.start()
    expect(r2.ok).toBe(false)
  })

  it('stop 归档并计算时长与碎片标记', async () => {
    const t0 = Date.now() - 20 * 60 * 1000 // 20 分钟前
    const entry = entriesRepo.insert({ startTime: t0 })
    const r = await ledger.stop({ tagId: 1 }) // 1 = 编码
    expect(r.ok).toBe(true)
    const finished = entriesRepo.get(entry.id)
    expect(finished.end_time).not.toBeNull()
    expect(finished.duration_sec).toBeGreaterThanOrEqual(20 * 60)
    expect(finished.is_fragment).toBe(0)
    expect(finished.tag_id).toBe(1)
  })

  it('短记录标记为碎片', async () => {
    const entry = entriesRepo.insert({ startTime: Date.now() - 60 * 1000 })
    await ledger.stop({})
    const finished = entriesRepo.get(entry.id)
    expect(finished.is_fragment).toBe(1)
  })

  it('无记录时 stop 报错', async () => {
    const r = await ledger.stop({})
    expect(r.ok).toBe(false)
  })

  it('pause 归档旧段并新建记录', async () => {
    await ledger.start()
    const r = await ledger.pause()
    expect(r.ok).toBe(true)
    const cur = ledger.current()
    expect(cur.id).toBe(r.entry.id)
    // 旧段已归档
    const all = entriesRepo.listByRange(0, Date.now() + 1000)
    expect(all.length).toBe(2)
  })

  it('recover 归档崩溃残留', () => {
    entriesRepo.insert({ startTime: Date.now() - 30 * 60 * 1000 })
    const count = ledger.recover()
    expect(count).toBe(1)
    expect(ledger.current()).toBeNull()
    const recovered = entriesRepo.listByRange(0, Date.now() + 1000)[0]
    expect(recovered.detail).toBe('[崩溃恢复]')
    expect(recovered.end_time).not.toBeNull()
  })

  it('retag 补打标签', async () => {
    await ledger.start()
    const r = await ledger.stop({})
    const ret = await ledger.retag(r.entry.id, { tagId: 3 })
    expect(ret.ok).toBe(true)
    expect(ret.entry.tag_id).toBe(3)
  })
  it('switchTask 自动结束上一段并开启新任务', async () => {
    const first = await ledger.switchTask({ tagId: 1, detail: '写代码' })
    expect(first.ok).toBe(true)
    const second = await ledger.switchTask({ tagId: 2, detail: '开会' })
    expect(second.ok).toBe(true)
    expect(second.finished.id).toBe(first.entry.id)
    expect(second.finished.end_time).not.toBeNull()
    expect(ledger.current().tag_id).toBe(2)
  })

  it('complete 结束当前任务但不开启新任务', async () => {
    await ledger.switchTask({ tagId: 1 })
    const r = await ledger.complete({})
    expect(r.ok).toBe(true)
    expect(ledger.current()).toBeNull()
  })

  it('addPausePoint 给当前任务添加暂停点', async () => {
    const r = await ledger.switchTask({ tagId: 1 })
    const p = ledger.addPausePoint({ detail: '被打断' })
    expect(p.ok).toBe(true)
    const points = ledger.listPausePointsByRange(r.entry.start_time - 1, Date.now() + 1000)
    expect(points.length).toBe(1)
    expect(points[0].detail).toBe('被打断')
  })
})

describe('todos 服务', () => {
  it('create/list/update/close', () => {
    const c = todos.create({ title: '写方案', detail: '牛马联盟 P1', priority: 'high', source: 'agent' })
    expect(c.ok).toBe(true)
    expect(todos.list({}).todos.length).toBe(1)
    const u = todos.update({ id: c.todo.id, status: 'doing' })
    expect(u.todo.status).toBe('doing')
    const closed = todos.close({ id: c.todo.id })
    expect(closed.todo.status).toBe('done')
    expect(todos.list({}).todos.length).toBe(0)
    expect(todos.list({ includeDone: true }).todos.length).toBe(1)
  })
})

describe('report 聚合', () => {
  function seed(dayStart, offsetSec, durationSec, tagId) {
    const e = entriesRepo.insert({ startTime: dayStart + offsetSec * 1000 })
    entriesRepo.finish(e.id, {
      endTime: dayStart + (offsetSec + durationSec) * 1000,
      durationSec,
      tagId,
      detail: null,
      windowTitle: null,
      isFragment: durationSec < 15 * 60 ? 1 : 0
    })
    return e
  }

  it('effectiveHours 剔除 break 标签', () => {
    const now = Date.now()
    const dayStart = startOfDay(now)
    seed(dayStart, 10 * 3600, 2 * 3600, 1) // 编码 2h（非 break）
    seed(dayStart, 13 * 3600, 3600, 5) // 摸鱼 1h（break）
    const eff = report.effectiveHours(now)
    expect(eff).toBe(2 * 3600)
  })

  it('dailyTimeline 返回带标签名的段落', () => {
    const now = Date.now()
    seed(startOfDay(now), 10 * 3600, 1800, 2)
    const segs = report.dailyTimeline(now)
    expect(segs.length).toBe(1)
    expect(segs[0].tagName).toBe('开会')
  })

  it('tagDistribution 统计秒数', () => {
    const now = Date.now()
    const dayStart = startOfDay(now)
    seed(dayStart, 10 * 3600, 3600, 1)
    seed(dayStart, 12 * 3600, 3600, 1)
    const dist = report.tagDistribution(startOfDay(now), endOfDay(now))
    expect(dist.length).toBe(1)
    expect(dist[0].count).toBe(2)
    expect(dist[0].totalSec).toBe(2 * 3600)
  })

  it('空数据返回空数组与 0', () => {
    const now = Date.now()
    expect(report.dailyTimeline(now)).toEqual([])
    expect(report.effectiveHours(now)).toBe(0)
    expect(report.dailyTrend(now)).toEqual([])
  })
})

describe('time 工具', () => {
  it('startOfDay / endOfDay 边界', () => {
    const ts = new Date(2026, 7, 5, 15, 30).getTime()
    expect(startOfDay(ts)).toBe(new Date(2026, 7, 5, 0, 0, 0, 0).getTime())
    expect(endOfDay(ts) - startOfDay(ts)).toBe(24 * 3600 * 1000)
  })

  it('formatDuration', () => {
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(1500)).toBe('25m')
    expect(formatDuration(6000)).toBe('1h40m')
  })

  it('dayRange 跨天正确', () => {
    const ts = Date.now()
    const r = dayRange(ts)
    expect(r.end - r.start).toBe(24 * 3600 * 1000)
  })
})
