// 主进程入口：生命周期、单实例、服务装配。
const { app, shell, dialog } = require('electron')
const path = require('path')
const crypto = require('crypto')
const { IPC } = require('../shared/constants')

let server = null

// ---------- 单实例锁 ----------
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const windows = require('./windows')
    windows.showRecorder()
  })

  app.whenReady().then(async () => {
    const db = require('./db')
    const settings = require('./services/settings')
    const ledger = require('./services/ledger')
    const tray = require('./tray')
    const windows = require('./windows')
    const shortcut = require('./services/shortcut')
    const activity = require('./services/activity')
    const todoReminder = require('./services/todoReminder')
    const overtimeEvidenceReminder = require('./services/overtimeEvidenceReminder')
    const ipc = require('./ipc')
    const lifecycle = require('./services/lifecycle')

    // 1. 生命周期预检 + 数据库迁移。升级前先备份，降级写入直接阻止。
    const userData = app.getPath('userData')
    const dbPath = path.join(userData, 'niuma.db')
    let lifecycleContext = null
    try {
      lifecycleContext = await lifecycle.prepare({ userData, dbPath, appVersion: app.getVersion() })
      const database = db.init(dbPath)
      lifecycle.finalize(database, lifecycleContext)
    } catch (e) {
      if (lifecycleContext?.backup?.id) lifecycle.scheduleRestore(userData, lifecycleContext.backup.id)
      dialog.showErrorBox('牛马联盟启动保护', `${e.message}\n\n程序已停止写入。${lifecycleContext?.backup ? '升级前备份已保留，可在修复后恢复。' : ''}`)
      app.quit()
      return
    }

    // 2. 初始化运行时设置（token + 快捷键规范化）
    if (lifecycleContext.mode === 'upgrade' && settings.get('onboarding.completed') !== true) settings.set('onboarding.completed', true)
    settings.set('install.lastStartMode', lifecycleContext.mode)
    settings.set('install.currentVersion', app.getVersion())
    ensureRuntimeToken(settings)
    normalizeShortcutSettings(settings)

    // 3. 崩溃恢复
    const recovered = ledger.recover()
    if (recovered > 0) console.log(`[niuma] 崩溃恢复 ${recovered} 条未完成记录`)

    // 4. 服务事件接线
    ipc.wireServiceEmitters()
    ipc.registerAll()

    // 5. 本地 Web 服务（先起服务，再建窗口，统一走 http 加载）
    const { createServer } = require('./server')
    const { server: sv, actualPort } = await createServer(settings.get('server.port'))
    server = sv
    if (actualPort !== settings.get('server.port')) settings.set('server.port', actualPort)
    refreshLanUrls(settings)
    require('./services/mcpConfig').ensureRuntimeFiles()
    if (settings.get('onboarding.completed') !== true) {
      shell.openExternal(`http://127.0.0.1:${actualPort}/panel.html#settings`)
    }
    const evidenceService = require('./services/evidence')
    if (!settings.get('evidence.dir')) evidenceService.ensureLibraryDirs(Date.now())
    const evidenceStatus = evidenceService.evidenceLibraryStatus()
    if (evidenceStatus.requiresRelocate) {
      const { Notification } = require('electron')
      const notice = new Notification({ title: '牛马联盟 · 证据库未连接', body: '已停止向失联路径写入。请在设置中重新定位已有证据库。' })
      notice.on('click', () => shell.openExternal(`http://127.0.0.1:${actualPort}/panel.html#settings`))
      notice.show()
    }
    if (settings.get('update.autoCheck')) require('./services/updater').check().catch(() => {})

    // 6. 托盘 + 独立记录器（是否自动显示由设置控制）
    const actions = buildActions()
    tray.create(actions)
    if (settings.get('recorder.enabled') || settings.get('mini.enabled')) windows.createRecorder()

    // 7. 快捷键
    const failed = shortcut.registerAll({
      start: () => { console.log('[niuma] 快捷键触发: start'); onStartShortcut() },
      stop: () => { console.log('[niuma] 快捷键触发: stop'); onStopShortcut() },
      screenshot: () => { console.log('[niuma] 快捷键触发: screenshot'); evidenceCapture() },
      pack: () => { console.log('[niuma] 快捷键触发: pack'); actions.pack() },
      openPanel: () => { console.log('[niuma] 快捷键触发: openPanel'); actions.openPanel() }
    })
    if (failed.length) {
      const { Notification } = require('electron')
      for (const f of failed) console.warn(`[niuma] 快捷键冲突: ${f.name} -> ${f.accelerator}`)
      new Notification({
        title: '牛马联盟 · 快捷键注册失败',
        body: failed.map((f) => `${f.name}: ${f.accelerator}`).join('\n')
      }).show()
    }

    // 8. 活动采集 + 待办提醒
    activity.start()
    todoReminder.start()
    overtimeEvidenceReminder.start()

    // 9. 迷你栏状态同步
    syncMiniState(ledger.current())

    console.log(`[niuma] 牛马联盟已启动 · 面板 http://127.0.0.1:${actualPort}`)
  })
}

function ensureRuntimeToken(settings) {
  if (!settings.get('server.token')) {
    settings.set('server.token', crypto.randomBytes(16).toString('hex'))
  }
}

function normalizeShortcutSettings(settings) {
  const shortcuts = settings.get('shortcuts') || {}
  const stableDefaults = {
    start: 'F8',
    stop: 'F9',
    screenshot: 'F10',
    pack: '',
    openPanel: ''
  }
  if (settings.get('shortcutPresetVersion') !== 'fkeys-v2') {
    settings.set('shortcuts', stableDefaults)
    settings.set('shortcutPresetVersion', 'fkeys-v2')
    return
  }
  let changed = false
  const next = { ...shortcuts }
  for (const [key, value] of Object.entries(next)) {
    if (typeof value !== 'string') continue
    if (value.startsWith('Ctrl+')) {
      next[key] = value.replace(/^Ctrl\+/, 'CommandOrControl+')
      changed = true
    }
    // Windows 上 Shift/Alt + 数字可能撞系统、显卡、桌面热键；统一迁移到 F 键。
    if (/^(CommandOrControl\+)?(Shift|Alt)\+[0-9]$/.test(next[key]) && Object.prototype.hasOwnProperty.call(stableDefaults, key)) {
      next[key] = stableDefaults[key]
      changed = true
    }
    if (/^CommandOrControl\+Alt\+[0-9]$/.test(next[key]) && Object.prototype.hasOwnProperty.call(stableDefaults, key)) {
      next[key] = stableDefaults[key]
      changed = true
    }
  }
  for (const [key, value] of Object.entries(stableDefaults)) {
    if (!next[key]) { next[key] = value; changed = true }
  }
  if (changed) settings.set('shortcuts', next)
}

function refreshLanUrls(settings) {
  const { localIPs } = require('./server')
  settings.set('server.urls', {
    local: `http://127.0.0.1:${settings.get('server.port')}`,
    lan: localIPs().map((ip) => `http://${ip}:${settings.get('server.port')}`)
  })
}

function buildActions() {
  const settings = require('./services/settings')
  const ledger = require('./services/ledger')
  const evidence = require('./services/evidence')
  const tray = require('./tray')
  const windows = require('./windows')
  return {
    openRecorder: () => windows.showRecorder(),
    hideRecorder: () => windows.hideRecorder(true),
    toggleRecord: () => onStartShortcut(),
    screenshot: () => evidence.capture(),
    pack: () => {
      const { BrowserWindow, Notification } = require('electron')
      new Notification({ title: '牛马联盟', body: '证据包打包将在 P2 实现' }).show()
    },
    openPanel: () => {
      shell.openExternal(`http://127.0.0.1:${settings.get('server.port')}`)
    },
    quit: () => app.quit()
  }
}

async function onStartShortcut() {
  const ledger = require('./services/ledger')
  const settings = require('./services/settings')
  const tray = require('./tray')
  const windows = require('./windows')
  const { tagsRepo } = require('./db')
  const selected = settings.get('recorder.selectedTagId') || settings.get('mini.selectedTagId')
  const tags = tagsRepo.all()
  const tag = tags.find((t) => t.id === Number(selected)) || tags[0]
  if (!tag) {
    const { Notification } = require('electron')
    new Notification({ title: '牛马联盟', body: '没有可用标签，请先在设置里创建标签' }).show()
    windows.showRecorderMessage({ type: 'warning', text: '没有可用标签', duration: 2400 })
    return { ok: false, error: '没有可用标签' }
  }
  const current = ledger.current()
  if (current && current.paused) {
    const r = await ledger.start({ tagId: tag.id })
    console.log(`[niuma] resume result: ok=${r.ok}${r.entry ? ` id=${r.entry.id}` : ''}${r.error ? ` error=${r.error}` : ''}`)
    if (r.ok) tray.setState('recording')
    return r
  }
  if (current) {
    const r = await ledger.pause({})
    console.log(`[niuma] pause result: ok=${r.ok}${r.entry ? ` id=${r.entry.id}` : ''}${r.error ? ` error=${r.error}` : ''}`)
    if (r.ok) tray.setState('idle')
    return r
  }
  const r = await ledger.start({ tagId: tag.id })
  console.log(`[niuma] start result: ok=${r.ok}${r.entry ? ` id=${r.entry.id}` : ''}${r.error ? ` error=${r.error}` : ''}`)
  if (r.ok) {
    tray.setState('recording')
  }
  return r
}

async function onStopShortcut() {
  const ledger = require('./services/ledger')
  const tray = require('./tray')
  const r = await ledger.complete({})
  console.log(`[niuma] stop result: ok=${r.ok}${r.entry ? ` id=${r.entry.id}` : ''}${r.error ? ` error=${r.error}` : ''}`)
  if (r.ok) tray.setState('idle')
  return r
}

function evidenceCapture() {
  const evidence = require('./services/evidence')
  const tray = require('./tray')
  evidence.capture().then((r) => {
    const windows = require('./windows')
    if (!r.ok) {
      const { Notification } = require('electron')
      new Notification({ title: '牛马联盟', body: `截图失败: ${r.error}` }).show()
      windows.showRecorderMessage({ type: 'error', text: '未落盘', duration: 2400 })
    }
  })
}

function syncMiniState(entry) {
  const tray = require('./tray')
  tray.setState(entry ? 'recording' : 'idle')
}

app.on('window-all-closed', () => {
  // 托盘应用：不退出
})

app.on('before-quit', () => {
  const activity = require('./services/activity')
  const todoReminder = require('./services/todoReminder')
  const overtimeEvidenceReminder = require('./services/overtimeEvidenceReminder')
  const shortcut = require('./services/shortcut')
  activity.stop()
  todoReminder.stop()
  overtimeEvidenceReminder.stop()
  shortcut.unregisterAll()
  if (server) server.close()
})
