// 待办提醒：到期/阶段待办弹系统通知，提醒状态持久化，避免重启后重复刷屏。
const { Notification, shell } = require('electron')
const todos = require('./todos')
const settings = require('./settings')

let timer = null

function openTodosPage() {
  const port = settings.get('server.port') || 37129
  shell.openExternal(`http://127.0.0.1:${port}/panel.html#todos`).catch(() => {})
}

function fmt(ts) { return ts ? new Date(ts).toLocaleString() : '' }
function bodyOf(t) {
  const isPhase = t.reminder_enabled && t.phase_start_at && t.phase_end_at && Date.now() >= t.phase_start_at && Date.now() <= t.phase_end_at
  if (isPhase) return `${t.title}\n阶段 ${fmt(t.phase_start_at)} 至 ${fmt(t.phase_end_at)}\n提醒窗口 ${t.remind_window_start || '09:00'}-${t.remind_window_end || '18:00'}`
  return t.due_at ? `${t.title}\n截止 ${fmt(t.due_at)}` : t.title
}

function tick() {
  const now = Date.now()
  const r = todos.due(now)
  if (!r.ok) return
  for (const t of r.todos) {
    const isPhase = t.reminder_enabled && t.phase_start_at && t.phase_end_at && now >= t.phase_start_at && now <= t.phase_end_at
    const n = new Notification({
      title: isPhase ? '牛马联盟 · 阶段待办提醒' : '牛马联盟 · 待办提醒',
      body: bodyOf(t)
    })
    n.on('click', openTodosPage)
    n.show()
    todos.markReminded({ id: t.id, remindedAt: now, kind: isPhase ? 'phase' : 'due' })
  }
}

function start() {
  if (timer) return
  timer = setInterval(tick, 60 * 1000)
  tick()
}

function stop() {
  if (timer) clearInterval(timer)
  timer = null
}

module.exports = { start, stop, tick, openTodosPage }
