// 证据服务：P1 原始证据安全入库。原始文件只写入 raw，不加水印、不覆盖。
const { desktopCapturer, app, screen, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const { screenshotsRepo, evidenceRepo, entriesRepo } = require('../db')
const winUtil = require('../utils/window')
const { formatDate } = require('../utils/time')
const settings = require('./settings')

let emitter = null
function attachEventSender(fn) {
  emitter = fn
}
function emit(event, payload) {
  if (emitter) emitter(event, payload)
}

function evidenceLibraryDir() {
  const cfg = settings.get('evidence.dir')
  if (cfg) return path.join(cfg, '牛马联盟证据库')
  return path.join(app.getPath('userData'), '牛马联盟证据库')
}

// 兼容旧 server/index.js 的 /shots 静态目录命名。
function screenshotsDir() {
  return evidenceLibraryDir()
}

function dayParts(ts) {
  const d = new Date(ts)
  return {
    yyyy: String(d.getFullYear()),
    mm: String(d.getMonth() + 1).padStart(2, '0'),
    dd: String(d.getDate()).padStart(2, '0'),
    hmsms: `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}_${String(d.getMilliseconds()).padStart(3, '0')}`
  }
}

function captureDirs(ts) {
  const p = dayParts(ts)
  const base = path.join(evidenceLibraryDir(), 'captures', p.yyyy, p.mm, p.dd)
  return {
    base,
    raw: path.join(base, 'raw'),
    meta: path.join(base, 'meta'),
    thumbs: path.join(base, 'thumbs')
  }
}

function fileDirs(ts) {
  const p = dayParts(ts)
  const base = path.join(evidenceLibraryDir(), 'files', p.yyyy, p.mm, p.dd)
  return {
    base,
    raw: path.join(base, 'raw'),
    meta: path.join(base, 'meta'),
    extracted: path.join(base, 'extracted')
  }
}

function ensureLibraryDirs(ts = Date.now()) {
  const root = evidenceLibraryDir()
  const dirs = captureDirs(ts)
  const fdirs = fileDirs(ts)
  for (const dir of [root, path.join(root, '_system'), path.join(root, 'inbox', 'manual-upload'), path.join(root, 'inbox', 'agent-import'), dirs.raw, dirs.meta, dirs.thumbs, fdirs.raw, fdirs.meta, fdirs.extracted]) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dirs
}

function sanitize(name, maxLen = 32) {
  return String(name || '')
    .replace(/[\\/:*?"<>|\r\n]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, maxLen) || 'screen'
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}
function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath))
}
function detectFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const map = {
    '.png': ['image', 'image/png'],
    '.jpg': ['image', 'image/jpeg'],
    '.jpeg': ['image', 'image/jpeg'],
    '.webp': ['image', 'image/webp'],
    '.gif': ['image', 'image/gif'],
    '.txt': ['text', 'text/plain'],
    '.md': ['text', 'text/markdown'],
    '.csv': ['csv', 'text/csv'],
    '.json': ['json', 'application/json'],
    '.html': ['html', 'text/html'],
    '.pdf': ['pdf', 'application/pdf'],
    '.docx': ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    '.xlsx': ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    '.mp3': ['audio', 'audio/mpeg'],
    '.wav': ['audio', 'audio/wav'],
    '.mp4': ['video', 'video/mp4'],
    '.mov': ['video', 'video/quicktime'],
    '.mkv': ['video', 'video/x-matroska'],
    '.zip': ['archive', 'application/zip'],
    '.rar': ['archive', 'application/vnd.rar']
  }
  const found = map[ext]
  return found ? { type: found[0], mimeType: found[1], ext } : { type: 'unknown', mimeType: null, ext }
}

function uniquePath(dir, filename) {
  const ext = path.extname(filename)
  const stem = path.basename(filename, ext)
  let candidate = path.join(dir, filename)
  let i = 1
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${stem}_${i}${ext}`)
    i += 1
  }
  return candidate
}

function toWebPath(filePath) {
  const rel = path.relative(evidenceLibraryDir(), filePath).split(path.sep).join('/')
  return '/shots/' + encodeURI(rel).replace(/%2F/g, '/')
}

function metaFilePath(evidenceId, capturedAt) {
  const dirs = ensureLibraryDirs(capturedAt)
  return path.join(dirs.meta, `${evidenceId}.json`)
}
function fileMetaPath(evidenceId, importedAt) {
  ensureLibraryDirs(importedAt)
  return path.join(fileDirs(importedAt).meta, `${evidenceId}.json`)
}

function buildEvidenceId(capturedAt, hash) {
  const p = dayParts(capturedAt)
  const nonce = crypto.randomBytes(2).toString('hex')
  return `ev_${p.yyyy}${p.mm}${p.dd}_${p.hmsms}_${hash.slice(0, 8)}_${nonce}`
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pickCursorDisplay() {
  // 用户刚把鼠标移到副屏并按快捷键时，给系统一个很短的 settle 时间，再取最终光标点。
  // 这比立即取点更不容易误判到上一块屏幕，同时 80ms 基本不会破坏“隐蔽截图”的手感。
  await wait(80)
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  return { cursor, display }
}

function pickSourceForDisplay(sources, display) {
  if (!sources.length) return null
  const byId = sources.find((s) => String(s.display_id) === String(display.id))
  if (byId) return byId
  const primary = sources.find((s) => s.display_id === '0')
  return primary || sources[0]
}

async function capture() {
  const now = Date.now()
  const win = await winUtil.getActiveWindow().catch(() => null)
  const target = await pickCursorDisplay()
  const display = target.display || screen.getPrimaryDisplay()
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: display.size.width, height: display.size.height },
    fetchWindowIcons: false
  })
  const source = pickSourceForDisplay(sources, display)
  if (!source) return { ok: false, error: '未找到屏幕' }

  // 原始截图永远写 raw，不加水印。水印只允许未来导出副本时生成。
  const buffer = source.thumbnail.toPNG()
  return captureBuffer(buffer, { capturedAt: now, windowInfo: win, display, cursor: target.cursor, captureScope: 'cursor_display' })
}

function captureBuffer(buffer, { capturedAt = Date.now(), windowInfo = null, display = null, cursor = null, captureScope = 'screen' } = {}) {
  const hash = sha256(buffer)
  const short = hash.slice(0, 8)
  const p = dayParts(capturedAt)
  const dirs = ensureLibraryDirs(capturedAt)
  // raw 原件文件名只使用稳定字段：时间 + 类型 + hash。窗口标题只写入元数据，避免编码问题污染文件名。
  const filename = `${p.yyyy}${p.mm}${p.dd}_${p.hmsms}_screen_${short}.png`
  const finalPath = uniquePath(dirs.raw, filename)
  const tmpPath = path.join(dirs.raw, `.${path.basename(finalPath)}.${process.pid}.tmp`)
  fs.writeFileSync(tmpPath, buffer)
  fs.renameSync(tmpPath, finalPath)

  const current = entriesRepo.current()
  const evidenceId = buildEvidenceId(capturedAt, hash)
  const stat = fs.statSync(finalPath)
  const relativePath = path.relative(evidenceLibraryDir(), finalPath).split(path.sep).join('/')
  const item = evidenceRepo.insert({
    id: evidenceId,
    type: 'screenshot',
    source: 'screenshot',
    status: 'captured',
    originalPath: finalPath,
    relativePath,
    sha256: hash,
    sizeBytes: stat.size,
    mimeType: 'image/png',
    createdAt: capturedAt,
    importedAt: Date.now(),
    capturedAt,
    deviceId: os.hostname(),
    ledgerEntryId: current ? current.id : null,
    tagId: current ? current.tag_id : null,
    title: windowInfo ? windowInfo.title : '屏幕截图'
  })

  const meta = {
    evidence_id: evidenceId,
    captured_at: capturedAt,
    sha256: hash,
    size_bytes: stat.size,
    window_title: windowInfo ? windowInfo.title : null,
    process_name: windowInfo ? windowInfo.processName : null,
    ledger_entry_id: current ? current.id : null,
    capture_scope: captureScope,
    cursor_point: cursor,
    display: display ? { id: display.id, bounds: display.bounds, workArea: display.workArea, size: display.size, scaleFactor: display.scaleFactor } : null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    hostname: os.hostname(),
    platform: os.platform(),
    original_path: finalPath,
    relative_path: relativePath
  }
  fs.writeFileSync(metaFilePath(evidenceId, capturedAt), JSON.stringify(meta, null, 2), 'utf8')
  for (const [key, value] of Object.entries(meta)) evidenceRepo.insertMetadata(evidenceId, key, value)

  // 兼容旧 screenshots 表和旧证据页字段。
  const shot = screenshotsRepo.insert({
    filePath: finalPath,
    takenAt: capturedAt,
    windowTitle: windowInfo ? windowInfo.title : null,
    processName: windowInfo ? windowInfo.processName : null,
    entryId: current ? current.id : null
  })
  const screenshot = normalizeEvidenceItem(item, shot)
  emit('capture:done', { ok: true, screenshot, evidence: item })
  return { ok: true, screenshot, evidence: item, filePath: finalPath }
}

async function importWithDialog() {
  const result = await dialog.showOpenDialog({
    title: '导入证据材料',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '常用证据材料', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'txt', 'md', 'csv', 'json', 'html', 'pdf', 'docx', 'xlsx', 'mp3', 'wav', 'mp4', 'mov', 'mkv', 'zip', 'rar'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePaths.length) return { ok: true, canceled: true, items: [] }
  return importPaths(result.filePaths, { source: 'manual_upload' })
}

function importPaths(filePaths = [], { source = 'manual_upload' } = {}) {
  const importedAt = Date.now()
  const dirs = fileDirs(importedAt)
  ensureLibraryDirs(importedAt)
  const items = []
  for (const sourcePath of filePaths) {
    if (!fs.existsSync(sourcePath)) continue
    const stat0 = fs.statSync(sourcePath)
    if (!stat0.isFile()) continue
    const hash = sha256File(sourcePath)
    const short = hash.slice(0, 8)
    const info = detectFileType(sourcePath)
    const ext = path.extname(sourcePath).toLowerCase() || '.bin'
    const p = dayParts(importedAt)
    const originalName = sanitize(path.basename(sourcePath, path.extname(sourcePath)), 42)
    const filename = `${p.yyyy}${p.mm}${p.dd}_${p.hmsms}_${info.type}_${short}_${originalName}${ext}`
    const finalPath = uniquePath(dirs.raw, filename)
    const tmpPath = path.join(dirs.raw, `.${path.basename(finalPath)}.${process.pid}.tmp`)
    fs.copyFileSync(sourcePath, tmpPath)
    fs.renameSync(tmpPath, finalPath)
    const stat = fs.statSync(finalPath)
    const evidenceId = buildEvidenceId(importedAt, hash)
    const relativePath = path.relative(evidenceLibraryDir(), finalPath).split(path.sep).join('/')
    const unsupported = ['audio', 'video', 'archive', 'unknown'].includes(info.type)
    const item = evidenceRepo.insert({
      id: evidenceId,
      type: info.type,
      source,
      status: unsupported ? 'unsupported' : 'imported',
      originalPath: finalPath,
      relativePath,
      sha256: hash,
      sizeBytes: stat.size,
      mimeType: info.mimeType,
      createdAt: Math.floor(stat0.mtimeMs || importedAt),
      importedAt,
      capturedAt: null,
      deviceId: os.hostname(),
      ledgerEntryId: null,
      tagId: null,
      title: path.basename(sourcePath),
      unsupportedReason: unsupported ? `当前版本暂不自动解析 ${info.type} 类型材料，已安全入库，可人工备注或后续处理。` : null
    })
    const meta = {
      evidence_id: evidenceId,
      import_source_path: sourcePath,
      imported_at: importedAt,
      original_filename: path.basename(sourcePath),
      sha256: hash,
      size_bytes: stat.size,
      mime_type: info.mimeType,
      type: info.type,
      status: item.status,
      unsupported_reason: item.unsupported_reason,
      hostname: os.hostname(),
      platform: os.platform(),
      original_path: finalPath,
      relative_path: relativePath
    }
    fs.writeFileSync(fileMetaPath(evidenceId, importedAt), JSON.stringify(meta, null, 2), 'utf8')
    for (const [key, value] of Object.entries(meta)) evidenceRepo.insertMetadata(evidenceId, key, value)
    items.push(normalizeEvidenceItem(item))
  }
  emit('evidence:imported', { ok: true, items })
  return { ok: true, items }
}

function normalizeEvidenceItem(item, legacyShot = null) {
  const review = item.id ? evidenceRepo.getReview(item.id) : null
  return {
    id: item.id,
    evidence_id: item.id,
    type: item.type,
    source: item.source,
    status: item.status,
    file_path: item.original_path,
    original_path: item.original_path,
    relative_path: item.relative_path,
    taken_at: item.captured_at || item.created_at,
    captured_at: item.captured_at,
    created_at: item.created_at,
    imported_at: item.imported_at,
    window_title: item.title || legacyShot?.window_title || null,
    process_name: legacyShot?.process_name || null,
    entry_id: item.ledger_entry_id,
    ledger_entry_id: item.ledger_entry_id,
    tag_id: item.tag_id,
    sha256: item.sha256,
    size_bytes: item.size_bytes,
    mime_type: item.mime_type,
    title: item.title,
    user_note: item.user_note,
    review_status: review?.review_status || null,
    confirmed_title: review?.confirmed_title || null,
    confirmed_summary: review?.confirmed_summary || null,
    review_note: review?.user_note || null,
    webPath: toWebPath(item.original_path)
  }
}

function normalizeLegacyShot(s) {
  return {
    ...s,
    evidence_id: null,
    type: 'screenshot',
    source: 'legacy_screenshot',
    status: 'legacy',
    original_path: s.file_path,
    taken_at: s.taken_at,
    // 旧截图可能位于旧 screenshots 目录，不一定在新证据库根下；Electron 里用本地路径兜底。
    webPath: fs.existsSync(s.file_path) ? s.file_path.replace(/\\/g, '/') : ''
  }
}

function updateEvidence({ id, status, title, userNote, tagId, ledgerEntryId } = {}) {
  const item = evidenceRepo.get(id)
  if (!item) return { ok: false, error: '证据不存在' }
  const allowed = new Set(['captured', 'imported', 'pending_review', 'reviewed', 'invalid', 'unsupported'])
  const finalStatus = status === undefined ? item.status : status
  if (finalStatus && !allowed.has(finalStatus)) return { ok: false, error: '证据状态不合法' }
  const updated = evidenceRepo.update(id, {
    status: finalStatus,
    title: title !== undefined ? title : item.title,
    userNote: userNote !== undefined ? userNote : item.user_note,
    tagId: tagId !== undefined ? tagId : item.tag_id,
    ledgerEntryId: ledgerEntryId !== undefined ? ledgerEntryId : item.ledger_entry_id
  })
  const review = evidenceRepo.upsertReview(id, {
    reviewStatus: finalStatus === 'reviewed' ? 'reviewed' : finalStatus === 'invalid' ? 'rejected' : 'pending',
    confirmedTitle: title !== undefined ? title : updated.title,
    userNote: userNote !== undefined ? userNote : updated.user_note
  })
  emit('evidence:updated', { ok: true, evidence: updated, review })
  return { ok: true, evidence: normalizeEvidenceItem(updated), review }
}

function listByRange(start, end) {
  const items = evidenceRepo.listByRange(start, end).map((item) => normalizeEvidenceItem(item))
  const knownPaths = new Set(items.map((x) => x.file_path))
  const legacy = screenshotsRepo
    .listByRange(start, end)
    .filter((s) => !knownPaths.has(s.file_path))
    .map(normalizeLegacyShot)
  return [...items, ...legacy].sort((a, b) => (b.taken_at || 0) - (a.taken_at || 0))
}

async function pack({ start, end }) {
  return { ok: false, error: '证据包打包将在 P2 实现' }
}

function packStatus() {
  return { running: false }
}

function openScreenshotsDir() {
  const dir = evidenceLibraryDir()
  ensureLibraryDirs(Date.now())
  require('electron').shell.openPath(dir)
  return { ok: true }
}

module.exports = {
  attachEventSender,
  capture,
  captureBuffer,
  importWithDialog,
  importPaths,
  updateEvidence,
  listByRange,
  pack,
  packStatus,
  openScreenshotsDir,
  screenshotsDir,
  evidenceLibraryDir,
  ensureLibraryDirs,
  sha256
}
