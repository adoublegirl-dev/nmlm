// 托盘：状态感知菜单。
const { Tray, Menu, nativeImage } = require('electron')
const path = require('path')

let tray = null
let currentState = 'idle' // idle | recording

function iconPath(state) {
  // 资源目录：先用内置 SVG 数据生成（无图片资源时兜底）
  return null
}

function createIcon() {
  const iconFile = path.join(__dirname, 'assets/icon.ico')
  const img = nativeImage.createFromPath(iconFile)
  if (!img.isEmpty()) {
    img.setTemplateImage(false)
    return img.resize({ width: 32, height: 32, quality: 'best' })
  }
  const fallback = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="10" fill="#D4AF6A"/></svg>`
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(fallback).toString('base64')}`)
}

function buildMenu(actions) {
  const windows = require('./windows')
  const recorderVisible = windows.isMiniVisible()
  const items = []
  if (currentState === 'recording') {
    items.push({ label: '● 记录中', enabled: false })
  }
  items.push(
    { label: currentState === 'recording' ? '停止记录  F9' : '开始记录  F8', click: () => currentState === 'recording' ? actions.stopRecord() : actions.primaryRecordAction() },
    { label: recorderVisible ? '隐藏记录器' : '显示记录器', click: () => recorderVisible ? actions.hideRecorder() : actions.openRecorder() },
    { label: '快捷截图  F10', click: () => actions.screenshot() },
    { type: 'separator' },
    { label: '打开浏览器面板', click: () => actions.openPanel() },
    { label: '生成证据包', click: () => actions.pack() },
    { type: 'separator' },
    { label: '退出', click: () => actions.quit() }
  )
  return Menu.buildFromTemplate(items)
}

function create(actions) {
  tray = new Tray(createIcon(currentState))
  tray.setToolTip('牛马联盟')
  tray.setContextMenu(buildMenu(actions))
  tray.on('right-click', () => tray.setContextMenu(buildMenu(actions)))
  tray.on('click', () => actions.openPanel())
  return tray
}

function setState(state) {
  currentState = state
  if (tray) {
    tray.setImage(createIcon(state))
    tray.setToolTip(state === 'recording' ? '牛马联盟 · 记录中' : '牛马联盟')
  }
}

function refreshMenu(actions) {
  if (tray) tray.setContextMenu(buildMenu(actions))
}

module.exports = { create, setState, refreshMenu }
