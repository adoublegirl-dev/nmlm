// 主进程入口：生命周期、单实例、服务装配。
const { app, shell } = require('electron')
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
    const mini = windows.getMini()
    if (mini) {
      mini.showInactive()
      windows.resizeMini(360, 320)
    }
  })

  app.whenReady().then(async () => {
    const db = require('./db')
    const settings = require('./services/settings')
    const ledger = require('./services/ledger')
    const tray = require('./tray')
    const windows = require('./windows')
    const shortcut = require('./services/shortcut')
    const activity = require('./services/activity')
    const ipc = require('./ipc')

    // 1. 数据库
    db.init(path.join(app.getPath('userData'), 'niuma.db'))

    // 2. 初始化运行时设置（token）
    ensureRuntimeToken(settings)

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

    // 6. 托盘 + 迷你栏
    const actions = buildActions()
    tray.create(actions)
    windows.createMini()

    // 7. 快捷键
    const failed = shortcut.registerAll({
      start: () => ledger.start(),
      stop: () => onStopShortcut(),
      screenshot: () => evidenceCapture(),
      pack: () => actions.pack(),
      openPanel: () => actions.openPanel()
    })
    if (failed.length) {
      for (const f of failed) console.warn(`[niuma] 快捷键冲突: ${f.accelerator}`)
    }

    // 8. 活动采集（P0 起轮询，供迷你栏显示当前窗口）
    activity.start()

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
    toggleRecord: () => {
      const current = ledger.current()
      if (current) return onStopShortcut()
      ledger.start()
      tray.setState('recording')
    },
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

function onStopShortcut() {
  const ledger = require('./services/ledger')
  const tray = require('./tray')
  const windows = require('./windows')
  const r = ledger.stop({})
  if (r.ok) {
    tray.setState('idle')
    windows.createTagPicker(r.entry.id)
  }
  return r
}

function evidenceCapture() {
  const evidence = require('./services/evidence')
  const tray = require('./tray')
  evidence.capture().then((r) => {
    if (!r.ok) {
      const { Notification } = require('electron')
      new Notification({ title: '牛马联盟', body: `截图失败: ${r.error}` }).show()
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
  const shortcut = require('./services/shortcut')
  activity.stop()
  shortcut.unregisterAll()
  if (server) server.close()
})
