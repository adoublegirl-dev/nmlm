// 报表聚合：全部纯函数，输入时间范围输出图表数据。可单测。
const { entriesRepo, tagsRepo } = require('../db')
const { startOfDay, endOfDay, startOfMonth, DAY_MS, formatDate } = require('../utils/time')

function withTag(entry) {
  const tag = entry.tag_id ? tagsRepo.get(entry.tag_id) : null
  return {
    ...entry,
    tagName: tag ? tag.name : '未分类',
    color: tag ? tag.color : '#9D9D9D',
    isBreak: tag ? tag.is_break : 0
  }
}

function clippedSec(entry, start, end, now = Date.now()) {
  const actualEnd = entry.end_time || now
  const s = Math.max(entry.start_time, start)
  const e = Math.min(actualEnd, end)
  return Math.max(0, Math.floor((e - s) / 1000))
}

// 今日时间线（甘特条数据）
function dailyTimeline(date) {
  const { start, end } = dayRangeOf(date)
  return entriesRepo.listByRange(start, end).map(withTag)
}

function dayRangeOf(date) {
  return { start: startOfDay(date), end: endOfDay(date) }
}

// 标签分布（环形图）：秒数 + 次数
function tagDistribution(start, end) {
  const entries = entriesRepo.listByRange(start, end).map(withTag)
  const map = new Map()
  for (const e of entries) {
    const key = e.tagName
    if (!map.has(key)) map.set(key, { name: key, color: e.color, totalSec: 0, count: 0 })
    const item = map.get(key)
    item.totalSec += clippedSec(e, start, end)
    item.count += 1
  }
  return [...map.values()].sort((a, b) => b.totalSec - a.totalSec)
}

// 月度趋势（折线）：每天有效工时 + 总工时 + 碎片次数
function dailyTrend(monthStart) {
  const m0 = startOfMonth(monthStart)
  const days = []
  const now = Date.now()
  for (let ts = m0; ts < m0 + DAY_MS * 31; ts += DAY_MS) {
    if (ts > now) break
    const { start, end } = dayRangeOf(ts)
    const entries = entriesRepo.listByRange(start, end).map(withTag)
    const totalSec = entries.reduce((sum, e) => sum + clippedSec(e, start, end, now), 0)
    const effectiveSec = entries
      .filter((e) => !e.isBreak)
      .reduce((sum, e) => sum + clippedSec(e, start, end, now), 0)
    const fragmentCount = entries.filter((e) => e.is_fragment).length
    if (entries.length === 0) continue
    days.push({ date: formatDate(ts), totalSec, effectiveSec, fragmentCount })
  }
  return days
}

// 有效工时（秒）：总时长 - break 标签时长
function effectiveHours(date) {
  const { start, end } = dayRangeOf(date)
  const entries = entriesRepo.listByRange(start, end).map(withTag)
  return entries.filter((e) => !e.isBreak).reduce((sum, e) => sum + clippedSec(e, start, end), 0)
}

// 碎片统计
function fragmentStats(date) {
  const { start, end } = dayRangeOf(date)
  const entries = dailyTimeline(date)
  const fragments = entries.filter((e) => e.is_fragment)
  return {
    fragmentCount: fragments.length,
    fragmentTotalSec: fragments.reduce((sum, e) => sum + clippedSec(e, start, end), 0),
    entryCount: entries.length
  }
}

module.exports = { dailyTimeline, tagDistribution, dailyTrend, effectiveHours, fragmentStats, dayRangeOf }
