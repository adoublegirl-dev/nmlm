// 配置导入导出：不包含 token、数据库和证据原件。
const { dialog, app } = require('electron')
const fs = require('fs')
const path = require('path')
const settings = require('./settings')

const ROOTS = ['shortcuts', 'reminder', 'evidence', 'privacy', 'model', 'recorder', 'activity', 'tools', 'update']

function safeConfig() {
  const all = settings.getAll()
  const out = {}
  for (const key of ROOTS) if (all[key] !== undefined) out[key] = structuredClone(all[key])
  if (out.recorder?.position) out.recorder.position = { x: null, y: null }
  return out
}
async function exportConfig() {
  const result = await dialog.showSaveDialog({
    title: '导出牛马联盟配置',
    defaultPath: path.join(app.getPath('documents'), `牛马联盟配置-${new Date().toISOString().slice(0, 10)}.json`),
    filters: [{ name: 'JSON 配置', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return { ok: true, canceled: true }
  const payload = { format: 'nmlm-config', version: 1, appVersion: app.getVersion(), exportedAt: Date.now(), settings: safeConfig() }
  fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8')
  return { ok: true, filePath: result.filePath }
}
async function importConfig() {
  const result = await dialog.showOpenDialog({ title: '导入牛马联盟配置', properties: ['openFile'], filters: [{ name: 'JSON 配置', extensions: ['json'] }] })
  if (result.canceled || !result.filePaths.length) return { ok: true, canceled: true }
  let payload
  try { payload = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8')) } catch (e) { return { ok: false, error: '配置文件不是有效 JSON' } }
  if (payload?.format !== 'nmlm-config' || !payload.settings) return { ok: false, error: '不是牛马联盟配置文件' }
  const incoming = payload.settings
  const evidenceDir = incoming.evidence?.dir
  if (evidenceDir && !fs.existsSync(path.join(evidenceDir, '牛马联盟证据库'))) {
    return { ok: false, error: '配置中的证据库路径不存在，请先连接磁盘或在设置页重新定位证据库' }
  }
  for (const key of ROOTS) if (incoming[key] !== undefined) settings.set(key, incoming[key])
  return { ok: true, filePath: result.filePaths[0], requiresRestart: true }
}

module.exports = { exportConfig, importConfig, safeConfig }
