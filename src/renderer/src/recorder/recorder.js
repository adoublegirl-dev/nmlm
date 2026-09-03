import { api, on } from '../api'
import stageVideo from '../assets/recorder-stage-video.webm'
import miniStageVideo from '../assets/recorder-mini-video.webm'
import timelineKeyframeIcon from '../assets/timeline-keyframe.svg'
import { createMiniTimeline } from './timeline.js'
import { createIcons, ArrowLeft, ChevronDown, RefreshCw, X, ListTodo, Settings, Square, Plus, Trash2, Scissors, Maximize2, Minimize2 } from 'lucide'
import './recorder.css'

const app = document.getElementById('recorder-app')
app.innerHTML = `
  <div class="recorder-shell">
    <div id="tagMenu" class="tag-menu hidden no-drag"></div>
    <div id="todoPanel" class="todo-panel hidden no-drag"></div>
    <div class="recorder">
      <div class="titlebar">
        <div class="title">Niuma Recorder</div>
        <div class="title-actions no-drag">
          <button id="todoTopBtn" class="top-icon" title="待办" aria-label="待办"><i data-lucide="list-todo" aria-hidden="true"></i></button>
          <button id="settingsTopBtn" class="top-icon" title="设置" aria-label="设置"><i data-lucide="settings" aria-hidden="true"></i></button>
          <button id="minimizeTopBtn" class="top-icon mode-toggle minimize-toggle" title="切换到迷你模式" aria-label="切换到迷你模式"><i data-lucide="minimize-2" aria-hidden="true"></i></button>
          <button id="expandTopBtn" class="top-icon mode-toggle expand-toggle" title="展开记录器" aria-label="展开记录器"><i data-lucide="maximize-2" aria-hidden="true"></i></button>
          <button id="hide" class="top-icon" title="隐藏到托盘" aria-label="隐藏到托盘"><i data-lucide="x" aria-hidden="true"></i></button>
        </div>
      </div>

      <section class="hero no-drag" aria-label="记录器状态">
        <video id="heroVideo" class="hero-video" src="${stageVideo}" muted loop playsinline preload="auto"></video>
        <video id="miniHeroVideo" class="mini-hero-video" src="${miniStageVideo}" muted loop playsinline preload="auto"></video>
        <div class="hero-overlay" aria-hidden="true"></div>
        <div class="stage-timer" aria-live="off">
          <div id="stageStatus" class="stage-status">准备记录</div>
          <time id="stageTimer" class="stage-time">00:00</time>
        </div>
        <div class="mini-actions">
          <button id="miniStopBtn" class="mini-action-btn" title="停止记录" aria-label="停止记录"><i data-lucide="square" aria-hidden="true"></i></button>
          <button id="miniKeyframeBtn" class="mini-action-btn" title="打关键帧" aria-label="打关键帧"><i data-lucide="scissors" aria-hidden="true"></i></button>
        </div>
        <div id="miniTimeline" class="mini-timeline" aria-label="当日记录时间轴">
          <div id="miniTimelineRuler" class="timeline-ruler" aria-hidden="true"></div>
          <div id="miniTimelineTrack" class="mini-timeline-track"></div>
          <div id="miniTimelinePlayhead" class="timeline-playhead" aria-hidden="true" hidden></div>
          <div id="miniTimelineTagPicker" class="timeline-segment-picker hidden" role="menu" aria-label="选择工作类型"></div>
        </div>
      </section>

      <section class="status-strip no-drag">
        <div class="record-copy">
          <div class="record-label">已记录</div>
          <div id="timer" class="timer num">00:00:00</div>
          <div id="recordTagLabel" class="record-tag">未选择标签</div>
        </div>
      </section>

      <section class="quick-row no-drag">
        <button id="tagButton" class="tag-card" title="选择工作类型" aria-label="选择工作类型">
          <span id="tagActionLabel" class="tag-action-label">选择工作类型</span>
          <span class="tag-value"><span id="currentTagLabel" class="tag-text">未选择</span><i data-lucide="chevron-down" aria-hidden="true"></i></span>
        </button>
        <div class="primary-actions">
          <button id="quickStopBtn" class="start-card quick-stop-btn" title="停止记录" aria-label="停止记录"><i data-lucide="square" aria-hidden="true"></i></button>
          <button id="toggleBtn" class="start-card" title="开始记录"><span id="toggleLabel">开始记录</span><i id="keyframeIcon" data-lucide="scissors" aria-hidden="true"></i></button>
        </div>
      </section>

      <div id="taskHint" class="task-hint no-drag">选择标签后开始记录</div>
      <div id="messageBadge" class="message-badge no-drag" aria-live="polite"></div>
      <div class="brand no-drag">by niuma</div>
    </div>
  </div>
`

const recorderIcons = { ArrowLeft, ChevronDown, RefreshCw, X, ListTodo, Settings, Square, Plus, Trash2, Scissors, Maximize2, Minimize2 }

function renderIcons(root = document) {
  createIcons({
    icons: recorderIcons,
    root,
    attrs: { width: 14, height: 14, 'stroke-width': 2, 'aria-hidden': 'true' }
  })
}

renderIcons()

let tags = []
let current = null
let recorderSettings = {}
let selectedTagId = null
let menuOpen = false
let collapsed = false
let messageTimer = null
let activeMessage = null
let lastMessageId = null
let creatingTag = false
let segmentPickerOpen = false
let activeSegmentPicker = null
let skipNextSegmentPickerOutsideClick = false
let lastKeyframeTs = 0
let initialRefresh = true
const KEYFRAME_COOLDOWN_MS = 3000

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
  recorderSettings = r.settings?.recorder || {}
  selectedTagId = r.settings?.recorder?.selectedTagId || r.settings?.mini?.selectedTagId || null
  renderLayoutClass()
}

function renderLayoutClass() {
  const shell = document.querySelector('.recorder-shell')
  const mode = 'panel'
  const skin = 'mini'
  shell.dataset.displayMode = mode
  shell.dataset.capsuleSkin = skin
  shell.classList.toggle('mode-capsule', mode === 'capsule')
  shell.classList.toggle('mode-panel', mode !== 'capsule')
  shell.classList.toggle('skin-horse', mode === 'capsule' && skin === 'horse')
  shell.classList.toggle('skin-classic', mode === 'capsule' && skin === 'classic')
  updateMotionState()
}
function updateMotionState() {
  const running = !!current
  const shell = document.querySelector('.recorder-shell')
  shell.classList.toggle('motion-running', running)
  shell.classList.toggle('motion-still', !running)

  const heroVideo = document.getElementById('heroVideo')
  const miniHeroVideo = document.getElementById('miniHeroVideo')
  if (heroVideo) {
    if (!collapsed) heroVideo.play().catch(() => {})
    else heroVideo.pause()
  }
  if (miniHeroVideo) {
    if (collapsed && current) miniHeroVideo.play().catch(() => {})
    else miniHeroVideo.pause()
  }
}
function formatTodoDue(ts) {
  if (!ts) return '无截止'
  const d = new Date(ts)
  return `截止 ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function todoStatusLabel(status) { return ({ todo: '待处理', doing: '进行中', done: '已完成' })[status] || '待处理' }
function todoPriorityLabel(priority) { return ({ low: '低优先级', medium: '中优先级', high: '高优先级' })[priority] || '中优先级' }
async function saveSelectedTag(id) {
  selectedTagId = id
  await api('settings:set', { key: 'recorder.selectedTagId', value: id }).catch(() => {})
  renderTagButton()
}
async function loadTags() {
  const r = await api('tags:list')
  tags = (r.tags || []).slice().sort((a, b) => Number(a.created_at || 0) - Number(b.created_at || 0) || Number(a.id) - Number(b.id))
  if (selectedTagId && !tags.some((t) => t.id === Number(selectedTagId))) selectedTagId = null
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
  const isRecording = !!current
  const name = isRecording ? (active?.name || '未分类') : (tag?.name || '未选择')
  const currentTagLabel = document.getElementById('currentTagLabel')
  const tagButton = document.getElementById('tagButton')
  const tagColor = active?.color || tag?.color || '#ba945d'
  const actionLabel = isRecording ? '修改当前工作类型' : '选择工作类型'
  currentTagLabel.textContent = name
  currentTagLabel.title = name
  document.getElementById('tagActionLabel').textContent = actionLabel
  tagButton.title = `${actionLabel}：${name}`
  tagButton.setAttribute('aria-label', `${actionLabel}：${name}`)
  document.getElementById('recordTagLabel').textContent = active ? active.name : '未选择标签'
  tagButton.style.setProperty('--tag-color', tagColor)
}
function renderTags() {
  renderTagButton()
  const menu = document.getElementById('tagMenu')
  const selectedMenuTagId = current ? activeTag()?.id : selectedTagId
  const menuTitle = current ? '修改当前工作类型' : '选择工作类型'
  const options = tags.map((t) => `<div class="tag-option-row ${Number(t.id) === Number(selectedMenuTagId) ? 'selected' : ''}"><button class="tag-option" data-id="${t.id}">${escapeHtml(t.name)}</button><button class="tag-delete" data-delete-id="${t.id}" title="删除类型" aria-label="删除${escapeHtml(t.name)}"><i data-lucide="trash-2" aria-hidden="true"></i></button></div>`).join('')
  const newOption = creatingTag ? '<input id="newTagInput" class="tag-option tag-option-input" maxlength="50" placeholder="新建类型按回车确认" aria-label="新建工作类型">' : ''
  menu.innerHTML = `<div class="tag-sheet"><div class="tag-sheet-head">${menuTitle}<button id="closeTagMenu" class="top-icon" aria-label="关闭"><i data-lucide="x"></i></button></div><div class="tag-options">${options || (!creatingTag ? '<div class="tag-empty">暂无工作类型</div>' : '')}${newOption}</div><button id="createTag" class="tag-create"><i data-lucide="plus" aria-hidden="true"></i><span>创建</span></button></div>`
  renderIcons(menu)
  menu.querySelectorAll('.tag-option[data-id]').forEach((b) => {
    b.addEventListener('click', async () => {
      await chooseTag(Number(b.dataset.id))
      setMenu(false)
    })
  })
  menu.querySelectorAll('.tag-delete[data-delete-id]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation()
      const id = Number(button.dataset.deleteId)
      try {
        await api('tags:delete', { id })
        if (Number(selectedTagId) === id) await saveSelectedTag(null)
        await loadTags()
      } catch (error) {
        alert(error.message || '删除工作类型失败')
      }
    })
  })
  menu.querySelector('#createTag')?.addEventListener('click', () => {
    if (creatingTag) return
    creatingTag = true
    renderTags()
    menu.querySelector('#newTagInput')?.focus()
  })
  const newTagInput = menu.querySelector('#newTagInput')
  newTagInput?.addEventListener('keydown', async (event) => {
    if (event.key === 'Escape') { creatingTag = false; renderTags(); return }
    if (event.key !== 'Enter') return
    event.preventDefault()
    const name = newTagInput.value.trim()
    if (!name) return
    try {
      await api('tags:create', { name })
      creatingTag = false
      await loadTags()
    } catch (error) {
      alert(error.message || '创建工作类型失败')
    }
  })
  newTagInput?.addEventListener('blur', () => {
    setTimeout(() => {
      if (!creatingTag || document.activeElement === newTagInput) return
      creatingTag = false
      renderTags()
    }, 0)
  })
  menu.querySelector('#closeTagMenu')?.addEventListener('click', () => setMenu(false))
}
async function chooseTag(id) {
  if (!current) {
    await saveSelectedTag(id)
    render()
    return
  }

  const activeSegment = miniTimeline.getActiveSegment()
  if (!activeSegment) return alert('当前时间段尚未加载，请稍后重试')
  await applyTagToSegment(activeSegment, id)
}
async function loadTimelinePoints() {
  if (!current) {
    miniTimeline.setData(null)
    lastKeyframeTs = 0
    return
  }
  const dayStart = new Date().setHours(0, 0, 0, 0)
  const end = dayStart + 24 * 60 * 60 * 1000
  const start = Math.min(current.start_time, dayStart)
  const [pointsResult, entriesResult, markersResult] = await Promise.all([
    api('ledger:timelinePoints', { start, end }).catch(() => ({ points: [] })),
    api('ledger:list', { start, end }).catch(() => ({ entries: [] })),
    api('ledger:timelineMarkers', { start, end }).catch(() => ({ markers: [] }))
  ])
  const timelineEntries = (entriesResult.entries || []).filter((entry) => entry.end_time || Number(entry.id) === Number(current.id))
  miniTimeline.setData(current, pointsResult.points || [], timelineEntries, markersResult.markers || [])
  lastKeyframeTs = miniTimeline.getLastPointTimestamp()
}
function updateKeyframeCooldown(now = Date.now()) {
  const remaining = Math.max(0, KEYFRAME_COOLDOWN_MS - (now - lastKeyframeTs))
  const disabled = !!current && remaining > 0
  const title = disabled ? `请等待 ${Math.ceil(remaining / 1000)} 秒` : '打关键帧'
  const buttons = [document.getElementById('miniKeyframeBtn'), document.getElementById('toggleBtn')]
  buttons.forEach((button) => {
    if (!button) return
    button.disabled = disabled
    if (current) button.title = title
  })
}
async function openSegmentTagPicker(segment, event) {
  if (!segment || !current) return
  const menu = document.getElementById('miniTimelineTagPicker')
  const timeline = document.getElementById('miniTimeline')
  const rect = timeline.getBoundingClientRect()
  const menuHalfWidth = 52
  const pointerX = event.clientX - rect.left
  const left = Math.min(Math.max(pointerX, menuHalfWidth), Math.max(menuHalfWidth, rect.width - menuHalfWidth))

  activeSegmentPicker = segment
  segmentPickerOpen = true
  skipNextSegmentPickerOutsideClick = true
  setTimeout(() => { skipNextSegmentPickerOutsideClick = false }, 0)
  miniTimeline.setPickerOpen(true)
  menu.style.left = `${left}px`
  menu.innerHTML = tags.length
    ? tags.map((tag) => `<button type="button" class="timeline-segment-picker-option${Number(tag.id) === Number(segment.tagId) ? ' is-selected' : ''}" role="menuitem" data-tag-id="${Number(tag.id)}">${escapeHtml(tag.name)}</button>`).join('')
    : '<div class="timeline-segment-picker-empty">暂无工作类型</div>'
  menu.classList.remove('hidden')
  menu.querySelectorAll('[data-tag-id]').forEach((button) => {
    button.addEventListener('click', (pickerEvent) => {
      pickerEvent.stopPropagation()
      void applySegmentTag(Number(button.dataset.tagId))
    })
  })
}
function closeSegmentTagPicker() {
  if (!segmentPickerOpen) return
  segmentPickerOpen = false
  activeSegmentPicker = null
  document.getElementById('miniTimelineTagPicker').classList.add('hidden')
  miniTimeline.setPickerOpen(false)
}
async function applyTagToSegment(segment, tagId) {
  if (!segment || !current) return false
  const result = segment.kind === 'point'
    ? await api('ledger:applyTimelinePointTag', { entryId: segment.entryId, pointId: segment.pointId, tagId })
    : await api('ledger:retag', { id: segment.entryId, tagId })
  if (!result.ok) {
    alert(result.error || '设置工作类型失败')
    return false
  }
  await refresh()
  return true
}
async function applySegmentTag(tagId) {
  if (!activeSegmentPicker) return
  const applied = await applyTagToSegment(activeSegmentPicker, tagId)
  if (!applied) return
  closeSegmentTagPicker()
}
const miniTimeline = createMiniTimeline({
  root: document.getElementById('miniTimeline'),
  ruler: document.getElementById('miniTimelineRuler'),
  track: document.getElementById('miniTimelineTrack'),
  playhead: document.getElementById('miniTimelinePlayhead'),
  keyframeIcon: timelineKeyframeIcon,
  getTagName: (tagId) => tags.find((tag) => Number(tag.id) === Number(tagId))?.name,
  onSegmentClick: openSegmentTagPicker
})
function setMenu(open) {
  menuOpen = open
  if (!open) creatingTag = false
  if (open) setCollapsed(false)
  const menu = document.getElementById('tagMenu')
  menu.classList.toggle('hidden', !open)
  menu.classList.remove('opening')
  if (open) {
    void menu.offsetWidth
    menu.classList.add('opening')
    setTimeout(() => menu.classList.remove('opening'), 240)
  }
  document.querySelector('.recorder-shell').classList.toggle('menu-open', open)
}
function setCollapsed(next, syncWindow = true, anchorMode = 'current') {
  if (menuOpen && next) return
  const enteringMini = !collapsed && !!next
  if (collapsed !== !!next && segmentPickerOpen) closeSegmentTagPicker()
  collapsed = !!next
  document.querySelector('.recorder-shell').classList.toggle('collapsed', collapsed)
  if (enteringMini && current) {
    const anchor = anchorMode === 'start' ? current.start_time : Date.now()
    miniTimeline.enter({ anchorTs: anchor, anchorRatio: anchorMode === 'start' ? 0.2 : 0.8 })
  }
  updateMotionState()
  if (syncWindow) api('recorder:setCollapsed', { collapsed }).catch(() => {})
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
    if (current.tag_id) selectedTagId = current.tag_id
  } else {
    miniTimeline.setData(null)
    if (collapsed) setCollapsed(false)
  }
  if (current) await loadTimelinePoints()
  render()
  if (!hadCurrent && current && !menuOpen && !collapsed) setCollapsed(true, true, initialRefresh ? 'current' : 'start')
  initialRefresh = false
}
function renderStateClass() {
  const shell = document.querySelector('.recorder-shell')
  shell.classList.toggle('is-idle', !current)
  shell.classList.toggle('is-recording', !!current)
}
function render() {
  const timer = document.getElementById('timer')
  const stageTimer = document.getElementById('stageTimer')
  const stageStatus = document.getElementById('stageStatus')
  const recordLabel = document.querySelector('.record-label')
  const toggleBtn = document.getElementById('toggleBtn')
  const hint = document.getElementById('taskHint')

  renderTagButton()
  renderLayoutClass()
  renderStateClass()
  updateMotionState()
  miniTimeline.render()
  updateKeyframeCooldown()
  if (activeMessage) document.getElementById('messageBadge').textContent = activeMessage.text

  if (current) {
    const elapsed = hmShort((Date.now() - current.start_time) / 1000)
    const elapsedFull = hms((Date.now() - current.start_time) / 1000)
    const statusText = '记录中'
    timer.textContent = elapsed
    stageTimer.textContent = collapsed ? elapsedFull : elapsed
    stageStatus.textContent = collapsed ? '已记录' : statusText
    recordLabel.textContent = statusText
    toggleBtn.title = '打关键帧'
    toggleBtn.setAttribute('aria-label', '打关键帧')
    hint.textContent = '记录中：可从标题栏切换到迷你模式'
  } else {
    timer.textContent = '00:00'
    stageTimer.textContent = '00:00'
    stageStatus.textContent = '准备记录'
    recordLabel.textContent = '准备记录'
    document.getElementById('toggleLabel').textContent = '开始记录'
    toggleBtn.title = '开始记录'
    toggleBtn.setAttribute('aria-label', '开始记录')
    hint.textContent = selectedTag() ? '点击开始记录当前工作类型' : '可直接开始，稍后再归类'
  }
}

async function startRecord() {
  const tagId = selectedTag()
  if (tagId) await saveSelectedTag(tagId)
  const r = await api('ledger:start', { tagId })
  if (!r.ok) return alert(r.error || '开始失败')
  current = r.entry || current
  setCollapsed(true, true, 'start')
  await refresh()
}
async function addKeyframe() {
  if (!current) return
  if (Date.now() - lastKeyframeTs < KEYFRAME_COOLDOWN_MS) return
  try {
    const r = await api('ledger:addKeyframe', {})
    lastKeyframeTs = Number(r.marker?.ts || Date.now())
    await loadTimelinePoints()
    miniTimeline.render()
    showMessage({ text: '已打关键帧', type: 'info', duration: 1600 })
  } catch (error) {
    alert(error.message || '打关键帧失败')
  }
}
async function stopRecord() {
  if (!current) { render(); return }
  if (segmentPickerOpen) closeSegmentTagPicker()
  const r = await api('ledger:complete', {})
  if (!r.ok) return alert(r.error || '停止失败')
  await refresh()
}
async function toggleRecord() {
  if (current) return addKeyframe()
  return startRecord()
}

const shell = document.querySelector('.recorder-shell')
document.getElementById('tagButton').addEventListener('click', () => setMenu(!menuOpen))
document.getElementById('settingsTopBtn').addEventListener('click', () => api('server:openBrowser').catch(() => {}))
document.getElementById('minimizeTopBtn').addEventListener('click', async () => {
  shell.classList.remove('mini-mode-hint')
  if (!recorderSettings.miniModeHintSeen) {
    recorderSettings.miniModeHintSeen = true
    await api('settings:set', { key: 'recorder.miniModeHintSeen', value: true }).catch(() => {})
  }
  setCollapsed(true, true, 'current')
  render()
})
document.getElementById('expandTopBtn').addEventListener('click', () => {
  setCollapsed(false)
  if (!recorderSettings.miniModeHintSeen) shell.classList.add('mini-mode-hint')
  render()
})
async function renderTodoPanel() {
  const panel = document.getElementById('todoPanel')
  const r = await api('todos:list', { includeDone: false }).catch(() => ({ todos: [] }))
  const items = (r.todos || []).slice(0, 5).map((todo) => {
    const detailTooltip = todo.detail ? ` title="${escapeHtml(todo.detail)}"` : ''
    return `<div class="todo-item"><div class="todo-item-title"${detailTooltip}>${escapeHtml(todo.title)}</div><div class="todo-item-meta"><span>${formatTodoDue(todo.due_at)}</span><span class="todo-status todo-status-${escapeHtml(todo.status || 'todo')}">${todoStatusLabel(todo.status)}</span><span>${todoPriorityLabel(todo.priority)}</span></div></div>`
  }).join('')
  panel.innerHTML = `<div class="todo-sheet-head"><button id="closeTodos" class="top-icon" title="返回记录器" aria-label="返回记录器"><i data-lucide="arrow-left" aria-hidden="true"></i></button><span class="todo-sheet-title">待办</span><button id="refreshTodos" class="top-icon" title="刷新待办" aria-label="刷新待办"><i data-lucide="refresh-cw" aria-hidden="true"></i></button></div><div class="todo-list">${items || '<div class="tag-empty">暂无待办</div>'}</div><button id="createTodo" class="todo-create"><i data-lucide="plus" aria-hidden="true"></i><span>新建待办</span></button>`
  renderIcons(panel)
  panel.querySelector('#closeTodos')?.addEventListener('click', () => panel.classList.add('hidden'))
  panel.querySelector('#refreshTodos')?.addEventListener('click', () => { void renderTodoPanel() })
  panel.querySelector('#createTodo')?.addEventListener('click', () => api('server:openBrowser', { route: 'todos' }).catch(() => {}))
}
document.getElementById('todoTopBtn').addEventListener('click', async () => {
  const panel = document.getElementById('todoPanel')
  const isOpen = !panel.classList.contains('hidden')
  panel.classList.toggle('hidden', isOpen)
  if (isOpen) return
  await renderTodoPanel()
})
document.getElementById('toggleBtn').addEventListener('click', () => toggleRecord())
document.getElementById('quickStopBtn').addEventListener('click', () => stopRecord())
document.getElementById('miniStopBtn').addEventListener('click', () => stopRecord())
document.getElementById('miniKeyframeBtn').addEventListener('click', () => addKeyframe())
document.getElementById('hide').addEventListener('click', () => { setMenu(false); closeSegmentTagPicker(); api('tagpicker:cancel').catch(() => {}); api('recorder:hide') })
document.addEventListener('click', (e) => {
  const path = e.composedPath()
  if (!path.includes(document.getElementById('tagMenu')) && !path.includes(document.getElementById('tagButton'))) setMenu(false)
  if (skipNextSegmentPickerOutsideClick) {
    skipNextSegmentPickerOutsideClick = false
    return
  }
  const clickedSegment = path.some((node) => node?.classList?.contains('timeline-segment'))
  if (segmentPickerOpen && !path.includes(document.getElementById('miniTimelineTagPicker')) && !clickedSegment) closeSegmentTagPicker()
})

on('ledger:state-changed', () => refresh())
on('settings:changed', (payload) => {
  if (!String(payload?.key || '').startsWith('recorder')) return
  loadSettings().then(render).catch(() => {})
})
on('recorder:message', showMessage)
on('recorder:expand', () => setCollapsed(false, false))
on('tagpicker:segment-closed', () => {
  closeSegmentTagPicker()
  refresh().catch(() => {})
})

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
  .then(pollMessage)

setInterval(() => { refresh().catch(() => render()) }, 1000)
setInterval(pollMessage, 500)
