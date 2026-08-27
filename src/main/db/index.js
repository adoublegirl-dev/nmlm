// DB 连接与仓储。核心逻辑全部经此层读写，主进程唯一数据出口。
const Database = require('better-sqlite3')
const { migrate } = require('./migrations')

let db = null

function init(dbPath) {
  db = new Database(dbPath)
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    migrate(db)
    return db
  } catch (e) {
    try { db.close() } catch (_) {}
    db = null
    throw e
  }
}

function getDb() {
  if (!db) throw new Error('DB 未初始化')
  return db
}

// ---------- 标签仓储 ----------
const tagsRepo = {
  all() {
    return getDb().prepare('SELECT * FROM tags ORDER BY sort_order, id').all()
  },
  get(id) {
    return getDb().prepare('SELECT * FROM tags WHERE id = ?').get(id)
  },
  getByName(name) {
    return getDb().prepare('SELECT * FROM tags WHERE name = ?').get(name)
  },
  create({ name, color = '#D4AF6A', shortcutKey = null, isBreak = 0 }) {
    const info = getDb()
      .prepare('INSERT INTO tags (name, color, shortcut_key, sort_order, is_break, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, color, shortcutKey, Date.now() % 1000, isBreak, Date.now())
    return this.get(info.lastInsertRowid)
  },
  update(id, patch) {
    const fields = []
    const vals = []
    const map = { name: 'name', color: 'color', shortcutKey: 'shortcut_key', isBreak: 'is_break', sortOrder: 'sort_order' }
    for (const [k, col] of Object.entries(map)) {
      if (patch[k] !== undefined) {
        fields.push(`${col} = ?`)
        vals.push(patch[k])
      }
    }
    if (!fields.length) return this.get(id)
    vals.push(id)
    getDb().prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`).run(...vals)
    return this.get(id)
  },
  remove(id) {
    getDb().prepare('UPDATE time_entries SET tag_id = NULL WHERE tag_id = ?').run(id)
    getDb().prepare('DELETE FROM tags WHERE id = ?').run(id)
  },
  findOtherTag() {
    return getDb().prepare("SELECT * FROM tags WHERE name = '其他'").get()
  }
}

// ---------- 台账记录仓储 ----------
const entriesRepo = {
  current() {
    return getDb().prepare('SELECT * FROM time_entries WHERE end_time IS NULL ORDER BY id DESC LIMIT 1').get()
  },
  insert({ startTime, tagId = null, detail = null, windowTitle = null }) {
    const info = getDb()
      .prepare('INSERT INTO time_entries (start_time, tag_id, detail, window_title, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(startTime, tagId, detail, windowTitle, Date.now())
    return this.get(info.lastInsertRowid)
  },
  insertFinished({ startTime, endTime, durationSec, tagId = null, detail = null, windowTitle = null, isFragment = 0, createdAt = Date.now() }) {
    const info = getDb()
      .prepare('INSERT INTO time_entries (start_time, end_time, duration_sec, tag_id, detail, window_title, is_fragment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(startTime, endTime, durationSec, tagId, detail, windowTitle, isFragment, createdAt)
    return this.get(info.lastInsertRowid)
  },
  get(id) {
    return getDb().prepare('SELECT * FROM time_entries WHERE id = ?').get(id)
  },
  finish(id, { endTime, durationSec, tagId = null, detail = null, windowTitle = null, isFragment = 0 }) {
    getDb()
      .prepare(`UPDATE time_entries
                SET end_time = ?, duration_sec = ?, tag_id = ?, detail = ?, window_title = ?, is_fragment = ?
                WHERE id = ?`)
      .run(endTime, durationSec, tagId, detail, windowTitle, isFragment, id)
    return this.get(id)
  },
  listByRange(start, end) {
    // 查询与 [start, end) 有交集的记录，而不是只查 start_time 落在范围内的记录。
    // 这样跨天记录在前后两天的日视图里都能被投影展示，但原始记录不被拆分。
    return getDb()
      .prepare('SELECT * FROM time_entries WHERE start_time < ? AND COALESCE(end_time, ?) > ? ORDER BY start_time')
      .all(end, Date.now(), start)
  },
  allUnfinished() {
    return getDb().prepare('SELECT * FROM time_entries WHERE end_time IS NULL ORDER BY start_time').all()
  },
  updateMeta(id, { tagId = null, detail = null }) {
    getDb()
      .prepare('UPDATE time_entries SET tag_id = ?, detail = ? WHERE id = ?')
      .run(tagId, detail, id)
    return this.get(id)
  },
  updateTime(id, { startTime, endTime, durationSec, isFragment }) {
    getDb()
      .prepare('UPDATE time_entries SET start_time = ?, end_time = ?, duration_sec = ?, is_fragment = ? WHERE id = ?')
      .run(startTime, endTime, durationSec, isFragment, id)
    return this.get(id)
  },
  overlapping(start, end, { excludeId = null, now = Date.now() } = {}) {
    const params = [end, now, start]
    let sql = 'SELECT * FROM time_entries WHERE start_time < ? AND COALESCE(end_time, ?) > ?'
    if (excludeId != null) {
      sql += ' AND id != ?'
      params.push(excludeId)
    }
    return getDb().prepare(sql + ' ORDER BY start_time').all(...params)
  },
  remove(id) {
    getDb().prepare('DELETE FROM time_entries WHERE id = ?').run(id)
    return { ok: true }
  }
}

// ---------- 暂停点仓储 ----------
const ledgerRevisionsRepo = {
  insert({ entryId = null, action, before = null, after = null }) {
    const info = getDb()
      .prepare('INSERT INTO ledger_revisions (entry_id, action, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(entryId, action, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), Date.now())
    return getDb().prepare('SELECT * FROM ledger_revisions WHERE id = ?').get(info.lastInsertRowid)
  },
  listByEntry(entryId) {
    return getDb().prepare('SELECT * FROM ledger_revisions WHERE entry_id = ? ORDER BY created_at DESC').all(entryId)
  }
}

const pausePointsRepo = {
  insert({ entryId = null, ts = Date.now(), detail = null, tagId = null }) {
    const info = getDb()
      .prepare('INSERT INTO pause_points (entry_id, ts, detail, tag_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(entryId, ts, detail, tagId, Date.now())
    return this.get(info.lastInsertRowid)
  },
  get(id) {
    return getDb().prepare('SELECT * FROM pause_points WHERE id = ?').get(id)
  },
  listByEntry(entryId) {
    return getDb().prepare('SELECT * FROM pause_points WHERE entry_id = ? ORDER BY ts').all(entryId)
  },
  listByRange(start, end) {
    return getDb().prepare('SELECT * FROM pause_points WHERE ts >= ? AND ts < ? ORDER BY ts').all(start, end)
  },
  update(id, { tagId = null, detail = null, ts } = {}) {
    if (ts !== undefined) {
      getDb().prepare('UPDATE pause_points SET ts = ?, tag_id = ?, detail = ? WHERE id = ?').run(ts, tagId, detail, id)
    } else {
      getDb().prepare('UPDATE pause_points SET tag_id = ?, detail = ? WHERE id = ?').run(tagId, detail, id)
    }
    return this.get(id)
  },
  updateTag(id, tagId = null) {
    getDb().prepare('UPDATE pause_points SET tag_id = ? WHERE id = ?').run(tagId, id)
    return this.get(id)
  },
  remove(id) {
    getDb().prepare('DELETE FROM pause_points WHERE id = ?').run(id)
    return { ok: true }
  },
  removeByEntry(entryId) {
    getDb().prepare('DELETE FROM pause_points WHERE entry_id = ?').run(entryId)
    return { ok: true }
  }
}

// ---------- 待办仓储 ----------
const todosRepo = {
  create({
    title,
    detail = null,
    status = 'todo',
    priority = 'medium',
    dueAt = null,
    source = 'desktop',
    reminderEnabled = 0,
    phaseStartAt = null,
    phaseEndAt = null,
    remindWindowStart = '09:00',
    remindWindowEnd = '18:00',
    remindIntervalMin = 120
  }) {
    const now = Date.now()
    const info = getDb()
      .prepare(`INSERT INTO todos (
        title, detail, status, priority, due_at, source, created_at, updated_at,
        reminder_enabled, phase_start_at, phase_end_at, remind_window_start, remind_window_end, remind_interval_min
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`) 
      .run(title, detail, status, priority, dueAt, source, now, now, reminderEnabled ? 1 : 0, phaseStartAt, phaseEndAt, remindWindowStart, remindWindowEnd, remindIntervalMin)
    return this.get(info.lastInsertRowid)
  },
  get(id) {
    return getDb().prepare('SELECT * FROM todos WHERE id = ?').get(id)
  },
  list({ status = null, includeDone = false, limit = 100, dueOnly = false } = {}) {
    const clauses = []
    const vals = []
    const now = Date.now()
    if (status) { clauses.push('status = ?'); vals.push(status) }
    if (!includeDone && !status && !dueOnly) clauses.push("status != 'done'")
    if (dueOnly) {
      clauses.push("(due_at IS NOT NULL AND due_at <= ? OR phase_end_at IS NOT NULL AND phase_end_at <= ?)")
      vals.push(now, now)
    }
    vals.push(limit)
    return getDb()
      .prepare(`SELECT * FROM todos ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''} ORDER BY COALESCE(due_at, phase_end_at, 9999999999999), updated_at DESC LIMIT ?`)
      .all(...vals)
  },
  update(id, patch) {
    const map = {
      title: 'title', detail: 'detail', status: 'status', priority: 'priority', dueAt: 'due_at', source: 'source',
      remindedAt: 'reminded_at', snoozeUntil: 'snooze_until', reminderEnabled: 'reminder_enabled', phaseStartAt: 'phase_start_at',
      phaseEndAt: 'phase_end_at', remindWindowStart: 'remind_window_start', remindWindowEnd: 'remind_window_end',
      remindIntervalMin: 'remind_interval_min', lastPhaseRemindedAt: 'last_phase_reminded_at', phaseCompletedAt: 'phase_completed_at'
    }
    const fields = []
    const vals = []
    for (const [k, col] of Object.entries(map)) {
      if (patch[k] !== undefined) { fields.push(`${col} = ?`); vals.push(patch[k]) }
    }
    if (patch.status === 'done') { fields.push('closed_at = ?'); vals.push(patch.closedAt || Date.now()) }
    if (patch.status && patch.status !== 'done') { fields.push('closed_at = ?'); vals.push(null) }
    fields.push('updated_at = ?'); vals.push(Date.now())
    vals.push(id)
    getDb().prepare(`UPDATE todos SET ${fields.join(', ')} WHERE id = ?`).run(...vals)
    return this.get(id)
  },
  remove(id) {
    getDb().prepare('DELETE FROM todos WHERE id = ?').run(id)
    return { ok: true }
  },
  removeMany(ids = []) {
    const tx = getDb().transaction((list) => {
      const stmt = getDb().prepare('DELETE FROM todos WHERE id = ?')
      for (const id of list) stmt.run(id)
    })
    tx(ids)
    return { ok: true, count: ids.length }
  },
  dueForReminder(now = Date.now()) {
    const rows = getDb()
      .prepare("SELECT * FROM todos WHERE status != 'done' AND due_at IS NOT NULL AND due_at <= ? AND (snooze_until IS NULL OR snooze_until <= ?) AND (reminded_at IS NULL OR reminded_at < due_at) ORDER BY due_at LIMIT 20")
      .all(now, now)
    return rows
  },
  activePhaseReminders(now = Date.now()) {
    return getDb()
      .prepare(`SELECT * FROM todos
        WHERE status != 'done'
          AND reminder_enabled = 1
          AND phase_start_at IS NOT NULL AND phase_end_at IS NOT NULL
          AND phase_start_at <= ? AND phase_end_at >= ?
          AND (snooze_until IS NULL OR snooze_until <= ?)
        ORDER BY COALESCE(last_phase_reminded_at, 0), priority DESC
        LIMIT 50`)
      .all(now, now, now)
  },
  expiredPhases(now = Date.now()) {
    return getDb()
      .prepare("SELECT * FROM todos WHERE status != 'done' AND phase_end_at IS NOT NULL AND phase_end_at < ? ORDER BY phase_end_at LIMIT 50")
      .all(now)
  }
}

// ---------- 截图仓储 ----------
const screenshotsRepo = {
  insert({ filePath, takenAt, windowTitle = null, processName = null, entryId = null }) {
    const info = getDb()
      .prepare('INSERT INTO screenshots (file_path, taken_at, window_title, process_name, entry_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(filePath, takenAt, windowTitle, processName, entryId, Date.now())
    return this.get(info.lastInsertRowid)
  },
  get(id) {
    return getDb().prepare('SELECT * FROM screenshots WHERE id = ?').get(id)
  },
  listByRange(start, end) {
    return getDb()
      .prepare('SELECT * FROM screenshots WHERE taken_at >= ? AND taken_at < ? ORDER BY taken_at')
      .all(start, end)
  },
  setPackId(ids, packId) {
    const stmt = getDb().prepare('UPDATE screenshots SET pack_id = ? WHERE id = ?')
    const tx = getDb().transaction((list) => {
      for (const id of list) stmt.run(packId, id)
    })
    tx(ids)
  }
}

// ---------- 证据库仓储 ----------
const evidenceRepo = {
  insert(item) {
    getDb()
      .prepare(`INSERT INTO evidence_items (
        id, type, source, status, original_path, relative_path, sha256, size_bytes, mime_type,
        created_at, imported_at, captured_at, device_id, ledger_entry_id, tag_id, title, user_note,
        unsupported_reason, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`) 
      .run(
        item.id,
        item.type,
        item.source,
        item.status || 'captured',
        item.originalPath,
        item.relativePath,
        item.sha256,
        item.sizeBytes,
        item.mimeType || null,
        item.createdAt,
        item.importedAt,
        item.capturedAt || null,
        item.deviceId || null,
        item.ledgerEntryId || null,
        item.tagId || null,
        item.title || null,
        item.userNote || null,
        item.unsupportedReason || null,
        item.isDeleted ? 1 : 0
      )
    return this.get(item.id)
  },
  get(id) {
    return getDb().prepare('SELECT * FROM evidence_items WHERE id = ?').get(id)
  },
  update(id, patch = {}) {
    const map = {
      status: 'status',
      title: 'title',
      userNote: 'user_note',
      tagId: 'tag_id',
      ledgerEntryId: 'ledger_entry_id',
      unsupportedReason: 'unsupported_reason',
      isDeleted: 'is_deleted'
    }
    const fields = []
    const vals = []
    for (const [key, col] of Object.entries(map)) {
      if (patch[key] !== undefined) {
        fields.push(`${col} = ?`)
        vals.push(key === 'isDeleted' ? (patch[key] ? 1 : 0) : patch[key])
      }
    }
    if (!fields.length) return this.get(id)
    vals.push(id)
    getDb().prepare(`UPDATE evidence_items SET ${fields.join(', ')} WHERE id = ?`).run(...vals)
    return this.get(id)
  },
  all() {
    return getDb().prepare('SELECT * FROM evidence_items WHERE is_deleted = 0 ORDER BY COALESCE(captured_at, imported_at, created_at) DESC').all()
  },
  rebasePaths(rootDir) {
    const rows = getDb().prepare('SELECT id, relative_path FROM evidence_items').all()
    const update = getDb().prepare('UPDATE evidence_items SET original_path = ? WHERE id = ?')
    const tx = getDb().transaction(() => {
      for (const row of rows) update.run(require('path').join(rootDir, ...String(row.relative_path).split('/')), row.id)
    })
    tx()
    return rows.length
  },
  listByRange(start, end) {
    return getDb()
      .prepare(`SELECT * FROM evidence_items
                WHERE is_deleted = 0 AND COALESCE(captured_at, imported_at, created_at) >= ? AND COALESCE(captured_at, imported_at, created_at) < ?
                ORDER BY COALESCE(captured_at, imported_at, created_at) DESC`)
      .all(start, end)
  },
  insertMetadata(evidenceId, key, value, source = 'system') {
    const info = getDb()
      .prepare('INSERT INTO evidence_metadata (evidence_id, key, value_json, source, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(evidenceId, key, JSON.stringify(value), source, Date.now())
    return getDb().prepare('SELECT * FROM evidence_metadata WHERE id = ?').get(info.lastInsertRowid)
  },
  listMetadata(evidenceId) {
    return getDb().prepare('SELECT * FROM evidence_metadata WHERE evidence_id = ? ORDER BY id').all(evidenceId)
  },
  remove(id) {
    const tx = getDb().transaction((evidenceId) => {
      getDb().prepare('DELETE FROM evidence_metadata WHERE evidence_id = ?').run(evidenceId)
      getDb().prepare('DELETE FROM evidence_reviews WHERE evidence_id = ?').run(evidenceId)
      getDb().prepare('DELETE FROM evidence_items WHERE id = ?').run(evidenceId)
    })
    tx(id)
    return { ok: true }
  },
  upsertReview(evidenceId, patch = {}) {
    const now = Date.now()
    const existing = getDb().prepare('SELECT * FROM evidence_reviews WHERE evidence_id = ? ORDER BY updated_at DESC LIMIT 1').get(evidenceId)
    if (!existing) {
      const id = `rev_${now}_${Math.random().toString(16).slice(2, 8)}`
      getDb()
        .prepare(`INSERT INTO evidence_reviews (
          id, evidence_id, review_status, confirmed_title, confirmed_summary,
          confirmed_tags_json, accepted_claims_json, user_note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`) 
        .run(
          id,
          evidenceId,
          patch.reviewStatus || 'pending',
          patch.confirmedTitle || null,
          patch.confirmedSummary || null,
          patch.confirmedTags ? JSON.stringify(patch.confirmedTags) : null,
          patch.acceptedClaims ? JSON.stringify(patch.acceptedClaims) : null,
          patch.userNote || null,
          now,
          now
        )
      return getDb().prepare('SELECT * FROM evidence_reviews WHERE id = ?').get(id)
    }
    const map = {
      reviewStatus: 'review_status',
      confirmedTitle: 'confirmed_title',
      confirmedSummary: 'confirmed_summary',
      confirmedTags: 'confirmed_tags_json',
      acceptedClaims: 'accepted_claims_json',
      userNote: 'user_note'
    }
    const fields = []
    const vals = []
    for (const [key, col] of Object.entries(map)) {
      if (patch[key] !== undefined) {
        fields.push(`${col} = ?`)
        vals.push(['confirmedTags', 'acceptedClaims'].includes(key) ? JSON.stringify(patch[key]) : patch[key])
      }
    }
    fields.push('updated_at = ?'); vals.push(now)
    vals.push(existing.id)
    getDb().prepare(`UPDATE evidence_reviews SET ${fields.join(', ')} WHERE id = ?`).run(...vals)
    return getDb().prepare('SELECT * FROM evidence_reviews WHERE id = ?').get(existing.id)
  },
  getReview(evidenceId) {
    return getDb().prepare('SELECT * FROM evidence_reviews WHERE evidence_id = ? ORDER BY updated_at DESC LIMIT 1').get(evidenceId)
  }
}

// ---------- 证据包仓储 ----------
const packsRepo = {
  insert({ dateStart, dateEnd, zipPath, summary, ntpOffsetMs = 0 }) {
    const info = getDb()
      .prepare('INSERT INTO evidence_packs (date_start, date_end, zip_path, summary, ntp_offset_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(dateStart, dateEnd, zipPath, summary, ntpOffsetMs, Date.now())
    return this.get(info.lastInsertRowid)
  },
  get(id) {
    return getDb().prepare('SELECT * FROM evidence_packs WHERE id = ?').get(id)
  },
  list() {
    return getDb().prepare('SELECT * FROM evidence_packs ORDER BY created_at DESC LIMIT 50').all()
  }
}

// ---------- 活动日志仓储 ----------
const activityRepo = {
  insert({ ts, windowTitle = null, processName = null, isIdle = 0, idleSec = 0, inputActive = 1 }) {
    getDb()
      .prepare('INSERT INTO activity_log (ts, window_title, process_name, is_idle, idle_sec, input_active) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ts, windowTitle, processName, isIdle ? 1 : 0, Math.max(0, Number(idleSec) || 0), inputActive ? 1 : 0)
  },
  rawByRange(start, end) {
    return getDb()
      .prepare('SELECT * FROM activity_log WHERE ts >= ? AND ts < ? ORDER BY ts')
      .all(start, end)
  },
  listByRange(start, end, stepSec = 300) {
    // 按 step 聚合采样，供证据包使用
    return getDb()
      .prepare(
        `SELECT (ts / ?) * ? AS bucket, MAX(window_title) AS window_title, MAX(is_idle) AS is_idle, MAX(idle_sec) AS idle_sec, COUNT(*) AS samples
         FROM activity_log WHERE ts >= ? AND ts < ? GROUP BY bucket ORDER BY bucket`
      )
      .all(stepSec * 1000, stepSec * 1000, start, end)
  },
  ignore({ signature, start, end, reason = null }) {
    getDb()
      .prepare('INSERT INTO activity_ignored_suggestions (signature, start_time, end_time, reason, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(signature) DO UPDATE SET reason = excluded.reason')
      .run(signature, start, end, reason, Date.now())
    return { ok: true }
  },
  ignoredByRange(start, end) {
    return getDb()
      .prepare('SELECT * FROM activity_ignored_suggestions WHERE start_time < ? AND end_time > ? ORDER BY start_time')
      .all(end, start)
  }
}

// ---------- 设置仓储 ----------
const settingsRepo = {
  get(key) {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key)
    return row ? JSON.parse(row.value) : undefined
  },
  set(key, value) {
    getDb()
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value))
  },
  all() {
    const rows = getDb().prepare('SELECT key, value FROM settings').all()
    const out = {}
    for (const r of rows) out[r.key] = JSON.parse(r.value)
    return out
  }
}

module.exports = { init, getDb, tagsRepo, entriesRepo, ledgerRevisionsRepo, pausePointsRepo, todosRepo, screenshotsRepo, evidenceRepo, packsRepo, activityRepo, settingsRepo }
