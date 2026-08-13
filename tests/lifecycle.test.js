import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
const lifecycle = require('../src/main/services/lifecycle')

describe('app lifecycle', () => {
  it('compares semantic versions', () => {
    expect(lifecycle.compareVersions('0.2.0', '0.1.9')).toBe(1)
    expect(lifecycle.compareVersions('0.1.0', '0.1.0')).toBe(0)
    expect(lifecycle.compareVersions('0.1.0', '0.2.0')).toBe(-1)
  })

  it('detects first install when database does not exist', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmlm-life-'))
    const ctx = await lifecycle.prepare({ userData: dir, dbPath: path.join(dir, 'niuma.db'), appVersion: '0.2.0' })
    expect(ctx.mode).toBe('first-install')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('blocks app downgrade against a newer database version marker', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmlm-life-'))
    const dbPath = path.join(dir, 'niuma.db')
    const db = new Database(dbPath)
    db.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
      INSERT INTO schema_migrations VALUES (7, 1);
      CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
      INSERT INTO app_metadata VALUES ('last_app_version', '"9.0.0"', 1);
    `)
    db.close()
    await expect(lifecycle.prepare({ userData: dir, dbPath, appVersion: '0.2.0' })).rejects.toMatchObject({ code: 'DATABASE_DOWNGRADE_BLOCKED' })
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
