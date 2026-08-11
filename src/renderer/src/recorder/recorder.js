import { api, on } from '../api'
import './recorder.css'

const app = document.getElementById('recorder-app')
app.innerHTML = `
  <div class="recorder-shell">
    <div id="tagMenu" class="tag-menu hidden no-drag"></div>
    <div class="recorder">
      <div class="titlebar">
        <div class="title">记录器</div>
        <button id="hide" class="close-btn no-drag" title="隐藏到托盘">×</button>
      </div>

      <div class="main-row no-drag">
        <div class="timer-block">
          <div id="currentTagLabel" class="current-tag-label">未选择标签</div>
          <div class="timer-line">
            <div id="timer" class="timer num">00:00:00</div>
            <div id="pauseDelta" class="pause-delta num hidden">+00:00</div>
          </div>
        </div>
        <button id="toggleBtn" class="icon-action primary" title="开始">▶</button>
        <button id="stopBtn" class="icon-action danger" title="停止">■</button>
        <div id="tagDropdown" class="tag-dropdown">
          <button id="tagButton" class="tag-button" title="选择标签">标签</button>
        </div>
      </div>
      <div id="taskHint" class="task-hint no-drag">选择标签后开始记录</div>
      <div class="motion-track" aria-hidden="true">
        <span class="motion-dot"></span>
        <span class="motion-mark"></span>
      </div>
    </div>
  </div>
`

let tags = []
let current = null
let selectedTagId = null
let paused = false
let menuOpen = false
let collapsed = false
let idleTimer = null
const IDLE_COLLAPSE_MS = 5000

function pad(n) { return String(n).padStart(2, '0') }
function hms(sec) {
  sec = Math.max(0, Math.floor(sec || 0))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function hmShort(sec) {
  sec = Math.max(0, Math.floor(sec || 0))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

async function loadSettings() {
  const r = await api('settings:getAll')
  selectedTagId = r.settings?.recorder?.selectedTagId || r.settings?.mini?.selectedTagId || null
}

async function saveSelectedTag(id) {
  selectedTagId = id
  await api('settings:set', { key: 'recorder.selectedTagId', value: id }).catch(() => {})
  renderTagButton()
}

async function loadTags() {
  const r = await api('tags:list')
  tags = r.tags || []
  if (!selectedTagId && tags[0]) selectedTagId = tags[0].id
  if (selectedTagId && !tags.some((t) => t.id === Number(selectedTagId)) && tags[0]) selectedTagId = tags[0].id
  renderTags()
}

function currentTag() {
  return tags.find((t) => t.id === Number(selectedTagId)) || null
}

function activeTag() {
  const id = current?.active_tag_id || current?.tag_id
  if (id) return tags.find((t) => t.id === Number(id)) || null
  return currentTag()
}

function renderTagButton() {
  const btn = document.getElementById('tagButton')
  const tag = currentTag()
  btn.textContent = tag ? tag.name : '标签'
  btn.title = tag ? tag.name : '选择标签'
}

function renderCurrentTagLabel() {
  const label = document.getElementById('currentTagLabel')
  const tag = activeTag()
  const name = tag ? tag.name : '未选择标签'
  label.textContent = current ? name : (tag ? `待开始 · ${name}` : '未选择标签')
  label.title = name
}

function renderTags() {
  renderTagButton()
  const menu = document.getElementById('tagMenu')
  menu.innerHTML = tags.map((t) => `
    <button class="tag-option" data-id="${t.id}" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</button>
  `).join('')
  menu.querySelectorAll('.tag-option').forEach((b) => {
    b.addEventListener('click', () => {
      saveSelectedTag(Number(b.dataset.id))
      setMenu(false)
    })
  })
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]))
}

function setMenu(open) {
  menuOpen = open
  if (open) setCollapsed(false)
  document.getElementById('tagMenu').classList.toggle('hidden', !open)
  document.getElementById('tagDropdown').classList.toggle('open', open)
  resetIdleTimer()
}

function setCollapsed(next, syncWindow = true) {
  if (menuOpen && next) return
  collapsed = next
  document.querySelector('.recorder-shell').classList.toggle('collapsed', collapsed)
  if (syncWindow) api('recorder:setCollapsed', { collapsed }).catch(() => {})
  if (!collapsed) resetIdleTimer()
}

function resetIdleTimer() {
  clearTimeout(idleTimer)
  if (menuOpen) return
  idleTimer = setTimeout(() => setCollapsed(true), IDLE_COLLAPSE_MS)
}

function wake() {
  if (collapsed) setCollapsed(false)
  else resetIdleTimer()
}

async function refresh() {
  const r = await api('ledger:current')
  current = r.entry || null
  if (current) {
    paused = !!current.paused
    if (current.tag_id && !paused) selectedTagId = current.tag_id
  } else {
    paused = false
  }
  render()
}

function renderStateClass() {
  const shell = document.querySelector('.recorder-shell')
  shell.classList.toggle('is-idle', !current)
  shell.classList.toggle('is-recording', !!current && !current.paused)
  shell.classList.toggle('is-paused', !!current?.paused)
}

function render() {
  const timer = document.getElementById('timer')
  const toggleBtn = document.getElementById('toggleBtn')
  const stopBtn = document.getElementById('stopBtn')
  const hint = document.getElementById('taskHint')
  const pauseDelta = document.getElementById('pauseDelta')

  renderTagButton()
  renderCurrentTagLabel()
  renderStateClass()
  if (current) {
    const end = current.paused ? current.paused_at : Date.now()
    timer.textContent = hms((end - current.start_time) / 1000)
    let pausedDeltaText = ''
    if (current.paused) {
      const deltaSec = (Date.now() - current.paused_at) / 1000
      pausedDeltaText = hms(deltaSec)
    }
    pauseDelta.classList.add('hidden')
    toggleBtn.textContent = current.paused ? '▶' : 'Ⅱ'
    toggleBtn.title = current.paused ? '继续' : '暂停'
    toggleBtn.disabled = false
    stopBtn.disabled = false
    hint.textContent = current.paused ? `暂停中：${pausedDeltaText}` : '进行中：暂停会留下一个可整理的时间节点'
  } else {
    timer.textContent = '00:00:00'
    pauseDelta.classList.add('hidden')
    toggleBtn.textContent = '▶'
    toggleBtn.title = '开始'
    toggleBtn.disabled = false
    stopBtn.disabled = true
    hint.textContent = selectedTag() ? '点击开始记录当前标签' : '选择标签后开始记录'
  }
}

function selectedTag() {
  return Number(selectedTagId || 0) || null
}

async function startRecord() {
  const tagId = selectedTag()
  if (!tagId) return alert('请先配置或选择标签')
  await saveSelectedTag(tagId)
  const r = await api('ledger:start', { tagId })
  if (!r.ok) return alert(r.error || '开始失败')
  paused = false
  await refresh()
}

async function pauseRecord() {
  if (!current) return
  const r = await api('ledger:pause', {})
  if (!r.ok) return alert(r.error || '暂停失败')
  paused = true
  await refresh()
}

async function stopRecord() {
  if (!current) {
    paused = false
    render()
    return
  }
  const r = await api('ledger:complete', {})
  if (!r.ok) return alert(r.error || '停止失败')
  paused = false
  await refresh()
}

async function toggleRecord() {
  if (current?.paused) return startRecord()
  if (current) return pauseRecord()
  return startRecord()
}

document.querySelector('.recorder-shell').addEventListener('mouseenter', wake)
document.querySelector('.recorder-shell').addEventListener('mousemove', resetIdleTimer)
document.querySelector('.recorder-shell').addEventListener('mousedown', wake)
document.getElementById('tagButton').addEventListener('click', () => setMenu(!menuOpen))
document.getElementById('toggleBtn').addEventListener('click', toggleRecord)
document.getElementById('stopBtn').addEventListener('click', stopRecord)
document.getElementById('hide').addEventListener('click', () => {
  setMenu(false)
  api('recorder:hide')
})
document.addEventListener('click', (e) => {
  if (!document.getElementById('tagDropdown').contains(e.target)) setMenu(false)
})

on('ledger:state-changed', refresh)
on('recorder:expand', () => setCollapsed(false, false))

Promise.resolve()
  .then(loadSettings)
  .then(loadTags)
  .then(refresh)
  .then(resetIdleTimer)

setInterval(() => {
  refresh().catch(() => render())
}, 1000)
