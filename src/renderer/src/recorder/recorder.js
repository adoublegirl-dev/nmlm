import { api, on } from '../api'
import './recorder.css'

const app = document.getElementById('recorder-app')
app.innerHTML = `
  <div class="recorder-shell">
    <div id="tagMenu" class="tag-menu hidden no-drag"></div>
    <div class="recorder">
      <div class="titlebar">
        <div class="title">Niuma Recorder</div>
        <div class="title-actions no-drag">
          <button id="tagTopBtn" class="top-icon" title="选择标签">⌄</button>
          <button id="hide" class="top-icon" title="隐藏到托盘">×</button>
        </div>
      </div>

      <section class="hero no-drag" aria-label="记录器状态">
        <div class="hero-bezel"></div>
        <div class="hero-inner">
          <div class="idle-copy">
            <span class="dot"></span>
            <span id="idleTagLabel">选择标签后开始记录</span>
          </div>
          <div class="record-copy">
            <div class="record-label">已记录</div>
            <div id="timer" class="timer num">00:00:00</div>
            <div id="recordTagLabel" class="record-tag">未选择标签</div>
          </div>
          <div class="visual-line" aria-hidden="true"><span></span><i></i><b></b></div>
        </div>
      </section>

      <section class="quick-row no-drag">
        <button id="tagButton" class="tag-card" title="选择标签">
          <span class="tag-mark">◆</span>
          <span id="currentTagLabel" class="tag-text">未选择标签</span>
        </button>
        <button id="toggleBtn" class="start-card" title="开始记录"><span id="toggleLabel">开始记录</span></button>
      </section>

      <section class="record-actions no-drag">
        <button id="pauseBtn" class="control-btn" title="暂停/继续">暂停</button>
        <button id="stopBtn" class="control-btn" title="完成记录">完成</button>
      </section>

      <div id="taskHint" class="task-hint no-drag">选择标签后开始记录</div>
      <div id="messageBadge" class="message-badge no-drag" aria-live="polite"></div>
      <div class="brand no-drag">by niuma</div>
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
let messageTimer = null
let activeMessage = null
let lastMessageId = null
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
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]))
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
function currentTag() { return tags.find((t) => t.id === Number(selectedTagId)) || null }
function activeTag() {
  const id = current?.active_tag_id || current?.tag_id
  if (id) return tags.find((t) => t.id === Number(id)) || null
  return currentTag()
}
function selectedTag() { return Number(selectedTagId || 0) || null }

function renderTagButton() {
  const tag = currentTag()
  const active = activeTag()
  const name = active?.name || tag?.name || '未选择标签'
  document.getElementById('currentTagLabel').textContent = current ? name : (tag ? tag.name : '选择标签')
  document.getElementById('currentTagLabel').title = name
  document.getElementById('idleTagLabel').textContent = tag ? `当前标签 · ${tag.name}` : '选择标签后开始记录'
  document.getElementById('recordTagLabel').textContent = active ? active.name : '未选择标签'
}
function renderTags() {
  renderTagButton()
  const menu = document.getElementById('tagMenu')
  menu.innerHTML = tags.length ? tags.map((t) => `
    <button class="tag-option" data-id="${t.id}" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</button>
  `).join('') : '<div class="tag-empty">暂无标签，请先到设置页配置</div>'
  menu.querySelectorAll('.tag-option').forEach((b) => {
    b.addEventListener('click', () => {
      saveSelectedTag(Number(b.dataset.id))
      setMenu(false)
    })
  })
}
function setMenu(open) {
  menuOpen = open
  if (open) setCollapsed(false)
  document.getElementById('tagMenu').classList.toggle('hidden', !open)
  document.querySelector('.recorder-shell').classList.toggle('menu-open', open)
  resetIdleTimer()
}
function setCollapsed(next, syncWindow = true) {
  if (menuOpen && next) return
  collapsed = !!next
  document.querySelector('.recorder-shell').classList.toggle('collapsed', collapsed)
  if (syncWindow) api('recorder:setCollapsed', { collapsed }).catch(() => {})
  resetIdleTimer()
}
function resetIdleTimer() {
  clearTimeout(idleTimer)
  if (menuOpen || !current) return
  idleTimer = setTimeout(() => setCollapsed(true), IDLE_COLLAPSE_MS)
}
function wake() {
  if (collapsed) setCollapsed(false)
  else resetIdleTimer()
}

function showMessage(payload = {}) {
  if (payload.id && payload.id === lastMessageId) return
  if (payload.id) lastMessageId = payload.id
  const text = String(payload.text || '').trim()
  if (!text) return
  const type = payload.type || 'info'
  const duration = Number(payload.duration || 2000)
  activeMessage = { text, type }
  const shell = document.querySelector('.recorder-shell')
  const badge = document.getElementById('messageBadge')
  shell.classList.add('has-message')
  shell.dataset.messageType = type
  badge.textContent = text
  badge.title = text
  if (collapsed) api('recorder:setMessageMode', { active: true }).catch(() => {})
  clearTimeout(messageTimer)
  messageTimer = setTimeout(() => {
    activeMessage = null
    shell.classList.remove('has-message')
    delete shell.dataset.messageType
    badge.textContent = ''
    badge.title = ''
    if (collapsed) api('recorder:setMessageMode', { active: false }).catch(() => {})
  }, duration)
}

async function refresh() {
  const r = await api('ledger:current')
  const hadCurrent = !!current
  current = r.entry || null
  if (current) {
    paused = !!current.paused
    if (current.tag_id && !paused) selectedTagId = current.tag_id
  } else {
    paused = false
    if (collapsed) setCollapsed(false)
  }
  render()
  if (!hadCurrent && current && !menuOpen) setCollapsed(true)
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
  const pauseBtn = document.getElementById('pauseBtn')
  const stopBtn = document.getElementById('stopBtn')
  const hint = document.getElementById('taskHint')

  renderTagButton()
  renderStateClass()
  if (activeMessage) document.getElementById('messageBadge').textContent = activeMessage.text

  if (current) {
    const end = current.paused ? current.paused_at : Date.now()
    timer.textContent = hmShort((end - current.start_time) / 1000)
    const pausedDelta = current.paused ? hms((Date.now() - current.paused_at) / 1000) : ''
    document.getElementById('toggleLabel').textContent = current.paused ? '继续记录' : '暂停记录'
    toggleBtn.title = current.paused ? '继续' : '暂停'
    pauseBtn.textContent = current.paused ? '继续' : '暂停'
    pauseBtn.disabled = false
    stopBtn.disabled = false
    hint.textContent = current.paused ? `暂停中：${pausedDelta}` : '记录中：悬停可展开，空闲后回到小面板'
  } else {
    timer.textContent = '00:00'
    document.getElementById('toggleLabel').textContent = '开始记录'
    toggleBtn.title = '开始记录'
    pauseBtn.textContent = '暂停'
    pauseBtn.disabled = true
    stopBtn.disabled = true
    hint.textContent = selectedTag() ? '点击开始记录当前标签' : '选择标签后开始记录'
  }
}

async function startRecord() {
  const tagId = selectedTag()
  if (!tagId) return alert('请先配置或选择标签')
  await saveSelectedTag(tagId)
  const r = await api('ledger:start', { tagId })
  if (!r.ok) return alert(r.error || '开始失败')
  paused = false
  await refresh()
  setCollapsed(true)
}
async function pauseRecord() {
  if (!current) return
  const r = await api('ledger:pause', {})
  if (!r.ok) return alert(r.error || '暂停失败')
  paused = true
  await refresh()
}
async function stopRecord() {
  if (!current) { paused = false; render(); return }
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

const shell = document.querySelector('.recorder-shell')
shell.addEventListener('mouseenter', wake)
shell.addEventListener('mousemove', resetIdleTimer)
shell.addEventListener('mousedown', wake)
document.getElementById('tagButton').addEventListener('click', () => setMenu(!menuOpen))
document.getElementById('tagTopBtn').addEventListener('click', () => setMenu(!menuOpen))
document.getElementById('toggleBtn').addEventListener('click', toggleRecord)
document.getElementById('pauseBtn').addEventListener('click', toggleRecord)
document.getElementById('stopBtn').addEventListener('click', stopRecord)
document.getElementById('hide').addEventListener('click', () => { setMenu(false); api('recorder:hide') })
document.addEventListener('click', (e) => {
  if (!document.getElementById('tagMenu').contains(e.target) && !document.getElementById('tagButton').contains(e.target) && !document.getElementById('tagTopBtn').contains(e.target)) setMenu(false)
})

on('ledger:state-changed', () => refresh())
on('recorder:message', showMessage)
on('recorder:expand', () => setCollapsed(false, false))

async function pollMessage() {
  try {
    const r = await api('recorder:getMessage')
    const msg = r.message
    if (!msg || !msg.id || msg.id === lastMessageId) return
    if (Date.now() - msg.createdAt > (msg.duration || 2000) + 800) return
    showMessage(msg)
  } catch (_) {}
}

Promise.resolve()
  .then(loadSettings)
  .then(loadTags)
  .then(refresh)
  .then(resetIdleTimer)
  .then(pollMessage)

setInterval(() => { refresh().catch(() => render()) }, 1000)
setInterval(pollMessage, 500)
