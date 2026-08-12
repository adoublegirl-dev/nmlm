// 台账状态机：兼容旧 start/stop，同时支持任务播放器 switchTask / complete / pausePoint。
const { getDb, entriesRepo, tagsRepo, pausePointsRepo } = require('../db')
const { FRAGMENT_THRESHOLD_SEC } = require('../../shared/constants')
const winUtil = require('../utils/window')

let emitter = null
let pausedSession = null // { entryId, pointId, pausedAt }

function attachEventSender(fn) { emitter = fn }
function emit(state, entry) { if (emitter) emitter({ state, entry }) }

function rawCurrent() {
  return entriesRepo.current() || null
}

function activeSegmentTagId(entry) {
  if (!entry) return null
  const points = pausePointsRepo.listByEntry(entry.id)
  const latest = points[points.length - 1]
  return latest && latest.tag_id != null ? latest.tag_id : entry.tag_id
}

function decoratePaused(entry) {
  if (!entry) {
    pausedSession = null
    return null
  }
  const activeTagId = activeSegmentTagId(entry)
  if (pausedSession && pausedSession.entryId === entry.id) {
    return { ...entry, active_tag_id: activeTagId, paused: true, paused_at: pausedSession.pausedAt, pause_point_id: pausedSession.pointId }
  }
  if (pausedSession && pausedSession.entryId !== entry.id) pausedSession = null
  return { ...entry, active_tag_id: activeTagId, paused: false }
}

function validTagId(tagId) {
  if (tagId == null) return null
  const t = tagsRepo.get(tagId)
  return t ? tagId : null
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

// 旧接口：开始一个未标记段；如果当前处于暂停态，则转为“继续”。
async function start({ tagId = null, detail = null } = {}) {
  const finalTagId = validTagId(tagId)
  if (tagId != null && finalTagId == null) return { ok: false, error: '标签不存在' }
  const cur = rawCurrent()
  if (cur) {
    if (pausedSession && pausedSession.entryId === cur.id) return resume({ tagId: finalTagId ?? cur.tag_id, detail })
    return { ok: false, error: '已在记录中' }
  }
  const entry = entriesRepo.insert({ startTime: Date.now(), tagId: finalTagId, detail })
  pausedSession = null
  emit('recording', entry)
  return { ok: true, entry: decoratePaused(entry) }
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
  if (previous && pausedSession && pausedSession.entryId === previous.id) return resume({ tagId: finalTagId, detail })
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
  pausedSession = null
  emit('recording', entry)
  return { ok: true, entry: decoratePaused(entry), finished }
}

// 新接口：完成当前任务，不开启新任务
async function complete({ tagId, detail } = {}) {
  const cur = rawCurrent()
  if (!cur) return { ok: false, error: '没有进行中的任务' }
  const endTime = pausedSession && pausedSession.entryId === cur.id ? pausedSession.pausedAt : Date.now()
  if (pausedSession && pausedSession.entryId === cur.id && pausedSession.pointId) pausePointsRepo.remove(pausedSession.pointId)
  pausedSession = null
  const entry = await finishEntry(cur, { tagId, detail, endTime, state: 'completed' })
  return { ok: true, entry }
}

// F8 暂停：不结束当前记录，只在时间轴上留下一个暂停点，并进入暂停态。
async function pause({ detail = null } = {}) {
  const cur = rawCurrent()
  if (!cur) return { ok: false, error: '没有进行中的记录' }
  if (pausedSession && pausedSession.entryId === cur.id) return { ok: true, entry: decoratePaused(cur), paused: true }
  const pausedAt = Date.now()
  const point = pausePointsRepo.insert({ entryId: cur.id, ts: pausedAt, detail, tagId: activeSegmentTagId(cur) })
  pausedSession = { entryId: cur.id, pointId: point.id, pausedAt }
  const entry = decoratePaused(cur)
  emit('paused', { entry, point })
  return { ok: true, entry, point, paused: true }
}

async function resume({ tagId = null, detail = null } = {}) {
  const cur = rawCurrent()
  if (!cur) return { ok: false, error: '没有可继续的记录' }
  if (!pausedSession || pausedSession.entryId !== cur.id) return { ok: true, entry: decoratePaused(cur), resumed: false }
  const finalTagId = tagId == null ? cur.tag_id : validTagId(tagId)
  if (tagId != null && finalTagId == null) return { ok: false, error: '标签不存在' }
  const pausedAt = pausedSession.pausedAt
  const pointId = pausedSession.pointId

  if (Number(finalTagId) === Number(cur.tag_id)) {
    pausedSession = null
    const entry = decoratePaused(entriesRepo.get(cur.id))
    emit('recording', entry)
    return { ok: true, entry, resumed: true, split: false }
  }

  const win = await winUtil.getActiveWindow().catch(() => null)
  const durationSec = Math.max(0, Math.floor((pausedAt - cur.start_time) / 1000))
  const tx = getDb().transaction(() => {
    pausePointsRepo.remove(pointId)
    const finished = entriesRepo.finish(cur.id, {
      endTime: pausedAt,
      durationSec,
      tagId: cur.tag_id,
      detail: cur.detail,
      windowTitle: win ? win.title : cur.window_title,
      isFragment: durationSec < FRAGMENT_THRESHOLD_SEC ? 1 : 0
    })
    const entry = entriesRepo.insert({
      startTime: pausedAt,
      tagId: finalTagId,
      detail,
      windowTitle: win ? win.title : null
    })
    return { finished, entry }
  })
  const result = tx()
  pausedSession = null
  emit('recording', result.entry)
  return { ok: true, entry: decoratePaused(result.entry), finished: result.finished, resumed: true, split: true }
}

function current() { return decoratePaused(rawCurrent()) }

function retag(id, { tagId = null, detail = null } = {}) {
  const entry = entriesRepo.get(id)
  if (!entry) return { ok: false, error: '记录不存在' }
  const updated = entriesRepo.updateMeta(id, { tagId: validTagId(tagId), detail: detail !== null ? detail : entry.detail })
  return { ok: true, entry: updated }
}

function addPausePoint({ detail = null } = {}) {
  const cur = entriesRepo.current()
  if (!cur) return { ok: false, error: '没有进行中的任务' }
  const point = pausePointsRepo.insert({ entryId: cur.id, detail })
  emit('pause-point', { entry: cur, point })
  return { ok: true, point }
}

function listPausePointsByRange(start, end) { return pausePointsRepo.listByRange(start, end) }
function listByRange(start, end) { return entriesRepo.listByRange(start, end) }

function applyPausePointPlan({ entryId, points = [], baseTagId, detail } = {}) {
  const entry = entriesRepo.get(entryId)
  if (!entry) return { ok: false, error: '记录不存在' }
  const finalBaseTagId = baseTagId !== undefined ? validTagId(baseTagId) : entry.tag_id
  if (baseTagId != null && finalBaseTagId == null) return { ok: false, error: '标签不存在' }
  const finalDetail = detail !== undefined ? detail : entry.detail
  const existing = pausePointsRepo.listByEntry(entry.id)
  const existingIds = new Set(existing.map((p) => p.id))
  for (const p of points) {
    if (!existingIds.has(p.id)) return { ok: false, error: '暂停点不存在' }
    const finalTagId = validTagId(p.tagId)
    if (p.tagId != null && finalTagId == null) return { ok: false, error: '标签不存在' }
  }

  const wantsSplit = points.some((p) => Number(p.tagId) !== Number(finalBaseTagId))

  const tx = getDb().transaction(() => {
    for (const p of points) pausePointsRepo.update(p.id, { tagId: p.tagId, detail: p.detail || null })
    if (!wantsSplit) {
      const updated = entriesRepo.updateMeta(entry.id, { tagId: finalBaseTagId, detail: finalDetail })
      return { entries: [updated], split: false, updatedOnly: true }
    }

    const latestEntry = entriesRepo.get(entry.id)
    const splitEnd = latestEntry.end_time || Date.now()
    const isOngoingSplit = !latestEntry.end_time
    const latestPoints = pausePointsRepo
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

    pausePointsRepo.removeByEntry(latestEntry.id)
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
    if (isOngoingSplit && pausedSession && pausedSession.entryId === latestEntry.id) pausedSession = null
    return { entries: created, split: created.length > 1 }
  })

  const result = tx()
  emit(result.split ? 'split' : 'pause-point-updated', result)
  return { ok: true, ...result }
}

function applyPausePointTag({ entryId, pointId, tagId = null } = {}) {
  const point = pausePointsRepo.get(pointId)
  if (!point) return { ok: false, error: '暂停点不存在' }
  return applyPausePointPlan({ entryId, points: [{ id: pointId, tagId, detail: point.detail }] })
}

function recover(now = Date.now()) {
  pausedSession = null
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
  pause,
  resume,
  current,
  listByRange,
  retag,
  addPausePoint,
  listPausePointsByRange,
  applyPausePointTag,
  applyPausePointPlan,
  recover
}
