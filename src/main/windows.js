// 窗口管理：记录器、TagPicker、提醒浮窗。主面板走浏览器，无大窗口。
const { BrowserWindow, screen } = require('electron')
const path = require('path')
const settings = require('./services/settings')
const { EVENTS } = require('../shared/constants')

let recorderWin = null
let tagPickerWin = null
let reminderWin = null
let recorderCollapsed = false
let recorderMessageSeq = 0
let latestRecorderMessage = null
let recorderMessageTimer = null

const RECORDER_WIDTH = 280
const RECORDER_HEIGHT = 390
const RECORDER_COLLAPSED_WIDTH = 280
const RECORDER_MESSAGE_WIDTH = RECORDER_COLLAPSED_WIDTH
const RECORDER_COLLAPSED_HEIGHT = 168

function recorderLayout() {
  // 记录器按当前设计稿固定尺寸；历史配置中的尺寸字段不再生效。
  const expandedWidth = RECORDER_WIDTH
  const expandedHeight = RECORDER_HEIGHT
  const displayMode = 'panel'
  const panelWidth = RECORDER_COLLAPSED_WIDTH
  const panelHeight = RECORDER_COLLAPSED_HEIGHT
  const capsuleWidth = panelWidth
  const capsuleHeight = panelHeight
  const collapsedWidth = panelWidth
  const collapsedHeight = panelHeight
  return { expandedWidth, expandedHeight, displayMode, panelWidth, panelHeight, capsuleWidth, capsuleHeight, collapsedWidth, collapsedHeight }
}
const DIST_URL = () => `http://127.0.0.1:${require('./services/settings').get('server.port')}`
const APP_ICON = path.join(__dirname, 'assets/icon.ico')

function loadRenderer(win, file) {
  win.loadURL(`${DIST_URL()}/${file}`)
}

function defaultRecorderPos() {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: Math.round(workArea.x + workArea.width - recorderLayout().expandedWidth - 24),
    y: Math.round(workArea.y + workArea.height - recorderLayout().expandedHeight - 72)
  }
}

function clampRecorderPos(pos, width = RECORDER_WIDTH, height = RECORDER_HEIGHT) {
  const displays = screen.getAllDisplays()
  const centerX = (pos?.x || 0) + width / 2
  const centerY = (pos?.y || 0) + height / 2
  const display = displays.find((d) => {
    const a = d.workArea
    return centerX >= a.x && centerX <= a.x + a.width && centerY >= a.y && centerY <= a.y + a.height
  }) || screen.getDisplayNearestPoint({ x: Math.round(centerX), y: Math.round(centerY) }) || screen.getPrimaryDisplay()
  const { workArea } = display
  return {
    x: Math.min(Math.max(pos?.x ?? workArea.x, workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(pos?.y ?? workArea.y, workArea.y), workArea.y + workArea.height - height)
  }
}

function createRecorder() {
  if (recorderWin && !recorderWin.isDestroyed()) return recorderWin
  const saved = settings.get('recorder.position') || settings.get('mini.position')
  const rawPos = saved && saved.x != null ? saved : defaultRecorderPos()
  const layout = recorderLayout()
  const pos = clampRecorderPos(rawPos, layout.expandedWidth, layout.expandedHeight)
  recorderWin = new BrowserWindow({
    width: layout.expandedWidth,
    height: layout.expandedHeight,
    minWidth: 96,
    maxWidth: Math.max(layout.expandedWidth, layout.collapsedWidth),
    minHeight: 40,
    maxHeight: Math.max(layout.expandedHeight, layout.collapsedHeight),
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    // CSS 阴影会被透明 BrowserWindow 的矩形边界裁切；保留原生窗口阴影作为桌面端兜底。
    hasShadow: true,
    icon: APP_ICON,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  recorderWin.setAlwaysOnTop(true, 'screen-saver')
  let saveTimer = null
  recorderWin.on('move', () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (!recorderWin || recorderWin.isDestroyed()) return
      const [x, y] = recorderWin.getPosition()
      settings.set('recorder.position', { x, y })
    }, 250)
  })
  // 尺寸由完整态/收缩态控制，不暴露任意 resize。启动时总是完整态，避免上次胶囊坐标/裁剪残留影响可见区域。
  applyRecorderShape(false, layout.expandedWidth, layout.expandedHeight)
  loadRenderer(recorderWin, 'recorder.html')
  recorderWin.on('closed', () => { recorderWin = null })
  return recorderWin
}

function getRecorder() { return recorderWin }
function getMini() { return recorderWin } // 兼容旧调用，只返回 recorder

function showRecorder() {
  if (!recorderWin || recorderWin.isDestroyed()) createRecorder()
  if (!recorderWin) return
  settings.set('recorder.hiddenToTray', false)
  const hasActiveRecord = !!require('./services/ledger').current()
  setRecorderCollapsed(hasActiveRecord)
  recorderWin.show()
  recorderWin.focus()
}

function hideRecorder(flag = true) {
  settings.set('recorder.hiddenToTray', !!flag)
  if (flag && recorderWin && !recorderWin.isDestroyed()) recorderWin.hide()
  else if (!flag) showRecorder()
}

function hideMiniToTray(flag) { hideRecorder(flag) }

function isRecorderVisible() {
  return !!(recorderWin && !recorderWin.isDestroyed() && recorderWin.isVisible())
}
function isMiniVisible() { return isRecorderVisible() }

function setRecorderMenuOpen(open) {
  if (open) return setRecorderCollapsed(false)
  return { ok: true, open }
}

function applyRecorderShape(collapsed, width, height) {
  if (!recorderWin || typeof recorderWin.setShape !== 'function') return
  try {
    // Chromium 的 CSS clip-path 会按显示器缩放抗锯齿；不要用逐像素 setShape，
    // 否则 2K 屏在 Windows 缩放下会让 8px 圆弧出现阶梯和断续边线。
    recorderWin.setShape([])
  } catch (_) {
    // setShape 在部分 Electron/Windows 组合上可能不可用，失败时退回透明窗口。
  }
}

function setRecorderCollapsed(collapsed) {
  if (!recorderWin || recorderWin.isDestroyed()) return { ok: false, error: '记录器未创建' }
  recorderCollapsed = !!collapsed
  const b = recorderWin.getBounds()
  const right = b.x + b.width
  const bottom = b.y + b.height
  const layout = recorderLayout()
  const width = collapsed ? layout.collapsedWidth : layout.expandedWidth
  const height = collapsed ? layout.collapsedHeight : layout.expandedHeight
  recorderWin.setBounds({ x: right - width, y: bottom - height, width, height })
  applyRecorderShape(collapsed, width, height)
  if (!collapsed) recorderWin.webContents.send(EVENTS.RECORDER_EXPAND, { collapsed: false })
  return { ok: true, collapsed, width, height }
}

function setRecorderMessageMode(active) {
  if (!recorderWin || recorderWin.isDestroyed()) return { ok: false, error: '记录器未创建' }
  const b = recorderWin.getBounds()
  const right = b.x + b.width
  const bottom = b.y + b.height
  const layout = recorderLayout()
  const width = layout.collapsedWidth
  const height = layout.collapsedHeight
  recorderWin.setBounds({ x: right - width, y: bottom - height, width, height })
  applyRecorderShape(true, width, height)
  return { ok: true, active: !!active, width, height }
}

function refreshRecorderLayout() {
  if (!recorderWin || recorderWin.isDestroyed()) return { ok: false, error: '记录器未创建' }
  return setRecorderCollapsed(recorderCollapsed)
}

function showRecorderMessage(payload = {}) {
  const text = String(payload.text || '').trim()
  if (!text) return { ok: false, error: '消息为空' }
  if (!recorderWin || recorderWin.isDestroyed()) createRecorder()
  if (!recorderWin || recorderWin.isDestroyed()) return { ok: false, error: '记录器未创建' }
  const duration = Number(payload.duration || 2000)
  latestRecorderMessage = {
    id: ++recorderMessageSeq,
    type: payload.type || 'info',
    text,
    duration,
    createdAt: Date.now()
  }
  recorderWin.webContents.send(EVENTS.RECORDER_MESSAGE, latestRecorderMessage)
  clearTimeout(recorderMessageTimer)
  if (recorderCollapsed) {
    // 收起态消息不改变窗口尺寸，只在原胶囊内呼吸式浮现。
    setRecorderMessageMode(true)
    recorderMessageTimer = setTimeout(() => {
      if (recorderCollapsed) setRecorderMessageMode(false)
    }, duration + 120)
  }
  return { ok: true, message: latestRecorderMessage }
}

function getRecorderMessage() {
  return { ok: true, message: latestRecorderMessage }
}

function setRecorderPos(x, y) {
  if (!recorderWin || recorderWin.isDestroyed()) return { ok: false, error: '记录器未创建' }
  const { workArea } = screen.getPrimaryDisplay()
  const b = recorderWin.getBounds()
  const width = b.width || RECORDER_WIDTH
  const height = b.height || RECORDER_HEIGHT
  const cx = Math.min(Math.max(x, workArea.x - width + 40), workArea.x + workArea.width - 40)
  const cy = Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - 40)
  recorderWin.setBounds({ x: cx, y: cy, width, height })
  settings.set('recorder.position', { x: cx, y: cy })
  return { ok: true, x: cx, y: cy }
}
function setMiniPos(x, y) { return setRecorderPos(x, y) }

// ---------- TagPicker ----------
function createTagPicker(entryId) {
  if (tagPickerWin) tagPickerWin.close()
  const { workArea } = screen.getPrimaryDisplay()
  tagPickerWin = new BrowserWindow({
    width: 280,
    height: 320,
    x: Math.round(workArea.x + workArea.width - 296),
    y: Math.round(workArea.y + workArea.height - 336),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: true,
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  tagPickerWin.loadURL(`${DIST_URL()}/tagpicker.html?entryId=${encodeURIComponent(String(entryId))}`)
  tagPickerWin.on('closed', () => { tagPickerWin = null })
  return tagPickerWin
}

function createSegmentTagPicker({ entryId, target = 'base', pointId = null, x, y } = {}) {
  if (tagPickerWin) tagPickerWin.close()
  const width = 220
  const height = 212
  const pointer = { x: Number(x) || 0, y: Number(y) || 0 }
  const display = screen.getDisplayNearestPoint(pointer)
  const { workArea } = display
  const px = Math.min(Math.max(Math.round(pointer.x - width / 2), workArea.x), workArea.x + workArea.width - width)
  const below = Math.round(pointer.y + 8)
  const py = below + height <= workArea.y + workArea.height
    ? below
    : Math.max(workArea.y, Math.round(pointer.y - height - 8))
  tagPickerWin = new BrowserWindow({
    width,
    height,
    x: px,
    y: py,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: true,
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  const query = new URLSearchParams({ mode: 'segment', entryId: String(entryId), target, pointId: pointId == null ? '' : String(pointId) })
  tagPickerWin.loadURL(`${DIST_URL()}/tagpicker.html?${query.toString()}`)
  tagPickerWin.on('blur', () => closeTagPicker())
  tagPickerWin.on('closed', () => {
    tagPickerWin = null
    if (recorderWin && !recorderWin.isDestroyed()) recorderWin.webContents.send(EVENTS.SEGMENT_TAG_PICKER_CLOSED)
  })
  return tagPickerWin
}

function closeTagPicker() {
  if (tagPickerWin) tagPickerWin.close()
}

// ---------- Reminder（P1 启用） ----------
function createReminder(payload) {
  if (reminderWin) reminderWin.close()
  reminderWin = new BrowserWindow({
    width: 360,
    height: 200,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: true,
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  reminderWin.loadURL(`${DIST_URL()}/reminder.html?payload=${encodeURIComponent(JSON.stringify(payload || {}))}`)
  reminderWin.on('closed', () => { reminderWin = null })
  return reminderWin
}

module.exports = {
  createRecorder,
  getRecorder,
  showRecorder,
  hideRecorder,
  isRecorderVisible,
  setRecorderPos,
  setRecorderMenuOpen,
  setRecorderCollapsed,
  setRecorderMessageMode,
  refreshRecorderLayout,
  showRecorderMessage,
  getRecorderMessage,
  // 兼容旧名字，避免外围调用崩
  getMini,
  hideMiniToTray,
  isMiniVisible,
  setMiniPos,
  createTagPicker,
  createSegmentTagPicker,
  closeTagPicker,
  createReminder
}
