<template>
  <div class="layout" :class="themeClass">
    <div class="page-background" aria-hidden="true">
      <img :src="activeBackground" alt="" />
      <div class="background-veils"></div>
    </div>
    <header class="topbar">
      <div class="brand">牛马联盟</div>
      <div class="status" :class="{ recording: recording }">
        <span class="dot"></span>
        <template v-if="recording">记录中 {{ currentTagName }} {{ sinceText }}</template>
        <template v-else>今日有效 {{ effectiveText }}</template>
      </div>
      <nav class="nav">
        <a v-for="item in navs" :key="item.key" :class="{ active: route === item.key }" :href="'#' + item.key">{{ item.label }}</a>
      </nav>
      <button class="theme-toggle" type="button" @click="toggleTheme">
        <span class="theme-dot"></span>
        {{ themeLabel }}
      </button>
    </header>

    <main class="content">
      <LedgerView v-if="route === 'ledger'" />
      <EvidenceView v-else-if="route === 'evidence'" />
      <ReportView v-else-if="route === 'report'" />
      <ToolsView v-else-if="route === 'tools'" />
      <TodosView v-else-if="route === 'todos'" />
      <SettingsView v-else-if="route === 'settings'" />
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api, on } from './api'
import { formatDuration } from './utils/format'
import LedgerView from './views/LedgerView.vue'
import EvidenceView from './views/EvidenceView.vue'
import ReportView from './views/ReportView.vue'
import ToolsView from './views/ToolsView.vue'
import TodosView from './views/TodosView.vue'
import SettingsView from './views/SettingsView.vue'
import dayBackground from './assets/background-day-cattle-horses.png'
import nightBackground from './assets/background-night-cattle-horses.png'

const navs = [
  { key: 'ledger', label: '台账' },
  { key: 'evidence', label: '证据' },
  { key: 'report', label: '报表' },
  { key: 'tools', label: '工具' },
  { key: 'todos', label: '待办' },
  { key: 'settings', label: '设置' }
]

const savedTheme = localStorage.getItem('nmlm.panelTheme')
const pastureTheme = ref(savedTheme === 'night' ? 'night' : 'day')
const route = ref(location.hash.replace('#', '') || 'ledger')
window.addEventListener('hashchange', () => {
  route.value = location.hash.replace('#', '') || 'ledger'
})

const recording = ref(false)
const currentEntry = ref(null)
const effectiveSec = ref(0)
const tags = ref([])
let ticker = null

const currentTagName = computed(() => {
  const e = currentEntry.value
  if (!e) return ''
  const t = tags.value.find((t) => t.id === e.tag_id)
  return t ? t.name : ''
})

const sinceText = computed(() => {
  const e = currentEntry.value
  if (!e) return ''
  return formatDuration(Math.floor((Date.now() - e.start_time) / 1000))
})

const effectiveText = computed(() => formatDuration(effectiveSec.value))
const themeClass = computed(() => `theme-pasture-${pastureTheme.value}`)
const themeLabel = computed(() => pastureTheme.value === 'day' ? '白天牛马' : '夜晚牛马')
const activeBackground = computed(() => pastureTheme.value === 'day' ? dayBackground : nightBackground)

function toggleTheme() {
  pastureTheme.value = pastureTheme.value === 'day' ? 'night' : 'day'
  localStorage.setItem('nmlm.panelTheme', pastureTheme.value)
}

async function refresh() {
  try {
    const [cur, eff, tagRes] = await Promise.all([
      api('ledger:current'),
      api('report:effectiveHours', { date: Date.now() }),
      api('tags:list')
    ])
    currentEntry.value = cur.entry
    recording.value = !!cur.entry
    effectiveSec.value = eff.sec
    tags.value = tagRes.tags
  } catch (e) {
    /* 首屏静默 */
  }
}

onMounted(() => {
  refresh()
  ticker = setInterval(() => {
    if (recording.value) effectiveSec.value = Math.max(effectiveSec.value, effectiveSec.value)
  }, 1000)
  offState = on('ledger:state-changed', (data) => {
    if (data.state === 'recording') {
      currentEntry.value = data.entry
      recording.value = true
    } else {
      currentEntry.value = null
      recording.value = false
      refresh()
    }
  })
})
let offState = null
onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
  if (offState) offState()
})
</script>

<style scoped>
.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow-x: hidden;
  color: var(--text-main);
  transition: color .22s ease;
}
.layout.theme-pasture-day {
  --bg-deep: #17201a;
  --bg-panel: rgba(16, 29, 22, 0.54);
  --bg-panel-solid: rgba(21, 37, 28, 0.72);
  --bg-hover: rgba(236, 255, 226, 0.14);
  --text-main: #f7f5e9;
  --text-dim: rgba(229, 238, 211, 0.78);
  --gold: #f0c76e;
  --gold-dim: rgba(240, 199, 110, 0.18);
  --green: #b9e3a5;
  --border: rgba(237, 255, 228, 0.18);
  --shadow: 0 16px 48px rgba(7, 23, 13, 0.36);
}
.layout.theme-pasture-night {
  --bg-deep: #07101c;
  --bg-panel: rgba(8, 15, 27, 0.62);
  --bg-panel-solid: rgba(13, 22, 37, 0.82);
  --bg-hover: rgba(178, 211, 255, 0.13);
  --text-main: #eef5ff;
  --text-dim: rgba(202, 218, 236, 0.74);
  --gold: #d9c07a;
  --gold-dim: rgba(217, 192, 122, 0.16);
  --green: #9ec7ba;
  --border: rgba(204, 226, 255, 0.16);
  --shadow: 0 18px 52px rgba(0, 5, 15, 0.46);
}
.page-background {
  position: fixed;
  inset: 0;
  z-index: -2;
  background: var(--bg-deep);
  overflow: hidden;
}
.page-background img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(1.02);
  transition: opacity .28s ease, filter .28s ease;
}
.background-veils {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.theme-pasture-day .page-background img { filter: saturate(1.12) contrast(.98) brightness(1.02); }
.theme-pasture-night .page-background img { filter: saturate(1.02) contrast(1.02) brightness(.96); }
.theme-pasture-day .background-veils {
  background:
    radial-gradient(circle at 50% 18%, rgba(246, 255, 219, .12), transparent 38%),
    linear-gradient(180deg, rgba(20, 39, 24, .06), rgba(11, 24, 17, .36) 64%, rgba(8, 18, 12, .52)),
    linear-gradient(90deg, rgba(7, 20, 12, .22), rgba(7, 20, 12, .08) 30%, rgba(7, 20, 12, .08) 70%, rgba(7, 20, 12, .22));
}
.theme-pasture-night .background-veils {
  background:
    radial-gradient(circle at 52% 18%, rgba(177, 211, 255, .14), transparent 36%),
    linear-gradient(180deg, rgba(3, 8, 18, .06), rgba(3, 8, 18, .42) 60%, rgba(2, 6, 12, .62)),
    linear-gradient(90deg, rgba(1, 5, 14, .30), rgba(1, 5, 14, .12) 34%, rgba(1, 5, 14, .12) 66%, rgba(1, 5, 14, .30));
}
.topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 24px;
  border-bottom: 0.5px solid var(--border);
  background: color-mix(in srgb, var(--bg-panel-solid) 72%, transparent);
  backdrop-filter: blur(18px) saturate(1.18);
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: 0 10px 32px rgba(0,0,0,.12);
}
.brand { font-weight: 700; color: var(--gold); letter-spacing: 1px; text-shadow: 0 1px 14px rgba(0,0,0,.28); }
.status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-dim);
  padding: 4px 12px;
  border-radius: 20px;
  background: var(--bg-panel-solid);
  border: 0.5px solid var(--border);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
}
.status .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-dim); }
.status.recording { color: var(--gold); border-color: color-mix(in srgb, var(--gold) 44%, transparent); }
.status.recording .dot { background: var(--gold); box-shadow: 0 0 8px color-mix(in srgb, var(--gold) 58%, transparent); }
.nav { display: flex; gap: 4px; margin-left: auto; }
.nav a {
  color: var(--text-dim);
  text-decoration: none;
  padding: 6px 14px;
  border-radius: var(--radius);
  font-size: 13px;
}
.nav a:hover { background: var(--bg-hover); color: var(--text-main); }
.nav a.active { background: var(--gold-dim); color: var(--gold); }
.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 0.5px solid var(--border);
  border-radius: 999px;
  background: var(--bg-panel-solid);
  color: var(--text-main);
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
}
.theme-toggle:hover { background: var(--bg-hover); }
.theme-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 10px color-mix(in srgb, var(--green) 70%, transparent);
}
.theme-pasture-night .theme-dot { background: #b8d4ff; box-shadow: 0 0 12px rgba(184, 212, 255, .76); }
.content {
  flex: 1;
  position: relative;
  isolation: isolate;
  padding: 24px;
  max-width: 1120px;
  width: 100%;
  margin: 0 auto;
}
.content::before {
  content: '';
  position: absolute;
  inset: 12px 4px 24px;
  z-index: -1;
  border-radius: 28px;
  background: radial-gradient(circle at 50% 8%, rgba(255,255,255,.08), transparent 38%);
  pointer-events: none;
}
@media (max-width: 980px) {
  .topbar { flex-wrap: wrap; gap: 10px; }
  .nav { order: 3; width: 100%; overflow-x: auto; margin-left: 0; }
}
@media (max-width: 820px) {
  .content { padding: 16px; }
  .page-background img { transform: scale(1.08); }
}
</style>
