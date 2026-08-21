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
        <button class="btn" @click="openManualCreate">补记一段</button>
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
          <p class="muted">一条轨道看完这一天：实体色块是正式台账，半透明虚线是活动轨迹线索。</p>
        </div>
        <div class="zoom-tools">
          <span class="muted num">00:00 – 24:00</span>
          <button class="zoom-btn" :class="{ active: Math.abs(timelineZoom - 1) < 0.01 }" @click="setTimelineZoom(1)">1x</button>
          <button class="zoom-btn" :class="{ active: Math.abs(timelineZoom - 4) < 0.01 }" @click="setTimelineZoom(4)">4x</button>
          <button class="zoom-btn" :class="{ active: Math.abs(timelineZoom - 8) < 0.01 }" @click="setTimelineZoom(8)">8x</button>
          <button class="zoom-btn" :class="{ active: Math.abs(timelineZoom - 32) < 0.01 }" @click="setTimelineZoom(32)">32x</button>
          <span class="zoom-readout num">{{ timelineZoomText }}</span>
          <button class="zoom-btn activity-toggle" :class="{ active: showActivityTrack }" @click="showActivityTrack = !showActivityTrack">{{ showActivityTrack ? '隐藏轨迹' : '显示轨迹' }}</button>
        </div>
      </div>
      <div v-if="!segments.length && !activitySuggestions.length" class="empty muted">这一天还没有记录，也还没有活动轨迹</div>
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
                :class="{ fragment: clip.is_fragment, micro: clip.duration_sec < 10, running: !clip.end_time, adjustable: canDragClip(clip), resizing: clip.resizing, snap: clip.snap }"
                :style="{ left: clip.left + '%', width: clip.width + '%', top: (42 + clip.lane * 28) + 'px', '--clip-color': clip.color }"
                :title="clip.crossDay ? `${clip.trackTitle}\n跨天原始：${clip.actualRangeText}` : clip.trackTitle"
                @click="openClipFromTimeline(clip)"
              >
                <span v-if="canDragClip(clip)" class="clip-resize left" title="拖动调整开始时间" @mousedown.stop.prevent="startClipResize($event, clip, 'start')"></span>
                <span class="clip-label">{{ clip.tagName }}</span>
                <span class="clip-time num">{{ clip.startText }} – {{ clip.endText }}</span>
                <span v-if="canDragClip(clip)" class="clip-resize right" title="拖动调整结束时间" @mousedown.stop.prevent="startClipResize($event, clip, 'end')"></span>
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
              <template v-if="showActivityTrack">
                <div class="activity-lane-label">活动轨迹</div>
                <button
                  v-for="a in activityClips"
                  :key="a.signature"
                  class="activity-clip"
                  :class="[a.kind, { idle: a.isIdle }]"
                  :style="{ left: a.left + '%', width: a.width + '%' }"
                  :title="a.titleText"
                  @click="focusActivitySuggestion(a.signature)"
                >
                  <span class="activity-dot"></span>
                  <span class="activity-text">{{ a.shortLabel }}</span>
                </button>
              </template>
              <span v-if="isToday" class="now-line" :style="{ left: nowLeft + '%' }"><b>现在</b></span>
            </div>
          </div>
        </div>
      </div>
      <div v-if="actionableActivitySuggestions.length" class="activity-panel" :class="{ collapsed: activityPanelCollapsed }">
        <div class="activity-panel-head">
          <div>
            <div class="section-title">活动线索 <span class="activity-count">{{ activitySummaryText }}</span></div>
            <div class="muted activity-help">轨迹只作为参考流水，不自动计入工时；补记时会按空白区间裁剪。</div>
          </div>
          <button class="btn small" @click="activityPanelCollapsed = !activityPanelCollapsed">{{ activityPanelCollapsed ? '展开处理' : '收起线索' }}</button>
        </div>
        <div v-if="!activityPanelCollapsed" class="activity-rows">
        <div
          v-for="a in actionableActivitySuggestions"
          :key="a.signature"
          class="activity-row"
          :class="a.kind"
          :data-activity-signature="a.signature"
        >
          <div class="activity-main">
            <span class="activity-kind">{{ activityKindText(a) }}</span>
            <span class="num activity-time">{{ formatActivityRange(a) }}</span>
            <span class="activity-title">{{ a.title || a.processName || '未知活动' }}</span>
            <span class="muted">{{ formatDuration(a.durationSec) }}</span>
          </div>
          <div class="activity-controls">
            <template v-if="a.kind === 'unrecorded_active'">
              <select class="input activity-select" v-model.number="activityForms[a.signature].tagId">
                <option v-for="t in tags" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
              <input class="input activity-note" v-model="activityForms[a.signature].detail" placeholder="补记备注，可留空" />
              <button class="btn small primary" @click="convertActivityToLedger(a)">补记为台账</button>
            </template>
            <template v-else-if="a.kind === 'idle_inside_entry'">
              <button class="btn small primary" @click="applyActivityIdleBreak(a)">按轨迹切分</button>
            </template>
            <button class="btn small" @click="ignoreActivity(a)">忽略</button>
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
          <span v-if="s.crossDay" class="cross-chip" :title="s.actualRangeText">跨天</span>
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
          <div class="edit-time muted num">
            {{ s.startText }} – {{ s.endText }} · {{ s.durText }}
            <span v-if="s.crossDay"> · 原始 {{ s.actualRangeText }}</span>
          </div>
          <div v-if="s.end_time" class="time-calibrate">
            <label>实际开始
              <input class="input time-input" type="datetime-local" step="1" v-model="editForm.startValue" />
            </label>
            <label>实际结束
              <input class="input time-input" type="datetime-local" step="1" v-model="editForm.endValue" />
            </label>
          </div>
          <div v-else class="muted split-hint">进行中的记录请先完成，再校准起止时间。</div>
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
          <div v-if="s.end_time" class="pause-editor">
            <div class="pause-editor-head">
              <h4>时间节点切分</h4>
              <button class="btn small" @click="addDraftPausePoint">+ 添加切点</button>
            </div>
            <div class="muted split-hint">切点表示“从这个时间点开始进入新标签”。不同标签会拆分记录，连续同标签会自动合并。</div>
            <div v-if="!editForm.pausePoints.length" class="muted split-hint">还没有切点，可以添加一个时间点来事后拆分这段记录。</div>
            <div v-for="p in editForm.pausePoints" :key="p.id" class="pause-edit-row">
              <input class="input pause-time-input" type="datetime-local" step="1" v-model="p.timeValue" />
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

    <div v-if="manualOpen" class="manual-mask" @click="closeManualCreate">
      <div class="manual-card card" @click.stop>
        <div class="manual-head">
          <h3>补记一段</h3>
          <span class="muted">用于事后补录忘记开启计时器的工作片段。</span>
        </div>
        <div class="manual-grid">
          <label>开始时间
            <input class="input" type="datetime-local" step="1" v-model="manualForm.startValue" />
          </label>
          <label>结束时间
            <input class="input" type="datetime-local" step="1" v-model="manualForm.endValue" />
          </label>
          <label>标签
            <select class="input" v-model.number="manualForm.tagId">
              <option v-for="t in tags" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </label>
          <label>备注
            <textarea class="input" rows="3" v-model="manualForm.detail" placeholder="这段在做什么…"></textarea>
          </label>
        </div>
        <div class="edit-ops">
          <button class="btn" @click="closeManualCreate">取消</button>
          <button class="btn primary" @click="saveManualCreate">保存补记</button>
        </div>
      </div>
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
const activitySuggestions = ref([])
const activityForms = ref({})
const activityPanelCollapsed = ref(true)
const showActivityTrack = ref(true)
const recording = ref(false)
const totalSec = ref(0)
const effectiveSec = ref(0)
const fragments = ref(0)
const tags = ref([])
const editEntry = ref(null)
const editForm = ref({ tagId: null, detail: '', startValue: '', endValue: '', pausePoints: [] })
const manualOpen = ref(false)
const manualForm = ref({ startValue: '', endValue: '', tagId: null, detail: '' })
const detailMode = ref('collapsed') // collapsed | single | all
const expandedEntryId = ref(null)
const timelineZoom = ref(2)
const timelineScroll = ref(null)
const timelineDragging = ref(false)
let dragStartX = 0
let dragStartScrollLeft = 0
let dragMoved = false
const resizePreview = ref(null) // { id, edge, startTime, endTime, snap }
let resizingClip = null
let resizeEdge = null
let resizeGuide = null

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
      const preview = resizePreview.value && resizePreview.value.id === s.id ? resizePreview.value : null
      const endAt = preview ? preview.endTime : (s.viewEndTime || s.end_time || (s.paused ? s.paused_at : Date.now()))
      const startAt = preview ? preview.startTime : (s.viewStartTime || s.start_time)
      let lane = lanes.findIndex((laneEnd) => startAt >= laneEnd)
      if (lane < 0) {
        lane = lanes.length
        lanes.push(endAt)
      } else {
        lanes[lane] = endAt
      }
      const left = clampPct(((startAt - start) / DAY_MS) * 100)
      const width = clampPct(((endAt - startAt) / DAY_MS) * 100)
      return {
        ...s,
        left,
        width,
        lane,
        startText: preview ? formatTime(startAt, { seconds: true }) : s.startText,
        endText: preview ? formatTime(endAt, { seconds: true }) : s.endText,
        durText: preview ? formatDuration(Math.max(0, Math.floor((endAt - startAt) / 1000))) : s.durText,
        resizing: !!preview,
        snap: !!preview?.snap
      }
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
const activityClips = computed(() => {
  const start = startOfDay(curDate.value)
  return activitySuggestions.value.map((a) => {
    const left = clampPct(((a.start - start) / DAY_MS) * 100)
    const width = Math.max(0.08, clampPct(((a.end - a.start) / DAY_MS) * 100))
    return {
      ...a,
      left,
      width,
      shortLabel: a.isIdle ? 'idle' : (a.processName || '活动'),
      titleText: `${activityKindText(a)} · ${formatActivityRange(a)} · ${a.title || a.processName || ''}`
    }
  })
})
const actionableActivitySuggestions = computed(() => activitySuggestions.value.filter((a) => a.kind === 'unrecorded_active' || a.kind === 'idle_inside_entry'))
const activitySummaryText = computed(() => {
  const items = actionableActivitySuggestions.value
  const unrecorded = items.filter((a) => a.kind === 'unrecorded_active').length
  const idle = items.filter((a) => a.kind === 'idle_inside_entry').length
  const parts = [`${items.length} 条`]
  if (unrecorded) parts.push(`未记录 ${unrecorded}`)
  if (idle) parts.push(`疑似离开 ${idle}`)
  return parts.join(' / ')
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
function canDragClip(clip) {
  return !!clip.end_time && !clip.crossDay
}
function eventToTimelineTs(e) {
  const canvas = document.querySelector('.timeline-canvas')
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
  const ratio = rect.width ? x / rect.width : 0
  const dayStart = startOfDay(curDate.value)
  const raw = dayStart + ratio * DAY_MS
  const z = timelineZoom.value
  const step = z >= 48
    ? 1000
    : z >= 32
      ? 5 * 1000
      : z >= 16
        ? 10 * 1000
        : z >= 8
          ? 15 * 1000
          : z >= 4
            ? 60 * 1000
            : 5 * 60 * 1000
  return Math.round(raw / step) * step
}
function neighborBoundary(clip, edge) {
  const sameDay = segments.value
    .filter((s) => s.id !== clip.id && s.end_time && !s.crossDay)
    .slice()
    .sort((a, b) => a.start_time - b.start_time)
  if (edge === 'end') {
    const next = sameDay.find((s) => s.start_time >= clip.end_time)
    return next ? next.start_time : null
  }
  const prev = sameDay.filter((s) => s.end_time <= clip.start_time).pop()
  return prev ? prev.end_time : null
}
function applyResizeSnap(clip, edge, ts) {
  const boundary = neighborBoundary(clip, edge)
  const snapWindow = 2 * 60 * 1000
  if (boundary != null) {
    if (edge === 'end' && (ts >= boundary || Math.abs(ts - boundary) <= snapWindow)) return { ts: boundary, snap: true }
    if (edge === 'start' && (ts <= boundary || Math.abs(ts - boundary) <= snapWindow)) return { ts: boundary, snap: true }
  }
  return { ts, snap: false }
}
function updateResizePreview(clip, edge, guide, snap = false) {
  const minDuration = 1000
  let startTime = edge === 'start' ? guide : clip.start_time
  let endTime = edge === 'end' ? guide : clip.end_time
  if (edge === 'start') startTime = Math.min(startTime, clip.end_time - minDuration)
  if (edge === 'end') endTime = Math.max(endTime, clip.start_time + minDuration)
  resizePreview.value = { id: clip.id, edge, startTime, endTime, snap }
}
function startClipResize(e, clip, edge) {
  if (!canDragClip(clip)) return
  resizingClip = clip
  resizeEdge = edge
  resizeGuide = edge === 'start' ? clip.start_time : clip.end_time
  updateResizePreview(clip, edge, resizeGuide, false)
  dragMoved = true
  window.addEventListener('mousemove', moveClipResize)
  window.addEventListener('mouseup', stopClipResize, { once: true })
}
function moveClipResize(e) {
  if (!resizingClip) return
  const ts = eventToTimelineTs(e)
  if (ts == null) return
  const snapped = applyResizeSnap(resizingClip, resizeEdge, Math.min(ts, Date.now()))
  resizeGuide = snapped.ts
  updateResizePreview(resizingClip, resizeEdge, resizeGuide, snapped.snap)
}
async function stopClipResize() {
  window.removeEventListener('mousemove', moveClipResize)
  const clip = resizingClip
  const edge = resizeEdge
  const ts = resizeGuide
  resizingClip = null
  resizeEdge = null
  resizeGuide = null
  resizePreview.value = null
  setTimeout(() => { dragMoved = false }, 0)
  if (!clip || ts == null) return
  const startTime = edge === 'start' ? ts : clip.start_time
  const endTime = edge === 'end' ? ts : clip.end_time
  if (startTime === clip.start_time && endTime === clip.end_time) return
  try {
    await api('ledger:adjustTime', { id: clip.id, startTime, endTime })
    await load()
  } catch (err) {
    alert(err.message || '时间调整失败')
  }
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
function toDateTimeInput(ts) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${day}T${hh}:${mm}:${ss}`
}
function fromDateTimeInput(value) {
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? ts : null
}
function sameSecond(a, b) {
  return Math.floor(Number(a) / 1000) === Math.floor(Number(b) / 1000)
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
      const actualEnd = e.end_time || (e.paused ? e.paused_at : Date.now())
      e.actualEndTime = actualEnd
      e.viewStartTime = Math.max(e.start_time, start)
      e.viewEndTime = Math.min(actualEnd, end)
      e.viewDurationSec = Math.max(0, Math.floor((e.viewEndTime - e.viewStartTime) / 1000))
      e.crossDay = e.start_time < start || actualEnd > end
      e.dateText = formatDate(e.viewStartTime)
      e.durText = formatDuration(e.viewDurationSec)
      e.startText = formatTime(e.viewStartTime, { seconds: true })
      e.endText = e.viewEndTime < actualEnd || e.end_time ? formatTime(e.viewEndTime, { seconds: true }) : '…'
      e.actualRangeText = `${formatDate(e.start_time)} ${formatTime(e.start_time, { seconds: true })} – ${e.end_time ? `${formatDate(e.end_time)} ${formatTime(e.end_time, { seconds: true })}` : '进行中'}`
    }
    // 未完成记录实时刷新；暂停态停在 paused_at，避免视觉上继续跳秒。
    for (const e of raw) {
      decorateEntryTimeline(e, tagMap)
    }
    segments.value = raw
    totalSec.value = raw.reduce((s, e) => s + (e.viewDurationSec || 0), 0)
    effectiveSec.value = eff.sec
    fragments.value = raw.filter((e) => e.is_fragment).length
    const act = await api('activity:suggestions', { start, end }).catch(() => ({ suggestions: [] }))
    activitySuggestions.value = (act.suggestions || []).map((a) => ({ ...a }))
    ensureActivityForms()
    const cur = await api('ledger:current')
    recording.value = !!cur.entry
    if (focusWorkStart) requestWorkStartFocus()
  } catch (e) {
    /* 静默 */
  }
}

function decorateEntryTimeline(entry, tagMap) {
  const trackStart = entry.viewStartTime || entry.start_time
  const trackEnd = entry.viewEndTime || entry.end_time || (entry.paused ? entry.paused_at : Date.now())
  const totalMs = Math.max(1, trackEnd - trackStart)
  const cleanPoints = (entry.pausePoints || [])
    .filter((p) => p.ts > trackStart && p.ts < trackEnd)
    .sort((a, b) => a.ts - b.ts)

  entry.pausePoints = cleanPoints.map((p) => ({
    ...p,
    left: clampPct(((p.ts - trackStart) / totalMs) * 100)
  }))

  const boundaries = [trackStart, ...entry.pausePoints.map((p) => p.ts), trackEnd]
  entry.timelineSlices = []
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const sliceStart = boundaries[i]
    const sliceEnd = boundaries[i + 1]
    if (sliceEnd <= sliceStart) continue
    const fromPoint = i === 0 ? null : entry.pausePoints[i - 1]
    const sliceTag = tagMap.get(fromPoint?.tag_id) || tagMap.get(entry.tag_id) || { name: '未分类', color: '#9D9D9D' }
    const left = clampPct(((sliceStart - trackStart) / totalMs) * 100)
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

function ensureActivityForms() {
  const next = { ...activityForms.value }
  const fallbackTagId = tags.value.find((t) => !t.is_break)?.id || tags.value[0]?.id || null
  for (const a of activitySuggestions.value) {
    if (!next[a.signature]) {
      next[a.signature] = {
        tagId: fallbackTagId,
        detail: a.kind === 'unrecorded_active' ? `根据活动轨迹补记：${a.title || a.processName || '电脑活动'}` : ''
      }
    }
  }
  activityForms.value = next
}
function activityKindText(a) {
  if (a.kind === 'unrecorded_active') return '未记录活动'
  if (a.kind === 'idle_inside_entry') return '记录中疑似离开'
  if (a.kind === 'entry_context') return '记录内活动'
  return '活动轨迹'
}
function formatActivityRange(a) {
  return `${formatTime(a.start, { seconds: true })} – ${formatTime(a.end, { seconds: true })}`
}
function focusActivitySuggestion(signature) {
  activityPanelCollapsed.value = false
  nextTick(() => {
    const el = document.querySelector(`[data-activity-signature="${CSS.escape(signature)}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.remove('pulse-focus')
    window.requestAnimationFrame(() => el.classList.add('pulse-focus'))
    window.setTimeout(() => el.classList.remove('pulse-focus'), 1600)
  })
}
async function convertActivityToLedger(a) {
  const form = activityForms.value[a.signature] || {}
  const ok = confirm(`将 ${formatActivityRange(a)} 补记为台账？\n\n该操作只补当前空白区间，不会覆盖已有台账。`)
  if (!ok) return
  const r = await api('activity:convertToLedger', {
    start: a.start,
    end: a.end,
    tagId: form.tagId,
    detail: form.detail?.trim() || null
  })
  if (!r.ok) return alert(r.error || '补记失败')
  await load({ focusWorkStart: false })
}
async function applyActivityIdleBreak(a) {
  const ok = confirm(`按活动轨迹把 ${formatActivityRange(a)} 标为疑似离开？\n\n系统会在正式台账中添加两个切点，原始轨迹不会被修改。`)
  if (!ok) return
  const r = await api('activity:applyIdleBreak', {
    entryId: a.entryId,
    start: a.start,
    end: a.end,
    detail: '活动轨迹显示这段可能离开电脑'
  })
  if (!r.ok) return alert(r.error || '切分失败')
  await load({ focusWorkStart: false })
}
async function ignoreActivity(a) {
  const r = await api('activity:ignore', a)
  if (!r.ok) return alert(r.error || '忽略失败')
  activitySuggestions.value = activitySuggestions.value.filter((x) => x.signature !== a.signature)
}

function scrollTimelineToWorkStart() {
  const el = timelineScroll.value
  if (!el) return
  const hourRatio = WORK_START_HOUR / 24
  const target = el.scrollWidth * hourRatio - 12
  const max = Math.max(0, el.scrollWidth - el.clientWidth)
  el.scrollLeft = Math.max(0, Math.min(max, target))
}
function requestWorkStartFocus() {
  nextTick(() => {
    scrollTimelineToWorkStart()
    window.requestAnimationFrame(() => scrollTimelineToWorkStart())
    setTimeout(scrollTimelineToWorkStart, 80)
    setTimeout(scrollTimelineToWorkStart, 220)
  })
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
    startValue: toDateTimeInput(s.start_time),
    endValue: s.end_time ? toDateTimeInput(s.end_time) : '',
    pausePoints: (s.pausePoints || []).map((p) => ({
      id: p.id,
      ts: p.ts,
      timeText: p.timeText,
      timeValue: toDateTimeInput(p.ts),
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
function addDraftPausePoint() {
  if (!editEntry.value?.end_time) return
  const existing = editForm.value.pausePoints
    .map((p) => fromDateTimeInput(p.timeValue))
    .filter((ts) => ts != null)
  const candidates = [editEntry.value.start_time, ...existing, editEntry.value.end_time].sort((a, b) => a - b)
  let bestStart = editEntry.value.start_time
  let bestEnd = editEntry.value.end_time
  let bestGap = 0
  for (let i = 0; i < candidates.length - 1; i += 1) {
    const gap = candidates[i + 1] - candidates[i]
    if (gap > bestGap) {
      bestGap = gap
      bestStart = candidates[i]
      bestEnd = candidates[i + 1]
    }
  }
  const ts = bestStart + Math.floor((bestEnd - bestStart) / 2)
  editForm.value.pausePoints.push({
    id: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ts,
    timeText: formatTime(ts, { seconds: true }),
    timeValue: toDateTimeInput(ts),
    tagId: editForm.value.tagId || tags.value[0]?.id || null,
    detail: ''
  })
  editForm.value.pausePoints.sort((a, b) => fromDateTimeInput(a.timeValue) - fromDateTimeInput(b.timeValue))
}

async function saveEdit() {
  if (!editEntry.value) return
  try {
  const detail = editForm.value.detail.trim() || null
  if (editEntry.value.end_time) {
    const startTime = fromDateTimeInput(editForm.value.startValue)
    const endTime = fromDateTimeInput(editForm.value.endValue)
    if (startTime == null || endTime == null) return alert('请填写有效的开始和结束时间')
    if (!sameSecond(startTime, editEntry.value.start_time) || !sameSecond(endTime, editEntry.value.end_time)) {
      await api('ledger:adjustTime', { id: editEntry.value.id, startTime, endTime })
    }
  }
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
    let cleanupSameTagPoints = false
    if (willSplit) {
      const ok = confirm('时间节点中存在与当前记录不同的标签。确认后，当前记录将按节点拆分成多条，并自动合并连续相同标签。')
      if (!ok) return
    } else {
      const hasNodeDetail = editForm.value.pausePoints.some((p) => p.detail?.trim())
      const msg = hasNodeDetail
        ? '暂停点标签和起始标签一致，不需要切分。确认后会合并整个片段并移除暂停点；暂停点文字会追加到片段备注中，避免丢失。是否执行？'
        : '暂停点标签和起始标签一致，不需要切分。确认后会合并整个片段并移除这些暂停点。是否执行？'
      cleanupSameTagPoints = confirm(msg)
      if (!cleanupSameTagPoints) return
    }
    const r = await api('ledger:applyPausePointPlan', {
      entryId: editEntry.value.id,
      baseTagId: editForm.value.tagId,
      detail,
      cleanupSameTagPoints,
      points: editForm.value.pausePoints.map((p) => ({
        id: p.id,
        ts: fromDateTimeInput(p.timeValue),
        tagId: p.tagId,
        detail: p.detail?.trim() || null
      }))
    })
    if (!r.ok) return alert(r.error || '保存失败')
    if (r.split) alert('已按时间节点拆分并刷新台账')
    else if (r.cleaned) alert('已合并片段并清理同标签暂停点')
  }
  expandedEntryId.value = null
  editEntry.value = null
  await load()
  } catch (err) {
    alert(err.message || '保存失败')
  }
}

function openManualCreate() {
  const base = startOfDay(curDate.value) + WORK_START_HOUR * 3600 * 1000
  manualForm.value = {
    startValue: toDateTimeInput(base),
    endValue: toDateTimeInput(base + 30 * 60 * 1000),
    tagId: tags.value[0]?.id ?? null,
    detail: ''
  }
  manualOpen.value = true
}
function closeManualCreate() {
  manualOpen.value = false
}
async function saveManualCreate() {
  try {
    const startTime = fromDateTimeInput(manualForm.value.startValue)
    const endTime = fromDateTimeInput(manualForm.value.endValue)
    if (startTime == null || endTime == null) return alert('请填写有效的开始和结束时间')
    await api('ledger:manualCreate', {
      startTime,
      endTime,
      tagId: manualForm.value.tagId,
      detail: manualForm.value.detail.trim() || null
    })
    manualOpen.value = false
    await load({ focusWorkStart: true })
  } catch (err) {
    alert(err.message || '保存补记失败')
  }
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
.activity-toggle { margin-left: 6px; border-style: dashed; }
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
.master-track { position: relative; height: 252px; background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.08)); }
.master-track::before { content: ''; position: absolute; left: 0; right: 0; top: 96px; height: 1px; background: rgba(224,188,114,0.18); }
.master-track::after { content: ''; position: absolute; left: 0; right: 0; bottom: 58px; height: 1px; background: rgba(127,169,140,0.20); }
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
.clip.adjustable { cursor: pointer; }
.clip.resizing { filter: brightness(1.12); outline: 1px solid rgba(255,255,255,.52); box-shadow: 0 0 0 1px rgba(255,255,255,.18), 0 8px 24px rgba(0,0,0,.22); }
.clip.snap { outline-color: var(--gold); box-shadow: 0 0 0 1px rgba(224,188,114,.48), 0 0 18px rgba(224,188,114,.28); }
.clip-resize { position: absolute; top: 0; bottom: 0; width: 8px; z-index: 3; cursor: ew-resize; opacity: 0; transition: opacity .12s ease, background .12s ease; }
.clip-resize.left { left: 0; border-radius: 7px 0 0 7px; }
.clip-resize.right { right: 0; border-radius: 0 7px 7px 0; }
.clip:hover .clip-resize { opacity: 1; background: rgba(255,255,255,.22); }
.clip-resize:hover { background: rgba(255,255,255,.34) !important; }
.cut-marker { position: absolute; top: 36px; height: 118px; width: 1px; padding: 0; border: 0; border-left: 1px dashed rgba(224,188,114,0.48); background: transparent; color: var(--gold); cursor: pointer; font-size: 10px; opacity: .88; }
.cut-marker::after { content: ''; position: absolute; left: -4px; top: -4px; width: 7px; height: 7px; transform: rotate(45deg); border-radius: 1px; background: var(--gold); }
.cut-marker span { position: absolute; left: 8px; top: -9px; opacity: 0; white-space: nowrap; padding: 1px 5px; border-radius: 999px; background: rgba(32,35,41,.96); color: var(--gold); border: 1px solid rgba(224,188,114,.36); pointer-events: none; transition: opacity .12s ease; }
.cut-marker:hover span { opacity: 1; }
.cut-marker.empty { border-left-color: rgba(241,162,143,0.68); color: #f1a28f; }
.cut-marker.empty::after { background: #f1a28f; }
.cut-marker.empty span { color: #f1a28f; border-color: rgba(241,162,143,.38); }
.activity-lane-label { position: absolute; left: 10px; bottom: 34px; font-size: 10px; letter-spacing: .08em; color: rgba(127,169,140,.82); pointer-events: none; }
.activity-clip { position: absolute; bottom: 28px; height: 18px; min-width: 2px; border-radius: 999px; border: 1px dashed rgba(127,169,140,.58); background: rgba(127,169,140,.15); color: rgba(230,244,235,.82); cursor: pointer; overflow: hidden; padding: 1px 6px; display: flex; align-items: center; gap: 5px; opacity: .82; backdrop-filter: blur(2px); }
.activity-clip::before { content: ''; position: absolute; inset: 0; background-image: repeating-linear-gradient(90deg, rgba(255,255,255,.18) 0 2px, transparent 2px 7px); opacity: .34; pointer-events: none; }
.activity-clip:hover { opacity: 1; filter: brightness(1.16); }
.activity-clip.idle { border-color: rgba(241,162,143,.66); background: rgba(241,162,143,.14); color: #ffd6cd; }
.activity-clip.entry_context { opacity: .45; bottom: 7px; height: 12px; }
.activity-dot { position: relative; z-index: 1; width: 5px; height: 5px; border-radius: 999px; background: currentColor; box-shadow: 0 0 8px currentColor; flex: 0 0 auto; }
.activity-text { position: relative; z-index: 1; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.now-line { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(127,169,140,0.88); }
.now-line b { position: absolute; top: 9px; left: 6px; font-size: 10px; color: var(--green); font-weight: 500; white-space: nowrap; }
.activity-panel { margin-top: 10px; padding: 9px 10px; border: 1px dashed rgba(127,169,140,.24); border-radius: 12px; background: rgba(127,169,140,.045); display: flex; flex-direction: column; gap: 8px; }
.activity-panel.collapsed { padding-bottom: 9px; }
.activity-panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.activity-count { margin-left: 6px; color: var(--green); font-size: 12px; font-weight: 400; }
.activity-help { font-size: 12px; line-height: 1.5; }
.activity-rows { max-height: 240px; overflow: auto; padding-right: 4px; display: flex; flex-direction: column; gap: 8px; scrollbar-width: thin; }
.activity-rows::-webkit-scrollbar { width: 8px; }
.activity-rows::-webkit-scrollbar-thumb { background: rgba(127,169,140,.24); border-radius: 999px; }
.activity-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 10px; border: 1px dashed rgba(127,169,140,.32); background: rgba(127,169,140,.07); }
.activity-row.idle_inside_entry { border-color: rgba(241,162,143,.34); background: rgba(241,162,143,.07); }
.activity-row.pulse-focus { animation: activityPulseFocus 1.35s ease both; }
@keyframes activityPulseFocus {
  0% { box-shadow: 0 0 0 0 rgba(224,188,114,.0); transform: translateY(0); }
  20% { box-shadow: 0 0 0 2px rgba(224,188,114,.55), 0 0 24px rgba(224,188,114,.22); transform: translateY(-1px); }
  100% { box-shadow: 0 0 0 0 rgba(224,188,114,0); transform: translateY(0); }
}
.activity-main { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.activity-kind { font-size: 12px; color: var(--green); border: 1px solid rgba(127,169,140,.32); background: rgba(127,169,140,.10); border-radius: 999px; padding: 1px 7px; white-space: nowrap; }
.activity-row.idle_inside_entry .activity-kind { color: #f1a28f; border-color: rgba(241,162,143,.34); background: rgba(241,162,143,.10); }
.activity-time { font-size: 12px; color: var(--text-dim); white-space: nowrap; }
.activity-title { font-size: 12px; max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.activity-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.activity-select { width: 108px; height: 30px; font-size: 12px; }
.activity-note { width: 220px; height: 30px; font-size: 12px; }
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
.cross-chip { font-size: 12px; color: var(--green); background: rgba(127,169,140,0.12); border: 1px solid rgba(127,169,140,0.28); padding: 1px 7px; border-radius: 999px; }
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
.time-calibrate { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
.time-calibrate label,
.manual-grid label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-dim); }
.time-input { font-family: var(--font-mono); }
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
.pause-editor-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.pause-editor h4 { font-size: 13px; font-weight: 500; color: var(--gold); }
.btn.small { padding: 4px 9px; font-size: 12px; }
.split-hint { font-size: 12px; line-height: 1.5; }
.pause-edit-row { display: flex; align-items: center; gap: 8px; }
.pause-edit-row .num { width: 62px; color: var(--text-dim); }
.pause-time-input { width: 210px; font-family: var(--font-mono); }
.pause-select { width: 130px; }
.pause-detail { flex: 1; min-width: 160px; }
.edit-ops { display: flex; justify-content: flex-end; gap: 8px; }
.manual-mask { position: fixed; inset: 0; z-index: 90; background: rgba(0,0,0,.48); display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(8px); }
.manual-card { width: min(560px, 100%); padding: 18px; }
.manual-head { margin-bottom: 14px; }
.manual-head h3 { font-size: 17px; font-weight: 500; margin: 0 0 4px; color: var(--gold); }
.manual-grid { display: grid; gap: 12px; }
.manual-grid textarea { resize: vertical; font-family: inherit; }
</style>
