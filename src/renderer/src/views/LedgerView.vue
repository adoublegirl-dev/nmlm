<template>
  <div class="ledger">
    <div class="toolbar">
      <div class="day-nav">
        <button class="btn" :class="{ primary: isToday }" @click="goToday">今天</button>
        <button class="btn" :class="{ primary: isYesterday }" @click="goYesterday">昨天</button>
        <input class="input date-input" type="date" :value="dateValue" :max="todayValue" @change="setDateFromInput($event.target.value)" />
        <span class="day-label">{{ dayLabel(curDate) }}</span>
      </div>
      <div class="actions">
        <button v-if="!recording" class="btn primary" @click="doStart">开始记录</button>
        <template v-else>
          <button class="btn primary" @click="doStop">完成记录</button>
          <button class="btn" @click="doPause">加节点</button>
        </template>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat"><span class="v num">{{ totalText }}</span><span class="l">总时长</span></div>
      <div class="stat"><span class="v num">{{ effectiveText }}</span><span class="l">有效工时</span></div>
      <div class="stat"><span class="v num">{{ fragments }}</span><span class="l">碎片段</span></div>
      <div class="stat"><span class="v num">{{ segments.length }}</span><span class="l">段数</span></div>
    </div>

    <div class="card cutdesk">
      <div class="cutdesk-head">
        <div>
          <h3>今日剪辑台</h3>
          <p class="muted">一条轨道看完这一天，色块是记录，刀口是中途节点。</p>
        </div>
        <div class="zoom-tools">
          <span class="muted num">00:00 – 24:00</span>
          <button class="zoom-btn" :class="{ active: Math.abs(timelineZoom - 1) < 0.01 }" @click="setTimelineZoom(1)">1x</button>
          <button class="zoom-btn" :class="{ active: Math.abs(timelineZoom - 4) < 0.01 }" @click="setTimelineZoom(4)">4x</button>
          <button class="zoom-btn" :class="{ active: Math.abs(timelineZoom - 8) < 0.01 }" @click="setTimelineZoom(8)">8x</button>
          <button class="zoom-btn" :class="{ active: Math.abs(timelineZoom - 32) < 0.01 }" @click="setTimelineZoom(32)">32x</button>
          <span class="zoom-readout num">{{ timelineZoomText }}</span>
        </div>
      </div>
      <div v-if="!segments.length" class="empty muted">这一天还没有记录，按 F8 开始</div>
      <div v-else class="day-timeline" @wheel.prevent="handleTimelineWheel">
        <div
          class="timeline-scroll"
          ref="timelineScroll"
          :class="{ dragging: timelineDragging }"
          @mousedown="startTimelineDrag"
        >
          <div class="timeline-canvas" :style="{ width: timelineCanvasWidth }">
            <div class="ruler">
              <span v-for="tick in timelineTicks" :key="tick.minute" class="ruler-tick" :class="{ major: tick.major, minor: !tick.major }" :style="{ left: tick.left + '%' }">
                <span v-if="tick.label">{{ tick.label }}</span>
              </span>
            </div>
            <div class="master-track">
              <button
                v-for="clip in timelineClips"
                :key="clip.id"
                class="clip"
                :class="{ fragment: clip.is_fragment, micro: clip.duration_sec < 10, running: !clip.end_time }"
                :style="{ left: clip.left + '%', width: clip.width + '%', top: (42 + clip.lane * 28) + 'px', '--clip-color': clip.color }"
                :title="clip.trackTitle"
                @click="openClipFromTimeline(clip)"
              >
                <span class="clip-label">{{ clip.tagName }}</span>
                <span class="clip-time num">{{ clip.startText }} – {{ clip.endText }}</span>
              </button>
              <button
                v-for="node in timelineNodes"
                :key="node.key"
                class="cut-marker"
                :class="{ empty: !node.detail }"
                :style="{ left: node.left + '%' }"
                :title="node.title"
                @click="openClipFromTimeline(node.entry)"
              ><span>{{ node.shortText }}</span></button>
              <span v-if="isToday" class="now-line" :style="{ left: nowLeft + '%' }"><b>现在</b></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card timeline detail-list" :class="{ compact: detailMode === 'single', collapsed: detailMode === 'collapsed' }">
      <div class="detail-head">
        <div>
          <div class="section-title">片段明细</div>
          <div class="muted detail-subtitle">{{ detailMode === 'collapsed' ? '默认收起，需要时展开' : detailMode === 'single' ? '当前选中片段' : '当天全部片段' }}</div>
        </div>
        <div class="detail-actions">
          <button v-if="detailMode === 'single'" class="btn" @click="showAllDetails">展示全部</button>
          <button v-if="detailMode === 'collapsed'" class="btn" @click="showAllDetails">展开明细</button>
          <button v-else class="btn" @click="collapseDetails">收起明细</button>
        </div>
      </div>
      <template v-if="detailMode !== 'collapsed'">
      <div v-if="!displaySegments.length" class="empty muted">没有可编辑片段</div>
      <div
        v-for="(s, idx) in displaySegments"
        :key="s.id"
        class="seg"
        :class="{ expanded: expandedEntryId === s.id }"
        :data-entry-id="s.id"
        :style="{ borderLeftColor: s.color, '--seg-color': s.color, '--i': idx }"
        @click="openInlineEdit(s)"
      >
        <div class="seg-head">
          <span class="date-chip num">{{ s.dateText }}</span>
          <span class="seg-time num">{{ s.startText }} – {{ s.endText }}</span>
          <span class="tag-chip" :style="{ background: s.color + '26', color: s.color }">{{ s.tagName }}</span>
          <span class="seg-dur num">{{ s.durText }}</span>
          <span v-if="s.is_fragment" class="frag muted">碎片</span>
          <span class="pause-chip">节点 × {{ s.pausePoints?.length || 0 }}</span>
          <span v-if="s.detail" class="seg-detail muted">{{ s.detail }}</span>
        </div>
        <div v-if="s.pausePoints?.length" class="pause-summary muted">
          <span v-for="p in s.pausePoints" :key="p.id" class="pause-summary-item">
            {{ p.timeText }}{{ p.detail ? ' · ' + p.detail : ' · 未说明' }}
          </span>
        </div>
        <div v-if="expandedEntryId === s.id" class="inline-edit" @click.stop>
          <div class="edit-time muted num">{{ s.startText }} – {{ s.endText }} · {{ s.durText }}</div>
          <div class="edit-tags">
            <button
              v-for="t in tags" :key="t.id"
              class="edit-tag"
              :class="{ active: editForm.tagId === t.id }"
              :style="{ '--c': t.color }"
              @click="editForm.tagId = t.id"
            >{{ t.name }}</button>
          </div>
          <textarea v-model="editForm.detail" class="input edit-detail" placeholder="写点什么：这段在做什么、为什么被切碎…" rows="3"></textarea>
          <div v-if="s.pausePoints?.length" class="pause-editor">
            <h4>时间节点切分</h4>
            <div class="muted split-hint">节点标签表示“从该节点开始到下一个节点/结束”的标签。不同标签会拆分记录，连续同标签会自动合并。</div>
            <div v-for="p in editForm.pausePoints" :key="p.id" class="pause-edit-row">
              <span class="num">{{ p.timeText }}</span>
              <select class="input pause-select" v-model.number="p.tagId">
                <option v-for="t in tags" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
              <input class="input pause-detail" v-model="p.detail" placeholder="节点文字记录" />
            </div>
          </div>
          <div class="edit-ops">
            <button class="btn" @click="closeEdit">取消</button>
            <button class="btn primary" @click="saveEdit">保存</button>
          </div>
        </div>
      </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { api, on } from '../api'
import { formatDuration, formatTime, formatDate, dayLabel } from '../utils/format'

const DAY_MS = 86400000
const WORK_START_HOUR = 8
const curDate = ref(Date.now())
const segments = ref([])
const recording = ref(false)
const totalSec = ref(0)
const effectiveSec = ref(0)
const fragments = ref(0)
const tags = ref([])
const editEntry = ref(null)
const editForm = ref({ tagId: null, detail: '', pausePoints: [] })
const detailMode = ref('collapsed') // collapsed | single | all
const expandedEntryId = ref(null)
const timelineZoom = ref(2)
const timelineScroll = ref(null)
const timelineDragging = ref(false)
let dragStartX = 0
let dragStartScrollLeft = 0
let dragMoved = false

const isToday = computed(() => new Date(curDate.value).toDateString() === new Date().toDateString())
const isYesterday = computed(() => new Date(curDate.value).toDateString() === new Date(startOfDay(Date.now()) - DAY_MS).toDateString())
const dateValue = computed(() => toDateInput(curDate.value))
const todayValue = computed(() => toDateInput(Date.now()))
const totalText = computed(() => formatDuration(totalSec.value))
const effectiveText = computed(() => formatDuration(effectiveSec.value))
const displaySegments = computed(() => {
  if (detailMode.value === 'all') return segments.value
  if (detailMode.value === 'single' && expandedEntryId.value != null) return segments.value.filter((s) => s.id === expandedEntryId.value)
  return []
})
const timelineCanvasWidth = computed(() => `${Math.max(1, timelineZoom.value) * 100}%`)
const timelineZoomText = computed(() => `${Number(timelineZoom.value).toFixed(timelineZoom.value % 1 ? 1 : 0)}x`)
const timelineTickStep = computed(() => {
  const z = timelineZoom.value
  if (z >= 48) return 1
  if (z >= 24) return 5
  if (z >= 12) return 10
  if (z >= 6) return 15
  if (z >= 3) return 30
  return 60
})
const timelineLabelStep = computed(() => {
  const z = timelineZoom.value
  if (z >= 48) return 5
  if (z >= 24) return 15
  if (z >= 12) return 30
  return 60
})
const timelineTicks = computed(() => {
  const step = timelineTickStep.value
  const labelStep = timelineLabelStep.value
  const ticks = []
  for (let minute = 0; minute <= 1440; minute += step) {
    const hour = Math.floor(minute / 60)
    const min = minute % 60
    const major = min === 0
    const label = minute % labelStep === 0
      ? `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
      : ''
    ticks.push({ minute, left: (minute / 1440) * 100, major, label })
  }
  return ticks
})
const nowLeft = computed(() => {
  const start = startOfDay(curDate.value)
  return clampPct(((Date.now() - start) / DAY_MS) * 100)
})
const timelineClips = computed(() => {
  const start = startOfDay(curDate.value)
  const lanes = []
  return segments.value
    .slice()
    .sort((a, b) => a.start_time - b.start_time)
    .map((s) => {
      const endAt = s.end_time || (s.paused ? s.paused_at : Date.now())
      let lane = lanes.findIndex((laneEnd) => s.start_time >= laneEnd)
      if (lane < 0) {
        lane = lanes.length
        lanes.push(endAt)
      } else {
        lanes[lane] = endAt
      }
      const left = clampPct(((s.start_time - start) / DAY_MS) * 100)
      const width = clampPct(((endAt - s.start_time) / DAY_MS) * 100)
      return { ...s, left, width, lane }
    })
})
const timelineNodes = computed(() => {
  const start = startOfDay(curDate.value)
  return segments.value.flatMap((s) => (s.pausePoints || []).map((p) => ({
    ...p,
    entry: s,
    key: `${s.id}-day-node-${p.id}`,
    left: clampPct(((p.ts - start) / DAY_MS) * 100),
    title: p.detail ? `${p.timeText} · ${p.detail}` : `${p.timeText} · 未说明`
  })))
})

function goToday() {
  curDate.value = Date.now()
  load({ focusWorkStart: true })
}
function goYesterday() {
  curDate.value = startOfDay(Date.now()) - DAY_MS
  load({ focusWorkStart: true })
}
function setDateFromInput(v) {
  if (!v) return
  const ts = new Date(v + 'T00:00:00').getTime()
  const today = startOfDay(Date.now())
  curDate.value = Math.min(ts, today)
  load({ focusWorkStart: true })
}
function clampZoom(v) {
  return Math.max(1, Math.min(64, v))
}
function setTimelineZoom(value, anchorX = null) {
  const el = timelineScroll.value
  if (!el) {
    timelineZoom.value = clampZoom(value)
    return
  }
  const cursorX = anchorX == null ? el.clientWidth / 2 : anchorX
  const beforeWidth = Math.max(1, el.scrollWidth)
  const anchorRatio = (el.scrollLeft + cursorX) / beforeWidth
  timelineZoom.value = clampZoom(value)
  nextTick(() => {
    const afterWidth = Math.max(1, el.scrollWidth)
    el.scrollLeft = Math.max(0, anchorRatio * afterWidth - cursorX)
  })
}
function handleTimelineWheel(e) {
  const el = timelineScroll.value
  if (!el) return
  if (e.shiftKey) {
    el.scrollLeft += e.deltaY || e.deltaX
    return
  }
  const rect = el.getBoundingClientRect()
  const anchorX = e.clientX - rect.left
  const factor = e.deltaY < 0 ? 1.22 : 1 / 1.22
  setTimelineZoom(Math.round(clampZoom(timelineZoom.value * factor) * 10) / 10, anchorX)
}
function startTimelineDrag(e) {
  const el = timelineScroll.value
  if (!el || e.button !== 0) return
  timelineDragging.value = true
  dragMoved = false
  dragStartX = e.clientX
  dragStartScrollLeft = el.scrollLeft
  window.addEventListener('mousemove', moveTimelineDrag)
  window.addEventListener('mouseup', stopTimelineDrag, { once: true })
}
function moveTimelineDrag(e) {
  const el = timelineScroll.value
  if (!timelineDragging.value || !el) return
  const dx = e.clientX - dragStartX
  if (Math.abs(dx) > 3) dragMoved = true
  el.scrollLeft = dragStartScrollLeft - dx
}
function stopTimelineDrag() {
  timelineDragging.value = false
  window.removeEventListener('mousemove', moveTimelineDrag)
  setTimeout(() => { dragMoved = false }, 0)
}
function openClipFromTimeline(clip) {
  if (dragMoved) return
  if (detailMode.value === 'all') {
    openInlineEdit(clip)
    nextTick(() => scrollDetailIntoView(clip.id))
    return
  }
  detailMode.value = 'single'
  openInlineEdit(clip)
  nextTick(() => scrollDetailIntoView(clip.id))
}
function toDateInput(ts) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function load({ focusWorkStart = false } = {}) {
  try {
    const start = startOfDay(curDate.value)
    const end = start + DAY_MS
    const tagRes = await api('tags:list')
    tags.value = tagRes.tags || []
    const tagMap = new Map(tags.value.map((t) => [t.id, t]))
    const r = await api('ledger:list', { start, end })
    const pointsRes = await api('ledger:pausePoints', { start, end }).catch(() => ({ points: [] }))
    const eff = await api('report:effectiveHours', { date: curDate.value })
    const raw = (r.entries || []).slice().sort((a, b) => b.start_time - a.start_time)
    const pointsByEntry = new Map()
    for (const p of pointsRes.points || []) {
      p.timeText = formatTime(p.ts, { seconds: true })
      p.shortText = formatTime(p.ts, { seconds: true })
      if (!pointsByEntry.has(p.entry_id)) pointsByEntry.set(p.entry_id, [])
      pointsByEntry.get(p.entry_id).push(p)
    }
    for (const e of raw) {
      const tag = tagMap.get(e.tag_id) || { name: '未分类', color: '#9D9D9D' }
      e.tagName = tag.name
      e.color = tag.color
      e.pausePoints = pointsByEntry.get(e.id) || []
      e.dateText = formatDate(e.start_time)
      e.durText = formatDuration(e.duration_sec || 0)
      e.startText = formatTime(e.start_time, { seconds: true })
      e.endText = e.end_time ? formatTime(e.end_time, { seconds: true }) : '…'
    }
    // 未完成记录实时刷新；暂停态停在 paused_at，避免视觉上继续跳秒。
    for (const e of raw) {
      if (!e.end_time) {
        const endAt = e.paused ? e.paused_at : Date.now()
        e.durText = formatDuration(Math.floor((endAt - e.start_time) / 1000))
      }
      decorateEntryTimeline(e, tagMap)
    }
    segments.value = raw
    totalSec.value = raw.reduce((s, e) => s + (e.duration_sec || 0), 0)
    effectiveSec.value = eff.sec
    fragments.value = raw.filter((e) => e.is_fragment).length
    const cur = await api('ledger:current')
    recording.value = !!cur.entry
    if (focusWorkStart) await nextTick(scrollTimelineToWorkStart)
  } catch (e) {
    /* 静默 */
  }
}

function decorateEntryTimeline(entry, tagMap) {
  const trackEnd = entry.end_time || (entry.paused ? entry.paused_at : Date.now())
  const totalMs = Math.max(1, trackEnd - entry.start_time)
  const cleanPoints = (entry.pausePoints || [])
    .filter((p) => p.ts > entry.start_time && p.ts < trackEnd)
    .sort((a, b) => a.ts - b.ts)

  entry.pausePoints = cleanPoints.map((p) => ({
    ...p,
    left: clampPct(((p.ts - entry.start_time) / totalMs) * 100)
  }))

  const boundaries = [entry.start_time, ...entry.pausePoints.map((p) => p.ts), trackEnd]
  entry.timelineSlices = []
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const sliceStart = boundaries[i]
    const sliceEnd = boundaries[i + 1]
    if (sliceEnd <= sliceStart) continue
    const fromPoint = i === 0 ? null : entry.pausePoints[i - 1]
    const sliceTag = tagMap.get(fromPoint?.tag_id) || tagMap.get(entry.tag_id) || { name: '未分类', color: '#9D9D9D' }
    const left = clampPct(((sliceStart - entry.start_time) / totalMs) * 100)
    const width = Math.max(1.2, clampPct(((sliceEnd - sliceStart) / totalMs) * 100))
    entry.timelineSlices.push({
      key: `${entry.id}-${i}-${sliceStart}`,
      left,
      width,
      color: sliceTag.color,
      fromPause: !!fromPoint,
      title: `${formatTime(sliceStart)} – ${formatTime(sliceEnd)} · ${sliceTag.name}${fromPoint?.detail ? ' · ' + fromPoint.detail : ''}`
    })
  }
  if (!entry.timelineSlices.length) {
    entry.timelineSlices.push({ key: `${entry.id}-empty`, left: 0, width: 100, color: entry.color, fromPause: false, title: entry.tagName })
  }
  entry.timeNodes = [
    {
      key: `${entry.id}-start`,
      type: 'start',
      left: 0,
      shortText: entry.startText.slice(0, 5),
      title: `${entry.startText} · 开始 · ${entry.tagName}`
    },
    ...entry.pausePoints.map((p) => ({
      key: `${entry.id}-pause-${p.id}`,
      type: 'pause',
      left: p.left,
      shortText: p.shortText,
      detail: p.detail,
      title: p.detail ? `${p.timeText} · 节点 · ${p.detail}` : `${p.timeText} · 节点 · 未填写说明`
    })),
    {
      key: `${entry.id}-end`,
      type: entry.end_time ? 'end' : 'now',
      left: 100,
      shortText: entry.end_time ? entry.endText.slice(0, 5) : '现在',
      title: entry.end_time ? `${entry.endText} · 结束` : '进行中 · 当前时间'
    }
  ]
  entry.nodeCount = entry.timeNodes.length
  entry.trackTitle = `${entry.startText} – ${entry.endText} · ${entry.durText}`
}

function scrollTimelineToWorkStart() {
  const el = timelineScroll.value
  if (!el) return
  const hourRatio = WORK_START_HOUR / 24
  const target = el.scrollWidth * hourRatio
  const max = Math.max(0, el.scrollWidth - el.clientWidth)
  el.scrollLeft = Math.max(0, Math.min(max, target))
}

function clampPct(n) {
  return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0))
}

function startOfDay(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

async function doStart() {
  await api('ledger:start')
  load()
}
async function doStop() {
  await api('ledger:complete')
  load()
}
async function doPause() {
  await api('ledger:addPausePoint')
  load()
}

function fillEditForm(s) {
  editEntry.value = s
  editForm.value = {
    tagId: s.tag_id,
    detail: s.detail || '',
    pausePoints: (s.pausePoints || []).map((p) => ({
      id: p.id,
      timeText: p.timeText,
      tagId: p.tag_id == null ? s.tag_id : p.tag_id,
      detail: p.detail || ''
    }))
  }
}
function openInlineEdit(s) {
  if (detailMode.value === 'collapsed') detailMode.value = 'single'
  expandedEntryId.value = s.id
  fillEditForm(s)
}
function showAllDetails() {
  detailMode.value = 'all'
  expandedEntryId.value = null
  editEntry.value = null
}
function collapseDetails() {
  detailMode.value = 'collapsed'
  expandedEntryId.value = null
  editEntry.value = null
}
function scrollDetailIntoView(id) {
  const el = document.querySelector(`[data-entry-id="${id}"]`)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
function closeEdit() {
  expandedEntryId.value = null
  editEntry.value = null
}
async function saveEdit() {
  if (!editEntry.value) return
  const detail = editForm.value.detail.trim() || null
  if (!editForm.value.pausePoints.length) {
    const r = await api('ledger:retag', {
      id: editEntry.value.id,
      tagId: editForm.value.tagId,
      detail
    })
    if (!r.ok) return alert(r.error || '保存失败')
  } else {
    const baseTag = editForm.value.tagId
    const willSplit = editForm.value.pausePoints.some((p) => Number(p.tagId) !== Number(baseTag))
    if (willSplit) {
      const ok = confirm('时间节点中存在与当前记录不同的标签。确认后，当前记录将按节点拆分成多条，并自动合并连续相同标签。')
      if (!ok) return
    }
    const r = await api('ledger:applyPausePointPlan', {
      entryId: editEntry.value.id,
      baseTagId: editForm.value.tagId,
      detail,
      points: editForm.value.pausePoints.map((p) => ({ id: p.id, tagId: p.tagId, detail: p.detail?.trim() || null }))
    })
    if (!r.ok) return alert(r.error || '保存失败')
    if (r.split) alert('已按时间节点拆分并刷新台账')
  }
  expandedEntryId.value = null
  editEntry.value = null
  await load()
}

let off = null
onMounted(() => {
  load({ focusWorkStart: true })
  off = on('ledger:state-changed', () => load())
})
onBeforeUnmount(() => {
  if (off) off()
  window.removeEventListener('mousemove', moveTimelineDrag)
})
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
.day-nav { display: flex; align-items: center; gap: 8px; }
.day-label { font-size: 16px; font-weight: 500; min-width: 72px; text-align: center; }
.date-input { width: 138px; }
.actions { display: flex; gap: 8px; }
.stats-row { display: flex; gap: 24px; margin-bottom: 16px; flex-wrap: wrap; }
.stat { display: flex; flex-direction: column; }
.stat .v { font-size: 22px; font-weight: 600; color: var(--gold); }
.stat .l { font-size: 12px; color: var(--text-dim); }
.cutdesk { margin-bottom: 16px; }
.cutdesk-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
.cutdesk-head h3 { font-size: 15px; font-weight: 500; margin: 0 0 4px; }
.cutdesk-head p { font-size: 12px; margin: 0; }
.zoom-tools { display: flex; align-items: center; gap: 6px; padding-top: 1px; }
.zoom-tools .muted { font-size: 12px; margin-right: 2px; }
.zoom-btn { height: 24px; padding: 0 8px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--text-dim); font-size: 11px; cursor: pointer; }
.zoom-btn.active { color: var(--gold); border-color: rgba(224,188,114,0.55); background: rgba(224,188,114,0.10); }
.zoom-readout { min-width: 38px; font-size: 11px; color: var(--gold); text-align: right; }
.day-timeline { border: 1px solid var(--border); border-radius: 14px; background: rgba(255,255,255,0.035); overflow: hidden; }
.timeline-scroll { overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; cursor: grab; user-select: none; }
.timeline-scroll.dragging { cursor: grabbing; }
.timeline-scroll::-webkit-scrollbar { height: 8px; }
.timeline-scroll::-webkit-scrollbar-thumb { background: rgba(224,188,114,0.26); border-radius: 999px; }
.timeline-canvas { min-width: 100%; }
.ruler { position: relative; height: 34px; border-bottom: 1px solid var(--border); background: rgba(255,255,255,0.025); }
.ruler-tick { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,0.08); }
.ruler-tick.minor { bottom: 10px; background: rgba(255,255,255,0.045); }
.ruler-tick.major { background: rgba(224,188,114,0.24); }
.ruler-tick span { position: absolute; top: 9px; left: 4px; font-size: 10px; color: var(--text-dim); font-variant-numeric: tabular-nums; }
.master-track { position: relative; height: 188px; background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.08)); }
.master-track::before { content: ''; position: absolute; left: 0; right: 0; top: 96px; height: 1px; background: rgba(224,188,114,0.18); }
.clip { position: absolute; height: 22px; min-width: 0; border: 1px solid color-mix(in srgb, var(--clip-color) 72%, transparent); border-radius: 7px; background: color-mix(in srgb, var(--clip-color) 78%, rgba(32,35,41,0.94)); color: #fffaf0; cursor: pointer; overflow: hidden; text-align: left; padding: 3px 7px; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.10); }
.clip:hover { filter: brightness(1.08); }
.clip::before { content: ''; position: absolute; inset: 0; pointer-events: none; background-image: repeating-linear-gradient(135deg, rgba(255,255,255,.16) 0 3px, transparent 3px 7px); opacity: .28; }
.clip.fragment { border-style: dashed; }
.clip.micro { min-width: 1px; padding-left: 0; padding-right: 0; border-radius: 3px; }
.clip.running { outline: 1px solid rgba(224,188,114,0.72); }
.clip-label { position: relative; z-index: 1; display: inline; font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.clip-time { position: relative; z-index: 1; display: inline; margin-left: 5px; font-size: 10px; opacity: .72; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.clip.micro .clip-label,
.clip.micro .clip-time { opacity: 0; }
.cut-marker { position: absolute; top: 36px; height: 118px; width: 1px; padding: 0; border: 0; border-left: 1px dashed rgba(224,188,114,0.48); background: transparent; color: var(--gold); cursor: pointer; font-size: 10px; opacity: .88; }
.cut-marker::after { content: ''; position: absolute; left: -4px; top: -4px; width: 7px; height: 7px; transform: rotate(45deg); border-radius: 1px; background: var(--gold); }
.cut-marker span { position: absolute; left: 8px; top: -9px; opacity: 0; white-space: nowrap; padding: 1px 5px; border-radius: 999px; background: rgba(32,35,41,.96); color: var(--gold); border: 1px solid rgba(224,188,114,.36); pointer-events: none; transition: opacity .12s ease; }
.cut-marker:hover span { opacity: 1; }
.cut-marker.empty { border-left-color: rgba(241,162,143,0.68); color: #f1a28f; }
.cut-marker.empty::after { background: #f1a28f; }
.cut-marker.empty span { color: #f1a28f; border-color: rgba(241,162,143,.38); }
.now-line { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(127,169,140,0.88); }
.now-line b { position: absolute; top: 9px; left: 6px; font-size: 10px; color: var(--green); font-weight: 500; white-space: nowrap; }
.section-title { font-size: 13px; color: var(--gold); margin-bottom: 3px; }
.detail-toggle { margin-top: 0; }
.detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.detail-actions { display: flex; gap: 8px; }
.detail-subtitle { font-size: 12px; }
.timeline { display: flex; flex-direction: column; gap: 10px; }
.detail-list { margin-top: 0; overflow: hidden; }
.seg { border-left: 3px solid; padding: 9px 10px 9px 12px; cursor: pointer; border-radius: 8px; animation: detailCascade .34s cubic-bezier(.2,1.25,.35,1) both; animation-delay: calc(var(--i) * 28ms); transform-origin: top left; }
.seg:hover { background: var(--bg-hover); }
.seg.expanded { background: color-mix(in srgb, var(--seg-color) 9%, transparent); outline: 1px solid color-mix(in srgb, var(--seg-color) 62%, transparent); box-shadow: inset 0 0 0 1px rgba(255,255,255,.06); }
.seg-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.date-chip { font-size: 12px; color: var(--green); background: rgba(127,169,140,0.12); border: 1px solid rgba(127,169,140,0.25); padding: 1px 7px; border-radius: 999px; }
.seg-time { font-size: 13px; color: var(--text-dim); }
.start-chip { font-size: 12px; }
.seg-dur { font-size: 13px; font-weight: 500; }
.frag { font-size: 12px; }
.pause-chip { font-size: 12px; color: var(--gold); background: rgba(224,188,114,0.12); border: 1px solid rgba(224,188,114,0.28); padding: 1px 7px; border-radius: 999px; }
.entry-track {
  position: relative;
  height: 38px;
  margin-top: 8px;
  border-radius: 10px;
  background: rgba(255,255,255,0.045);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
}
.track-slice {
  position: absolute;
  top: 22px;
  height: 8px;
  min-width: 2px;
  border-radius: 999px;
  opacity: .9;
}
.track-slice.marked {
  opacity: .72;
  background-image: repeating-linear-gradient(135deg, rgba(255,255,255,.16) 0 5px, transparent 5px 10px);
}
.track-marker {
  position: absolute;
  top: 4px;
  transform: translateX(-50%);
  height: 18px;
  min-width: 34px;
  padding: 0 5px;
  border-radius: 999px;
  border: 1px solid rgba(224,188,114,0.45);
  background: rgba(32,35,41,.96);
  color: var(--gold);
  font-size: 10px;
  line-height: 16px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,.18);
}
.track-marker::before {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -8px;
  width: 1px;
  height: 8px;
  background: rgba(224,188,114,0.6);
}
.track-marker.start,
.track-marker.end,
.track-marker.now {
  min-width: 34px;
  color: var(--text-dim);
  border-color: rgba(255,255,255,.16);
  background: rgba(32,35,41,.82);
  cursor: default;
}
.track-marker.start { transform: translateX(0); }
.track-marker.end,
.track-marker.now { transform: translateX(-100%); }
.track-marker.now { color: var(--green); border-color: rgba(127,169,140,.42); }
.track-marker.empty {
  color: #f1a28f;
  border-color: rgba(241,162,143,.45);
}
.pause-summary { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; font-size: 11px; }
.pause-summary-item { max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.seg-detail { margin-top: 4px; font-size: 12px; }
.empty { text-align: center; padding: 40px 0; }
.inline-edit { margin-top: 10px; padding: 12px; border-radius: 9px; border: 1px solid color-mix(in srgb, var(--seg-color) 48%, transparent); background: rgba(0,0,0,.10); display: flex; flex-direction: column; gap: 12px; animation: inlineUnfold .28s cubic-bezier(.2,1.2,.35,1) both; }
@keyframes detailCascade {
  0% { opacity: 0; transform: translateY(-8px) rotateX(-10deg); }
  72% { opacity: 1; transform: translateY(1px) rotateX(1deg); }
  100% { opacity: 1; transform: translateY(0) rotateX(0); }
}
@keyframes inlineUnfold {
  0% { opacity: 0; transform: translateY(-6px); }
  100% { opacity: 1; transform: translateY(0); }
}
.edit-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.edit-tag {
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--c) 12%, transparent);
  color: var(--text-main);
  font-size: 13px;
  cursor: pointer;
}
.edit-tag.active { outline: 2px solid var(--c); }
.edit-detail { resize: vertical; font-family: inherit; }
.pause-editor { border-top: 1px solid var(--border); padding-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.pause-editor h4 { font-size: 13px; font-weight: 500; color: var(--gold); }
.split-hint { font-size: 12px; line-height: 1.5; }
.pause-edit-row { display: flex; align-items: center; gap: 8px; }
.pause-edit-row .num { width: 62px; color: var(--text-dim); }
.pause-select { width: 130px; }
.pause-detail { flex: 1; min-width: 160px; }
.edit-ops { display: flex; justify-content: flex-end; gap: 8px; }
</style>
