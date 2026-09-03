// 台账状态机：兼容 start/stop，同时支持任务播放器 switchTask / complete / timeline point。
const { getDb, entriesRepo, tagsRepo, timelinePointsRepo, timelineMarkersRepo, ledgerRevisionsRepo } = require('../db')
const { FRAGMENT_THRESHOLD_SEC } = require('../../shared/constants')
const winUtil = require('../utils/window')

let emitter = null
function attachEventSender(fn) { emitter = fn }
function emit(state, entry) { if (emitter) emitter({ state, entry }) }

function rawCurrent() {
  return entriesRepo.current() || null
}

function activeSegmentTagId(entry) {
  if (!entry) return null
  const points = timelinePointsRepo.listByEntry(entry.id)
  const latest = points[points.length - 1]
  return latest && latest.tag_id != null ? latest.tag_id : entry.tag_id
}

function decorateCurrent(entry) { return entry ? { ...entry, active_tag_id: activeSegmentTagId(entry) } : null }

function validTagId(tagId) {
  if (tagId == null) return null
  const t = tagsRepo.get(tagId)
  return t ? tagId : null
}

function normalizeTimeRange({ startTime, endTime, now = Date.now() }) {
  const s = Number(startTime)
  const e = Number(endTime)
  if (!Number.isFinite(s) || !Number.isFinite(e)) return { ok: false, error: '时间格式不正确' }
  if (s > now || e > now) return { ok: false, error: '开始/结束时间不能晚于当前时间' }
  if (e <= s) return { ok: false, error: '结束时间必须晚于开始时间' }
  return { ok: true, startTime: s, endTime: e, durationSec: Math.max(0, Math.floor((e - s) / 1000)) }
}

function assertNoOverlap(startTime, endTime, { excludeId = null } = {}) {
  const overlaps = entriesRepo.overlapping(startTime, endTime, { excludeId })
  if (overlaps.length) {
    const first = overlaps[0]
    return { ok: false, error: `时间与已有记录重叠（#${first.id}），请先调整时间` }
  }
  return { ok: true }
}

function isFragmentByDuration(durationSec) {
  return durationSec < FRAGMENT_THRESHOLD_SEC ? 1 : 0
}

async function finishEntry(entry, { tagId, detail, endTime = Date.now(), state = 'idle' } = {}) {
  const durationSec = Math.max(0, Math.floor((endTime - entry.start_time) / 1000))
  const win = await winUtil.getActiveWindow().catch(() => null)
  const finalTagId = tagId !== undefined ? validTagId(tagId) : entry.tag_id
  const finalDetail = detail !== undefined ? detail : entry.detail
  const updated = entriesRepo.finish(entry.id, {
    endTime,
    durationSec,
    tagId: finalTagId,
    detail: finalDetail,
    windowTitle: win ? win.title : entry.window_title,
    isFragment: durationSec < FRAGMENT_THRESHOLD_SEC ? 1 : 0
  })
  emit(state, updated)
  return updated
}

// 开始一条进行中的记录。
async function start({ tagId = null, detail = null } = {}) {
  const finalTagId = validTagId(tagId)
  if (tagId != null && finalTagId == null) return { ok: false, error: '标签不存在' }
  const cur = rawCurrent()
  if (cur) return { ok: false, error: '已在记录中' }
  const entry = entriesRepo.insert({ startTime: Date.now(), tagId: finalTagId, detail })
  emit('recording', entry)
  return { ok: true, entry: decorateCurrent(entry) }
}

// 旧接口：结束当前段。默认保留当前标签/备注；传 tagId/detail 时覆盖
async function stop({ tagId, detail } = {}) {
  return complete({ tagId, detail })
}

// 新接口：任务播放器“开始/切换任务”。若已有任务，自动结束上一段，再开启新段
async function switchTask({ tagId = null, detail = null } = {}) {
  const finalTagId = validTagId(tagId)
  if (tagId != null && finalTagId == null) return { ok: false, error: '标签不存在' }
  const previous = rawCurrent()
  const now = Date.now()
  let finished = null
  if (previous) finished = await finishEntry(previous, { endTime: now, state: 'switched' })
  const win = await winUtil.getActiveWindow().catch(() => null)
  const entry = entriesRepo.insert({
    startTime: now,
    tagId: finalTagId,
    detail,
    windowTitle: win ? win.title : null
  })
  emit('recording', entry)
  return { ok: true, entry: decorateCurrent(entry), finished }
}

// 新接口：完成当前任务，不开启新任务
async function complete({ tagId, detail } = {}) {
  const cur = rawCurrent()
  if (!cur) return { ok: false, error: '没有进行中的任务' }
  const entry = await finishEntry(cur, { tagId, detail, endTime: Date.now(), state: 'completed' })
  return { ok: true, entry }
}

function current() { return decorateCurrent(rawCurrent()) }

function sameTag(a, b) {
  return Number(a?.tag_id ?? 0) === Number(b?.tag_id ?? 0)
}

function mergeAdjacentSameTagAround(entryId) {
  const entry = entriesRepo.get(entryId)
  if (!entry || !entry.end_time) return entry
  return getDb().transaction(() => {
    let cur = entriesRepo.get(entryId)
    let changed = false
    while (cur && cur.end_time) {
      const prev = getDb().prepare('SELECT * FROM time_entries WHERE end_time = ? AND id != ? ORDER BY id DESC LIMIT 1').get(cur.start_time, cur.id)
      if (!prev || !prev.end_time || !sameTag(prev, cur)) break
      const durationSec = Math.max(0, Math.floor((cur.end_time - prev.start_time) / 1000))
      entriesRepo.finish(prev.id, {
        endTime: cur.end_time,
        durationSec,
        tagId: prev.tag_id,
        detail: prev.detail || cur.detail,
        windowTitle: prev.window_title || cur.window_title,
        isFragment: isFragmentByDuration(durationSec)
      })
      timelinePointsRepo.removeByEntry(cur.id)
      entriesRepo.remove(cur.id)
      cur = entriesRepo.get(prev.id)
      changed = true
    }
    while (cur && cur.end_time) {
      const next = getDb().prepare('SELECT * FROM time_entries WHERE start_time = ? AND id != ? ORDER BY id LIMIT 1').get(cur.end_time, cur.id)
      if (!next || !next.end_time || !sameTag(cur, next)) break
      const durationSec = Math.max(0, Math.floor((next.end_time - cur.start_time) / 1000))
      entriesRepo.finish(cur.id, {
        endTime: next.end_time,
        durationSec,
        tagId: cur.tag_id,
        detail: cur.detail || next.detail,
        windowTitle: cur.window_title || next.window_title,
        isFragment: isFragmentByDuration(durationSec)
      })
      timelinePointsRepo.removeByEntry(next.id)
      entriesRepo.remove(next.id)
      cur = entriesRepo.get(cur.id)
      changed = true
    }
    if (changed) ledgerRevisionsRepo.insert({ entryId: cur.id, action: 'merge_adjacent_same_tag', before: { entryId }, after: cur })
    return cur
  })()
}

function retag(id, { tagId = null, detail = null } = {}) {
  const entry = entriesRepo.get(id)
  if (!entry) return { ok: false, error: '记录不存在' }
  const updated = entriesRepo.updateMeta(id, { tagId: validTagId(tagId), detail: detail !== null ? detail : entry.detail })
  const merged = mergeAdjacentSameTagAround(updated.id)
  return { ok: true, entry: merged || updated }
}

function adjustTime({ id, startTime, endTime } = {}) {
  const entry = entriesRepo.get(id)
  if (!entry) return { ok: false, error: '记录不存在' }
  if (!entry.end_time) return { ok: false, error: '进行中的记录请先完成，再校准时间' }
  const range = normalizeTimeRange({ startTime, endTime })
  if (!range.ok) return range
  const overlap = assertNoOverlap(range.startTime, range.endTime, { excludeId: entry.id })
  if (!overlap.ok) return overlap
  const points = timelinePointsRepo.listByEntry(entry.id)
  const outPoint = points.find((p) => p.ts <= range.startTime || p.ts >= range.endTime)
  if (outPoint) return { ok: false, error: '已有时间节点超出新的起止范围，请先调整切点或拆分记录' }
  const before = { ...entry, timelinePoints: points }
  const updated = entriesRepo.updateTime(entry.id, {
    startTime: range.startTime,
    endTime: range.endTime,
    durationSec: range.durationSec,
    isFragment: isFragmentByDuration(range.durationSec)
  })
  ledgerRevisionsRepo.insert({ entryId: entry.id, action: 'adjust_time', before, after: updated })
  emit('time-adjusted', updated)
  return { ok: true, entry: updated }
}

function manualCreate({ startTime, endTime, tagId = null, detail = null } = {}) {
  const finalTagId = validTagId(tagId)
  if (tagId != null && finalTagId == null) return { ok: false, error: '标签不存在' }
  const range = normalizeTimeRange({ startTime, endTime })
  if (!range.ok) return range
  const overlap = assertNoOverlap(range.startTime, range.endTime)
  if (!overlap.ok) return overlap
  const entry = entriesRepo.insertFinished({
    startTime: range.startTime,
    endTime: range.endTime,
    durationSec: range.durationSec,
    tagId: finalTagId,
    detail,
    windowTitle: '[人工补记]',
    isFragment: isFragmentByDuration(range.durationSec)
  })
  ledgerRevisionsRepo.insert({ entryId: entry.id, action: 'manual_create', before: null, after: entry })
  emit('manual-created', entry)
  return { ok: true, entry }
}

function addKeyframe({ detail = null } = {}) {
  const cur = entriesRepo.current()
  if (!cur) return { ok: false, error: '没有进行中的任务' }
  const point = timelinePointsRepo.insert({ entryId: cur.id, detail })
  const marker = timelineMarkersRepo.insert({ entryId: cur.id, ts: point.ts })
  emit('keyframe', { entry: cur, point, marker })
  return { ok: true, point, marker }
}

function listTimelinePointsByRange(start, end) { return timelinePointsRepo.listByRange(start, end) }
function listTimelineMarkersByRange(start, end) { return timelineMarkersRepo.listByRange(start, end) }
function listByRange(start, end) { return entriesRepo.listByRange(start, end) }

function formatNodeTime(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function appendNodeNotes(detail, points = []) {
  const notes = points
    .filter((p) => p.detail)
    .map((p) => `${formatNodeTime(p.ts)} · ${p.detail}`)
  if (!notes.length) return detail
  const block = `时间节点记录：\n${notes.map((x) => `- ${x}`).join('\n')}`
  return detail ? `${detail}\n${block}` : block
}

function applyTimelinePointPlan({ entryId, points = [], baseTagId, detail, cleanupSameTagPoints = false } = {}) {
  const entry = entriesRepo.get(entryId)
  if (!entry) return { ok: false, error: '记录不存在' }
  const finalBaseTagId = baseTagId !== undefined ? validTagId(baseTagId) : entry.tag_id
  if (baseTagId != null && finalBaseTagId == null) return { ok: false, error: '标签不存在' }
  const finalDetail = detail !== undefined ? detail : entry.detail
  const splitEnd = entry.end_time || Date.now()
  const existing = timelinePointsRepo.listByEntry(entry.id)
  const existingIds = new Set(existing.map((p) => p.id))
  const normalizedPoints = []
  for (const p of points) {
    const idNum = Number(p.id)
    const isExisting = Number.isInteger(idNum) && existingIds.has(idNum)
    if (p.id != null && !String(p.id).startsWith('new-') && !isExisting) return { ok: false, error: '切点不存在' }
    const finalTagId = validTagId(p.tagId)
    if (p.tagId != null && finalTagId == null) return { ok: false, error: '标签不存在' }
    const pointTs = p.ts !== undefined ? Number(p.ts) : (isExisting ? existing.find((x) => x.id === idNum)?.ts : NaN)
    if (!Number.isFinite(pointTs)) return { ok: false, error: '切点时间格式不正确' }
    if (pointTs <= entry.start_time || pointTs >= splitEnd) return { ok: false, error: '切点必须位于记录开始和结束之间' }
    normalizedPoints.push({ id: isExisting ? idNum : null, ts: pointTs, tagId: finalTagId, detail: p.detail || null })
  }
  normalizedPoints.sort((a, b) => a.ts - b.ts)
  for (let i = 1; i < normalizedPoints.length; i += 1) {
    if (normalizedPoints[i].ts === normalizedPoints[i - 1].ts) return { ok: false, error: '不能添加重复时间切点' }
  }

  const wantsSplit = normalizedPoints.some((p) => Number(p.tagId) !== Number(finalBaseTagId))

  const tx = getDb().transaction(() => {
    for (const p of normalizedPoints) {
      if (p.id) timelinePointsRepo.update(p.id, { ts: p.ts, tagId: p.tagId, detail: p.detail })
      else timelinePointsRepo.insert({ entryId: entry.id, ts: p.ts, tagId: p.tagId, detail: p.detail })
    }
    if (!wantsSplit) {
      const latestPoints = timelinePointsRepo.listByEntry(entry.id).sort((a, b) => a.ts - b.ts)
      const nextDetail = cleanupSameTagPoints ? appendNodeNotes(finalDetail, latestPoints) : finalDetail
      if (cleanupSameTagPoints) timelinePointsRepo.removeByEntry(entry.id)
      const updated = entriesRepo.updateMeta(entry.id, { tagId: finalBaseTagId, detail: nextDetail })
      return { entries: [updated], split: false, updatedOnly: true, cleaned: !!cleanupSameTagPoints }
    }

    const latestEntry = entriesRepo.get(entry.id)
    const splitEnd = latestEntry.end_time || Date.now()
    const isOngoingSplit = !latestEntry.end_time
    const latestPoints = timelinePointsRepo
      .listByEntry(entry.id)
      .filter((p) => p.ts > latestEntry.start_time && p.ts < splitEnd)
      .sort((a, b) => a.ts - b.ts)

    const rawSegments = []
    let cursor = latestEntry.start_time
    let currentTag = finalBaseTagId
    for (const p of latestPoints) {
      if (p.ts > cursor) rawSegments.push({ start: cursor, end: p.ts, tagId: currentTag, ongoing: false })
      cursor = p.ts
      currentTag = p.tag_id == null ? finalBaseTagId : p.tag_id
    }
    if (splitEnd > cursor) rawSegments.push({ start: cursor, end: splitEnd, tagId: currentTag, ongoing: isOngoingSplit })

    const merged = []
    for (const s of rawSegments) {
      if (s.end <= s.start) continue
      const last = merged[merged.length - 1]
      if (last && last.tagId === s.tagId) {
        last.end = s.end
        last.ongoing = !!s.ongoing
      } else merged.push({ ...s })
    }
    if (!merged.length) return { entries: [latestEntry], split: false }

    timelinePointsRepo.removeByEntry(latestEntry.id)
    const created = []
    const writeSegment = (baseId, s) => {
      const durationSec = Math.max(0, Math.floor((s.end - s.start) / 1000))
      const isFragment = durationSec < FRAGMENT_THRESHOLD_SEC ? 1 : 0
      if (s.ongoing) {
        if (baseId) {
          getDb().prepare('UPDATE time_entries SET start_time = ?, tag_id = ?, detail = ?, window_title = ? WHERE id = ?')
            .run(s.start, s.tagId, finalDetail, latestEntry.window_title, baseId)
          return entriesRepo.get(baseId)
        }
        return entriesRepo.insert({
          startTime: s.start,
          tagId: s.tagId,
          detail: finalDetail,
          windowTitle: latestEntry.window_title
        })
      }
      if (baseId) {
        return entriesRepo.finish(baseId, {
          endTime: s.end,
          durationSec,
          tagId: s.tagId,
          detail: finalDetail,
          windowTitle: latestEntry.window_title,
          isFragment
        })
      }
      return entriesRepo.insertFinished({
        startTime: s.start,
        endTime: s.end,
        durationSec,
        tagId: s.tagId,
        detail: finalDetail,
        windowTitle: latestEntry.window_title,
        isFragment,
        createdAt: latestEntry.created_at
      })
    }

    const first = merged[0]
    getDb().prepare('UPDATE time_entries SET start_time = ? WHERE id = ?').run(first.start, latestEntry.id)
    created.push(writeSegment(latestEntry.id, first))
    for (const s of merged.slice(1)) created.push(writeSegment(null, s))
    return { entries: created, split: created.length > 1 }
  })

  const result = tx()
  emit(result.split ? 'split' : 'timeline-point-updated', result)
  return { ok: true, ...result }
}

function applyTimelinePointTag({ entryId, pointId, tagId = null } = {}) {
  const point = timelinePointsRepo.get(pointId)
  if (!point) return { ok: false, error: '切点不存在' }
  return applyTimelinePointPlan({ entryId, points: [{ id: pointId, tagId, detail: point.detail }] })
}

function recover(now = Date.now()) {
  const unfinished = entriesRepo.allUnfinished()
  for (const e of unfinished) {
    const other = tagsRepo.findOtherTag()
    entriesRepo.finish(e.id, {
      endTime: now,
      durationSec: Math.max(0, Math.floor((now - e.start_time) / 1000)),
      tagId: e.tag_id || (other ? other.id : null),
      detail: e.detail ? `${e.detail}\n[崩溃恢复]` : '[崩溃恢复]',
      windowTitle: e.window_title,
      isFragment: 0
    })
  }
  if (unfinished.length) emit('recovered', { count: unfinished.length })
  return unfinished.length
}

module.exports = {
  attachEventSender,
  start,
  stop,
  switchTask,
  complete,
  current,
  listByRange,
  retag,
  adjustTime,
  manualCreate,
  addKeyframe,
  listTimelinePointsByRange,
  listTimelineMarkersByRange,
  applyTimelinePointTag,
  applyTimelinePointPlan,
  recover
}
