// 托盘：状态感知菜单。
const { Tray, Menu, nativeImage } = require('electron')
const path = require('path')

let tray = null
let currentState = 'idle' // idle | recording

function iconPath(state) {
  // 资源目录：先用内置 SVG 数据生成（无图片资源时兜底）
  return null
}

function createIcon(state) {
  const color = state === 'recording' ? '#D4AF6A' : '#8F867B'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="9" fill="${color}"/>
  <circle cx="16" cy="16" r="3.5" fill="#14161A"/>
</svg>`
  const img = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
  img.setTemplateImage(false)
  return img
}

function buildMenu(actions) {
  const windows = require('./windows')
  const recorderVisible = windows.isMiniVisible()
  const items = []
  if (currentState === 'recording') {
    items.push({ label: '● 记录中', enabled: false })
  }
  items.push(
    { label: currentState === 'recording' ? '结束记录  Ctrl+Shift+2' : '开始记录  Ctrl+Shift+1', click: () => actions.toggleRecord() },
    { label: recorderVisible ? '隐藏悬浮记录器' : '显示悬浮记录器', click: () => recorderVisible ? actions.hideRecorder() : actions.openRecorder() },
    { label: '快捷截图  Ctrl+Shift+3', click: () => actions.screenshot() },
    { type: 'separator' },
    { label: '打开浏览器面板  Ctrl+Shift+0', click: () => actions.openPanel() },
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
