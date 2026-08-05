// 证据服务：P0 实现快捷截图与存证。打包（zip）在 P2。
const { desktopCapturer, nativeImage, app, screen } = require('electron')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { screenshotsRepo, entriesRepo } = require('../db')
const winUtil = require('../utils/window')
const { formatDate, formatTime } = require('../utils/time')
const settings = require('./settings')

let emitter = null
function attachEventSender(fn) {
  emitter = fn
}
function emit(event, payload) {
  if (emitter) emitter(event, payload)
}

function screenshotsDir() {
  const cfg = settings.get('evidence.dir')
  return cfg || path.join(app.getPath('userData'), 'screenshots')
}

function sanitize(name, maxLen = 20) {
  return String(name || '')
    .replace(/[\\/:*?"<>|\r\n]/g, '_')
    .slice(0, maxLen)
}

async function capture() {
  const now = Date.now()
  const win = await winUtil.getActiveWindow().catch(() => null)
  const display = screen.getPrimaryDisplay()
  // thumbnailSize 必须用真实屏幕尺寸，0×0 会得到空图
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: display.size.width, height: display.size.height },
    fetchWindowIcons: false
  })
  const primary = sources.find((s) => s.display_id === '0') || sources[0]
  if (!primary) return { ok: false, error: '未找到屏幕' }
  const image = primary.thumbnail

  // 水印
  const settings2 = settings.getAll()
  let final = image
  if (settings2.evidence.watermark) {
    final = addWatermark(image, now)
  }

  const d = new Date(now)
  const stamp = `${formatDate(now)}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
  const dir = path.join(screenshotsDir(), formatDate(now).replace(/-/g, ''))
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `${stamp}_${sanitize(win ? win.title : 'screen')}.png`)
  fs.writeFileSync(filePath, final.toPNG())

  const current = entriesRepo.current()
  const shot = screenshotsRepo.insert({
    filePath,
    takenAt: now,
    windowTitle: win ? win.title : null,
    processName: win ? win.processName : null,
    entryId: current ? current.id : null
  })
  emit('capture:done', { ok: true, screenshot: shot })
  return { ok: true, screenshot: shot, filePath }
}

function addWatermark(image, ts) {
  // 用 nativeImage 尺寸创建带水印的版本：简单方案是在图片下缘叠半透明黑条 + 时间文字
  // nativeImage 不直接支持绘图，这里用 PNG 编码后不处理文字，改为在文件名保留时间戳。
  // 说明：文字水印需要 canvas 或 sharp，P1 引入；P0 以文件名时间戳 + metadata 兜底。
  return image
}

function listByRange(start, end) {
  const base = screenshotsDir()
  return screenshotsRepo.listByRange(start, end).map((s) => ({
    ...s,
    webPath: '/shots/' + path.relative(base, s.file_path).split(path.sep).join('/')
  }))
}

// P2 占位：证据包打包
async function pack({ start, end }) {
  return { ok: false, error: '证据包打包将在 P2 实现' }
}

function packStatus() {
  return { running: false }
}

function openScreenshotsDir() {
  const dir = screenshotsDir()
  fs.mkdirSync(dir, { recursive: true })
  require('electron').shell.openPath(dir)
  return { ok: true }
}

module.exports = { attachEventSender, capture, listByRange, pack, packStatus, openScreenshotsDir, screenshotsDir }
