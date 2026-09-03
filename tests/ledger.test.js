import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'module'

// 用原生 require 加载 CJS 服务层，保证与模块内部 require 共享同一实例缓存
const require = createRequire(import.meta.url)

const db = require('../src/main/db')
const ledger = require('../src/main/services/ledger')
const activity = require('../src/main/services/activity')
const report = require('../src/main/services/report')
const todos = require('../src/main/services/todos')
const { startOfDay, endOfDay, formatDuration, dayRange } = require('../src/main/utils/time')

const { entriesRepo, timelinePointsRepo, evidenceRepo, activityRepo } = db

// 每个用例用独立内存库；窗口采集替换为空实现（避免真调 PowerShell 与缓存干扰）
beforeEach(() => {
  vi.useRealTimers()
  db.init(':memory:')
  ledger.attachEventSender(() => {})
  require('../src/main/utils/window').getActiveWindow = () => Promise.resolve(null)
})

afterEach(() => {
  vi.useRealTimers()
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

  it('可事后校准已完成记录的开始和结束时间', () => {
    const base = 1786300000000
    const entry = entriesRepo.insertFinished({
      startTime: base,
      endTime: base + 30 * 60 * 1000,
      durationSec: 30 * 60,
      tagId: 1,
      isFragment: 0
    })
    const r = ledger.adjustTime({ id: entry.id, startTime: base - 10 * 60 * 1000, endTime: base + 20 * 60 * 1000 })
    expect(r.ok).toBe(true)
    expect(r.entry.start_time).toBe(base - 10 * 60 * 1000)
    expect(r.entry.end_time).toBe(base + 20 * 60 * 1000)
    expect(r.entry.duration_sec).toBe(30 * 60)
  })

  it('补记记录会阻止与已有台账重叠', () => {
    const base = 1786300000000
    entriesRepo.insertFinished({ startTime: base, endTime: base + 3600 * 1000, durationSec: 3600, tagId: 1 })
    const r1 = ledger.manualCreate({ startTime: base + 3600 * 1000, endTime: base + 5400 * 1000, tagId: 2, detail: '补记会议' })
    expect(r1.ok).toBe(true)
    const r2 = ledger.manualCreate({ startTime: base + 30 * 60 * 1000, endTime: base + 90 * 60 * 1000, tagId: 2 })
    expect(r2.ok).toBe(false)
    expect(r2.error).toContain('重叠')
  })

  it('校准时间时阻止已有节点越界', () => {
    const base = 1786300000000
    const entry = entriesRepo.insertFinished({ startTime: base, endTime: base + 3600 * 1000, durationSec: 3600, tagId: 1 })
    timelinePointsRepo.insert({ entryId: entry.id, ts: base + 50 * 60 * 1000, tagId: 1 })
    const r = ledger.adjustTime({ id: entry.id, startTime: base, endTime: base + 40 * 60 * 1000 })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('时间节点')
  })

  it('校准和补记均不允许未来时间', () => {
    const now = 1786300000000
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const entry = entriesRepo.insertFinished({ startTime: now - 3600 * 1000, endTime: now - 1800 * 1000, durationSec: 1800, tagId: 1 })
    const r1 = ledger.adjustTime({ id: entry.id, startTime: now - 3600 * 1000, endTime: now + 1000 })
    expect(r1.ok).toBe(false)
    expect(r1.error).toContain('当前时间')
    const r2 = ledger.manualCreate({ startTime: now + 1000, endTime: now + 2000, tagId: 1 })
    expect(r2.ok).toBe(false)
    expect(r2.error).toContain('当前时间')
  })

  it('可事后新增切点并按标签拆分已完成记录', () => {
    const base = 1786300000000
    const entry = entriesRepo.insertFinished({
      startTime: base,
      endTime: base + 2 * 3600 * 1000,
      durationSec: 2 * 3600,
      tagId: 1,
      detail: '长段记录',
      isFragment: 0
    })
    const r = ledger.applyTimelinePointPlan({
      entryId: entry.id,
      baseTagId: 1,
      detail: '长段记录',
      points: [{ id: 'new-test', ts: base + 3600 * 1000, tagId: 2, detail: '改为开会' }]
    })
    expect(r.ok).toBe(true)
    expect(r.split).toBe(true)
    expect(r.entries.length).toBe(2)
    expect(r.entries[0].start_time).toBe(base)
    expect(r.entries[0].end_time).toBe(base + 3600 * 1000)
    expect(r.entries[0].tag_id).toBe(1)
    expect(r.entries[1].start_time).toBe(base + 3600 * 1000)
    expect(r.entries[1].end_time).toBe(base + 2 * 3600 * 1000)
    expect(r.entries[1].tag_id).toBe(2)
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

  it('addKeyframe 同时创建切点与关键帧', async () => {
    const r = await ledger.switchTask({ tagId: 1 })
    const p = ledger.addKeyframe({ detail: '补充上下文' })
    expect(p.ok).toBe(true)
    const points = ledger.listTimelinePointsByRange(r.entry.start_time - 1, Date.now() + 1000)
    expect(points.length).toBe(1)
    expect(points[0].detail).toBe('补充上下文')
  })

  it('切点选择不同标签后拆分记录，并保留连续同标签合并规则', () => {
    const base = 1786300000000
    const entry = entriesRepo.insertFinished({
      startTime: base,
      endTime: base + 30 * 60 * 1000,
      durationSec: 30 * 60,
      tagId: 1,
      detail: '长任务',
      windowTitle: null,
      isFragment: 0
    })
    const p1 = timelinePointsRepo.insert({ entryId: entry.id, ts: base + 10 * 60 * 1000 })
    timelinePointsRepo.insert({ entryId: entry.id, ts: base + 20 * 60 * 1000 })
    const r = ledger.applyTimelinePointTag({ entryId: entry.id, pointId: p1.id, tagId: 2 })
    expect(r.ok).toBe(true)
    expect(r.split).toBe(true)
    const rows = entriesRepo.listByRange(base - 1, base + 31 * 60 * 1000)
    expect(rows.map((x) => x.tag_id)).toEqual([1, 2, 1])
    expect(rows.map((x) => x.duration_sec)).toEqual([600, 600, 600])
  })

  it('切点选择同标签时只保存文字记录，不拆分不消费切点', () => {
    const base = 1786300000000
    const entry = entriesRepo.insertFinished({
      startTime: base,
      endTime: base + 30 * 60 * 1000,
      durationSec: 30 * 60,
      tagId: 1,
      detail: '长任务',
      windowTitle: null,
      isFragment: 0
    })
    const p1 = timelinePointsRepo.insert({ entryId: entry.id, ts: base + 10 * 60 * 1000 })
    const r = ledger.applyTimelinePointPlan({ entryId: entry.id, points: [{ id: p1.id, tagId: 1, detail: '接了个电话' }] })
    expect(r.ok).toBe(true)
    expect(r.split).toBe(false)
    const rows = entriesRepo.listByRange(base - 1, base + 31 * 60 * 1000)
    expect(rows.length).toBe(1)
    expect(rows[0].duration_sec).toBe(1800)
    const points = timelinePointsRepo.listByEntry(entry.id)
    expect(points.length).toBe(1)
    expect(points[0].detail).toBe('接了个电话')
  })

  it('同标签切点确认合并时会清理切点并保留文字记录', () => {
    const base = 1786300000000
    const entry = entriesRepo.insertFinished({
      startTime: base,
      endTime: base + 30 * 60 * 1000,
      durationSec: 30 * 60,
      tagId: 1,
      detail: '长任务',
      windowTitle: null,
      isFragment: 0
    })
    const p1 = timelinePointsRepo.insert({ entryId: entry.id, ts: base + 10 * 60 * 1000 })
    const r = ledger.applyTimelinePointPlan({
      entryId: entry.id,
      baseTagId: 1,
      detail: '长任务',
      cleanupSameTagPoints: true,
      points: [{ id: p1.id, tagId: 1, detail: '中途确认了一下需求' }]
    })
    expect(r.ok).toBe(true)
    expect(r.cleaned).toBe(true)
    expect(timelinePointsRepo.listByEntry(entry.id).length).toBe(0)
    const updated = entriesRepo.get(entry.id)
    expect(updated.detail).toContain('长任务')
    expect(updated.detail).toContain('时间节点记录')
    expect(updated.detail).toContain('中途确认了一下需求')
  })

  it('拆分后相邻片段改成同标签会自动归并', () => {
    const base = 1786300000000
    const entry = entriesRepo.insertFinished({
      startTime: base,
      endTime: base + 30 * 60 * 1000,
      durationSec: 30 * 60,
      tagId: 1,
      detail: '长任务',
      windowTitle: null,
      isFragment: 0
    })
    const p1 = timelinePointsRepo.insert({ entryId: entry.id, ts: base + 10 * 60 * 1000 })
    const split = ledger.applyTimelinePointPlan({ entryId: entry.id, baseTagId: 1, points: [{ id: p1.id, tagId: 2, detail: '切到开会' }] })
    expect(split.ok).toBe(true)
    let rows = entriesRepo.listByRange(base - 1, base + 31 * 60 * 1000)
    expect(rows.length).toBe(2)
    const ret = ledger.retag(rows[1].id, { tagId: 1 })
    expect(ret.ok).toBe(true)
    rows = entriesRepo.listByRange(base - 1, base + 31 * 60 * 1000)
    expect(rows.length).toBe(1)
    expect(rows[0].start_time).toBe(base)
    expect(rows[0].end_time).toBe(base + 30 * 60 * 1000)
    expect(rows[0].tag_id).toBe(1)
  })

  it('进行中记录可按切点拆分，最后一段保持进行中', () => {
    const base = 1786300000000
    vi.useFakeTimers()
    vi.setSystemTime(base + 30 * 60 * 1000)
    const entry = entriesRepo.insert({ startTime: base, tagId: 1 })
    const p1 = timelinePointsRepo.insert({ entryId: entry.id, ts: base + 10 * 60 * 1000 })
    const r = ledger.applyTimelinePointPlan({ entryId: entry.id, baseTagId: 1, points: [{ id: p1.id, tagId: 2, detail: '切到开会' }] })
    expect(r.ok).toBe(true)
    expect(r.split).toBe(true)
    const rows = entriesRepo.listByRange(base - 1, base + 31 * 60 * 1000)
    expect(rows.length).toBe(2)
    expect(rows[0].tag_id).toBe(1)
    expect(rows[0].start_time).toBe(base)
    expect(rows[0].end_time).toBe(base + 10 * 60 * 1000)
    expect(rows[1].tag_id).toBe(2)
    expect(rows[1].start_time).toBe(base + 10 * 60 * 1000)
    expect(rows[1].end_time).toBeNull()
    expect(ledger.current().id).toBe(rows[1].id)
    expect(timelinePointsRepo.listByEntry(entry.id).length).toBe(0)
  })
})

describe('todos 服务', () => {
  it('create/list/update/close/reopen/delete', () => {
    const c = todos.create({ title: '写方案', detail: '牛马联盟 P1', priority: 'high', source: 'agent' })
    expect(c.ok).toBe(true)
    expect(todos.list({}).todos.length).toBe(1)
    const u = todos.update({ id: c.todo.id, status: 'doing' })
    expect(u.todo.status).toBe('doing')
    const closed = todos.close({ id: c.todo.id })
    expect(closed.todo.status).toBe('done')
    expect(todos.list({}).todos.length).toBe(0)
    expect(todos.list({ includeDone: true }).todos.length).toBe(1)
    const reopened = todos.reopen({ id: c.todo.id, status: 'todo' })
    expect(reopened.todo.status).toBe('todo')
    const removed = todos.remove({ id: c.todo.id })
    expect(removed.ok).toBe(true)
    expect(todos.list({ includeDone: true }).todos.length).toBe(0)
  })

  it('校验状态、优先级、截止时间和不存在 id', () => {
    expect(todos.create({ title: '' }).ok).toBe(false)
    expect(todos.create({ title: 'x', priority: 'urgent' }).ok).toBe(false)
    expect(todos.create({ title: 'x', dueAt: 'bad' }).ok).toBe(false)
    expect(todos.update({ id: 999, title: 'x' }).ok).toBe(false)
    const c = todos.create({ title: 'x' })
    expect(todos.update({ id: c.todo.id, status: 'bad' }).ok).toBe(false)
  })

  it('due/reminded/snooze 闭环', () => {
    const now = 1786300000000
    const c = todos.create({ title: '到期任务', dueAt: now - 1000 })
    expect(c.ok).toBe(true)
    expect(todos.due(now).todos.length).toBe(1)
    const marked = todos.markReminded({ id: c.todo.id, remindedAt: now })
    expect(marked.todo.reminded_at).toBe(now)
    expect(todos.due(now + 1000).todos.length).toBe(0)
    todos.update({ id: c.todo.id, dueAt: now + 2000 })
    expect(todos.due(now + 3000).todos.length).toBe(1)
    todos.snooze({ id: c.todo.id, minutes: 10 })
    expect(todos.due(Date.now()).todos.length).toBe(0)
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

  it('跨天记录按日视图查询并按当天窗口裁剪统计', () => {
    const dayStart = new Date(2026, 7, 13, 0, 0, 0, 0).getTime()
    const entry = entriesRepo.insert({ startTime: dayStart - 2 * 3600 * 1000, tagId: 1 })
    entriesRepo.finish(entry.id, {
      endTime: dayStart + 3 * 3600 * 1000,
      durationSec: 5 * 3600,
      tagId: 1,
      detail: null,
      windowTitle: null,
      isFragment: 0
    })
    const list = entriesRepo.listByRange(dayStart, dayStart + 24 * 3600 * 1000)
    expect(list.length).toBe(1)
    expect(report.effectiveHours(dayStart)).toBe(3 * 3600)
    const dist = report.tagDistribution(dayStart, dayStart + 24 * 3600 * 1000)
    expect(dist[0].totalSec).toBe(3 * 3600)
  })

  it('空数据返回空数组与 0', () => {
    const now = Date.now()
    expect(report.dailyTimeline(now)).toEqual([])
    expect(report.effectiveHours(now)).toBe(0)
    expect(report.dailyTrend(now)).toEqual([])
  })
})

describe('evidence 证据库索引', () => {
  it('可写入证据项、记录 hash 和元数据，并按日期范围读取', () => {
    const ts = new Date(2026, 7, 13, 10, 30, 0).getTime()
    const item = evidenceRepo.insert({
      id: 'ev_test_001',
      type: 'screenshot',
      source: 'screenshot',
      status: 'captured',
      originalPath: 'D:/牛马证据/牛马联盟证据库/captures/2026/08/13/raw/a.png',
      relativePath: 'captures/2026/08/13/raw/a.png',
      sha256: 'a'.repeat(64),
      sizeBytes: 1234,
      mimeType: 'image/png',
      createdAt: ts,
      importedAt: ts + 1,
      capturedAt: ts,
      deviceId: 'test-device',
      ledgerEntryId: null,
      tagId: null,
      title: '测试截图'
    })
    expect(item.id).toBe('ev_test_001')
    expect(item.sha256).toBe('a'.repeat(64))
    evidenceRepo.insertMetadata(item.id, 'window_title', '测试窗口')
    const metas = evidenceRepo.listMetadata(item.id)
    expect(metas.length).toBe(1)
    expect(JSON.parse(metas[0].value_json)).toBe('测试窗口')
    const list = evidenceRepo.listByRange(ts - 1000, ts + 1000)
    expect(list.length).toBe(1)
    expect(list[0].relative_path).toContain('captures/2026/08/13/raw')
  })

  it('导入材料按 imported_at 进入当天列表，即使原始创建时间较早', () => {
    const oldTs = new Date(2025, 0, 1, 10, 0, 0).getTime()
    const importTs = new Date(2026, 7, 13, 18, 0, 0).getTime()
    evidenceRepo.insert({
      id: 'ev_import_001',
      type: 'pdf',
      source: 'manual_upload',
      status: 'imported',
      originalPath: 'D:/牛马证据/牛马联盟证据库/files/2026/08/13/raw/a.pdf',
      relativePath: 'files/2026/08/13/raw/a.pdf',
      sha256: 'b'.repeat(64),
      sizeBytes: 4321,
      mimeType: 'application/pdf',
      createdAt: oldTs,
      importedAt: importTs,
      capturedAt: null,
      title: 'a.pdf'
    })
    const list = evidenceRepo.listByRange(importTs - 1000, importTs + 1000)
    expect(list.length).toBe(1)
    expect(list[0].source).toBe('manual_upload')
  })

  it('可更新证据标题备注状态并写入复核记录', () => {
    const ts = new Date(2026, 7, 13, 19, 0, 0).getTime()
    evidenceRepo.insert({
      id: 'ev_review_001',
      type: 'screenshot',
      source: 'screenshot',
      status: 'captured',
      originalPath: 'D:/牛马证据/牛马联盟证据库/captures/2026/08/13/raw/r.png',
      relativePath: 'captures/2026/08/13/raw/r.png',
      sha256: 'c'.repeat(64),
      sizeBytes: 222,
      mimeType: 'image/png',
      createdAt: ts,
      importedAt: ts,
      capturedAt: ts,
      title: '原标题'
    })
    const updated = evidenceRepo.update('ev_review_001', { status: 'reviewed', title: '已确认截图', userNote: '可用于证据链' })
    const review = evidenceRepo.upsertReview('ev_review_001', { reviewStatus: 'reviewed', confirmedTitle: updated.title, userNote: updated.user_note })
    expect(updated.status).toBe('reviewed')
    expect(updated.title).toBe('已确认截图')
    expect(updated.user_note).toBe('可用于证据链')
    expect(review.review_status).toBe('reviewed')
    expect(review.confirmed_title).toBe('已确认截图')
  })
})

describe('activity 活动轨迹', () => {
  it('活动线索按台账空白区间裁剪，转台账不覆盖已有记录', () => {
    const base = new Date(2026, 7, 14, 9, 0, 0).getTime()
    entriesRepo.insertFinished({
      startTime: base + 30 * 60 * 1000,
      endTime: base + 60 * 60 * 1000,
      durationSec: 1800,
      tagId: 1,
      detail: '已有记录',
      windowTitle: null,
      isFragment: 0
    })
    activityRepo.insert({ ts: base, windowTitle: 'WPS 文档', processName: 'wps', isIdle: 0, idleSec: 0, inputActive: 1 })
    activityRepo.insert({ ts: base + 20 * 60 * 1000, windowTitle: 'WPS 文档', processName: 'wps', isIdle: 0, idleSec: 0, inputActive: 1 })
    activityRepo.insert({ ts: base + 70 * 60 * 1000, windowTitle: 'WPS 文档', processName: 'wps', isIdle: 0, idleSec: 0, inputActive: 1 })
    const r = activity.listSuggestions({ start: base, end: base + 2 * 60 * 60 * 1000 })
    expect(r.ok).toBe(true)
    const unrecorded = r.suggestions.filter((x) => x.kind === 'unrecorded_active')
    expect(unrecorded.length).toBeGreaterThan(0)
    expect(unrecorded.some((x) => x.end <= base + 30 * 60 * 1000)).toBe(true)
    expect(unrecorded.every((x) => !(x.start < base + 60 * 60 * 1000 && x.end > base + 30 * 60 * 1000))).toBe(true)
    const first = unrecorded[0]
    const created = activity.convertToLedger({ start: first.start, end: first.end, tagId: 1, detail: '轨迹补记' })
    expect(created.ok).toBe(true)
  })

  it('记录内 idle 线索可切分正式台账，但原始轨迹保留', () => {
    const base = new Date(2026, 7, 14, 13, 0, 0).getTime()
    const entry = entriesRepo.insertFinished({
      startTime: base,
      endTime: base + 2 * 60 * 60 * 1000,
      durationSec: 7200,
      tagId: 1,
      detail: '写方案',
      windowTitle: null,
      isFragment: 0
    })
    activityRepo.insert({ ts: base + 30 * 60 * 1000, windowTitle: 'WPS 文档', processName: 'wps', isIdle: 1, idleSec: 900, inputActive: 0 })
    activityRepo.insert({ ts: base + 50 * 60 * 1000, windowTitle: 'WPS 文档', processName: 'wps', isIdle: 1, idleSec: 2100, inputActive: 0 })
    const r = activity.listSuggestions({ start: base, end: base + 2 * 60 * 60 * 1000 })
    const idle = r.suggestions.find((x) => x.kind === 'idle_inside_entry')
    expect(idle).toBeTruthy()
    const split = activity.applyIdleBreak({ entryId: entry.id, start: idle.start, end: idle.end })
    expect(split.ok).toBe(true)
    const rows = entriesRepo.listByRange(base - 1, base + 2 * 60 * 60 * 1000 + 1)
    expect(rows.length).toBe(3)
    expect(activityRepo.rawByRange(base, base + 2 * 60 * 60 * 1000).length).toBe(2)
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
