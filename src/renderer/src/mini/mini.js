// 桌面记录器：小秒表形态。标签下拉 + 开始/暂停/停止 + 计时。
import { api, on } from '../api'
import './mini.css'

const app = document.getElementById('mini-app')
app.innerHTML = `
  <div class="recorder">
    <div class="titlebar">
      <div class="title">记录器</div>
      <button id="hide" class="close-btn no-drag" title="隐藏到托盘">×</button>
    </div>

    <div class="timer num" id="timer">00:00:00</div>

    <div class="field no-drag">
      <label>标签</label>
      <select id="tagSelect" class="select"></select>
    </div>

    <div class="buttons no-drag">
      <button id="startBtn" class="btn primary">开始</button>
      <button id="pauseBtn" class="btn">暂停</button>
      <button id="stopBtn" class="btn danger">停止</button>
    </div>
  </div>
`

let tags = []
let current = null
let paused = false
let selectedTagId = null

function pad(n) { return String(n).padStart(2, '0') }
function hms(sec) {
  sec = Math.max(0, Math.floor(sec || 0))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

async function loadSettings() {
  const r = await api('settings:getAll')
  selectedTagId = r.settings?.mini?.selectedTagId || null
}

async function saveSelectedTag(id) {
  selectedTagId = id
  await api('settings:set', { key: 'mini.selectedTagId', value: id }).catch(() => {})
}

async function loadTags() {
  const r = await api('tags:list')
  tags = r.tags || []
  if (!selectedTagId && tags[0]) selectedTagId = tags[0].id
  if (selectedTagId && !tags.some((t) => t.id === Number(selectedTagId)) && tags[0]) selectedTagId = tags[0].id
  renderTags()
}

function renderTags() {
  const sel = document.getElementById('tagSelect')
  sel.innerHTML = tags.map((t) => `<option value="${t.id}">${t.name}</option>`).join('')
  if (selectedTagId) sel.value = String(selectedTagId)
}

async function refresh() {
  const r = await api('ledger:current')
  current = r.entry || null
  if (current) {
    paused = false
    if (current.tag_id) {
      selectedTagId = current.tag_id
      const sel = document.getElementById('tagSelect')
      if (sel) sel.value = String(current.tag_id)
    }
  }
  render()
}

function render() {
  const timer = document.getElementById('timer')
  const startBtn = document.getElementById('startBtn')
  const pauseBtn = document.getElementById('pauseBtn')
  const stopBtn = document.getElementById('stopBtn')
  if (current) {
    timer.textContent = hms((Date.now() - current.start_time) / 1000)
    startBtn.textContent = '记录中'
    startBtn.disabled = true
    pauseBtn.disabled = false
    stopBtn.disabled = false
  } else {
    timer.textContent = '00:00:00'
    startBtn.textContent = paused ? '继续' : '开始'
    startBtn.disabled = false
    pauseBtn.disabled = true
    stopBtn.disabled = true
  }
}

async function startRecord() {
  const tagId = Number(document.getElementById('tagSelect').value || selectedTagId || 0) || null
  if (!tagId) return alert('请先配置或选择标签')
  await saveSelectedTag(tagId)
  const r = await api('ledger:start', { tagId })
  if (!r.ok) return alert(r.error || '开始失败')
  paused = false
  await refresh()
}

async function pauseRecord() {
  if (!current) return
  const r = await api('ledger:stop', {})
  if (!r.ok) return alert(r.error || '暂停失败')
  paused = true
  await refresh()
}

async function stopRecord() {
  if (!current) return
  const r = await api('ledger:complete', {})
  if (!r.ok) return alert(r.error || '停止失败')
  paused = false
  await refresh()
}

document.getElementById('tagSelect').addEventListener('change', (e) => saveSelectedTag(Number(e.target.value)))
document.getElementById('startBtn').addEventListener('click', startRecord)
document.getElementById('pauseBtn').addEventListener('click', pauseRecord)
document.getElementById('stopBtn').addEventListener('click', stopRecord)
document.getElementById('hide').addEventListener('click', () => api('mini:hide'))

on('ledger:state-changed', refresh)

Promise.resolve()
  .then(loadSettings)
  .then(loadTags)
  .then(refresh)

setInterval(render, 1000)
