// IPC 枢纽：handlers 注册表 + 事件推送。HTTP server 复用同一注册表。
const { ipcMain, BrowserWindow, shell, app } = require('electron')
const { IPC, EVENTS } = require('../shared/constants')
const settings = require('./services/settings')
const shortcut = require('./services/shortcut')
const ledger = require('./services/ledger')
const evidence = require('./services/evidence')
const report = require('./services/report')
const tools = require('./services/tools')
const todos = require('./services/todos')
const activity = require('./services/activity')
const windows = require('./windows')
const { tagsRepo, packsRepo, settingsRepo } = require('./db')
const { DEFAULT_SETTINGS } = require('../shared/constants')

const HANDLERS = {}

function registerHandler(channel, fn) {
  HANDLERS[channel] = fn
}

// 供 HTTP server 调用的统一入口
async function call(channel, args = {}) {
  const fn = HANDLERS[channel]
  if (!fn) return { ok: false, error: `未知通道: ${channel}` }
  try {
    return await fn(args)
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
}

// ---------- 事件推送（main → 所有渲染窗口） ----------
function broadcast(event, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(event, payload)
  }
}

function wireServiceEmitters() {
  ledger.attachEventSender((data) => {
    broadcast(EVENTS.LEDGER_STATE_CHANGED, data)
    const map = { recording: '已开始', paused: '留一个断点', completed: '已存档', idle: '已静默' }
    if (map[data?.state]) windows.showRecorderMessage({ type: data.state === 'paused' ? 'info' : 'success', text: map[data.state], duration: 1800 })
  })
  evidence.attachEventSender((event, payload) => {
    broadcast(event, payload)
    if (event === EVENTS.CAPTURE_DONE || event === 'capture:done') windows.showRecorderMessage({ type: payload?.ok === false ? 'error' : 'success', text: payload?.ok === false ? '未落盘' : '已落盘', duration: 2000 })
  })
  activity.attachEventSender((event, payload) => broadcast(event, payload))
  settings.attachEventSender((data) => broadcast(EVENTS.SETTINGS_CHANGED, data))
  todos.attachEventSender((data) => {
    broadcast(EVENTS.TODO_CHANGED, data)
    if (data?.type === 'created') windows.showRecorderMessage({ type: 'info', text: '已留待办', duration: 1800 })
  })
}

// ---------- 通道实现 ----------
function registerAll() {
  // ledger
  registerHandler(IPC.LEDGER_START, (a) => ledger.start(a))
  registerHandler(IPC.LEDGER_STOP, (a) => ledger.stop(a))
  registerHandler(IPC.LEDGER_SWITCH_TASK, (a) => ledger.switchTask(a))
  registerHandler(IPC.LEDGER_COMPLETE, (a) => ledger.complete(a))
  registerHandler(IPC.LEDGER_ADD_PAUSE_POINT, (a) => ledger.addPausePoint(a))
  registerHandler(IPC.LEDGER_APPLY_PAUSE_POINT_TAG, (a) => ledger.applyPausePointTag(a))
  registerHandler(IPC.LEDGER_APPLY_PAUSE_POINT_PLAN, (a) => ledger.applyPausePointPlan(a))
  registerHandler(IPC.LEDGER_PAUSE_POINTS, (a) => ({ ok: true, points: ledger.listPausePointsByRange(a.start, a.end) }))
  registerHandler(IPC.LEDGER_PAUSE, () => ledger.pause())
  registerHandler(IPC.LEDGER_CURRENT, () => ({ ok: true, entry: ledger.current() }))
  registerHandler(IPC.LEDGER_LIST, (a) => {
    const entries = ledger.listByRange(a.start, a.end)
    const cur = ledger.current()
    if (cur && cur.start_time >= a.start && cur.start_time < a.end && !entries.some((e) => e.id === cur.id)) {
      entries.push(cur)
      entries.sort((x, y) => x.start_time - y.start_time)
    }
    return { ok: true, entries }
  })
  registerHandler(IPC.LEDGER_RECOVER, () => ({ ok: true, recovered: ledger.recover() }))
  registerHandler(IPC.LEDGER_RETAG, (a) => ledger.retag(a.id, a))
  registerHandler(IPC.LEDGER_ADJUST_TIME, (a) => ledger.adjustTime(a))
  registerHandler(IPC.LEDGER_MANUAL_CREATE, (a) => ledger.manualCreate(a))

  // tags
  registerHandler(IPC.TAGS_LIST, () => ({ ok: true, tags: tagsRepo.all() }))
  registerHandler(IPC.TAGS_CREATE, (a) => ({ ok: true, tag: tagsRepo.create(a) }))
  registerHandler(IPC.TAGS_UPDATE, (a) => ({ ok: true, tag: tagsRepo.update(a.id, a) }))
  registerHandler(IPC.TAGS_DELETE, (a) => ({ ok: true, removed: tagsRepo.remove(a.id) }))

  // evidence
  registerHandler(IPC.EVIDENCE_CAPTURE, () => evidence.capture())
  registerHandler(IPC.EVIDENCE_LIST, (a) => ({ ok: true, screenshots: evidence.listByRange(a.start, a.end) }))
  registerHandler(IPC.EVIDENCE_PACK, (a) => evidence.pack(a))
  registerHandler(IPC.EVIDENCE_PACK_STATUS, () => ({ ok: true, ...evidence.packStatus() }))

  // report
  registerHandler(IPC.REPORT_DAILY_TIMELINE, (a) => ({ ok: true, segments: report.dailyTimeline(a.date) }))
  registerHandler(IPC.REPORT_TAG_DISTRIBUTION, (a) => ({ ok: true, data: report.tagDistribution(a.start, a.end) }))
  registerHandler(IPC.REPORT_DAILY_TREND, (a) => ({ ok: true, data: report.dailyTrend(a.month) }))
  registerHandler(IPC.REPORT_EFFECTIVE_HOURS, (a) => ({ ok: true, sec: report.effectiveHours(a.date) }))

  // model（P2 占位）
  registerHandler('model:generateReport', () => ({ ok: false, error: '模型接入将在 P2 实现' }))

  // tools
  registerHandler(IPC.TOOLS_LIST, () => ({ ok: true, tools: tools.list() }))
  registerHandler(IPC.TOOLS_OPEN, (a) => tools.open(a.id))
  registerHandler(IPC.TOOLS_CREATE, (a) => tools.create(a))
  registerHandler(IPC.TOOLS_UPDATE, (a) => tools.update(a.id, a))
  registerHandler(IPC.TOOLS_DELETE, (a) => tools.remove(a.id))

  // todos
  registerHandler(IPC.TODOS_LIST, (a) => todos.list(a))
  registerHandler(IPC.TODOS_CREATE, (a) => todos.create(a))
  registerHandler(IPC.TODOS_UPDATE, (a) => todos.update(a))
  registerHandler(IPC.TODOS_CLOSE, (a) => todos.close(a))
  registerHandler(IPC.TODOS_REOPEN, (a) => todos.reopen(a))
  registerHandler(IPC.TODOS_DELETE, (a) => todos.remove(a))
  registerHandler(IPC.TODOS_DUE, (a) => todos.due(a && a.now))
  registerHandler(IPC.TODOS_SNOOZE, (a) => todos.snooze(a))

  // settings
  registerHandler(IPC.SETTINGS_GET_ALL, () => ({ ok: true, settings: settings.getAll() }))
  registerHandler(IPC.SETTINGS_SET, (a) => {
    const value = settings.set(a.key, a.value)
    if (a.key === 'recorder.enabled' || a.key === 'mini.enabled') {
      if (value) windows.showRecorder()
      else windows.hideRecorder(true)
    }
    return { ok: true, value }
  })

  // server
  registerHandler(IPC.SERVER_INFO, () => {
    const s = settings.getAll()
    return { ok: true, port: s.server.port, token: s.server.token, urls: s.server.urls, userData: app.getPath('userData') }
  })
  registerHandler(IPC.SERVER_OPEN_BROWSER, () => {
    const s = settings.getAll()
    shell.openExternal(`http://127.0.0.1:${s.server.port}`)
    return { ok: true }
  })
  registerHandler(IPC.SERVER_MCP_CONFIG, () => require('./services/mcpConfig').getMcpConfig())

  // app
  registerHandler(IPC.APP_OPEN_SCREENSHOTS_DIR, () => evidence.openScreenshotsDir())
  registerHandler(IPC.APP_QUIT, () => {
    app.quit()
    return { ok: true }
  })

  // recorder
  registerHandler(IPC.RECORDER_HIDE, () => {
    windows.hideRecorder(true)
    return { ok: true }
  })
  registerHandler(IPC.RECORDER_SET_POS, (a) => windows.setRecorderPos(a.x, a.y))
  registerHandler(IPC.RECORDER_SET_MENU_OPEN, (a) => windows.setRecorderMenuOpen(!!a.open))
  registerHandler(IPC.RECORDER_SET_COLLAPSED, (a) => windows.setRecorderCollapsed(!!a.collapsed))
  registerHandler(IPC.RECORDER_SET_MESSAGE_MODE, (a) => windows.setRecorderMessageMode(!!a.active))
  registerHandler(IPC.RECORDER_SHOW_MESSAGE, (a) => windows.showRecorderMessage(a))
  registerHandler(IPC.RECORDER_GET_MESSAGE, () => windows.getRecorderMessage())
  // legacy mini aliases
  registerHandler(IPC.MINI_HIDE, () => {
    windows.hideRecorder(true)
    return { ok: true }
  })
  registerHandler(IPC.MINI_SET_POS, (a) => windows.setRecorderPos(a.x, a.y))
  // tagpicker
  registerHandler(IPC.TAGPICKER_CANCEL, () => {
    windows.closeTagPicker()
    return { ok: true }
  })
  registerHandler(IPC.TAGPICKER_CONFIRM, (a) => {
    const r = ledger.retag(Number(a.entryId), a)
    if (r.ok) windows.closeTagPicker()
    return r
  })

  // 绑定 ipcMain
  for (const [channel, fn] of Object.entries(HANDLERS)) {
    ipcMain.handle(channel, async (_e, args) => {
      try {
        return await fn(args || {})
      } catch (err) {
        return { ok: false, error: err.message || String(err) }
      }
    })
  }
}

module.exports = { registerAll, call, broadcast, wireServiceEmitters, HANDLERS }
