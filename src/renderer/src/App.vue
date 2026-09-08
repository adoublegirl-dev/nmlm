<template>
  <div class="layout" :class="themeClass">
    <div class="page-background" aria-hidden="true">
      <img :src="activeBackground" alt="" />
      <div class="background-veils"></div>
    </div>
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand">
          <span class="brand-scene" aria-hidden="true">
            <video :src="pastureVideo" :poster="activeBackground" autoplay muted loop playsinline></video>
          </span>
          <span class="brand-copy"><b>牛马联盟</b><small>WORKDAY LEDGER</small></span>
        </div>
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
      </div>
    </header>

    <main class="content">
      <LedgerView v-if="route === 'ledger'" />
      <EvidenceView v-else-if="route === 'evidence'" />
      <ReportView v-else-if="route === 'report'" />
      <ToolsView v-else-if="route === 'tools'" />
      <TodosView v-else-if="route === 'todos'" />
      <SettingsView v-else-if="route === 'settings'" @open-setup="showSetup = true" />
      <SystemView v-else-if="route === 'system'" />
    </main>
    <SetupView v-if="showSetup" @done="showSetup = false" />
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
import SystemView from './views/SystemView.vue'
import SetupView from './views/SetupView.vue'
import pastureStill from './assets/recorder-active-video.png'
import pastureVideo from './assets/recorder-mini-video.webm'

const navs = [
  { key: 'ledger', label: '台账' },
  { key: 'evidence', label: '证据' },
  { key: 'report', label: '报表' },
  { key: 'tools', label: '工具' },
  { key: 'todos', label: '待办' },
  { key: 'settings', label: '设置' },
  { key: 'system', label: '系统' }
]

const savedTheme = localStorage.getItem('nmlm.panelTheme')
const pastureTheme = ref(savedTheme === 'night' ? 'night' : 'day')
document.documentElement.dataset.panelTheme = pastureTheme.value
const route = ref(location.hash.replace('#', '') || 'ledger')
const showSetup = ref(false)
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
const activeBackground = computed(() => pastureStill)

function toggleTheme() {
  pastureTheme.value = pastureTheme.value === 'day' ? 'night' : 'day'
  document.documentElement.dataset.panelTheme = pastureTheme.value
  localStorage.setItem('nmlm.panelTheme', pastureTheme.value)
  window.dispatchEvent(new CustomEvent('nmlm:theme-changed', { detail: { theme: pastureTheme.value } }))
}

async function refresh() {
  try {
    const [cur, eff, tagRes, settingRes] = await Promise.all([
      api('ledger:current'),
      api('report:effectiveHours', { date: Date.now() }),
      api('tags:list'),
      api('settings:getAll')
    ])
    currentEntry.value = cur.entry
    recording.value = !!cur.entry
    effectiveSec.value = eff.sec
    tags.value = tagRes.tags
    if (settingRes.settings?.onboarding?.completed !== true) showSetup.value = true
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
  z-index: 0;
  overflow-x: hidden;
  color: var(--text-main);
  transition: color .22s ease, background .22s ease;
}
.page-background {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  background: #106bbf;
}
.page-background img {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  height: auto;
  object-fit: contain;
  object-position: center bottom;
  opacity: 1;
  filter: saturate(.96) contrast(.96) brightness(1.03);
  transition: filter .28s ease, opacity .28s ease;
}
.background-veils {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: none;
}
.theme-pasture-night .page-background { background: #0b2d4b; }
.theme-pasture-night .page-background img { opacity: 1; filter: saturate(.66) contrast(1.03) brightness(.42) hue-rotate(7deg); }
.theme-pasture-night .background-veils { background: none; }
.topbar {
  position: sticky;
  top: 0;
  z-index: 50;
  padding: 10px 24px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--paper-strong) 91%, transparent);
  box-shadow: 0 9px 28px rgba(67,47,25,.12), inset 0 -1px 0 rgba(255,255,255,.35);
  backdrop-filter: blur(18px) saturate(.92);
}
.topbar-inner {
  width: min(1180px, 100%);
  min-height: 48px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 14px;
}
.brand { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
.brand-scene {
  position: relative;
  width: 58px;
  height: 38px;
  overflow: hidden;
  border: 2px solid #6e5c49;
  border-radius: 10px;
  background: #262424;
  box-shadow: inset 0 0 0 2px #262424, 0 4px 10px rgba(58,38,20,.18);
}
.brand-scene::after { content: ''; position: absolute; inset: 2px; border-radius: 6px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); pointer-events: none; }
.brand-scene video { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; transition: filter .22s ease; }
.theme-pasture-night .brand-scene video { filter: brightness(.72) saturate(.72); }
.brand-copy { display: flex; flex-direction: column; line-height: 1; }
.brand-copy b { color: var(--brown); font-size: 16px; font-weight: 760; letter-spacing: .08em; }
.brand-copy small { margin-top: 5px; color: var(--text-dim); font-family: Georgia, serif; font-size: 8px; letter-spacing: .17em; }
.status {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 11px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-soft);
  color: var(--text-dim);
  font-size: 12px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.25);
}
.status .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--sage); box-shadow: 0 0 0 3px color-mix(in srgb, var(--sage) 12%, transparent); }
.status.recording { color: var(--brown); border-color: var(--border-strong); background: var(--gold-dim); }
.status.recording .dot { background: var(--brown); box-shadow: 0 0 0 3px var(--gold-dim), 0 0 10px color-mix(in srgb, var(--brown) 36%, transparent); }
.nav { display: flex; align-items: center; gap: 2px; margin-left: auto; }
.nav a {
  position: relative;
  color: var(--text-dim);
  text-decoration: none;
  padding: 8px 11px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  transition: color .14s ease, background .14s ease;
}
.nav a::after { content: ''; position: absolute; left: 12px; right: 12px; bottom: 3px; height: 2px; border-radius: 999px; background: var(--brown); opacity: 0; transform: scaleX(.45); transition: opacity .14s ease, transform .14s ease; }
.nav a:hover { background: var(--bg-hover); color: var(--brown); }
.nav a:focus-visible, .theme-toggle:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
.nav a.active { background: var(--gold-dim); color: var(--brown); }
.nav a.active::after { opacity: 1; transform: scaleX(1); }
.theme-toggle {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--paper-strong);
  color: var(--brown-text);
  font-size: 11px;
  cursor: pointer;
  transition: background .14s ease, border-color .14s ease;
}
.theme-toggle:hover { background: var(--paper-deep); border-color: var(--border-strong); }
.theme-dot { width: 8px; height: 8px; border-radius: 50%; background: #d5a63f; box-shadow: 0 0 0 3px rgba(213,166,63,.13); }
.theme-pasture-night .theme-dot { background: #a7b8a1; box-shadow: 0 0 0 3px rgba(167,184,161,.12), 0 0 9px rgba(167,184,161,.42); }
.content {
  flex: 1;
  position: relative;
  isolation: isolate;
  width: min(1180px, 100%);
  margin: 0 auto;
  padding: 24px 24px 44px;
}
.content::before {
  content: '';
  position: absolute;
  z-index: -1;
  inset: 8px 4px 24px;
  border-radius: 30px;
  background: radial-gradient(circle at 50% 0, rgba(255,255,255,.16), transparent 42%);
  pointer-events: none;
}
@media (max-width: 1060px) {
  .topbar-inner { flex-wrap: wrap; row-gap: 8px; }
  .nav { order: 3; width: 100%; margin-left: 0; overflow-x: auto; padding-top: 1px; }
}
@media (max-width: 720px) {
  .topbar { padding: 8px 14px; }
  .topbar-inner { gap: 9px; }
  .brand-scene { width: 50px; height: 34px; }
  .brand-copy small { display: none; }
  .status { margin-left: auto; }
  .theme-toggle { font-size: 0; padding: 5px 8px; }
  .nav a { flex: 0 0 auto; padding: 7px 10px; }
  .content { padding: 18px 14px 34px; }
  .page-background img { width: auto; min-width: 100%; height: 58%; object-fit: cover; object-position: center bottom; }
}
@media (prefers-reduced-motion: reduce) {
  .page-background img, .nav a, .nav a::after, .theme-toggle, .brand-scene video { transition: none; }
}
</style>
