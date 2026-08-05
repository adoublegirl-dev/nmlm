// 活动采集：轮询当前窗口，写 activity_log，并广播快照给迷你栏。
const { activityRepo } = require('../db')
const { getActiveWindow } = require('../utils/window')
const { EVENTS } = require('../../shared/constants')
const settings = require('./settings')

let timer = null
let lastTitle = null
let emitter = null

function attachEventSender(fn) {
  emitter = fn
}

async function tick() {
  const win = await getActiveWindow(true).catch(() => null)
  const title = win ? win.title : null
  const isIdle = title === lastTitle ? 0 : 0 // P1 接入空闲判定（GetLastInputInfo）
  lastTitle = title
  const now = Date.now()
  activityRepo.insert({
    ts: now,
    windowTitle: title,
    processName: win ? win.processName : null,
    isIdle
  })
  if (emitter) emitter(EVENTS.ACTIVITY_SNAPSHOT, { ts: now, windowTitle: title, processName: win ? win.processName : null })
}

function start() {
  if (timer) return
  tick()
  const sec = Math.max(10, settings.get('activity.pollIntervalSec') || 30)
  timer = setInterval(tick, sec * 1000)
}

function stop() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

module.exports = { attachEventSender, start, stop, tick }
