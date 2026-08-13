// 应用生命周期：首次安装/升级/降级保护、升级前备份、恢复与诊断。
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const Database = require('better-sqlite3')
const { LATEST_SCHEMA_VERSION } = require('../db/migrations')

const BACKUP_KEEP = 12

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
function safeJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (_) { return fallback }
}
function versionParts(v) {
  return String(v || '0.0.0').replace(/^v/, '').split(/[.-]/).slice(0, 3).map((x) => Number(x) || 0)
}
function compareVersions(a, b) {
  const aa = versionParts(a)
  const bb = versionParts(b)
  for (let i = 0; i < 3; i += 1) {
    if (aa[i] !== bb[i]) return aa[i] > bb[i] ? 1 : -1
  }
  return 0
}
function getSchemaVersion(dbPath) {
  if (!fs.existsSync(dbPath)) return 0
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get()
    if (!table) return 0
    return Number(db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get()?.version || 0)
  } finally { db.close() }
}
function getMetadata(dbPath) {
  if (!fs.existsSync(dbPath)) return {}
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_metadata'").get()
    if (!table) return {}
    const out = {}
    for (const row of db.prepare('SELECT key, value FROM app_metadata').all()) {
      try { out[row.key] = JSON.parse(row.value) } catch (_) { out[row.key] = row.value }
    }
    return out
  } finally { db.close() }
}
function backupRoot(userData) {
  return ensureDir(path.join(userData, 'backups'))
}
function pendingRestorePath(userData) {
  return path.join(userData, 'pending-restore.json')
}
function applyPendingRestore(userData, dbPath) {
  const pendingFile = pendingRestorePath(userData)
  const pending = safeJson(pendingFile)
  if (!pending?.database || !fs.existsSync(pending.database)) return null
  ensureDir(path.dirname(dbPath))
  fs.copyFileSync(pending.database, dbPath)
  for (const suffix of ['-wal', '-shm']) {
    const stale = dbPath + suffix
    if (fs.existsSync(stale)) fs.rmSync(stale, { force: true })
  }
  fs.rmSync(pendingFile, { force: true })
  return pending
}
async function createBackup({ userData, dbPath, fromVersion, toVersion, reason = 'upgrade', skipPrune = false }) {
  if (!fs.existsSync(dbPath)) return null
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const name = `${stamp}_${reason}_${fromVersion || 'unknown'}_to_${toVersion || 'unknown'}`
  const dir = ensureDir(path.join(backupRoot(userData), name))
  const target = path.join(dir, 'niuma.db')
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try { await db.backup(target) } finally { db.close() }
  const manifest = {
    id: name,
    reason,
    createdAt: Date.now(),
    fromVersion: fromVersion || null,
    toVersion: toVersion || null,
    schemaVersion: getSchemaVersion(dbPath),
    database: target,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  if (!skipPrune) pruneBackups(userData)
  return manifest
}
function pruneBackups(userData) {
  const root = backupRoot(userData)
  const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => path.join(root, x.name))
  dirs.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  for (const dir of dirs.slice(BACKUP_KEEP)) fs.rmSync(dir, { recursive: true, force: true })
}
function listBackups(userData) {
  const root = backupRoot(userData)
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((x) => x.isDirectory())
    .map((x) => safeJson(path.join(root, x.name, 'manifest.json')))
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt)
}
function scheduleRestore(userData, backupId) {
  const backup = listBackups(userData).find((x) => x.id === backupId)
  if (!backup || !fs.existsSync(backup.database)) return { ok: false, error: '备份不存在' }
  fs.writeFileSync(pendingRestorePath(userData), JSON.stringify({ ...backup, scheduledAt: Date.now() }, null, 2), 'utf8')
  return { ok: true, backup }
}
async function prepare({ userData, dbPath, appVersion }) {
  const restored = applyPendingRestore(userData, dbPath)
  const exists = fs.existsSync(dbPath)
  const schemaVersion = getSchemaVersion(dbPath)
  const metadata = getMetadata(dbPath)
  const lastVersion = metadata.last_app_version || null
  if (schemaVersion > LATEST_SCHEMA_VERSION || (lastVersion && compareVersions(appVersion, lastVersion) < 0)) {
    const err = new Error(`检测到降级运行：数据库由 ${lastVersion || '更高结构版本'} 写入，当前程序为 ${appVersion}（支持 schema ${LATEST_SCHEMA_VERSION}）。已阻止写入。`)
    err.code = 'DATABASE_DOWNGRADE_BLOCKED'
    throw err
  }
  const mode = !exists ? 'first-install' : (schemaVersion < LATEST_SCHEMA_VERSION || (lastVersion && compareVersions(appVersion, lastVersion) > 0) ? 'upgrade' : 'normal')
  let backup = null
  if (exists && mode === 'upgrade') backup = await createBackup({ userData, dbPath, fromVersion: lastVersion, toVersion: appVersion })
  return { mode, exists, schemaVersion, lastVersion, appVersion, backup, restored, dbPath, userData }
}
function finalize(db, context) {
  const now = Date.now()
  const put = db.prepare('INSERT INTO app_metadata (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at')
  const tx = db.transaction(() => {
    put.run('last_app_version', JSON.stringify(context.appVersion), now)
    put.run('schema_version', JSON.stringify(LATEST_SCHEMA_VERSION), now)
    put.run('last_start_mode', JSON.stringify(context.mode), now)
    if (!db.prepare("SELECT 1 FROM app_metadata WHERE key='installed_at'").get()) put.run('installed_at', JSON.stringify(now), now)
    if (context.mode === 'upgrade') put.run('last_upgraded_at', JSON.stringify(now), now)
  })
  tx()
}
function integrityCheck(dbPath) {
  if (!fs.existsSync(dbPath)) return { ok: false, error: '数据库不存在' }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    const rows = db.pragma('integrity_check')
    const messages = rows.map((r) => Object.values(r)[0])
    return { ok: messages.length === 1 && messages[0] === 'ok', messages }
  } finally { db.close() }
}

module.exports = {
  prepare, finalize, createBackup, listBackups, scheduleRestore,
  integrityCheck, getSchemaVersion, compareVersions, LATEST_SCHEMA_VERSION
}
