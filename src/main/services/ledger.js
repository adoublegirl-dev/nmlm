// 台账状态机：兼容旧 start/stop，同时支持任务播放器 switchTask / complete / pausePoint。
const { getDb, entriesRepo, tagsRepo, pausePointsRepo } = require('../db')
const { FRAGMENT_THRESHOLD_SEC } = require('../../shared/constants')
const winUtil = require('../utils/window')

let emitter = null

function attachEventSender(fn) { emitter = fn }
function emit(state, entry) { if (emitter) emitter({ state, entry }) }

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

// 旧接口：开始一个未标记段
async function start({ tagId = null, detail = null } = {}) {
  if (entriesRepo.current()) return { ok: false, error: '已在记录中' }
  const entry = entriesRepo.insert({ startTime: Date.now(), tagId: validTagId(tagId), detail })
  emit('recording', entry)
  return { ok: true, entry }
}

// 旧接口：结束当前段。默认保留当前标签/备注；传 tagId/detail 时覆盖
async function stop({ tagId, detail } = {}) {
  const cur = entriesRepo.current()
  if (!cur) return { ok: false, error: '没有进行中的记录' }
  const entry = await finishEntry(cur, { tagId, detail, state: 'idle' })
  return { ok: true, entry }
}

// 新接口：任务播放器“开始/切换任务”。若已有任务，自动结束上一段，再开启新段
async function switchTask({ tagId = null, detail = null } = {}) {
  const finalTagId = validTagId(tagId)
  if (tagId != null && finalTagId == null) return { ok: false, error: '标签不存在' }
  const now = Date.now()
  const previous = entriesRepo.current()
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
  return { ok: true, entry, finished }
}

// 新接口：完成当前任务，不开启新任务
async function complete({ detail } = {}) {
  const cur = entriesRepo.current()
  if (!cur) return { ok: false, error: '没有进行中的任务' }
  const entry = await finishEntry(cur, { detail, state: 'completed' })
  return { ok: true, entry }
}

// 暂停：保留旧语义，切出一段未标记的新记录。新 UI 主要使用 addPausePoint
async function pause() {
  const cur = entriesRepo.current()
  if (!cur) return { ok: false, error: '没有进行中的记录' }
  await finishEntry(cur, { state: 'paused' })
  const entry = entriesRepo.insert({ startTime: Date.now(), tagId: cur.tag_id, detail: cur.detail })
  emit('recording', entry)
  return { ok: true, entry }
}

function current() { return entriesRepo.current() || null }

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

function applyPausePointPlan({ entryId, points = [] } = {}) {
  const entry = entriesRepo.get(entryId)
  if (!entry) return { ok: false, error: '记录不存在' }
  const existing = pausePointsRepo.listByEntry(entry.id)
  const existingIds = new Set(existing.map((p) => p.id))
  for (const p of points) {
    if (!existingIds.has(p.id)) return { ok: false, error: '暂停点不存在' }
    const finalTagId = validTagId(p.tagId)
    if (p.tagId != null && finalTagId == null) return { ok: false, error: '标签不存在' }
  }

  const wantsSplit = points.some((p) => Number(p.tagId) !== Number(entry.tag_id))
  if (wantsSplit && !entry.end_time) return { ok: false, error: '进行中的记录暂不支持拆分' }

  const tx = getDb().transaction(() => {
    for (const p of points) pausePointsRepo.update(p.id, { tagId: p.tagId, detail: p.detail || null })
    if (!wantsSplit) return { entries: [entry], split: false, updatedOnly: true }

    const latestEntry = entriesRepo.get(entry.id)
    const latestPoints = pausePointsRepo
      .listByEntry(entry.id)
      .filter((p) => p.ts > latestEntry.start_time && p.ts < latestEntry.end_time)
      .sort((a, b) => a.ts - b.ts)

    const rawSegments = []
    let cursor = latestEntry.start_time
    let currentTag = latestEntry.tag_id
    for (const p of latestPoints) {
      if (p.ts > cursor) rawSegments.push({ start: cursor, end: p.ts, tagId: currentTag })
      cursor = p.ts
      currentTag = p.tag_id == null ? latestEntry.tag_id : p.tag_id
    }
    if (latestEntry.end_time > cursor) rawSegments.push({ start: cursor, end: latestEntry.end_time, tagId: currentTag })

    const merged = []
    for (const s of rawSegments) {
      if (s.end <= s.start) continue
      const last = merged[merged.length - 1]
      if (last && last.tagId === s.tagId) last.end = s.end
      else merged.push({ ...s })
    }
    if (!merged.length) return { entries: [latestEntry], split: false }

    pausePointsRepo.removeByEntry(latestEntry.id)
    const created = []
    const writeSegment = (baseId, s) => {
      const durationSec = Math.max(0, Math.floor((s.end - s.start) / 1000))
      const isFragment = durationSec < FRAGMENT_THRESHOLD_SEC ? 1 : 0
      if (baseId) {
        return entriesRepo.finish(baseId, {
          endTime: s.end,
          durationSec,
          tagId: s.tagId,
          detail: latestEntry.detail,
          windowTitle: latestEntry.window_title,
          isFragment
        })
      }
      return entriesRepo.insertFinished({
        startTime: s.start,
        endTime: s.end,
        durationSec,
        tagId: s.tagId,
        detail: latestEntry.detail,
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
  emit(result.split ? 'split' : 'pause-point-updated', result)
  return { ok: true, ...result }
}

function applyPausePointTag({ entryId, pointId, tagId = null } = {}) {
  const point = pausePointsRepo.get(pointId)
  if (!point) return { ok: false, error: '暂停点不存在' }
  return applyPausePointPlan({ entryId, points: [{ id: pointId, tagId, detail: point.detail }] })
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
  pause,
  current,
  listByRange,
  retag,
  addPausePoint,
  listPausePointsByRange,
  applyPausePointTag,
  applyPausePointPlan,
  recover
}
