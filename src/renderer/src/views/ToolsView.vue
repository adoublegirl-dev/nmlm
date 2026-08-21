<template>
  <div class="tools">
    <div class="toolbar">
      <div class="title">
        <h2>快捷工具</h2>
        <span class="muted">一键打开常用站点，浏览器直达</span>
      </div>
      <button class="btn primary" @click="showAdd = true">+ 添加</button>
    </div>

    <div v-for="(tools, group) in grouped" :key="group" class="group">
      <h3>{{ group }}</h3>
      <div class="grid">
        <div v-for="t in tools" :key="t.id" class="tool card" @click="open(t.id)">
          <div class="tool-name">{{ t.name }}</div>
          <div class="tool-url muted">{{ hostOf(t.url) }}</div>
          <div class="tool-ops">
            <button class="btn mini" @click.stop="edit(t)">编辑</button>
            <button class="btn mini danger" @click.stop="remove(t.id)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showAdd" class="mask" @click.self="showAdd = false">
      <div class="card form">
        <h3>{{ editing ? '编辑工具' : '添加工具' }}</h3>
        <input v-model="form.name" class="input" placeholder="名称，如：DeepSeek" />
        <input v-model="form.url" class="input" placeholder="https://…" style="margin-top:8px" />
        <input v-model="form.group" class="input" placeholder="分组，如：效率" style="margin-top:8px" />
        <div class="form-ops">
          <button class="btn" @click="showAdd = false">取消</button>
          <button class="btn primary" @click="save">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'
import { showAlert, showConfirm } from '../utils/dialog'

const list = ref([])
const showAdd = ref(false)
const editing = ref(null)
const form = ref({ name: '', url: '', group: '效率' })

const grouped = computed(() => {
  const map = {}
  for (const t of list.value) {
    const g = t.group || '其他'
    if (!map[g]) map[g] = []
    map[g].push(t)
  }
  return map
})

function hostOf(url) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

async function load() {
  const r = await api('tools:list')
  list.value = r.tools || []
}

async function open(id) {
  await api('tools:open', { id })
}

function edit(t) {
  editing.value = t
  form.value = { name: t.name, url: t.url, group: t.group || '效率' }
  showAdd.value = true
}

async function save() {
  try {
    if (editing.value) {
      await api('tools:update', { id: editing.value.id, ...form.value })
    } else {
      await api('tools:create', { ...form.value })
    }
    showAdd.value = false
    editing.value = null
    form.value = { name: '', url: '', group: '效率' }
    await load()
  } catch (e) {
    await showAlert(e.message, '保存失败')
  }
}

async function remove(id) {
  const ok = await showConfirm('删除该工具入口？', { title: '删除工具入口', confirmText: '删除', danger: true })
  if (!ok) return
  await api('tools:delete', { id })
  await load()
}

onMounted(load)
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.title h2 { font-size: 18px; font-weight: 500; margin-bottom: 2px; }
.group { margin-bottom: 20px; }
.group h3 { font-size: 13px; color: var(--text-dim); margin-bottom: 10px; font-weight: 500; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
.tool { cursor: pointer; transition: background 0.15s; display: flex; flex-direction: column; gap: 4px; }
.tool:hover { background: var(--bg-hover); }
.tool-name { font-weight: 500; }
.tool-url { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tool-ops { display: flex; gap: 6px; margin-top: 6px; opacity: 0; transition: opacity 0.15s; }
.tool:hover .tool-ops { opacity: 1; }
.btn.mini { padding: 2px 8px; font-size: 12px; }
.mask { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 50; }
.form { width: 320px; display: flex; flex-direction: column; background: var(--bg-panel-solid); }
.form h3 { margin-bottom: 12px; font-weight: 500; }
.form-ops { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
