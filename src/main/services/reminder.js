// 提醒引擎：检查链为纯函数（可单测），定时器在主进程启动。
// P0 提供检查逻辑与启动骨架，弹窗 UI 在 P1 接入。
const settings = require('./settings')
const report = require('./report')

let timer = null
let emitter = null
let lastRemindKey = null

function attachEventSender(fn) {
  emitter = fn
}

function nowMinutes() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

function parseHHMM(s) {
  const [h, m] = String(s || '').split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

// 是否处于检测时段 [checkStart, checkEnd]（跨零点处理）
function inCheckWindow(cfg, minute) {
  const start = parseHHMM(cfg.checkStart)
  const end = parseHHMM(cfg.checkEnd)
  if (start == null || end == null) return false
  if (start <= end) return minute >= start && minute <= end
  return minute >= start || minute <= end // 跨零点
}

// 是否处于免打扰时段
function inDnd(cfg, minute) {
  if (!cfg.dndStart || !cfg.dndEnd) return false
  const start = parseHHMM(cfg.dndStart)
  const end = parseHHMM(cfg.dndEnd)
  if (start == null || end == null) return false
  if (start <= end) return minute >= start && minute <= end
  return minute >= start || minute <= end
}

// 今天是否已提醒过（按检测时段划分的 key）
function alreadyReminded(cfg, nowTs) {
  const key = new Date(nowTs).toDateString()
  return lastRemindKey === key
}

// 完整检查链。返回 null = 不提醒；返回对象 = 应提醒
function evaluate(nowTs = Date.now(), extra = {}) {
  const cfg = settings.get('reminder')
  if (!cfg.enabled) return null
  const minute = nowMinutes()
  if (!inCheckWindow(cfg, minute)) return null
  if (inDnd(cfg, minute)) return null
  if (extra.isIdle) return null // 人不在电脑前
  if (alreadyReminded(cfg, nowTs)) return null
  const effectiveSec = report.effectiveHours(nowTs)
  const upgraded = effectiveSec > cfg.workHoursThreshold * 3600
  return {
    message: upgraded ? cfg.messageUpgraded : cfg.message,
    upgraded,
    effectiveSec,
    actions: cfg.actions || []
  }
}

function tick() {
  const result = evaluate()
  if (result) {
    lastRemindKey = new Date().toDateString()
    if (emitter) emitter(result)
  }
}

function start() {
  if (timer) return
  const cfg = settings.get('reminder')
  const intervalMs = Math.max(5, cfg.checkIntervalMin) * 60 * 1000
  timer = setInterval(tick, intervalMs)
  tick()
}

function stop() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

module.exports = { attachEventSender, evaluate, inCheckWindow, inDnd, start, stop }
