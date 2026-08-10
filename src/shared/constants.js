// 共享常量：IPC 通道名、事件名、默认配置。
// 主进程、preload、渲染层三处共用，禁止散落魔法字符串。

// ---------- IPC invoke/handle 通道 ----------
const IPC = {
  // ledger
  LEDGER_START: 'ledger:start',
  LEDGER_STOP: 'ledger:stop',
  LEDGER_SWITCH_TASK: 'ledger:switchTask',
  LEDGER_COMPLETE: 'ledger:complete',
  LEDGER_ADD_PAUSE_POINT: 'ledger:addPausePoint',
  LEDGER_PAUSE_POINTS: 'ledger:pausePoints',
  LEDGER_PAUSE: 'ledger:pause',
  LEDGER_CURRENT: 'ledger:current',
  LEDGER_LIST: 'ledger:list',
  LEDGER_RECOVER: 'ledger:recover',
  LEDGER_RETAG: 'ledger:retag',
  // tags
  TAGS_LIST: 'tags:list',
  TAGS_CREATE: 'tags:create',
  TAGS_UPDATE: 'tags:update',
  TAGS_DELETE: 'tags:delete',
  // evidence
  EVIDENCE_CAPTURE: 'evidence:capture',
  EVIDENCE_LIST: 'evidence:list',
  EVIDENCE_PACK: 'evidence:pack',
  EVIDENCE_PACK_STATUS: 'evidence:packStatus',
  // report
  REPORT_DAILY_TIMELINE: 'report:dailyTimeline',
  REPORT_TAG_DISTRIBUTION: 'report:tagDistribution',
  REPORT_DAILY_TREND: 'report:dailyTrend',
  REPORT_EFFECTIVE_HOURS: 'report:effectiveHours',
  // model
  MODEL_GENERATE_REPORT: 'model:generateReport',
  // tools
  TOOLS_LIST: 'tools:list',
  TOOLS_OPEN: 'tools:open',
  TOOLS_CREATE: 'tools:create',
  TOOLS_UPDATE: 'tools:update',
  TOOLS_DELETE: 'tools:delete',
  // todos
  TODOS_LIST: 'todos:list',
  TODOS_CREATE: 'todos:create',
  TODOS_UPDATE: 'todos:update',
  TODOS_CLOSE: 'todos:close',
  TODOS_DELETE: 'todos:delete',
  TODOS_DUE: 'todos:due',
  // settings
  SETTINGS_GET_ALL: 'settings:getAll',
  SETTINGS_SET: 'settings:set',
  // server
  SERVER_INFO: 'server:info',
  SERVER_OPEN_BROWSER: 'server:openBrowser',
  // app
  APP_OPEN_SCREENSHOTS_DIR: 'app:openScreenshotsDir',
  APP_QUIT: 'app:quit',
  // mini dock
  MINI_HIDE: 'mini:hide',
  MINI_SET_POS: 'mini:setPos',
  MINI_RESIZE: 'mini:resize',
  // tagpicker
  TAGPICKER_CANCEL: 'tagpicker:cancel',
  TAGPICKER_CONFIRM: 'tagpicker:confirm'
}

// ---------- main → renderer 推送事件 ----------
const EVENTS = {
  LEDGER_STATE_CHANGED: 'ledger:state-changed',
  REMINDER_TRIGGERED: 'reminder:triggered',
  CAPTURE_DONE: 'capture:done',
  PACK_DONE: 'pack:done',
  SETTINGS_CHANGED: 'settings:changed',
  SHORTCUT_CONFLICT: 'shortcut:conflict',
  ACTIVITY_SNAPSHOT: 'activity:snapshot',
  TODO_CHANGED: 'todo:changed',
  MINI_OPEN_TASK_PICKER: 'mini:open-task-picker'
}

// ---------- 默认配置 ----------
const DEFAULT_SETTINGS = {
  // 快捷键：accelerator 为空字符串表示未启用
  shortcuts: {
    start: 'CommandOrControl+Shift+1',
    stop: 'CommandOrControl+Shift+2',
    screenshot: 'CommandOrControl+Shift+3',
    pack: 'CommandOrControl+Shift+4',
    openPanel: 'CommandOrControl+Shift+0'
  },
  reminder: {
    enabled: true,
    checkStart: '19:00',
    checkEnd: '23:30',
    checkIntervalMin: 30,
    idleThresholdSec: 300,
    workHoursThreshold: 10,
    message: '到点了，该存档了',
    messageUpgraded: '今天进度拉满，存个档再走',
    actions: ['ledger', 'screenshot']
  },
  evidence: {
    dir: null, // null = userData/screenshots
    keepDays: 30,
    watermark: true
  },
  privacy: {
    blurSensitiveWindows: false,
    sensitiveProcesses: ['chrome', 'msedge', 'wechat', 'dingtalk', 'qq']
  },
  model: {
    enabled: false,
    provider: 'ollama',
    baseURL: 'http://127.0.0.1:11434',
    model: 'qwen2.5:7b',
    apiKey: '',
    timeoutSec: 60
  },
  server: {
    port: 37129
  },
  mini: {
    enabled: true, // 启动时是否自动显示桌面悬浮记录器
    position: { x: null, y: null }, // null = 右下角默认
    hiddenToTray: false
  },
  activity: {
    pollIntervalSec: 30
  },
  tools: [
    { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com', group: '效率' },
    { id: 'shimo', name: '石墨文档', url: 'https://shimo.im', group: '协作' },
    { id: 'yuque', name: '语雀', url: 'https://www.yuque.com', group: '协作' },
    { id: 'tengdoc', name: '腾讯文档', url: 'https://docs.qq.com', group: '协作' },
    { id: 'feishu', name: '飞书', url: 'https://www.feishu.cn', group: '协作' },
    { id: 'github', name: 'GitHub', url: 'https://github.com', group: '效率' }
  ]
}

const FRAGMENT_THRESHOLD_SEC = 15 * 60 // 碎片判定阈值

const SERVER_DEFAULT_PORT = 37129

module.exports = { IPC, EVENTS, DEFAULT_SETTINGS, FRAGMENT_THRESHOLD_SEC, SERVER_DEFAULT_PORT }
