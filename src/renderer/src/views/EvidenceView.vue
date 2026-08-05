<template>
  <div class="evidence">
    <div class="toolbar">
      <div class="title">
        <h2>证据留存</h2>
        <span class="muted">快捷键 Ctrl+Shift+3 随时截图存证</span>
      </div>
      <button class="btn primary" @click="capture" :disabled="capturing">{{ capturing ? '截图中…' : '立即截图' }}</button>
    </div>

    <div class="filters">
      <button class="btn" @click="shift(-1)">←</button>
      <span class="muted">{{ formatDate(curDate) }}</span>
      <button class="btn" @click="shift(1)">→</button>
    </div>

    <div v-if="!shots.length" class="card empty muted">这一天还没有截图</div>
    <div v-else class="grid">
      <div v-for="s in shots" :key="s.id" class="shot card" @click="preview(s)">
        <img :src="thumbUrl(s)" loading="lazy" alt="" />
        <div class="shot-meta">
          <span class="num">{{ timeOf(s.taken_at) }}</span>
          <span class="title">{{ s.window_title || '无窗口' }}</span>
        </div>
      </div>
    </div>

    <div v-if="previewing" class="preview-mask" @click="previewing = null">
      <img :src="previewUrl" class="preview-img" @click.stop />
      <button class="btn close" @click="previewing = null">关闭</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api, on } from '../api'
import { formatDate } from '../utils/format'

const DAY_MS = 86400000
const curDate = ref(Date.now())
const shots = ref([])
const capturing = ref(false)
const previewing = ref(null)
const previewUrl = computed(() => {
  if (!previewing.value) return ''
  return previewing.value.webPath || previewing.value.file_path.replace(/\\/g, '/')
})

function timeOf(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function thumbUrl(s) {
  return s.webPath || s.file_path.replace(/\\/g, '/')
}
function shift(d) {
  curDate.value += d * DAY_MS
  load()
}
async function load() {
  const d = new Date(curDate.value)
  d.setHours(0, 0, 0, 0)
  const r = await api('evidence:list', { start: d.getTime(), end: d.getTime() + DAY_MS })
  shots.value = r.screenshots || []
}
async function capture() {
  capturing.value = true
  try {
    await api('evidence:capture')
    await load()
  } catch (e) {
    alert(`截图失败：${e.message}`)
  } finally {
    capturing.value = false
  }
}
function preview(s) {
  previewing.value = s
}

onMounted(() => {
  load()
  const off = on('capture:done', () => load())
  // 保存 off 以便卸载；单页应用内常驻，简化为不清理
})
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.title h2 { font-size: 18px; font-weight: 500; margin-bottom: 2px; }
.filters { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.shot { padding: 8px; cursor: pointer; }
.shot img { width: 100%; height: 110px; object-fit: cover; border-radius: 4px; background: #000; }
.shot-meta { display: flex; flex-direction: column; margin-top: 6px; font-size: 12px; gap: 2px; }
.shot-meta .title { color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.preview-mask {
  position: fixed; inset: 0; background: rgba(0,0,0,0.8);
  display: flex; align-items: center; justify-content: center; z-index: 100;
}
.preview-img { max-width: 88vw; max-height: 82vh; border-radius: 4px; }
.close { position: absolute; top: 20px; right: 20px; }
.empty { text-align: center; padding: 40px 0; }
</style>
