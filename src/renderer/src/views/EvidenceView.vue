<template>
  <div class="evidence">
    <div class="toolbar">
      <div class="title">
        <h2>证据工作台</h2>
        <span class="muted">快捷键 F10 随时截图存证；原始证据进入 raw 目录，不加水印、不覆盖。</span>
      </div>
      <div class="toolbar-actions">
        <button class="btn" @click="importFiles" :disabled="importing">{{ importing ? '导入中…' : '导入材料' }}</button>
        <button class="btn primary" @click="capture" :disabled="capturing">{{ capturing ? '截图中…' : '立即截图' }}</button>
      </div>
    </div>

    <div class="notice card">
      <strong>原件保险柜</strong>
      <span>当前 P1 只做安全入库与基础索引。AI 分析、复核、导出水印副本会在后续阶段接入；raw 原件不会被修改。</span>
    </div>

    <div class="filters">
      <button class="btn" @click="shift(-1)">←</button>
      <span class="muted">{{ formatDate(curDate) }}</span>
      <button class="btn" @click="shift(1)">→</button>
    </div>

    <div v-if="!items.length" class="card empty muted">这一天还没有证据</div>
    <div v-else class="evidence-list">
      <div v-for="s in items" :key="s.evidence_id || s.id" class="evidence-item card" @click="preview(s)">
        <div class="thumb-wrap">
          <img v-if="isImage(s)" :src="thumbUrl(s)" loading="lazy" alt="" />
          <div v-else class="file-icon">{{ typeLabel(s) }}</div>
        </div>
        <div class="item-body">
          <div class="item-head">
            <span class="num">{{ timeOf(s.taken_at || s.captured_at || s.created_at) }}</span>
            <span class="status-chip" :class="s.status">{{ statusLabel(s.status) }}</span>
            <span v-if="s.source === 'legacy_screenshot'" class="legacy-chip">旧截图</span>
          </div>
          <div class="item-title">{{ displayTitle(s) }}</div>
          <div class="meta-line muted">{{ typeLabel(s) }} · {{ sizeText(s.size_bytes) }} · {{ displayPath(s) }}</div>
          <div v-if="s.sha256" class="hash-line num">sha256 {{ s.sha256.slice(0, 16) }}…</div>
          <div v-if="s.ledger_entry_id || s.entry_id" class="meta-line muted">关联台账 #{{ s.ledger_entry_id || s.entry_id }}</div>
        </div>
      </div>
    </div>

    <div v-if="previewing" class="preview-mask" @click="previewing = null">
      <div class="preview-panel" @click.stop>
        <div class="preview-main">
          <img v-if="isImage(previewing)" :src="previewUrl" class="preview-img" />
          <div v-else class="preview-file">{{ typeLabel(previewing) }}</div>
        </div>
        <aside class="preview-meta card">
          <h3>{{ displayTitle(previewing) }}</h3>
          <div class="meta-row"><span>状态</span><b>{{ statusLabel(previewing.status) }}</b></div>
          <div class="meta-row"><span>类型</span><b>{{ typeLabel(previewing) }}</b></div>
          <div class="meta-row"><span>时间</span><b>{{ fullTime(previewing.taken_at || previewing.captured_at || previewing.created_at) }}</b></div>
          <div v-if="previewing.window_title && !looksGarbled(previewing.window_title)" class="meta-row"><span>窗口标题</span><b>{{ previewing.window_title }}</b></div>
          <div class="meta-row"><span>大小</span><b>{{ sizeText(previewing.size_bytes) }}</b></div>
          <div class="meta-row"><span>hash</span><code>{{ previewing.sha256 || '旧截图暂无' }}</code></div>
          <div class="meta-row path"><span>原件路径</span><code>{{ displayPath(previewing) }}</code></div>

          <div v-if="previewing.evidence_id" class="review-box">
            <h4>人工复核</h4>
            <label>标题
              <input class="input" v-model="reviewForm.title" placeholder="给这份证据起个标题" />
            </label>
            <label>状态
              <select class="input" v-model="reviewForm.status">
                <option value="pending_review">待复核</option>
                <option value="reviewed">已确认</option>
                <option value="invalid">无效材料</option>
                <option value="unsupported">无法处理</option>
              </select>
            </label>
            <label>人工备注
              <textarea class="input" rows="4" v-model="reviewForm.userNote" placeholder="这份证据说明了什么、是否可用于证据链…"></textarea>
            </label>
            <button class="btn primary" @click="saveReview">保存复核</button>
          </div>
          <button class="btn" @click="previewing = null">关闭</button>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api, on } from '../api'
import { formatDate } from '../utils/format'

const DAY_MS = 86400000
const curDate = ref(Date.now())
const items = ref([])
const capturing = ref(false)
const importing = ref(false)
const previewing = ref(null)
const reviewForm = ref({ title: '', status: 'pending_review', userNote: '' })
const previewUrl = computed(() => {
  if (!previewing.value) return ''
  return previewing.value.webPath || previewing.value.file_path?.replace(/\\/g, '/') || ''
})

function isImage(s) {
  const t = s.mime_type || ''
  const p = s.file_path || s.original_path || ''
  return t.startsWith('image/') || /\.(png|jpg|jpeg|webp)$/i.test(p)
}
function statusLabel(status) {
  const map = { captured: '已入库', imported: '已导入', pending_review: '待复核', legacy: '旧记录', reviewed: '已确认', invalid: '无效材料', unsupported: '无法处理' }
  return map[status] || status || '已入库'
}
function typeLabel(s) {
  const map = { screenshot: '截图', image: '图片', pdf: 'PDF', text: '文本', unknown: '未知' }
  return map[s.type] || s.type || '文件'
}
function looksGarbled(text) {
  return /�|ţ|����|\uFFFD/.test(String(text || ''))
}
function basename(p) {
  return String(p || '').split(/[\\/]/).filter(Boolean).pop() || ''
}
function displayTitle(s) {
  const ts = s.taken_at || s.captured_at || s.created_at
  if (s.type === 'screenshot') return `${s.source === 'legacy_screenshot' ? '旧截图' : '屏幕截图'} ${timeOf(ts)}`
  const title = s.title || s.window_title
  if (title && !looksGarbled(title)) return title
  return `${typeLabel(s)} ${timeOf(ts)}`
}
function displayPath(s) {
  const rel = s.relative_path
  if (rel && !looksGarbled(rel)) return rel
  const name = basename(s.file_path || s.original_path)
  if (name && !looksGarbled(name)) return name
  return s.source === 'legacy_screenshot' ? '旧截图文件（原路径含异常字符）' : '原始文件'
}
function timeOf(ts) {
  if (!ts) return '…'
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}
function fullTime(ts) {
  if (!ts) return '…'
  const d = new Date(ts)
  return `${formatDate(ts)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}
function sizeText(size) {
  if (!size) return '未知大小'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}
function thumbUrl(s) {
  return s.webPath || s.file_path?.replace(/\\/g, '/') || ''
}
function shift(d) {
  curDate.value += d * DAY_MS
  load()
}
async function load() {
  const d = new Date(curDate.value)
  d.setHours(0, 0, 0, 0)
  const r = await api('evidence:list', { start: d.getTime(), end: d.getTime() + DAY_MS })
  items.value = r.screenshots || r.items || []
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
async function importFiles() {
  importing.value = true
  try {
    await api('evidence:import')
    await load()
  } catch (e) {
    alert(`导入失败：${e.message}`)
  } finally {
    importing.value = false
  }
}
function preview(s) {
  previewing.value = s
  reviewForm.value = {
    title: s.title || '',
    status: s.status === 'captured' || s.status === 'imported' ? 'pending_review' : (s.status || 'pending_review'),
    userNote: s.user_note || s.review_note || ''
  }
}
async function saveReview() {
  if (!previewing.value?.evidence_id) return
  try {
    const r = await api('evidence:update', {
      id: previewing.value.evidence_id,
      title: reviewForm.value.title.trim() || null,
      status: reviewForm.value.status,
      userNote: reviewForm.value.userNote.trim() || null
    })
    previewing.value = { ...previewing.value, ...(r.evidence || {}) }
    await load()
    alert('已保存复核')
  } catch (e) {
    alert(`保存失败：${e.message}`)
  }
}

onMounted(() => {
  load()
  on('capture:done', () => load())
})
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 16px; }
.toolbar-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.title h2 { font-size: 18px; font-weight: 500; margin-bottom: 2px; }
.notice { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; padding: 12px 14px; color: var(--text-dim); }
.notice strong { color: var(--gold); white-space: nowrap; }
.filters { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.evidence-list { display: flex; flex-direction: column; gap: 10px; }
.evidence-item { display: grid; grid-template-columns: 132px 1fr; gap: 12px; padding: 10px; cursor: pointer; transition: transform .14s ease, border-color .14s ease; }
.evidence-item:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--gold) 42%, transparent); }
.thumb-wrap { width: 132px; height: 82px; border-radius: 8px; overflow: hidden; background: rgba(0,0,0,.22); display: flex; align-items: center; justify-content: center; }
.thumb-wrap img { width: 100%; height: 100%; object-fit: cover; }
.file-icon { color: var(--gold); font-size: 13px; }
.item-body { min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.item-head { display: flex; align-items: center; gap: 8px; }
.item-title { font-size: 14px; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta-line { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hash-line { font-size: 11px; color: var(--text-dim); }
.status-chip,
.legacy-chip { font-size: 11px; padding: 1px 7px; border-radius: 999px; border: 1px solid rgba(224,188,114,.30); color: var(--gold); background: rgba(224,188,114,.10); }
.legacy-chip { color: #f1a28f; border-color: rgba(241,162,143,.32); background: rgba(241,162,143,.10); }
.preview-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.80); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 24px; }
.preview-panel { width: min(1180px, 96vw); height: min(760px, 90vh); display: grid; grid-template-columns: 1fr 330px; gap: 14px; }
.preview-main { min-width: 0; min-height: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.28); border-radius: 14px; overflow: hidden; }
.preview-img { max-width: 100%; max-height: 100%; object-fit: contain; }
.preview-file { color: var(--gold); font-size: 22px; }
.preview-meta { padding: 16px; overflow: auto; }
.preview-meta h3 { font-size: 16px; font-weight: 500; color: var(--gold); margin-bottom: 14px; }
.meta-row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; font-size: 12px; }
.meta-row span { color: var(--text-dim); }
.meta-row code { word-break: break-all; white-space: pre-wrap; }
.review-box { border-top: 1px solid var(--border); margin-top: 14px; padding-top: 14px; display: flex; flex-direction: column; gap: 10px; }
.review-box h4 { font-size: 14px; font-weight: 500; color: var(--gold); }
.review-box label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-dim); }
.review-box textarea { resize: vertical; font-family: inherit; }
.empty { text-align: center; padding: 40px 0; }
@media (max-width: 820px) {
  .evidence-item { grid-template-columns: 1fr; }
  .thumb-wrap { width: 100%; height: 160px; }
  .preview-panel { grid-template-columns: 1fr; height: 92vh; }
}
</style>
