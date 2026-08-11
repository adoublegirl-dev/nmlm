// 加班证据提醒：每天固定时间后，如果系统仍有键鼠交互，提醒用户留存加班证据。
const { Notification, powerMonitor, shell } = require('electron')
const settings = require('./settings')

let timer = null

function todayKey(now = Date.now()) {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function minutesOfDay(hhmm) {
  const [h, m] = String(hhmm || '20:00').split(':').map((n) => Number(n))
  return (Number.isFinite(h) ? h : 20) * 60 + (Number.isFinite(m) ? m : 0)
}

function openEvidencePage() {
  const port = settings.get('server.port') || 37129
  shell.openExternal(`http://127.0.0.1:${port}/panel.html#evidence`).catch(() => {})
}

function shouldNotify(now = Date.now()) {
  const cfg = settings.get('reminder') || {}
  if (cfg.enabled === false) return false
  const checkTime = cfg.evidenceCheckTime || '20:00'
  const d = new Date(now)
  const minute = d.getHours() * 60 + d.getMinutes()
  if (minute < minutesOfDay(checkTime)) return false
  if (settings.get('reminder.lastEvidenceReminderDate') === todayKey(now)) return false

  const idleThreshold = Number(cfg.evidenceIdleThresholdSec || cfg.idleThresholdSec || 300)
  const idleSec = typeof powerMonitor.getSystemIdleTime === 'function' ? powerMonitor.getSystemIdleTime() : 0
  return idleSec < idleThreshold
}

function tick(now = Date.now()) {
  if (!shouldNotify(now)) return { ok: true, notified: false }
  const n = new Notification({
    title: '牛马联盟 · 加班留证提醒',
    body: '很晚了，还在加班吗？记得截图落盘'
  })
  n.on('click', openEvidencePage)
  n.show()
  settings.set('reminder.lastEvidenceReminderDate', todayKey(now))
  try {
    const windows = require('../windows')
    windows.showRecorderMessage({ type: 'info', text: '记得留证', duration: 2200 })
  } catch (_) {}
  return { ok: true, notified: true }
}

function start() {
  if (timer) return
  timer = setInterval(() => tick(), 60 * 1000)
  tick()
}

function stop() {
  if (timer) clearInterval(timer)
  timer = null
}

module.exports = { start, stop, tick, shouldNotify, todayKey }
