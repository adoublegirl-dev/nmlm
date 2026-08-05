// 迷你栏：收起态细栏 + 展开卡片。纯原生 JS（窗口小，不用 Vue 重载）。
import { api, on } from '../api'
import { formatDuration, formatTime } from '../utils/format'
import './mini.css'

const COLLAPSED_W = 180
const COLLAPSED_H = 34
const EXPANDED_W = 340
const EXPANDED_H = 330

const app = document.getElementById('mini-app')
app.innerHTML = `
  <div id="bar" class="bar">
    <span id="dot" class="dot"></span>
    <span id="state" class="state">空闲</span>
    <span id="hours" class="hours num"></span>
    <span id="chev" class="chev">▲</span>
  </div>
  <div id="card" class="card hidden">
    <div class="c-status">
      <span id="c-state" class="c-state"></span>
      <div class="c-actions">
        <button id="btn-toggle" class="btn primary btn-sm"></button>
        <button id="btn-shot" class="btn btn-sm">截图</button>
      </div>
    </div>
    <div class="c-window muted" id="c-window">当前窗口：…</div>
    <div class="c-metrics">
      <span>今日 <b id="c-hours" class="num"></b></span>
      <span>碎片 <b id="c-frags" class="num"></b></span>
      <span><b id="c-segs" class="num"></b> 段</span>
    </div>
    <div class="c-recent" id="c-recent"></div>
    <div class="c-tools" id="c-tools"></div>
    <div class="c-foot">
      <button id="btn-panel" class="btn btn-sm primary">报表</button>
      <button id="btn-pack" class="btn btn-sm">打包</button>
      <button id="btn-hide" class="btn btn-sm">藏到托盘</button>
    </div>
  </div>
`

let expanded = false
let recording = false
let hideTimer = null

const bar = document.getElementById('bar')
const card = document.getElementById('card')

function resize() {
  api('mini:resize', expanded ? { width: EXPANDED_W, height: EXPANDED_H } : { width: COLLAPSED_W, height: COLLAPSED_H })
}

function renderState() {
  const dot = document.getElementById('dot')
  const state = document.getElementById('state')
  dot.className = 'dot ' + (recording ? 'rec' : '')
  state.textContent = recording ? '记录中' : '空闲'
  document.getElementById('btn-toggle').textContent = recording ? '结束' : '开始'
}

function renderHours(sec) {
  document.getElementById('hours').textContent = formatDuration(sec)
  document.getElementById('c-hours').textContent = formatDuration(sec)
}

async function refreshSummary() {
  try {
    const [cur, eff, frag] = await Promise.all([
      api('ledger:current'),
      api('report:effectiveHours', { date: Date.now() }),
      api('report:dailyTimeline', { date: Date.now() })
    ])
    recording = !!cur.entry
    renderState()
    renderHours(eff.sec)
    const segs = (frag.segments || []).slice(-3).reverse()
    document.getElementById('c-frags').textContent = frag.segments.filter((s) => s.is_fragment).length
    document.getElementById('c-segs').textContent = segs.length
    const recent = document.getElementById('c-recent')
    recent.innerHTML = segs.length
      ? segs.map((s) => `<div class="r-item"><span class="r-time num">${formatTime(s.start_time)}</span><span style="color:${s.color}">${s.tagName || '未分类'}</span><span class="r-dur num">${formatDuration(s.duration_sec)}</span></div>`).join('')
      : '<div class="muted">今天还没有记录</div>'
  } catch (e) {
    /* 静默 */
  }
}

async function refreshTools() {
  try {
    const r = await api('tools:list')
    const tools = (r.tools || []).slice(0, 6)
    const el = document.getElementById('c-tools')
    el.innerHTML = '<span class="lbl">工具</span>' + tools
      .map((t) => `<button class="tool-btn" data-id="${t.id}">${t.name}</button>`)
      .join('')
    el.querySelectorAll('.tool-btn').forEach((b) => {
      b.addEventListener('click', () => api('tools:open', { id: b.dataset.id }))
    })
  } catch (e) {
    /* 静默 */
  }
}

function toggle() {
  expanded = !expanded
  card.classList.toggle('hidden', !expanded)
  document.getElementById('chev').textContent = expanded ? '▼' : '▲'
  resize()
  if (expanded) {
    refreshSummary()
    refreshTools()
  }
}

// ---------- 拖拽（区分点击与拖动） ----------
let drag = null
let dragPending = false

function onMouseDown(e) {
  drag = {
    startX: e.screenX,
    startY: e.screenY,
    winX: window.screenX,
    winY: window.screenY,
    moved: false
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e) {
  if (!drag) return
  const dx = e.screenX - drag.startX
  const dy = e.screenY - drag.startY
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true
  if (dragPending) return
  dragPending = true
  // 用 mousedown 时的窗口快照 + 绝对位移，避免异步 IPC 导致基准漂移
  api('mini:setPos', { x: drag.winX + dx, y: drag.winY + dy }).then(() => {
    dragPending = false
  })
}

function onMouseUp() {
  if (!drag) return
  const wasDrag = drag.moved
  drag = null
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  // 拖动不算点击
  if (wasDrag) return
  toggle()
}

bar.addEventListener('mousedown', onMouseDown)

function scheduleHide() {
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    if (expanded && !card.matches(':hover') && !bar.matches(':hover')) toggle()
  }, 3000)
}

document.addEventListener('mouseleave', scheduleHide)
card.addEventListener('mouseenter', () => clearTimeout(hideTimer))

document.getElementById('btn-toggle').addEventListener('click', async (e) => {
  e.stopPropagation()
  if (recording) {
    await api('ledger:stop')
  } else {
    await api('ledger:start')
  }
  refreshSummary()
})

document.getElementById('btn-shot').addEventListener('click', async (e) => {
  e.stopPropagation()
  await api('evidence:capture')
})

document.getElementById('btn-panel').addEventListener('click', (e) => {
  e.stopPropagation()
  api('server:openBrowser')
})

document.getElementById('btn-pack').addEventListener('click', (e) => {
  e.stopPropagation()
  api('evidence:pack', { start: 0, end: Date.now() }).then((r) => {
    if (r && r.error) alert(r.error)
  })
})

document.getElementById('btn-hide').addEventListener('click', (e) => {
  e.stopPropagation()
  api('mini:hide')
})

// 事件订阅
on('ledger:state-changed', () => refreshSummary())
on('activity:snapshot', (p) => {
  if (p && p.windowTitle) {
    const el = document.getElementById('c-window')
    const t = p.windowTitle.length > 24 ? p.windowTitle.slice(0, 24) + '…' : p.windowTitle
    el.textContent = '当前窗口：' + t
  }
})

refreshSummary()
refreshTools()
