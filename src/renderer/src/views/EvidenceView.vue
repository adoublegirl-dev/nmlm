<template>
  <div class="evidence">
    <div class="toolbar">
      <div class="title">
        <h2>证据工作台</h2>
        <span class="muted">快捷键 F10 随时截图存证；原始证据进入 raw 目录，不加水印、不覆盖。</span>
      </div>
      <div class="toolbar-actions">
        <button class="btn" @click="openExportDialog">生成证据链</button>
        <button class="btn" @click="openImportDialog" :disabled="importing">{{ importing ? '导入中…' : '导入材料' }}</button>
      </div>
    </div>

    <div class="notice card">
      <strong>原件保险柜</strong>
      <span>当前 P1 只做安全入库与基础索引。AI 分析、复核、导出水印副本会在后续阶段接入；raw 原件不会被修改。</span>
    </div>

    <div class="filters">
      <button class="btn" @click="shift(-1)">←</button>
      <input class="input date-input" type="date" :value="dateValue" :max="todayValue" @change="setDateFromInput($event.target.value)" />
      <button class="btn" @click="shift(1)" :disabled="isToday">→</button>
      <span class="muted">{{ formatDate(curDate) }}</span>
      <select class="input filter-select" v-model="filterStatus">
        <option value="all">全部状态</option>
        <option value="pending_review">待复核</option>
        <option value="reviewed">已确认</option>
        <option value="unsupported">无法处理</option>
        <option value="invalid">无效材料</option>
      </select>
      <select class="input filter-select" v-model="filterType">
        <option value="all">全部类型</option>
        <option value="screenshot">截图</option>
        <option value="image">图片</option>
        <option value="text">文本</option>
        <option value="pdf">PDF</option>
        <option value="docx">DOCX</option>
        <option value="xlsx">XLSX</option>
        <option value="video">视频</option>
        <option value="audio">音频</option>
        <option value="archive">压缩包</option>
        <option value="unknown">未知</option>
      </select>
      <select class="input filter-select" v-model="filterLinked">
        <option value="all">全部关联</option>
        <option value="linked">已关联台账</option>
        <option value="unlinked">未关联台账</option>
      </select>
    </div>

    <div v-if="!filteredItems.length" class="card empty muted">这一天没有符合条件的证据</div>
    <div v-else class="evidence-list">
      <div v-for="s in filteredItems" :key="s.evidence_id || s.id" class="evidence-item card" @click="preview(s)">
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
          <div class="meta-line muted">{{ typeLabel(s) }} · {{ sizeText(s.size_bytes) }} · {{ absolutePath(s) }}</div>
          <div v-if="s.sha256" class="hash-line num">sha256 {{ s.sha256.slice(0, 16) }}…</div>
          <div v-if="s.ledger_entry_id || s.entry_id" class="meta-line muted">关联台账 {{ ledgerEntryLabel(s.ledger_entry_id || s.entry_id) }}</div>
        </div>
      </div>
    </div>

    <div v-if="exportingEvidence" class="preview-mask" @click="exportingEvidence = false">
      <div class="import-date-panel card" @click.stop>
        <h3>生成证据链 Markdown</h3>
        <p class="muted">支持单日或多日导出。当前版本先汇总原始材料、人工复核、未处理说明，不接 AI 分析。</p>
        <label>标题<input class="input" v-model="exportForm.title" /></label>
        <label>开始日期<input class="input" type="date" v-model="exportForm.startDate" :max="todayValue" /></label>
        <label>结束日期<input class="input" type="date" v-model="exportForm.endDate" :max="todayValue" /></label>
        <label>包含证据
          <select class="input" v-model="exportForm.includeStatus">
            <option value="reviewed">仅已确认</option>
            <option value="active">已确认 + 待复核/已入库</option>
            <option value="all">全部</option>
          </select>
        </label>
        <div class="import-date-actions">
          <button class="btn" @click="exportingEvidence = false">取消</button>
          <button class="btn primary" @click="exportMarkdown">导出 Markdown</button>
        </div>
      </div>
    </div>

    <div v-if="choosingImportDate" class="preview-mask" @click="choosingImportDate = false">
      <div class="import-date-panel card" @click.stop>
        <h3>选择证据归档日期</h3>
        <p class="muted">导入的材料会进入所选日期的 files/YYYY/MM/DD/raw 目录，原文件不会被修改。</p>
        <input class="input" type="date" v-model="importDate" :max="todayValue" />
        <div class="import-date-actions">
          <button class="btn" @click="choosingImportDate = false">取消</button>
          <button class="btn primary" @click="importFiles" :disabled="importing || !importDate">选择文件</button>
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
          <div class="meta-row path">
            <span>原件路径</span>
            <code>{{ absolutePath(previewing) }}</code>
            <button class="btn folder-btn" @click="openEvidenceFolder(previewing)">打开所在文件夹</button>
          </div>

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
            <label>标签
              <select class="input" v-model="reviewForm.tagId">
                <option :value="''">未关联标签</option>
                <option v-for="t in tags" :key="t.id" :value="String(t.id)">{{ t.name }}</option>
              </select>
            </label>
            <label>关联台账
              <select class="input" v-model="reviewForm.ledgerEntryId">
                <option :value="''">未关联台账</option>
                <option v-for="e in ledgerEntries" :key="e.id" :value="String(e.id)">{{ ledgerEntryLabel(e.id) }}</option>
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
const ledgerEntries = ref([])
const tags = ref([])
const filterStatus = ref('all')
const filterType = ref('all')
const filterLinked = ref('all')
const capturing = ref(false)
const importing = ref(false)
const choosingImportDate = ref(false)
const importDate = ref('')
const exportingEvidence = ref(false)
const exportForm = ref({ title: '加班证据链', startDate: '', endDate: '', includeStatus: 'reviewed' })
const previewing = ref(null)
const reviewForm = ref({ title: '', status: 'pending_review', tagId: '', ledgerEntryId: '', userNote: '' })
const previewUrl = computed(() => {
  if (!previewing.value) return ''
  return previewing.value.webPath || previewing.value.file_path?.replace(/\\/g, '/') || ''
})
const todayValue = computed(() => toDateInput(Date.now()))
const dateValue = computed(() => toDateInput(curDate.value))
const isToday = computed(() => startOfDay(curDate.value) >= startOfDay(Date.now()))
const filteredItems = computed(() => items.value.filter((s) => {
  if (filterStatus.value !== 'all' && effectiveStatus(s) !== filterStatus.value) return false
  if (filterType.value !== 'all' && s.type !== filterType.value) return false
  const linked = !!(s.ledger_entry_id || s.entry_id)
  if (filterLinked.value === 'linked' && !linked) return false
  if (filterLinked.value === 'unlinked' && linked) return false
  return true
}))

function isImage(s) {
  const t = s.mime_type || ''
  const p = s.file_path || s.original_path || ''
  return t.startsWith('image/') || /\.(png|jpg|jpeg|webp)$/i.test(p)
}
function effectiveStatus(s) {
  const status = s?.status
  if (status === 'captured' || status === 'imported') return 'pending_review'
  return status || 'pending_review'
}
function statusLabel(status) {
  const map = { captured: '待复核', imported: '待复核', pending_review: '待复核', legacy: '旧记录', reviewed: '已确认', invalid: '无效材料', unsupported: '无法处理' }
  return map[status] || status || '待复核'
}
function typeLabel(s) {
  const map = { screenshot: '截图', image: '图片', pdf: 'PDF', text: '文本', docx: 'DOCX', xlsx: 'XLSX', video: '视频', audio: '音频', archive: '压缩包', unknown: '未知' }
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
function absolutePath(s) {
  const p = s.file_path || s.original_path
  if (p && !looksGarbled(p)) return p
  const rel = s.relative_path
  if (rel && !looksGarbled(rel)) return rel
  const name = basename(p)
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
function startOfDay(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
function toDateInput(ts) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function shift(d) {
  const today = startOfDay(Date.now())
  curDate.value = Math.min(startOfDay(curDate.value) + d * DAY_MS, today)
  load()
}
function setDateFromInput(v) {
  if (!v) return
  const ts = new Date(v + 'T00:00:00').getTime()
  curDate.value = Math.min(ts, startOfDay(Date.now()))
  load()
}
function ledgerEntryLabel(id) {
  const e = ledgerEntries.value.find((x) => String(x.id) === String(id))
  if (!e) return `#${id}`
  const start = timeOf(e.start_time)
  const end = e.end_time ? timeOf(e.end_time) : '进行中'
  const tag = tags.value.find((t) => t.id === e.tag_id)?.name || '未分类'
  return `#${e.id} ${start}-${end} · ${tag}`
}
async function load() {
  const d = new Date(curDate.value)
  d.setHours(0, 0, 0, 0)
  const start = d.getTime()
  const end = start + DAY_MS
  const [r, ledgerRes, tagRes] = await Promise.all([
    api('evidence:list', { start, end }),
    api('ledger:list', { start, end }).catch(() => ({ entries: [] })),
    api('tags:list').catch(() => ({ tags: [] }))
  ])
  items.value = r.screenshots || r.items || []
  ledgerEntries.value = ledgerRes.entries || []
  tags.value = tagRes.tags || []
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
function archiveTimeFromDateInput(v) {
  const base = new Date(v + 'T00:00:00')
  const today = startOfDay(Date.now())
  if (startOfDay(base.getTime()) > today) return null
  const now = new Date()
  base.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds())
  return base.getTime()
}
function openImportDialog() {
  importDate.value = dateValue.value
  choosingImportDate.value = true
}
function openExportDialog() {
  exportForm.value = { title: '加班证据链', startDate: dateValue.value, endDate: dateValue.value, includeStatus: 'reviewed' }
  exportingEvidence.value = true
}
async function exportMarkdown() {
  const start = new Date(exportForm.value.startDate + 'T00:00:00').getTime()
  const end = new Date(exportForm.value.endDate + 'T00:00:00').getTime() + DAY_MS
  if (!exportForm.value.startDate || !exportForm.value.endDate || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    alert('导出日期范围不合法')
    return
  }
  if (startOfDay(start) > startOfDay(Date.now()) || startOfDay(end - DAY_MS) > startOfDay(Date.now())) {
    alert('不能导出未来日期的证据链')
    return
  }
  try {
    const r = await api('evidence:exportMarkdown', {
      start,
      end,
      title: exportForm.value.title.trim() || '加班证据链',
      includeStatus: exportForm.value.includeStatus
    })
    exportingEvidence.value = false
    alert(`已生成证据链：${r.markdownPath}`)
  } catch (e) {
    alert(`导出失败：${e.message}`)
  }
}
async function importFiles() {
  if (!importDate.value) return
  const evidenceDate = archiveTimeFromDateInput(importDate.value)
  if (!evidenceDate) {
    alert('不能导入到未来日期的证据目录')
    return
  }
  importing.value = true
  try {
    await api('evidence:import', { evidenceDate })
    choosingImportDate.value = false
    curDate.value = new Date(importDate.value + 'T00:00:00').getTime()
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
    tagId: s.tag_id ? String(s.tag_id) : '',
    ledgerEntryId: (s.ledger_entry_id || s.entry_id) ? String(s.ledger_entry_id || s.entry_id) : '',
    userNote: s.user_note || s.review_note || ''
  }
}
async function openEvidenceFolder(s) {
  if (!s) return
  try {
    await api('evidence:openFolder', { id: s.evidence_id || null, filePath: s.file_path || s.original_path || null })
  } catch (e) {
    alert(`打开失败：${e.message}`)
  }
}
async function saveReview() {
  if (!previewing.value?.evidence_id) return
  try {
    const r = await api('evidence:update', {
      id: previewing.value.evidence_id,
      title: reviewForm.value.title.trim() || null,
      status: reviewForm.value.status,
      tagId: reviewForm.value.tagId ? Number(reviewForm.value.tagId) : null,
      ledgerEntryId: reviewForm.value.ledgerEntryId ? Number(reviewForm.value.ledgerEntryId) : null,
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
.filters { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.date-input { width: 150px; flex: 0 0 150px; }
.filter-select { width: 132px; flex: 0 0 132px; }
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
.import-date-panel { width: min(420px, 92vw); display: flex; flex-direction: column; gap: 14px; }
.import-date-panel h3 { font-size: 16px; font-weight: 500; color: var(--gold); }
.import-date-panel label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-dim); }
.import-date-actions { display: flex; justify-content: flex-end; gap: 8px; }
.preview-main { min-width: 0; min-height: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.28); border-radius: 14px; overflow: hidden; }
.preview-img { max-width: 100%; max-height: 100%; object-fit: contain; }
.preview-file { color: var(--gold); font-size: 22px; }
.preview-meta { padding: 16px; overflow: auto; }
.preview-meta h3 { font-size: 16px; font-weight: 500; color: var(--gold); margin-bottom: 14px; }
.meta-row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; font-size: 12px; }
.meta-row span { color: var(--text-dim); }
.meta-row code { word-break: break-all; white-space: pre-wrap; }
.folder-btn { align-self: flex-start; margin-top: 4px; }
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
