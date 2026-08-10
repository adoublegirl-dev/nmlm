<template>
  <div class="todos">
    <div class="toolbar">
      <div>
        <h2>待办</h2>
        <span class="muted">Agent / MCP / 桌面端都写到这里</span>
      </div>
      <button class="btn primary" @click="openCreate">+ 新建待办</button>
    </div>

    <div class="filters">
      <button class="btn" :class="{ primary: status === null }" @click="setFilter(null)">未完成</button>
      <button class="btn" :class="{ primary: status === 'todo' }" @click="setFilter('todo')">todo</button>
      <button class="btn" :class="{ primary: status === 'doing' }" @click="setFilter('doing')">doing</button>
      <button class="btn" :class="{ primary: status === 'done' }" @click="setFilter('done')">done</button>
      <button class="btn" :class="{ primary: dueOnly }" @click="toggleDueOnly">已到期</button>
    </div>

    <div v-if="!todos.length" class="card empty muted">暂无待办</div>
    <div v-else class="list">
      <div v-for="t in todos" :key="t.id" class="card todo" :class="{ overdue: isOverdue(t), done: t.status === 'done' }">
        <div class="todo-main">
          <div class="todo-title" :class="{ done: t.status === 'done' }">{{ t.title }}</div>
          <div v-if="t.detail" class="todo-detail muted">{{ t.detail }}</div>
          <div class="todo-meta muted">
            <span class="status-chip" :class="t.status">{{ t.status }}</span>
            <span>{{ priorityLabel(t.priority) }}</span>
            <span>{{ t.source }}</span>
            <span v-if="t.due_at" :class="{ dangerText: isOverdue(t) }">截止 {{ formatDateTime(t.due_at) }}</span>
            <span v-if="t.closed_at">完成 {{ formatDateTime(t.closed_at) }}</span>
          </div>
        </div>
        <div class="ops">
          <button v-if="t.status !== 'done'" class="btn" @click="setDoing(t)">{{ t.status === 'doing' ? '转 todo' : '开始做' }}</button>
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
            <option value="todo">todo</option>
            <option value="doing">doing</option>
            <option value="done">done</option>
          </select>
          <select v-model="form.priority" class="input small">
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </div>
        <div class="form-row">
          <input v-model="form.due" type="datetime-local" class="input" />
          <button class="btn" @click="form.due = ''">清空截止</button>
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

const todos = ref([])
const status = ref(null)
const dueOnly = ref(false)
const showAdd = ref(false)
const editing = ref(null)
const error = ref('')
const form = ref(emptyForm())

function emptyForm() { return { title: '', detail: '', status: 'todo', priority: 'medium', due: '' } }
function priorityLabel(p) { return ({ low: '低', medium: '中', high: '高' })[p] || p }
function pad(n) { return String(n).padStart(2, '0') }
function toLocalInput(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function formatDateTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function dueAt() { return form.value.due ? new Date(form.value.due).getTime() : null }
function isOverdue(t) { return t.status !== 'done' && t.due_at && t.due_at <= Date.now() }

async function load() {
  const r = await api('todos:list', { status: status.value, includeDone: status.value === 'done', dueOnly: dueOnly.value })
  todos.value = r.todos || []
}
function setFilter(next) { status.value = next; dueOnly.value = false; load() }
function toggleDueOnly() { dueOnly.value = !dueOnly.value; if (dueOnly.value) status.value = null; load() }
function openCreate() { editing.value = null; form.value = emptyForm(); error.value = ''; showAdd.value = true }
function edit(t) {
  editing.value = t
  form.value = { title: t.title, detail: t.detail || '', status: t.status || 'todo', priority: t.priority || 'medium', due: toLocalInput(t.due_at) }
  error.value = ''
  showAdd.value = true
}
function cancel() { showAdd.value = false; editing.value = null; form.value = emptyForm(); error.value = '' }
async function save() {
  error.value = ''
  if (!form.value.title.trim()) { error.value = '标题不能为空'; return }
  const payload = { title: form.value.title, detail: form.value.detail || null, status: form.value.status, priority: form.value.priority, dueAt: dueAt() }
  const r = editing.value
    ? await api('todos:update', { id: editing.value.id, ...payload })
    : await api('todos:create', { ...payload, source: 'desktop' })
  if (!r.ok) { error.value = r.error || '保存失败'; return }
  cancel(); await load()
}
async function setDoing(t) { await api('todos:update', { id: t.id, status: t.status === 'doing' ? 'todo' : 'doing' }); await load() }
async function close(id) { await api('todos:close', { id }); await load() }
async function reopen(id) { await api('todos:reopen', { id, status: 'todo' }); await load() }
async function remove(id) { if (!confirm('删除待办？')) return; await api('todos:delete', { id }); await load() }

onMounted(() => { load(); on('todo:changed', () => load()) })
</script>

<style scoped>
.toolbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
h2 { font-size:18px; font-weight:500; margin-bottom:2px; }
.filters { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
.list { display:flex; flex-direction:column; gap:10px; }
.todo { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; border-color: var(--border); }
.todo.overdue { border-color: rgba(202,91,74,.55); background: rgba(202,91,74,.06); }
.todo.done { opacity:.78; }
.todo-title { font-weight:600; font-size:15px; }
.todo-title.done { text-decoration: line-through; color: var(--text-dim); }
.todo-detail { margin-top:4px; white-space:pre-wrap; }
.todo-meta { margin-top:8px; font-size:12px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.status-chip { padding:1px 7px; border-radius:999px; border:1px solid var(--border); }
.status-chip.todo { color: var(--text-dim); }
.status-chip.doing { color: var(--gold); border-color: rgba(212,175,106,.4); background: rgba(212,175,106,.1); }
.status-chip.done { color: var(--green); border-color: rgba(127,169,140,.4); background: rgba(127,169,140,.1); }
.dangerText { color:#d87968; }
.ops { display:flex; gap:6px; flex-shrink:0; flex-wrap:wrap; justify-content:flex-end; }
.mask { position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; z-index:60; }
.form { width:460px; background:var(--bg-panel-solid); display:flex; flex-direction:column; gap:10px; }
.form h3 { font-size:15px; font-weight:500; }
.detail { resize:vertical; font-family:inherit; }
.form-row { display:flex; gap:8px; }
.small { width:130px; }
.form-ops { display:flex; justify-content:flex-end; gap:8px; }
.empty { text-align:center; padding:40px 0; }
.error { color:#d87968; font-size:12px; }
</style>
