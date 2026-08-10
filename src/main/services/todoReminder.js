// 待办提醒：桌面启动器消息推送。基础版：到期未完成待办弹系统通知，单次运行内不重复提醒。
const { Notification } = require('electron')
const todos = require('./todos')

let timer = null
const reminded = new Set()

function tick() {
  const r = todos.due(Date.now())
  if (!r.ok) return
  for (const t of r.todos) {
    if (reminded.has(t.id)) continue
    reminded.add(t.id)
    new Notification({ title: '牛马联盟 · 待办提醒', body: t.title }).show()
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

module.exports = { start, stop, tick }
