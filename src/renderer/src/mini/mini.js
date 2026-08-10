// 悬浮任务播放器：类似音乐播放器，负责开始/切换任务、完成任务、添加暂停点。
import { api, on } from '../api'
import { formatDuration, formatTime } from '../utils/format'
import './mini.css'

const app = document.getElementById('mini-app')
app.innerHTML = `
  <div class="player">
    <div class="dragbar">
      <div>
        <div class="title">牛马联盟</div>
        <div id="sub" class="sub">任务播放器</div>
      </div>
      <button id="hide" class="icon-btn no-drag" title="隐藏到托盘">×</button>
    </div>

    <div class="now">
      <div id="statusDot" class="status-dot"></div>
      <div class="now-main">
        <div id="taskName" class="task-name">未开始</div>
        <div id="taskMeta" class="task-meta">选择一个标签开始记录</div>
      </div>
      <div id="elapsed" class="elapsed num">0m</div>
    </div>

    <div class="actions">
      <button id="startSwitch" class="btn primary">开始 / 切换</button>
      <button id="complete" class="btn">完成</button>
      <button id="pausePoint" class="btn">暂停点</button>
      <button id="panel" class="btn">面板</button>
    </div>

    <div id="tagPanel" class="tag-panel hidden">
      <input id="taskDetail" class="input task-input" placeholder="补一句：这段具体做什么（可选）" />
      <div id="tags" class="tags"></div>
    </div>

    <div id="recent" class="recent"></div>
  </div>
`

let tags = []
let current = null
let currentTag = null
let ticker = null
let tagPanelOpen = false

async function loadTags() {
  const r = await api('tags:list')
  tags = r.tags || []
  renderTags()
}

function renderTags() {
  const el = document.getElementById('tags')
  el.innerHTML = tags.map((t) => `
    <button class="tag-btn no-drag" data-id="${t.id}" style="--c:${t.color}">
      <span class="key">${t.shortcut_key ?? '·'}</span>${t.name}
    </button>
  `).join('')
  el.querySelectorAll('.tag-btn').forEach((b) => b.addEventListener('click', () => switchTask(Number(b.dataset.id))))
}

async function refresh() {
  const [cur, today] = await Promise.all([
    api('ledger:current'),
    api('report:dailyTimeline', { date: Date.now() }).catch(() => ({ segments: [] }))
  ])
  current = cur.entry || null
  currentTag = current && tags.find((t) => t.id === current.tag_id)
  renderCurrent()
  renderRecent(today.segments || [])
}

function renderCurrent() {
  const dot = document.getElementById('statusDot')
  const name = document.getElementById('taskName')
  const meta = document.getElementById('taskMeta')
  const elapsed = document.getElementById('elapsed')
  if (!current) {
    dot.classList.remove('recording')
    name.textContent = '未开始'
    meta.textContent = '点击“开始 / 切换”选择任务标签'
    elapsed.textContent = '0m'
    return
  }
  dot.classList.add('recording')
  name.textContent = currentTag ? currentTag.name : '未分类任务'
  meta.textContent = current.detail || '正在记录这一段工作'
  elapsed.textContent = formatDuration(Math.floor((Date.now() - current.start_time) / 1000))
}

function renderRecent(segments) {
  const el = document.getElementById('recent')
  const list = segments.filter((s) => s.end_time).slice(-3).reverse()
  if (!list.length) {
    el.innerHTML = '<span class="muted">今天还没有完成的片段</span>'
    return
  }
  el.innerHTML = list.map((s) => `<div class="recent-item"><span class="time">${formatTime(s.start_time)}</span><span style="color:${s.color}">${s.tagName}</span><span class="dur">${formatDuration(s.duration_sec || 0)}</span></div>`).join('')
}

function toggleTags(force) {
  tagPanelOpen = force == null ? !tagPanelOpen : force
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
  if (!current) return alert('还没有进行中的任务')
  const detail = prompt('暂停点备注（可选）：', '')
  const r = await api('ledger:addPausePoint', { detail: detail || null })
  if (!r.ok) return alert(r.error || '添加失败')
  document.getElementById('sub').textContent = '已添加暂停点 ' + formatTime(Date.now())
  setTimeout(() => { document.getElementById('sub').textContent = '任务播放器' }, 1500)
}

function bindKeys() {
  document.addEventListener('keydown', (e) => {
    if (/^[0-9]$/.test(e.key) && tagPanelOpen) {
      const tag = tags.find((t) => Number(t.shortcut_key) === Number(e.key))
      if (tag) switchTask(tag.id)
    }
    if (e.key === 'Escape' && tagPanelOpen) toggleTags(false)
  })
}

document.getElementById('startSwitch').addEventListener('click', () => toggleTags())
document.getElementById('complete').addEventListener('click', completeTask)
document.getElementById('pausePoint').addEventListener('click', addPausePoint)
document.getElementById('panel').addEventListener('click', () => api('server:openBrowser'))
document.getElementById('hide').addEventListener('click', () => api('mini:hide'))

on('ledger:state-changed', refresh)
on('mini:open-task-picker', () => toggleTags(true))

loadTags().then(refresh)
bindKeys()
ticker = setInterval(renderCurrent, 1000)
