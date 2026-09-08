import { beforeEach, describe, expect, it } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const db = require('../src/main/db')
const Database = require('better-sqlite3')
const { MIGRATIONS, migrate } = require('../src/main/db/migrations')
const ledger = require('../src/main/services/ledger')
const tags = require('../src/main/services/tags')
const report = require('../src/main/services/report')
const { tagsRepo, entriesRepo } = db

beforeEach(() => {
  db.init(':memory:')
  ledger.attachEventSender(() => {})
  require('../src/main/utils/window').getActiveWindow = () => Promise.resolve(null)
})

describe('tag lifecycle', () => {
  it('migrates a version 10 database without changing existing tag references', () => {
    const legacy = new Database(':memory:')
    legacy.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)')
    for (const migration of MIGRATIONS.filter((item) => item.version <= 10)) {
      legacy.exec(migration.sql)
      legacy.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(migration.version, 1)
    }
    legacy.prepare('INSERT INTO time_entries (start_time, end_time, duration_sec, tag_id, created_at) VALUES (?, ?, ?, ?, ?)').run(1000, 2000, 1, 1, 1000)

    expect(migrate(legacy)).toBe(11)
    expect(legacy.prepare('SELECT is_active, archived_at FROM tags WHERE id = 1').get()).toEqual({ is_active: 1, archived_at: null })
    expect(legacy.prepare('SELECT tag_id FROM time_entries ORDER BY id DESC LIMIT 1').get().tag_id).toBe(1)
    legacy.close()
  })

  it('soft-archives a tag without changing historical entries or report totals', () => {
    const start = Date.now() - 3600 * 1000
    const entry = entriesRepo.insertFinished({
      startTime: start,
      endTime: start + 1800 * 1000,
      durationSec: 1800,
      tagId: 1
    })

    const archived = tags.archive({ id: 1 })

    expect(archived.ok).toBe(true)
    expect(archived.removed).toMatchObject({ id: 1, name: '编码', is_active: 0 })
    expect(tagsRepo.allActive().some((tag) => tag.id === 1)).toBe(false)
    expect(entriesRepo.get(entry.id).tag_id).toBe(1)
    expect(report.tagDistribution(start, start + 3600 * 1000)).toEqual([
      expect.objectContaining({ name: '编码', totalSec: 1800, count: 1 })
    ])
  })

  it('keeps archived break tags excluded from effective hours', () => {
    const breakTag = tagsRepo.getByName('摸鱼')
    const day = new Date()
    day.setHours(10, 0, 0, 0)
    const start = day.getTime()
    entriesRepo.insertFinished({ startTime: start, endTime: start + 1200 * 1000, durationSec: 1200, tagId: breakTag.id })

    tags.archive({ id: breakTag.id })

    expect(report.effectiveHours(start)).toBe(0)
  })

  it('allows editing an archived historical record without changing its tag, but rejects assigning it elsewhere', () => {
    const start = Date.now() - 3600 * 1000
    const archivedEntry = entriesRepo.insertFinished({ startTime: start, endTime: start + 600000, durationSec: 600, tagId: 1 })
    const otherEntry = entriesRepo.insertFinished({ startTime: start + 700000, endTime: start + 1200000, durationSec: 500, tagId: 2 })
    tags.archive({ id: 1 })

    expect(ledger.retag(archivedEntry.id, { tagId: 1, detail: '仅修改备注' })).toMatchObject({ ok: true, entry: { tag_id: 1, detail: '仅修改备注' } })
    expect(ledger.retag(otherEntry.id, { tagId: 1 })).toMatchObject({ ok: false })
  })

  it('re-creating an archived name restores the same tag identity', () => {
    tags.archive({ id: 2 })
    const restored = tags.create({ name: '开会', color: '#123456', isBreak: 1 })

    expect(restored.tag).toMatchObject({ id: 2, name: '开会', color: '#123456', is_active: 1, archived_at: null })
    expect(tagsRepo.allActive().filter((tag) => tag.name === '开会')).toHaveLength(1)
  })

  it('protects the system fallback tag from being archived', () => {
    const other = tagsRepo.findOtherTag()
    expect(() => tags.archive({ id: other.id })).toThrow('不能停用')
  })

  it('blocks tag creation and archiving while recording', async () => {
    await ledger.start({ tagId: 1 })

    expect(() => tags.create({ name: '记录中新增' })).toThrow('请先停止记录')
    expect(() => tags.archive({ id: 2 })).toThrow('请先停止记录')
  })

  it('does not allow an archived tag to be assigned to a new record', async () => {
    tags.archive({ id: 1 })
    const result = await ledger.start({ tagId: 1 })

    expect(result.ok).toBe(false)
    expect(ledger.current()).toBeNull()
  })
})
