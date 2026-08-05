<template>
  <div class="layout">
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
    </header>

    <main class="content">
      <LedgerView v-if="route === 'ledger'" />
      <EvidenceView v-else-if="route === 'evidence'" />
      <ReportView v-else-if="route === 'report'" />
      <ToolsView v-else-if="route === 'tools'" />
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
import SettingsView from './views/SettingsView.vue'

const navs = [
  { key: 'ledger', label: '台账' },
  { key: 'evidence', label: '证据' },
  { key: 'report', label: '报表' },
  { key: 'tools', label: '工具' },
  { key: 'settings', label: '设置' }
]

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
.layout { min-height: 100vh; display: flex; flex-direction: column; }
.topbar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 14px 24px;
  border-bottom: 0.5px solid var(--border);
  background: var(--bg-panel);
  backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
  z-index: 10;
}
.brand { font-weight: 600; color: var(--gold); letter-spacing: 1px; }
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
}
.status .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-dim); }
.status.recording { color: var(--gold); border-color: rgba(212,175,106,0.4); }
.status.recording .dot { background: var(--gold); box-shadow: 0 0 6px rgba(212,175,106,0.6); }
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
.content { flex: 1; padding: 24px; max-width: 1080px; width: 100%; margin: 0 auto; }
</style>
