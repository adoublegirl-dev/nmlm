// 待办提醒：到期未完成待办弹系统通知，提醒状态持久化，避免重启后重复刷屏。
const { Notification, shell } = require('electron')
const todos = require('./todos')
const settings = require('./settings')

let timer = null

function openTodosPage() {
  const port = settings.get('server.port') || 37129
  shell.openExternal(`http://127.0.0.1:${port}/panel.html#todos`).catch(() => {})
}

function tick() {
  const r = todos.due(Date.now())
  if (!r.ok) return
  for (const t of r.todos) {
    const n = new Notification({
      title: '牛马联盟 · 待办提醒',
      body: t.due_at ? `${t.title}\n截止 ${new Date(t.due_at).toLocaleString()}` : t.title
    })
    n.on('click', openTodosPage)
    n.show()
    todos.markReminded({ id: t.id, remindedAt: Date.now() })
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
