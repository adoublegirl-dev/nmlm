<template>
  <div class="todos">
    <div class="toolbar">
      <div>
        <h2>待办</h2>
        <span class="muted">简单待办默认展示；高级待办用于阶段性提醒。</span>
      </div>
      <button class="btn primary" @click="openCreate">+ 新建待办</button>
    </div>

    <div class="filters">
      <button class="btn" :class="{ primary: status === null && !dueOnly }" @click="setFilter(null)">未完成</button>
      <button class="btn" :class="{ primary: status === 'todo' }" @click="setFilter('todo')">待处理</button>
      <button class="btn" :class="{ primary: status === 'doing' }" @click="setFilter('doing')">进行中</button>
      <button class="btn" :class="{ primary: status === 'done' && !dueOnly }" @click="setFilter('done')">已完成</button>
      <button class="btn" :class="{ primary: dueOnly }" @click="toggleDueOnly">已到期/阶段结束</button>
    </div>

    <div v-if="selectedIds.length" class="batch-bar card">
      <span>已选择 {{ selectedIds.length }} 项</span>
      <button class="btn" @click="batchClose">批量完成</button>
      <button class="btn" @click="batchReopen">批量重开</button>
      <button class="btn danger" @click="batchDelete">批量删除</button>
      <button class="btn" @click="selectedIds = []">取消选择</button>
    </div>

    <div v-if="!todos.length" class="card empty muted">暂无待办</div>
    <div v-else class="list">
      <div v-for="t in todos" :key="t.id" class="card todo" :class="{ overdue: isOverdue(t), done: t.status === 'done' }">
        <label class="check"><input type="checkbox" :value="t.id" v-model="selectedIds" /></label>
        <div class="todo-main">
          <div class="todo-title" :class="{ done: t.status === 'done' }">{{ t.title }}</div>
          <div v-if="t.detail" class="todo-detail muted">{{ t.detail }}</div>
          <div class="todo-meta muted">
            <span class="status-chip" :class="t.status">{{ statusLabel(t.status) }}</span>
            <span>{{ priorityLabel(t.priority) }}</span>
            <span>{{ sourceLabel(t.source) }}</span>
            <span v-if="isAdvanced(t)" class="phase-chip">阶段待办</span>
            <span v-if="t.due_at" :class="{ dangerText: dueExpired(t) }">截止 {{ formatDateTime(t.due_at) }}</span>
            <span v-if="t.phase_start_at && t.phase_end_at" :class="{ dangerText: phaseExpired(t) }">阶段 {{ formatDate(t.phase_start_at) }} 至 {{ formatDate(t.phase_end_at) }}</span>
            <span v-if="t.reminder_enabled">{{ t.remind_window_start }}-{{ t.remind_window_end }} / 每 {{ t.remind_interval_min }} 分钟</span>
            <span v-if="t.closed_at">完成 {{ formatDateTime(t.closed_at) }}</span>
          </div>
        </div>
        <div class="ops">
          <button v-if="t.status !== 'done'" class="btn" @click="setDoing(t)">{{ t.status === 'doing' ? '转待处理' : '开始做' }}</button>
          <button v-if="t.status !== 'done'" class="btn primary" @click="close(t.id)">完成</button>
          <button v-else class="btn primary" @click="reopen(t.id)">重开</button>
          <button class="btn" @click="edit(t)">编辑</button>
          <button class="btn danger" @click="remove(t.id)">删除</button>
        </div>
      </div>
    </div>

    <div v-if="showAdd" class="mask" @click.self="cancel">
      <div class="card form">
        <h3>{{ editing ? '编辑待办' : '新建待办' }}</h3>
        <input v-model="form.title" class="input" placeholder="标题" />
        <textarea v-model="form.detail" class="input detail" placeholder="详细描述（可选）" rows="4"></textarea>
        <div class="form-row">
          <select v-model="form.status" class="input small">
            <option value="todo">待处理</option>
            <option value="doing">进行中</option>
            <option value="done">已完成</option>
          </select>
          <select v-model="form.priority" class="input small">
            <option value="low">低优先级</option>
            <option value="medium">中优先级</option>
            <option value="high">高优先级</option>
          </select>
        </div>
        <div class="form-row">
          <label class="field">截止时间<input v-model="form.due" type="datetime-local" class="input" /></label>
          <button class="btn clear-btn" @click="form.due = ''">清空截止</button>
        </div>

        <button class="advanced-toggle" @click="form.advanced = !form.advanced">{{ form.advanced ? '收起高级待办' : '展开高级待办（阶段提醒）' }}</button>
        <div v-if="form.advanced" class="advanced-box">
          <label class="toggle-row"><input type="checkbox" v-model="form.reminderEnabled" /> 启用阶段提醒</label>
          <div class="form-row">
            <label class="field">阶段开始<input v-model="form.phaseStart" type="date" class="input" /></label>
            <label class="field">阶段结束<input v-model="form.phaseEnd" type="date" class="input" /></label>
          </div>
          <div class="form-row">
            <label class="field">每日提醒开始<input v-model="form.windowStart" type="time" class="input small" /></label>
            <label class="field">每日提醒结束<input v-model="form.windowEnd" type="time" class="input small" /></label>
            <label class="field">频率（分钟）<input v-model.number="form.intervalMin" type="number" min="5" class="input small" /></label>
          </div>
          <p class="muted hint">阶段结束后会自动标记为已完成，并出现在“已到期/阶段结束”筛选中。</p>
        </div>

        <div v-if="error" class="error">{{ error }}</div>
        <div class="form-ops">
          <button class="btn" @click="cancel">取消</button>
          <button class="btn primary" @click="save">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api, on } from '../api'
import { showConfirm } from '../utils/dialog'

const todos = ref([])
const status = ref(null)
const dueOnly = ref(false)
const showAdd = ref(false)
const editing = ref(null)
const error = ref('')
const selectedIds = ref([])
const form = ref(emptyForm())

function emptyForm() { return { title: '', detail: '', status: 'todo', priority: 'medium', due: '', advanced: false, reminderEnabled: false, phaseStart: '', phaseEnd: '', windowStart: '09:00', windowEnd: '18:00', intervalMin: 120 } }
function priorityLabel(p) { return ({ low: '低优先级', medium: '中优先级', high: '高优先级' })[p] || p }
function statusLabel(s) { return ({ todo: '待处理', doing: '进行中', done: '已完成' })[s] || s }
function sourceLabel(s) { return ({ desktop: '桌面端', agent: 'Agent', mcp: 'MCP' })[s] || s }
function pad(n) { return String(n).padStart(2, '0') }
function toLocalInput(ts) { if (!ts) return ''; const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }
function toDateInput(ts) { if (!ts) return ''; const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function dateToStart(v) { return v ? new Date(v + 'T00:00:00').getTime() : null }
function dateToEnd(v) { return v ? new Date(v + 'T23:59:59.999').getTime() : null }
function formatDateTime(ts) { if (!ts) return ''; const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` }
function formatDate(ts) { if (!ts) return ''; const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function dueAt() { return form.value.due ? new Date(form.value.due).getTime() : null }
function dueExpired(t) { return t.due_at && t.due_at <= Date.now() }
function phaseExpired(t) { return t.phase_end_at && t.phase_end_at <= Date.now() }
function isOverdue(t) { return t.status !== 'done' && (dueExpired(t) || phaseExpired(t)) }
function isAdvanced(t) { return !!(t.reminder_enabled || t.phase_start_at || t.phase_end_at) }

async function load() {
  const r = await api('todos:list', { status: status.value, includeDone: status.value === 'done' || dueOnly.value, dueOnly: dueOnly.value })
  todos.value = r.todos || []
  selectedIds.value = selectedIds.value.filter((id) => todos.value.some((t) => t.id === id))
}
function setFilter(next) { status.value = next; dueOnly.value = false; selectedIds.value = []; load() }
function toggleDueOnly() { dueOnly.value = !dueOnly.value; if (dueOnly.value) status.value = null; selectedIds.value = []; load() }
function openCreate() { editing.value = null; form.value = emptyForm(); error.value = ''; showAdd.value = true }
function edit(t) {
  editing.value = t
  form.value = { title: t.title, detail: t.detail || '', status: t.status || 'todo', priority: t.priority || 'medium', due: toLocalInput(t.due_at), advanced: isAdvanced(t), reminderEnabled: !!t.reminder_enabled, phaseStart: toDateInput(t.phase_start_at), phaseEnd: toDateInput(t.phase_end_at), windowStart: t.remind_window_start || '09:00', windowEnd: t.remind_window_end || '18:00', intervalMin: t.remind_interval_min || 120 }
  error.value = ''
  showAdd.value = true
}
function cancel() { showAdd.value = false; editing.value = null; form.value = emptyForm(); error.value = '' }
function buildPayload() {
  const payload = { title: form.value.title, detail: form.value.detail || null, status: form.value.status, priority: form.value.priority, dueAt: dueAt() }
  if (form.value.advanced) Object.assign(payload, { reminderEnabled: form.value.reminderEnabled, phaseStartAt: dateToStart(form.value.phaseStart), phaseEndAt: dateToEnd(form.value.phaseEnd), remindWindowStart: form.value.windowStart || '09:00', remindWindowEnd: form.value.windowEnd || '18:00', remindIntervalMin: form.value.intervalMin || 120 })
  else Object.assign(payload, { reminderEnabled: 0, phaseStartAt: null, phaseEndAt: null, lastPhaseRemindedAt: null, phaseCompletedAt: null })
  return payload
}
async function save() {
  error.value = ''
  if (!form.value.title.trim()) { error.value = '标题不能为空'; return }
  if (form.value.advanced && form.value.reminderEnabled && (!form.value.phaseStart || !form.value.phaseEnd)) { error.value = '启用阶段提醒时，需要填写阶段开始和阶段结束'; return }
  const payload = buildPayload()
  const r = editing.value ? await api('todos:update', { id: editing.value.id, ...payload }) : await api('todos:create', { ...payload, source: 'desktop' })
  if (!r.ok) { error.value = r.error || '保存失败'; return }
  cancel(); await load()
}
async function setDoing(t) { await api('todos:update', { id: t.id, status: t.status === 'doing' ? 'todo' : 'doing' }); await load() }
async function close(id) { await api('todos:close', { id }); await load() }
async function reopen(id) { await api('todos:reopen', { id, status: 'todo' }); await load() }
async function remove(id) { const ok = await showConfirm('删除待办？', { title: '删除待办', confirmText: '删除', danger: true }); if (!ok) return; await api('todos:delete', { id }); await load() }
async function batchClose() { await api('todos:batchClose', { ids: selectedIds.value }); selectedIds.value = []; await load() }
async function batchReopen() { await api('todos:batchReopen', { ids: selectedIds.value, status: 'todo' }); selectedIds.value = []; await load() }
async function batchDelete() { const ok = await showConfirm(`确认删除选中的 ${selectedIds.value.length} 个待办？\n删除后不可恢复。`, { title: '批量删除待办', confirmText: '删除', danger: true }); if (!ok) return; await api('todos:batchDelete', { ids: selectedIds.value }); selectedIds.value = []; await load() }

onMounted(() => { load(); on('todo:changed', () => load()) })
</script>

<style scoped>
.toolbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
h2 { font-size:18px; font-weight:500; margin-bottom:2px; }
.filters { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
.batch-bar { display:flex; align-items:center; gap:8px; margin-bottom:12px; padding:10px 12px; }
.list { display:flex; flex-direction:column; gap:10px; }
.todo { display:grid; grid-template-columns: 24px 1fr auto; gap:12px; align-items:flex-start; border-color: var(--border); }
.todo.overdue { border-color: rgba(202,91,74,.55); background: rgba(202,91,74,.06); }
.todo.done { opacity:.78; }
.check { padding-top:2px; }
.todo-title { font-weight:600; font-size:15px; }
.todo-title.done { text-decoration: line-through; color: var(--text-dim); }
.todo-detail { margin-top:4px; white-space:pre-wrap; }
.todo-meta { margin-top:8px; font-size:12px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.status-chip, .phase-chip { padding:1px 7px; border-radius:999px; border:1px solid var(--border); }
.status-chip.todo { color: var(--text-dim); }
.status-chip.doing { color: var(--gold); border-color: rgba(212,175,106,.4); background: rgba(212,175,106,.1); }
.status-chip.done { color: var(--green); border-color: rgba(127,169,140,.4); background: rgba(127,169,140,.1); }
.phase-chip { color: var(--green); border-color: rgba(127,169,140,.38); background: rgba(127,169,140,.1); }
.dangerText { color:#d87968; }
.ops { display:flex; gap:6px; flex-shrink:0; flex-wrap:wrap; justify-content:flex-end; }
.mask { position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; z-index:60; }
.form { width:560px; max-height:88vh; overflow:auto; background:var(--bg-panel-solid); display:flex; flex-direction:column; gap:10px; }
.form h3 { font-size:15px; font-weight:500; }
.detail { resize:vertical; font-family:inherit; }
.form-row { display:flex; gap:8px; align-items:flex-end; }
.field { display:flex; flex-direction:column; gap:5px; color:var(--text-dim); font-size:12px; flex:1; }
.small { width:130px; }
.clear-btn { align-self:flex-end; }
.form-ops { display:flex; justify-content:flex-end; gap:8px; }
.empty { text-align:center; padding:40px 0; }
.error { color:#d87968; font-size:12px; }
.advanced-toggle { border:1px dashed rgba(224,188,114,.36); color:var(--gold); background:rgba(224,188,114,.08); border-radius:10px; padding:8px 10px; cursor:pointer; text-align:left; }
.advanced-box { border:1px solid rgba(255,255,255,.09); border-radius:12px; padding:12px; background:rgba(255,255,255,.04); display:flex; flex-direction:column; gap:10px; }
.toggle-row { display:flex; align-items:center; gap:8px; color:var(--text-main); font-size:13px; }
.hint { font-size:12px; }
@media (max-width: 760px) { .todo { grid-template-columns: 24px 1fr; } .ops { grid-column: 2; justify-content:flex-start; } .form { width:92vw; } .form-row { flex-direction:column; align-items:stretch; } }
</style>
