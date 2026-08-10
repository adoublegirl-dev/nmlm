// 窗口管理：记录器、TagPicker、提醒浮窗。主面板走浏览器，无大窗口。
const { BrowserWindow, screen } = require('electron')
const path = require('path')
const settings = require('./services/settings')
const { EVENTS } = require('../shared/constants')

let recorderWin = null
let tagPickerWin = null
let reminderWin = null

const RECORDER_WIDTH = 380
const RECORDER_HEIGHT = 260
const RECORDER_COLLAPSED_WIDTH = 192
const RECORDER_COLLAPSED_HEIGHT = 66
const DIST_URL = () => `http://127.0.0.1:${require('./services/settings').get('server.port')}`

function loadRenderer(win, file) {
  win.loadURL(`${DIST_URL()}/${file}`)
}

function defaultRecorderPos() {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: Math.round(workArea.x + workArea.width - RECORDER_WIDTH - 24),
    y: Math.round(workArea.y + workArea.height - RECORDER_HEIGHT - 72)
  }
}

function createRecorder() {
  if (recorderWin && !recorderWin.isDestroyed()) return recorderWin
  const saved = settings.get('recorder.position') || settings.get('mini.position')
  const pos = saved && saved.x != null ? saved : defaultRecorderPos()
  recorderWin = new BrowserWindow({
    width: RECORDER_WIDTH,
    height: RECORDER_HEIGHT,
    minWidth: RECORDER_COLLAPSED_WIDTH,
    maxWidth: RECORDER_WIDTH,
    minHeight: RECORDER_COLLAPSED_HEIGHT,
    maxHeight: RECORDER_HEIGHT,
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
    hasShadow: false,
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
  // 尺寸由完整态/收缩态控制，不暴露任意 resize。
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
  setRecorderCollapsed(false)
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

function setRecorderCollapsed(collapsed) {
  if (!recorderWin || recorderWin.isDestroyed()) return { ok: false, error: '记录器未创建' }
  const b = recorderWin.getBounds()
  const right = b.x + b.width
  const bottom = b.y + b.height
  const width = collapsed ? RECORDER_COLLAPSED_WIDTH : RECORDER_WIDTH
  const height = collapsed ? RECORDER_COLLAPSED_HEIGHT : RECORDER_HEIGHT
  recorderWin.setBounds({ x: right - width, y: bottom - height, width, height })
  if (!collapsed) recorderWin.webContents.send(EVENTS.RECORDER_EXPAND, { collapsed: false })
  return { ok: true, collapsed, width, height }
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
  // 兼容旧名字，避免外围调用崩
  getMini,
  hideMiniToTray,
  isMiniVisible,
  setMiniPos,
  createTagPicker,
  closeTagPicker,
  createReminder
}
