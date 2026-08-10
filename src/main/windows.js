// 窗口管理：迷你栏、TagPicker、提醒浮窗。主面板走浏览器，无大窗口。
const { BrowserWindow, screen } = require('electron')
const path = require('path')
const settings = require('./services/settings')

let miniWin = null
let tagPickerWin = null
let reminderWin = null
let miniReady = false
let pendingTaskPicker = false

const DIST_URL = () => `http://127.0.0.1:${require('./services/settings').get('server.port')}`

function loadRenderer(win, file) {
  win.loadURL(`${DIST_URL()}/${file}`)
}

// ---------- 迷你栏 ----------
function miniDefaultPos(width, height) {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: Math.round(workArea.x + workArea.width - width - 24),
    y: Math.round(workArea.y + workArea.height - height - 72)
  }
}

function createMini() {
  const saved = settings.get('mini.position')
  const defaultPos = miniDefaultPos(280, 160)
  const pos = saved && saved.x != null ? saved : defaultPos
  miniWin = new BrowserWindow({
    width: 280,
    height: 160,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  miniWin.setAlwaysOnTop(true, 'screen-saver')
  let saveTimer = null
  miniWin.on('move', () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (!miniWin || miniWin.isDestroyed()) return
      const [x, y] = miniWin.getPosition()
      settings.set('mini.position', { x, y })
    }, 250)
  })
  miniReady = false
  loadRenderer(miniWin, 'mini.html')
  miniWin.webContents.once('did-finish-load', () => {
    miniReady = true
    if (pendingTaskPicker) {
      pendingTaskPicker = false
      sendTaskPickerOpen()
    }
  })
  miniWin.on('closed', () => {
    miniWin = null
    miniReady = false
  })
  return miniWin
}

function getMini() {
  return miniWin
}

function resizeMini(width, height) {
  if (!miniWin) return
  const [curX, curY] = miniWin.getPosition()
  // 展开向上，保持底部对齐
  miniWin.setBounds({ x: curX, y: curY - (height - miniWin.getBounds().height), width, height })
  // 贴边时保证不出屏幕
  const { workArea } = screen.getPrimaryDisplay()
  const b = miniWin.getBounds()
  if (b.y < workArea.y) miniWin.setPosition(b.x, workArea.y)
}

function setMiniPos(x, y) {
  if (miniWin) {
    const { workArea } = screen.getPrimaryDisplay()
    const b = miniWin.getBounds()
    const cx = Math.min(Math.max(x, workArea.x - b.width + 40), workArea.x + workArea.width - 40)
    const cy = Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - 40)
    miniWin.setPosition(cx, cy)
    settings.set('mini.position', { x: cx, y: cy })
    return { ok: true, x: cx, y: cy }
  }
  return { ok: false, error: '迷你栏未创建' }
}

function hideMiniToTray(flag) {
  settings.set('mini.hiddenToTray', flag)
  if (flag && miniWin) miniWin.hide()
  else if (!flag) showRecorder()
}

function showRecorder() {
  if (!miniWin) createMini()
  if (!miniWin) return
  settings.set('mini.hiddenToTray', false)
  miniWin.show()
  miniWin.focus()
}

function isMiniVisible() {
  return !!(miniWin && !miniWin.isDestroyed() && miniWin.isVisible())
}

function sendTaskPickerOpen() {
  if (!miniWin || miniWin.isDestroyed()) return
  miniWin.webContents.send('mini:open-task-picker')
}

function showTaskPicker() {
  console.log('[niuma] 快捷键触发：开始记录')
  showRecorder()
  if (!miniWin) return
  if (!miniReady) {
    pendingTaskPicker = true
    return
  }
  sendTaskPickerOpen()
}

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
  tagPickerWin.on('closed', () => {
    tagPickerWin = null
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
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  reminderWin.loadURL(`${DIST_URL()}/reminder.html?payload=${encodeURIComponent(JSON.stringify(payload || {}))}`)
  reminderWin.on('closed', () => {
    reminderWin = null
  })
  return reminderWin
}

module.exports = { createMini, getMini, resizeMini, setMiniPos, hideMiniToTray, showRecorder, isMiniVisible, showTaskPicker, createTagPicker, closeTagPicker, createReminder }
