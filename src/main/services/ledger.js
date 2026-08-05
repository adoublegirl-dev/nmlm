// 台账状态机：start / stop / pause / current / recover。
// 依赖 repos 与 utils/window，可直接用内存库单测。
const { entriesRepo, tagsRepo } = require('../db')
const { FRAGMENT_THRESHOLD_SEC } = require('../../shared/constants')
const winUtil = require('../utils/window')

let emitter = null

function attachEventSender(fn) {
  emitter = fn
}

function emit(state, entry) {
  if (emitter) emitter({ state, entry })
}

async function start() {
  if (entriesRepo.current()) return { ok: false, error: '已在记录中' }
  const entry = entriesRepo.insert({ startTime: Date.now() })
  emit('recording', entry)
  return { ok: true, entry }
}

async function stop({ tagId = null, detail = null } = {}) {
  const current = entriesRepo.current()
  if (!current) return { ok: false, error: '没有进行中的记录' }
  const now = Date.now()
  const durationSec = Math.max(0, Math.floor((now - current.start_time) / 1000))
  const win = await winUtil.getActiveWindow().catch(() => null)
  let tagIdFinal = tagId
  if (tagIdFinal != null) {
    const t = tagsRepo.get(tagIdFinal)
    if (!t) tagIdFinal = null
  }
  const entry = entriesRepo.finish(current.id, {
    endTime: now,
    durationSec,
    tagId: tagIdFinal,
    detail,
    windowTitle: win ? win.title : null,
    isFragment: durationSec < FRAGMENT_THRESHOLD_SEC ? 1 : 0
  })
  emit('idle', entry)
  return { ok: true, entry }
}

// 暂停：归档当前段（无标签）并立即新建一段，现场保留
async function pause() {
  const current = entriesRepo.current()
  if (!current) return { ok: false, error: '没有进行中的记录' }
  await stop({})
  const entry = entriesRepo.insert({ startTime: Date.now() })
  emit('recording', entry)
  return { ok: true, entry }
}

function current() {
  return entriesRepo.current() || null
}

// 补打标签：结束归档后由 TagPicker 调用
function retag(id, { tagId = null, detail = null } = {}) {
  const entry = entriesRepo.get(id)
  if (!entry) return { ok: false, error: '记录不存在' }
  let tagIdFinal = tagId
  if (tagIdFinal != null) {
    const t = tagsRepo.get(tagIdFinal)
    if (!t) tagIdFinal = null
  }
  const updated = entriesRepo.finish(id, {
    endTime: entry.end_time,
    durationSec: entry.duration_sec,
    tagId: tagIdFinal,
    detail: detail !== null ? detail : entry.detail,
    windowTitle: entry.window_title,
    isFragment: entry.is_fragment
  })
  return { ok: true, entry: updated }
}

function listByRange(start, end) {
  return entriesRepo.listByRange(start, end)
}

// 崩溃恢复：启动时调用
function recover(now = Date.now()) {
  const unfinished = entriesRepo.allUnfinished()
  for (const e of unfinished) {
    const other = tagsRepo.findOtherTag()
    entriesRepo.finish(e.id, {
      endTime: now,
      durationSec: Math.max(0, Math.floor((now - e.start_time) / 1000)),
      tagId: other ? other.id : null,
      detail: '[崩溃恢复]',
      windowTitle: null,
      isFragment: 0
    })
  }
  if (unfinished.length) emit('recovered', { count: unfinished.length })
  return unfinished.length
}

module.exports = { attachEventSender, start, stop, pause, current, listByRange, retag, recover }
