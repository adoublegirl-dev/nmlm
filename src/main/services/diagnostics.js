// 发布/恢复诊断：数据库完整性、证据库、版本、备份与运行路径。
const { app, dialog, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const lifecycle = require('./lifecycle')
const evidence = require('./evidence')
const updater = require('./updater')

function dbPath() { return path.join(app.getPath('userData'), 'niuma.db') }
function run() {
  const database = lifecycle.integrityCheck(dbPath())
  const evidenceStatus = evidence.evidenceLibraryStatus()
  const userData = app.getPath('userData')
  const appPath = app.getAppPath()
  const checks = [
    { key: 'database', label: '数据库完整性', ok: database.ok, detail: database.messages?.join(', ') || database.error },
    { key: 'evidence', label: '证据库可用', ok: evidenceStatus.ok, detail: evidenceStatus.error || evidenceStatus.root },
    { key: 'data-isolation', label: '用户数据与程序目录隔离', ok: !path.resolve(userData).startsWith(path.resolve(appPath)), detail: userData },
    { key: 'schema', label: '数据库结构版本', ok: lifecycle.getSchemaVersion(dbPath()) <= lifecycle.LATEST_SCHEMA_VERSION, detail: `${lifecycle.getSchemaVersion(dbPath())}/${lifecycle.LATEST_SCHEMA_VERSION}` }
  ]
  return {
    ok: checks.every((x) => x.ok), appVersion: app.getVersion(), isPackaged: app.isPackaged,
    appPath, userData, databasePath: dbPath(), evidence: evidenceStatus,
    backups: lifecycle.listBackups(userData), update: updater.status(), checks, generatedAt: Date.now()
  }
}
async function backupNow() {
  const metadata = require('../db').settingsRepo.get('install') || {}
  const backup = await lifecycle.createBackup({ userData: app.getPath('userData'), dbPath: dbPath(), fromVersion: app.getVersion(), toVersion: app.getVersion(), reason: 'manual', metadata })
  return { ok: true, backup }
}
async function restore(backupId) {
  await lifecycle.createBackup({ userData: app.getPath('userData'), dbPath: dbPath(), fromVersion: app.getVersion(), toVersion: app.getVersion(), reason: 'pre-restore', skipPrune: true })
  return lifecycle.scheduleRestore(app.getPath('userData'), backupId)
}
function restart() {
  app.relaunch()
  app.exit(0)
  return { ok: true }
}
async function exportReport() {
  const report = run()
  const result = await dialog.showSaveDialog({ title: '导出诊断报告', defaultPath: path.join(app.getPath('documents'), `牛马联盟诊断-${new Date().toISOString().slice(0, 10)}.json`), filters: [{ name: 'JSON', extensions: ['json'] }] })
  if (result.canceled || !result.filePath) return { ok: true, canceled: true }
  fs.writeFileSync(result.filePath, JSON.stringify(report, null, 2), 'utf8')
  return { ok: true, filePath: result.filePath }
}
function openBackups() {
  const dir = path.join(app.getPath('userData'), 'backups')
  fs.mkdirSync(dir, { recursive: true })
  shell.openPath(dir)
  return { ok: true, dir }
}

module.exports = { run, backupNow, restore, restart, exportReport, openBackups }
