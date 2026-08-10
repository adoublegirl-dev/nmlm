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
          <button class="btn" @click="doPause">暂停点</button>
        </template>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat"><span class="v num">{{ totalText }}</span><span class="l">总时长</span></div>
      <div class="stat"><span class="v num">{{ effectiveText }}</span><span class="l">有效工时</span></div>
      <div class="stat"><span class="v num">{{ fragments }}</span><span class="l">碎片段</span></div>
      <div class="stat"><span class="v num">{{ segments.length }}</span><span class="l">段数</span></div>
    </div>

    <div class="card timeline">
      <div v-if="!segments.length" class="empty muted">这一天还没有记录，按 F8 开始</div>
      <div v-for="s in segments" :key="s.id" class="seg" :style="{ borderLeftColor: s.color }" @click="openEdit(s)">
        <div class="seg-head">
          <span class="date-chip num">{{ s.dateText }}</span>
          <span class="seg-time num">{{ s.startText }} – {{ s.endText }}</span>
          <span class="start-chip muted num">开始 {{ s.startText }}</span>
          <span class="tag-chip" :style="{ background: s.color + '26', color: s.color }">{{ s.tagName }}</span>
          <span class="seg-dur num">{{ s.durText }}</span>
          <span v-if="s.is_fragment" class="frag muted">碎片</span>
          <span v-if="s.pausePoints?.length" class="pause-chip">暂停点 × {{ s.pausePoints.length }}</span>
          <span v-if="s.detail" class="seg-detail muted">{{ s.detail }}</span>
        </div>
        <div v-if="s.pausePoints?.length" class="pause-points">
          <span v-for="p in s.pausePoints" :key="p.id" class="pause-dot" :title="p.detail || '暂停点'">{{ p.timeText }}</span>
        </div>
        <div class="seg-bar">
          <div class="seg-fill" :style="{ width: s.widthPct + '%', background: s.color }"></div>
        </div>
      </div>
    </div>

    <div v-if="editEntry" class="mask" @click.self="closeEdit">
      <div class="card edit-panel">
        <h3>编辑记录</h3>
        <div class="edit-time muted num">{{ editEntry.startText }} – {{ editEntry.endText }} · {{ editEntry.durText }}</div>
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
        <div v-if="editEntry.pausePoints?.length" class="pause-editor">
          <h4>暂停点切分</h4>
          <div class="muted split-hint">暂停点标签表示“从该暂停点开始到下一个暂停点/结束”的标签。不同标签会拆分记录，连续同标签会自动合并。</div>
          <div v-for="p in editEntry.pausePoints" :key="p.id" class="pause-edit-row">
            <span class="num">{{ p.timeText }}</span>
            <select class="input pause-select" :value="p.tag_id ?? editEntry.tag_id" @change="applyPauseTag(p, Number($event.target.value))">
              <option v-for="t in tags" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </div>
        </div>
        <div class="edit-ops">
          <button class="btn" @click="closeEdit">取消</button>
          <button class="btn primary" @click="saveEdit">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api, on } from '../api'
import { formatDuration, formatTime, formatDate, dayLabel } from '../utils/format'

const DAY_MS = 86400000
const curDate = ref(Date.now())
const segments = ref([])
const recording = ref(false)
const totalSec = ref(0)
const effectiveSec = ref(0)
const fragments = ref(0)
const tags = ref([])
const editEntry = ref(null)
const editForm = ref({ tagId: null, detail: '' })

const isToday = computed(() => new Date(curDate.value).toDateString() === new Date().toDateString())
const isYesterday = computed(() => new Date(curDate.value).toDateString() === new Date(startOfDay(Date.now()) - DAY_MS).toDateString())
const dateValue = computed(() => toDateInput(curDate.value))
const todayValue = computed(() => toDateInput(Date.now()))
const totalText = computed(() => formatDuration(totalSec.value))
const effectiveText = computed(() => formatDuration(effectiveSec.value))

function goToday() {
  curDate.value = Date.now()
  load()
}
function goYesterday() {
  curDate.value = startOfDay(Date.now()) - DAY_MS
  load()
}
function setDateFromInput(v) {
  if (!v) return
  const ts = new Date(v + 'T00:00:00').getTime()
  const today = startOfDay(Date.now())
  curDate.value = Math.min(ts, today)
  load()
}
function toDateInput(ts) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function load() {
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
    let maxDur = 0
    const pointsByEntry = new Map()
    for (const p of pointsRes.points || []) {
      p.timeText = formatTime(p.ts)
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
      e.startText = formatTime(e.start_time)
      e.endText = e.end_time ? formatTime(e.end_time) : '…'
      maxDur = Math.max(maxDur, e.duration_sec || 0)
    }
    // 未完成记录实时刷新
    for (const e of raw) {
      if (!e.end_time) e.durText = formatDuration(Math.floor((Date.now() - e.start_time) / 1000))
    }
    for (const e of raw) {
      e.widthPct = maxDur ? Math.max(2, Math.round(((e.duration_sec || 0) / maxDur) * 100)) : 0
    }
    segments.value = raw
    totalSec.value = raw.reduce((s, e) => s + (e.duration_sec || 0), 0)
    effectiveSec.value = eff.sec
    fragments.value = raw.filter((e) => e.is_fragment).length
    const cur = await api('ledger:current')
    recording.value = !!cur.entry
  } catch (e) {
    /* 静默 */
  }
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

function openEdit(s) {
  editEntry.value = s
  editForm.value = { tagId: s.tag_id, detail: s.detail || '' }
}
function closeEdit() {
  editEntry.value = null
}
async function saveEdit() {
  if (!editEntry.value) return
  await api('ledger:retag', {
    id: editEntry.value.id,
    tagId: editForm.value.tagId,
    detail: editForm.value.detail.trim() || null
  })
  editEntry.value = null
  load()
}

async function applyPauseTag(point, tagId) {
  if (!editEntry.value) return
  const baseTag = editEntry.value.tag_id
  if (tagId !== baseTag) {
    const ok = confirm('您选择的标签与当前记录的标签不同。确认后，当前记录将按暂停点拆分成多条，并自动合并连续相同标签。')
    if (!ok) {
      load()
      return
    }
  }
  const r = await api('ledger:applyPausePointTag', {
    entryId: editEntry.value.id,
    pointId: point.id,
    tagId
  })
  alert(r.split ? '已按暂停点拆分并刷新台账' : '已合并为一条记录')
  editEntry.value = null
  load()
}

let off = null
onMounted(() => {
  load()
  off = on('ledger:state-changed', () => load())
})
onBeforeUnmount(() => {
  if (off) off()
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
.timeline { display: flex; flex-direction: column; gap: 14px; }
.seg { border-left: 3px solid; padding-left: 12px; cursor: pointer; }
.seg:hover { background: var(--bg-hover); border-radius: 4px; }
.seg-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.date-chip { font-size: 12px; color: var(--green); background: rgba(127,169,140,0.12); border: 1px solid rgba(127,169,140,0.25); padding: 1px 7px; border-radius: 999px; }
.seg-time { font-size: 13px; color: var(--text-dim); }
.start-chip { font-size: 12px; }
.seg-dur { font-size: 13px; font-weight: 500; }
.frag { font-size: 12px; }
.pause-chip { font-size: 12px; color: var(--gold); background: rgba(224,188,114,0.12); border: 1px solid rgba(224,188,114,0.28); padding: 1px 7px; border-radius: 999px; }
.pause-points { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.pause-dot { font-size: 11px; color: var(--text-dim); border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); padding: 1px 6px; border-radius: 999px; }
.seg-bar { height: 8px; background: rgba(255,255,255,0.08); border-radius: 4px; margin-top: 6px; overflow: hidden; }
.seg-fill { height: 100%; border-radius: 4px; opacity: 0.75; }
.seg-detail { margin-top: 4px; font-size: 12px; }
.empty { text-align: center; padding: 40px 0; }
.mask {
  position: fixed; inset: 0; background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center; z-index: 60;
}
.edit-panel { width: 400px; background: var(--bg-panel-solid); display: flex; flex-direction: column; gap: 12px; }
.edit-panel h3 { font-size: 15px; font-weight: 500; }
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
.pause-select { flex: 1; }
.edit-ops { display: flex; justify-content: flex-end; gap: 8px; }
</style>
