<template>
  <div class="todos">
    <div class="toolbar">
      <div>
        <h2>待办</h2>
        <span class="muted">Agent / MCP / 桌面端都写到这里</span>
      </div>
      <button class="btn primary" @click="showAdd = true">+ 新建待办</button>
    </div>

    <div class="filters">
      <button class="btn" :class="{ primary: status === null }" @click="status = null; load()">未完成</button>
      <button class="btn" :class="{ primary: status === 'todo' }" @click="status = 'todo'; load()">todo</button>
      <button class="btn" :class="{ primary: status === 'doing' }" @click="status = 'doing'; load()">doing</button>
      <button class="btn" :class="{ primary: status === 'done' }" @click="status = 'done'; load(true)">done</button>
    </div>

    <div v-if="!todos.length" class="card empty muted">暂无待办</div>
    <div v-else class="list">
      <div v-for="t in todos" :key="t.id" class="card todo">
        <div class="todo-main">
          <div class="todo-title" :class="{ done: t.status === 'done' }">{{ t.title }}</div>
          <div v-if="t.detail" class="todo-detail muted">{{ t.detail }}</div>
          <div class="todo-meta muted">{{ t.priority }} · {{ t.source }} <span v-if="t.due_at">· 截止 {{ formatDate(t.due_at) }}</span></div>
        </div>
        <div class="ops">
          <button v-if="t.status !== 'done'" class="btn primary" @click="close(t.id)">完成</button>
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
          <select v-model="form.priority" class="input small">
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
          <input v-model="form.due" type="datetime-local" class="input" />
        </div>
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
import { formatDate } from '../utils/format'

const todos = ref([])
const status = ref(null)
const showAdd = ref(false)
const editing = ref(null)
const form = ref({ title: '', detail: '', priority: 'medium', due: '' })

async function load(includeDone = false) {
  const r = await api('todos:list', { status: status.value, includeDone })
  todos.value = r.todos || []
}
function dueAt() { return form.value.due ? new Date(form.value.due).getTime() : null }
function edit(t) {
  editing.value = t
  form.value = { title: t.title, detail: t.detail || '', priority: t.priority || 'medium', due: t.due_at ? new Date(t.due_at).toISOString().slice(0,16) : '' }
  showAdd.value = true
}
function cancel() { showAdd.value = false; editing.value = null; form.value = { title: '', detail: '', priority: 'medium', due: '' } }
async function save() {
  if (!form.value.title.trim()) return
  if (editing.value) await api('todos:update', { id: editing.value.id, title: form.value.title, detail: form.value.detail || null, priority: form.value.priority, dueAt: dueAt() })
  else await api('todos:create', { title: form.value.title, detail: form.value.detail || null, priority: form.value.priority, dueAt: dueAt(), source: 'desktop' })
  cancel(); await load(status.value === 'done')
}
async function close(id) { await api('todos:close', { id }); await load() }
async function remove(id) { if (!confirm('删除待办？')) return; await api('todos:delete', { id }); await load(status.value === 'done') }

onMounted(() => { load(); on('todo:changed', () => load(status.value === 'done')) })
</script>

<style scoped>
.toolbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
h2 { font-size:18px; font-weight:500; margin-bottom:2px; }
.filters { display:flex; gap:8px; margin-bottom:14px; }
.list { display:flex; flex-direction:column; gap:10px; }
.todo { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
.todo-title { font-weight:600; font-size:15px; }
.todo-title.done { text-decoration: line-through; color: var(--text-dim); }
.todo-detail { margin-top:4px; white-space:pre-wrap; }
.todo-meta { margin-top:6px; font-size:12px; }
.ops { display:flex; gap:6px; flex-shrink:0; }
.mask { position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; z-index:60; }
.form { width:420px; background:var(--bg-panel-solid); display:flex; flex-direction:column; gap:10px; }
.form h3 { font-size:15px; font-weight:500; }
.detail { resize:vertical; font-family:inherit; }
.form-row { display:flex; gap:8px; }
.small { width:110px; }
.form-ops { display:flex; justify-content:flex-end; gap:8px; }
.empty { text-align:center; padding:40px 0; }
</style>
