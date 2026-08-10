// 悬浮记录器：默认紧凑，只做记录；展开后才露出管理动作。
import { api, on } from '../api'
import { formatDuration, formatTime } from '../utils/format'
import './mini.css'

const app = document.getElementById('mini-app')
app.innerHTML = `
  <div class="recorder" id="recorder">
    <div class="dragbar">
      <div class="brand">
        <div class="title">牛马记录器</div>
        <div id="sub" class="sub">桌面悬浮 · 可在设置关闭</div>
      </div>
      <div class="top-actions no-drag">
        <button id="more" class="icon-btn" title="展开/收起">···</button>
        <button id="hide" class="icon-btn" title="隐藏到托盘">×</button>
      </div>
    </div>

    <div class="now">
      <div id="statusDot" class="status-dot"></div>
      <div class="now-main">
        <div id="taskName" class="task-name">未开始</div>
        <div id="taskMeta" class="task-meta">点击开始记录</div>
      </div>
      <div id="elapsed" class="elapsed num">0m</div>
    </div>

    <div class="compact-actions no-drag">
      <button id="primaryAction" class="btn primary grow">开始记录</button>
      <button id="switchTask" class="btn compact-only">切换</button>
    </div>

    <div id="expandedPanel" class="expanded hidden no-drag">
      <div class="actions">
        <button id="pausePoint" class="btn">暂停点</button>
        <button id="complete" class="btn">完成任务</button>
        <button id="panel" class="btn">打开面板</button>
      </div>
      <div id="tagPanel" class="tag-panel hidden">
        <input id="taskDetail" class="input task-input" placeholder="这段具体做什么（可选）" />
        <div id="tags" class="tags"></div>
      </div>
      <div id="recent" class="recent"></div>
    </div>
  </div>
`

let tags = []
let current = null
let currentTag = null
let pauseCount = 0
let expanded = false
let tagPanelOpen = false

async function loadTags() {
  const r = await api('tags:list')
  tags = r.tags || []
  renderTags()
}

function renderTags() {
  const el = document.getElementById('tags')
  el.innerHTML = tags.map((t) => `
    <button class="tag-btn" data-id="${t.id}" style="--c:${t.color}">
      <span class="key">${t.shortcut_key ?? '·'}</span>${t.name}
    </button>
  `).join('')
  el.querySelectorAll('.tag-btn').forEach((b) => b.addEventListener('click', () => switchTask(Number(b.dataset.id))))
}

async function refresh() {
  const cur = await api('ledger:current')
  current = cur.entry || null
  currentTag = current && tags.find((t) => t.id === current.tag_id)
  pauseCount = 0
  if (current) {
    const ps = await api('ledger:pausePoints', { start: current.start_time - 1, end: Date.now() + 1000 }).catch(() => ({ points: [] }))
    pauseCount = (ps.points || []).filter((p) => p.entry_id === current.id).length
  }
  renderCurrent()
  if (expanded) renderRecentSafe()
}

async function renderRecentSafe() {
  const today = await api('report:dailyTimeline', { date: Date.now() }).catch(() => ({ segments: [] }))
  renderRecent(today.segments || [])
}

function renderCurrent() {
  const dot = document.getElementById('statusDot')
  const name = document.getElementById('taskName')
  const meta = document.getElementById('taskMeta')
  const elapsed = document.getElementById('elapsed')
  const primary = document.getElementById('primaryAction')
  const switchBtn = document.getElementById('switchTask')
  if (!current) {
    dot.classList.remove('recording')
    name.textContent = '未开始'
    meta.textContent = '选择标签开始一段记录'
    elapsed.textContent = '0m'
    primary.textContent = '开始记录'
    switchBtn.classList.add('hidden')
    return
  }
  dot.classList.add('recording')
  name.textContent = currentTag ? currentTag.name : '未分类任务'
  const pointText = pauseCount ? ` · ${pauseCount} 个暂停点` : ''
  meta.textContent = (current.detail || '正在记录') + pointText
  elapsed.textContent = formatDuration(Math.floor((Date.now() - current.start_time) / 1000))
  primary.textContent = '打暂停点'
  switchBtn.classList.remove('hidden')
}

function renderRecent(segments) {
  const el = document.getElementById('recent')
  const list = segments.filter((s) => s.end_time).slice(-2).reverse()
  if (!list.length) {
    el.innerHTML = '<span class="muted">今天还没有完成的片段</span>'
    return
  }
  el.innerHTML = list.map((s) => `<div class="recent-item"><span class="time">${formatTime(s.start_time)}</span><span style="color:${s.color}">${s.tagName}</span><span class="dur">${formatDuration(s.duration_sec || 0)}</span></div>`).join('')
}

function setExpanded(val) {
  expanded = val
  document.getElementById('expandedPanel').classList.toggle('hidden', !expanded)
  document.getElementById('recorder').classList.toggle('is-expanded', expanded)
  api('mini:resize', { width: 380, height: expanded ? 270 : 150 }).catch(() => {})
  if (expanded) renderRecentSafe()
  if (!expanded) toggleTags(false)
}

function toggleTags(force) {
  tagPanelOpen = force == null ? !tagPanelOpen : force
  if (tagPanelOpen && !expanded) setExpanded(true)
  document.getElementById('tagPanel').classList.toggle('hidden', !tagPanelOpen)
  if (tagPanelOpen) document.getElementById('taskDetail').focus()
}

async function switchTask(tagId) {
  const detail = document.getElementById('taskDetail').value.trim() || null
  const r = await api('ledger:switchTask', { tagId, detail })
  if (!r.ok) return alert(r.error || '切换失败')
  document.getElementById('taskDetail').value = ''
  toggleTags(false)
  await refresh()
}

async function completeTask() {
  if (!current) return
  const r = await api('ledger:complete', {})
  if (!r.ok) return alert(r.error || '完成失败')
  await refresh()
}

async function addPausePoint() {
  if (!current) {
    toggleTags(true)
    return
  }
  const r = await api('ledger:addPausePoint', { detail: null })
  if (!r.ok) return alert(r.error || '添加失败')
  pauseCount += 1
  renderCurrent()
  flash(`已添加暂停点 #${pauseCount}`)
}

function flash(text) {
  const sub = document.getElementById('sub')
  sub.textContent = text
  setTimeout(() => { sub.textContent = '桌面悬浮 · 可在设置关闭' }, 1500)
}

function bindKeys() {
  document.addEventListener('keydown', (e) => {
    if (/^[0-9]$/.test(e.key) && tagPanelOpen) {
      const tag = tags.find((t) => Number(t.shortcut_key) === Number(e.key))
      if (tag) switchTask(tag.id)
    }
    if (e.key === 'Escape') {
      if (tagPanelOpen) toggleTags(false)
      else if (expanded) setExpanded(false)
    }
  })
}

document.getElementById('primaryAction').addEventListener('click', () => current ? addPausePoint() : toggleTags(true))
document.getElementById('switchTask').addEventListener('click', () => toggleTags(true))
document.getElementById('more').addEventListener('click', () => setExpanded(!expanded))
document.getElementById('complete').addEventListener('click', completeTask)
document.getElementById('pausePoint').addEventListener('click', addPausePoint)
document.getElementById('panel').addEventListener('click', () => api('server:openBrowser'))
document.getElementById('hide').addEventListener('click', () => api('mini:hide'))

on('ledger:state-changed', refresh)
on('mini:open-task-picker', () => toggleTags(true))

loadTags().then(refresh)
bindKeys()
setExpanded(false)
setInterval(renderCurrent, 1000)
