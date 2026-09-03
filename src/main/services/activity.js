// 活动采集：轮询当前窗口，写 activity_log，并广播快照给记录器。
// 设计原则：activity_log 是原始传感器流水，不因台账编辑而物理拆分；展示/建议/转换时做虚拟裁剪。
const { activityRepo, entriesRepo, timelinePointsRepo, tagsRepo, getDb } = require('../db')
const { getActiveWindow } = require('../utils/window')
const { EVENTS } = require('../../shared/constants')
const settings = require('./settings')
const ledger = require('./ledger')

let timer = null
let emitter = null

function attachEventSender(fn) {
  emitter = fn
}

function normalizeProcessName(name) {
  return String(name || '').trim().toLowerCase()
}

function normalizeList(list) {
  if (Array.isArray(list)) return list.map((x) => String(x || '').trim()).filter(Boolean)
  return String(list || '').split(/[\n,，]/).map((x) => x.trim()).filter(Boolean)
}

function stripExe(name) {
  return normalizeProcessName(name).replace(/\.exe$/, '')
}

function isProcessInList(processName, list) {
  const p = stripExe(processName)
  return normalizeList(list).map(stripExe).includes(p)
}

function isSensitiveProcess(processName) {
  return isProcessInList(processName, settings.get('privacy.sensitiveProcesses') || [])
}

function titleMatches(title, list) {
  const text = String(title || '').toLowerCase()
  return normalizeList(list).some((pattern) => text.includes(String(pattern).toLowerCase()))
}

function isSystemIdleProcess(processName) {
  return isProcessInList(processName, settings.get('privacy.activityIgnoredProcesses') || ['lockapp', 'logonui', 'screensaver'])
}

function isIgnoredTitle(title) {
  return titleMatches(title, settings.get('privacy.activityIgnoredTitles') || [])
}

function shouldRedactTitle(title, processName) {
  if (!settings.get('privacy.blurSensitiveWindows')) return false
  return isSensitiveProcess(processName) || titleMatches(title, settings.get('privacy.sensitiveTitlePatterns') || [])
}

function redactTitle(title, processName) {
  if (!title) return null
  if (shouldRedactTitle(title, processName)) return '敏感窗口 · 已脱敏'
  return title
}

async function tick() {
  const cfg = settings.get('activity') || {}
  if (cfg.enabled === false) return null
  const win = await getActiveWindow(true).catch(() => null)
  const now = Date.now()
  const idleSec = Number(win?.idleSec || 0)
  const idleThresholdSec = Math.max(30, Number(cfg.idleThresholdSec || settings.get('reminder.idleThresholdSec') || 300))
  const processName = win ? win.processName : null
  const rawTitle = win ? win.title : null
  const isIdle = idleSec >= idleThresholdSec || isSystemIdleProcess(processName) || isIgnoredTitle(rawTitle) ? 1 : 0
  const title = redactTitle(rawTitle, processName)
  activityRepo.insert({
    ts: now,
    windowTitle: title,
    processName,
    isIdle,
    idleSec,
    inputActive: isIdle ? 0 : 1
  })
  if (emitter) emitter(EVENTS.ACTIVITY_SNAPSHOT, { ts: now, windowTitle: title, processName, isIdle, idleSec })
  return { ts: now, windowTitle: title, processName, isIdle, idleSec }
}

function start() {
  if (timer) return
  tick()
  const sec = Math.max(10, settings.get('activity.pollIntervalSec') || 30)
  timer = setInterval(tick, sec * 1000)
}

function stop() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function sampleEndAt(samples, idx, rangeEnd, pollMs) {
  const next = samples[idx + 1]
  if (next) return Math.min(next.ts, rangeEnd)
  return Math.min(samples[idx].ts + pollMs, rangeEnd)
}

function sameActivityKind(a, b) {
  if (!a || !b) return false
  if (!!a.isIdle !== !!b.isIdle) return false
  if (a.isIdle && b.isIdle) return true
  return normalizeProcessName(a.processName) === normalizeProcessName(b.processName)
}

function summarizeSegment(seg) {
  const counts = new Map()
  for (const s of seg.samples) {
    const key = s.window_title || s.process_name || (seg.isIdle ? '空闲' : '未知活动')
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const topTitle = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null
  return {
    ...seg,
    title: seg.isIdle ? '可能离开电脑' : topTitle,
    processName: seg.processName || seg.samples.find((s) => s.process_name)?.process_name || null,
    durationSec: Math.max(0, Math.floor((seg.end - seg.start) / 1000)),
    sampleCount: seg.samples.length
  }
}

function buildActivitySegments(start, end, { minDurationSec = 30, gapMergeSec = 90 } = {}) {
  const pollSec = Math.max(10, settings.get('activity.pollIntervalSec') || 30)
  const pollMs = pollSec * 1000
  const samples = activityRepo.rawByRange(start, end)
  if (!samples.length) return []
  const segs = []
  let cur = null
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i]
    const sampleStart = Math.max(s.ts, start)
    const sampleEnd = sampleEndAt(samples, i, end, pollMs)
    if (sampleEnd <= sampleStart) continue
    const atom = {
      start: sampleStart,
      end: sampleEnd,
      isIdle: !!s.is_idle || isSystemIdleProcess(s.process_name) || isIgnoredTitle(s.window_title),
      processName: s.process_name || null,
      samples: [s]
    }
    const gap = cur ? atom.start - cur.end : 0
    if (cur && gap <= gapMergeSec * 1000 && sameActivityKind(cur, atom)) {
      cur.end = Math.max(cur.end, atom.end)
      cur.samples.push(s)
      if (!cur.processName && atom.processName) cur.processName = atom.processName
    } else {
      if (cur) segs.push(summarizeSegment(cur))
      cur = atom
    }
  }
  if (cur) segs.push(summarizeSegment(cur))
  return segs.filter((s) => s.durationSec >= minDurationSec)
}

function intervalOverlap(aStart, aEnd, bStart, bEnd) {
  return Math.max(aStart, bStart) < Math.min(aEnd, bEnd)
}

function clipToIntervals(seg, intervals, kind) {
  const out = []
  for (const it of intervals) {
    const s = Math.max(seg.start, it.start)
    const e = Math.min(seg.end, it.end)
    if (e > s) out.push({ ...seg, start: s, end: e, durationSec: Math.floor((e - s) / 1000), kind, entryId: it.entryId || null })
  }
  return out
}

function blankIntervals(start, end, entries) {
  const busy = entries
    .map((e) => ({ start: Math.max(start, e.start_time), end: Math.min(end, e.end_time || Date.now()), entryId: e.id }))
    .filter((x) => x.end > x.start)
    .sort((a, b) => a.start - b.start)
  const blanks = []
  let cursor = start
  for (const b of busy) {
    if (b.start > cursor) blanks.push({ start: cursor, end: b.start })
    cursor = Math.max(cursor, b.end)
  }
  if (cursor < end) blanks.push({ start: cursor, end })
  return blanks
}

function entryIntervals(start, end, entries) {
  return entries
    .map((e) => ({ start: Math.max(start, e.start_time), end: Math.min(end, e.end_time || Date.now()), entryId: e.id, entry: e }))
    .filter((x) => x.end > x.start)
}

function signatureOf(item) {
  return `${item.kind}:${item.start}:${item.end}:${item.processName || ''}:${item.entryId || ''}`
}

function listSuggestions({ start, end } = {}) {
  const dayStart = Number(start)
  const dayEnd = Number(end)
  if (!Number.isFinite(dayStart) || !Number.isFinite(dayEnd) || dayEnd <= dayStart) return { ok: false, error: '时间范围无效' }
  const cfg = settings.get('activity') || {}
  const segments = buildActivitySegments(dayStart, dayEnd, {
    minDurationSec: Math.max(15, Number(cfg.minSuggestionSec || 60)),
    gapMergeSec: Math.max(15, Number(cfg.gapMergeSec || 120))
  })
  const entries = entriesRepo.listByRange(dayStart, dayEnd)
  const blanks = blankIntervals(dayStart, dayEnd, entries)
  const entryIts = entryIntervals(dayStart, dayEnd, entries)
  const ignored = new Set(activityRepo.ignoredByRange(dayStart, dayEnd).map((x) => x.signature))
  const out = []
  for (const seg of segments) {
    const base = {
      start: seg.start,
      end: seg.end,
      durationSec: seg.durationSec,
      isIdle: !!seg.isIdle,
      title: seg.title,
      processName: seg.processName,
      sampleCount: seg.sampleCount
    }
    if (!seg.isIdle) {
      for (const piece of clipToIntervals(base, blanks, 'unrecorded_active')) out.push(piece)
      for (const piece of clipToIntervals(base, entryIts, 'entry_context')) out.push(piece)
    } else {
      for (const piece of clipToIntervals(base, entryIts, 'idle_inside_entry')) out.push(piece)
    }
  }
  const suggestions = out
    .filter((x) => x.durationSec >= Math.max(15, Number(cfg.minSuggestionSec || 60)))
    .map((x) => {
      const item = { ...x }
      item.signature = signatureOf(item)
      item.ignored = ignored.has(item.signature)
      return item
    })
    .filter((x) => !x.ignored)
    .sort((a, b) => a.start - b.start)
  return { ok: true, suggestions }
}

function ignoreSuggestion(item = {}) {
  const signature = item.signature || signatureOf(item)
  if (!signature || !Number.isFinite(Number(item.start))) return { ok: false, error: '线索无效' }
  activityRepo.ignore({ signature, start: Number(item.start), end: Number(item.end || item.start), reason: item.reason || null })
  return { ok: true, signature }
}

function convertToLedger({ start, end, tagId = null, detail = null } = {}) {
  const s = Number(start)
  const e = Number(end)
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return { ok: false, error: '线索时间无效' }
  const overlaps = entriesRepo.overlapping(s, e)
  if (overlaps.length) return { ok: false, error: '该线索与已有台账重叠，请只补记空白区间' }
  return ledger.manualCreate({ startTime: s, endTime: e, tagId, detail: detail || '根据活动轨迹补记' })
}

function findBreakTagId() {
  const row = getDb().prepare('SELECT * FROM tags WHERE is_break = 1 ORDER BY sort_order, id LIMIT 1').get()
  return row ? row.id : (tagsRepo.findOtherTag()?.id || null)
}

function applyIdleBreak({ entryId, start, end, detail = null } = {}) {
  const entry = entriesRepo.get(Number(entryId))
  if (!entry) return { ok: false, error: '记录不存在' }
  if (!entry.end_time) return { ok: false, error: '进行中的记录请先完成后再按轨迹切分' }
  const s = Number(start)
  const e = Number(end)
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return { ok: false, error: '轨迹时间无效' }
  const innerStart = Math.max(entry.start_time, s)
  const innerEnd = Math.min(entry.end_time, e)
  if (innerEnd <= innerStart || innerStart <= entry.start_time || innerEnd >= entry.end_time) return { ok: false, error: '轨迹需要位于记录片段内部' }
  const breakTagId = findBreakTagId()
  const note = detail || '活动轨迹显示这段可能离开电脑'
  const p1 = timelinePointsRepo.insert({ entryId: entry.id, ts: innerStart, tagId: breakTagId, detail: note })
  const p2 = timelinePointsRepo.insert({ entryId: entry.id, ts: innerEnd, tagId: entry.tag_id, detail: '根据活动轨迹恢复原标签' })
  return ledger.applyTimelinePointPlan({
    entryId: entry.id,
    baseTagId: entry.tag_id,
    detail: entry.detail,
    points: [
      { id: p1.id, ts: innerStart, tagId: breakTagId, detail: note },
      { id: p2.id, ts: innerEnd, tagId: entry.tag_id, detail: '根据活动轨迹恢复原标签' }
    ]
  })
}

module.exports = {
  attachEventSender,
  start,
  stop,
  tick,
  buildActivitySegments,
  listSuggestions,
  ignoreSuggestion,
  convertToLedger,
  applyIdleBreak
}
