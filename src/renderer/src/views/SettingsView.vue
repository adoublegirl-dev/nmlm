<template>
  <div class="settings">
    <h2>设置</h2>

    <div class="card section">
      <h3>面板地址</h3>
      <div class="row">
        <span class="muted">本机访问</span>
        <code>{{ urls.local || '…' }}</code>
      </div>
      <div class="row">
        <span class="muted">局域网（手机）</span>
        <code>{{ (urls.lan || []).join(' ') }}</code>
      </div>
      <div class="row">
        <span class="muted">访问令牌</span>
        <code>{{ maskedToken }}</code>
        <button class="btn mini" @click="resetToken">重置</button>
      </div>
      <button class="btn" @click="openBrowser">在浏览器打开面板</button>
    </div>

    <div class="card section">
      <h3>桌面悬浮记录器</h3>
      <div class="row">
        <span>启动时显示</span>
        <input type="checkbox" :checked="recorder.enabled" @change="setRecorder('enabled', $event.target.checked)" />
        <span class="muted">关闭后不会自动挂在桌面，需要从托盘/启动器手动打开</span>
      </div>
    </div>

    <div class="card section">
      <h3>Agent MCP 接入</h3>
      <div class="row">
        <span class="muted">用途</span>
        <span>复制下面配置给 Agent，可通过 Agent 创建、查询、更新牛马联盟待办。</span>
      </div>
      <div class="row">
        <span class="muted">API</span>
        <code>{{ mcp.api || '…' }}</code>
      </div>
      <div class="row">
        <span class="muted">启动脚本</span>
        <code>{{ mcp.scriptPath || '…' }}</code>
      </div>
      <textarea class="input mcp-config" readonly :value="mcp.configJson || ''" rows="12"></textarea>
      <div class="mcp-actions">
        <button class="btn primary" @click="copyMcpConfig">复制 MCP 配置</button>
        <button class="btn" @click="loadMcpConfig">刷新配置</button>
      </div>
      <div class="muted hint">配置由当前安装位置动态生成，兼容中文路径；桌面端需要保持运行。</div>
    </div>

    <div class="card section">
      <h3>快捷键</h3>
      <div v-for="(acc, name) in shortcuts" :key="name" class="row">
        <span>{{ labelOf(name) }}</span>
        <code>{{ acc || '未启用' }}</code>
        <button class="btn mini" @click="recordKey(name)">录制</button>
      </div>
      <div v-if="recordingKey" class="record-hint muted">按下新的组合键…（Esc 取消）</div>
    </div>

    <div class="card section">
      <h3>标签</h3>
      <div v-for="t in tags" :key="t.id" class="row tag-row">
        <span class="color-dot" :style="{ background: t.color }"></span>
        <span class="tag-name">{{ t.name }}</span>
        <input type="color" :value="t.color" @change="setTagColor(t, $event.target.value)" title="颜色" />
        <input class="input time" type="number" min="0" max="9" :value="t.shortcut_key ?? ''" @change="setTagKey(t, $event)" title="数字键" />
        <label class="break-label"><input type="checkbox" :checked="!!t.is_break" @change="setTagBreak(t, $event.target.checked)" /> 摸鱼</label>
        <button class="btn mini danger" @click="deleteTag(t)">删除</button>
      </div>
      <div class="add-tag">
        <input v-model="newTag.name" class="input" placeholder="新标签名" @keyup.enter="addTag" />
        <input type="color" v-model="newTag.color" />
        <input class="input time" type="number" min="0" max="9" v-model.number="newTag.key" placeholder="数字键" />
        <label class="break-label"><input type="checkbox" v-model="newTag.isBreak" /> 摸鱼</label>
        <button class="btn primary" @click="addTag">添加</button>
      </div>
      <div class="muted hint">结束记录时按数字键即可快速打标签，0 表示"其他"</div>
    </div>

    <div class="card section">
      <h3>提醒</h3>
      <div class="row">
        <span>启用提醒</span>
        <input type="checkbox" :checked="reminder.enabled" @change="setReminder('enabled', $event.target.checked)" />
      </div>
      <div class="row">
        <span>检测时段</span>
        <input class="input time" :value="reminder.checkStart" @change="setReminder('checkStart', $event.target.value)" />
        <span class="muted">至</span>
        <input class="input time" :value="reminder.checkEnd" @change="setReminder('checkEnd', $event.target.value)" />
      </div>
      <div class="row">
        <span>暗号文案</span>
        <input class="input" :value="reminder.message" @change="setReminder('message', $event.target.value)" />
      </div>
      <div class="row">
        <span>升级文案（超工时）</span>
        <input class="input" :value="reminder.messageUpgraded" @change="setReminder('messageUpgraded', $event.target.value)" />
      </div>
      <div class="row">
        <span>工时阈值（小时）</span>
        <input class="input time" type="number" :value="reminder.workHoursThreshold" @change="setReminder('workHoursThreshold', Number($event.target.value))" />
      </div>
    </div>

    <div class="card section">
      <h3>证据</h3>
      <div class="row">
        <span>截图保留天数</span>
        <input class="input time" type="number" :value="evidence.keepDays" @change="setEvidence('keepDays', Number($event.target.value))" />
      </div>
      <div class="row">
        <span>水印</span>
        <input type="checkbox" :checked="evidence.watermark" @change="setEvidence('watermark', $event.target.checked)" />
      </div>
      <button class="btn" @click="openScreenshotsDir">打开截图目录</button>
    </div>

    <div class="card section">
      <h3>模型（P2 开放）</h3>
      <div class="row">
        <span>provider</span>
        <select class="input time" :value="model.provider" @change="setModel('provider', $event.target.value)">
          <option value="ollama">ollama</option>
          <option value="openai">openai</option>
        </select>
      </div>
      <div class="row">
        <span>baseURL</span>
        <input class="input" :value="model.baseURL" @change="setModel('baseURL', $event.target.value)" />
      </div>
      <div class="row">
        <span>model</span>
        <input class="input" :value="model.model" @change="setModel('model', $event.target.value)" />
      </div>
      <span class="muted">报告生成将在 P2 实现</span>
    </div>

    <div class="card section">
      <h3>关于</h3>
      <div class="row"><span class="muted">版本</span><code>0.1.0 (P0)</code></div>
      <div class="row"><span class="muted">协议</span><span>MIT · 开源 · 数据全本地</span></div>
      <div class="row"><span class="muted">数据目录</span><code>{{ userData }}</code></div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'

const urls = ref({})
const token = ref('')
const userData = ref('')
const shortcuts = ref({})
const reminder = ref({})
const evidence = ref({})
const model = ref({})
const recorder = ref({})
const mcp = ref({})
const tags = ref([])
const newTag = ref({ name: '', color: '#e0bc72', key: null, isBreak: false })
const recordingKey = ref(null)
const recordingName = ref('')

const maskedToken = computed(() => {
  if (!token.value) return '…'
  return token.value.slice(0, 6) + '••••'
})

const LABELS = { start: '开始/暂停记录', stop: '停止记录', screenshot: '快捷截图', pack: '打包证据链', openPanel: '打开面板' }
function labelOf(name) {
  return LABELS[name] || name
}

async function load() {
  const r = await api('settings:getAll')
  const s = r.settings
  urls.value = s.server.urls || {}
  token.value = s.server.token || ''
  shortcuts.value = s.shortcuts || {}
  reminder.value = s.reminder || {}
  evidence.value = s.evidence || {}
  model.value = s.model || {}
  recorder.value = s.recorder || s.mini || {}
  const info = await api('server:info')
  urls.value = info.urls || urls.value
  token.value = info.token || token.value
  userData.value = info.userData || ''
  const tagRes = await api('tags:list')
  tags.value = tagRes.tags || []
  await loadMcpConfig()
}

async function setReminder(key, val) {
  await api('settings:set', { key: `reminder.${key}`, value: val })
}
async function setEvidence(key, val) {
  await api('settings:set', { key: `evidence.${key}`, value: val })
}
async function setModel(key, val) {
  await api('settings:set', { key: `model.${key}`, value: val })
}
async function setRecorder(key, val) {
  await api('settings:set', { key: `recorder.${key}`, value: val })
  recorder.value[key] = val
}

async function resetToken() {
  const t = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  await api('settings:set', { key: 'server.token', value: t })
  token.value = t
  alert('令牌已重置')
}

async function setTagColor(t, color) {
  await api('tags:update', { id: t.id, color })
  t.color = color
}
async function setTagKey(t, e) {
  const v = e.target.value === '' ? null : Number(e.target.value)
  await api('tags:update', { id: t.id, shortcutKey: v })
  t.shortcut_key = v
}
async function setTagBreak(t, isBreak) {
  await api('tags:update', { id: t.id, isBreak: isBreak ? 1 : 0 })
  t.is_break = isBreak ? 1 : 0
}
async function deleteTag(t) {
  if (!confirm(`删除标签「${t.name}」？相关记录将变为未分类`)) return
  await api('tags:delete', { id: t.id })
  tags.value = tags.value.filter((x) => x.id !== t.id)
}
async function addTag() {
  const name = newTag.value.name.trim()
  if (!name) return
  await api('tags:create', {
    name,
    color: newTag.value.color,
    shortcutKey: newTag.value.key,
    isBreak: newTag.value.isBreak ? 1 : 0
  })
  newTag.value = { name: '', color: '#e0bc72', key: null, isBreak: false }
  const tagRes = await api('tags:list')
  tags.value = tagRes.tags || []
}

function openBrowser() {
  api('server:openBrowser')
}

function openScreenshotsDir() {
  api('app:openScreenshotsDir')
}

async function loadMcpConfig() {
  const r = await api('server:mcpConfig')
  if (r.ok) mcp.value = r
}

async function copyMcpConfig() {
  if (!mcp.value.configJson) await loadMcpConfig()
  try {
    await navigator.clipboard.writeText(mcp.value.configJson || '')
    alert('MCP 配置已复制')
  } catch (_) {
    const ta = document.createElement('textarea')
    ta.value = mcp.value.configJson || ''
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    alert('MCP 配置已复制')
  }
}

function recordKey(name) {
  recordingName.value = name
  recordingKey.value = true
  window.addEventListener('keydown', onKeyDown, true)
}

function onKeyDown(e) {
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape') {
    finishRecord(null)
    return
  }
  const mods = []
  if (e.ctrlKey) mods.push('CommandOrControl')
  if (e.shiftKey) mods.push('Shift')
  if (e.altKey) mods.push('Alt')
  if (e.metaKey) mods.push('Meta')
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key
  const combo = [...mods, key].join('+')
  if (mods.length === 0) return
  if (/(Shift|Alt)\+[0-9]$/.test(combo)) {
    alert('数字组合在 Windows 全局快捷键里容易撞系统/显卡/桌面热键，建议用 F8/F9/F10 这类功能键。')
    return
  }
  finishRecord(combo)
}

function finishRecord(combo) {
  window.removeEventListener('keydown', onKeyDown, true)
  recordingKey.value = false
  if (combo) {
    api('settings:set', { key: `shortcuts.${recordingName.value}`, value: combo }).then(() => {
      shortcuts.value[recordingName.value] = combo
    })
  }
  recordingName.value = ''
}

onMounted(() => {
  load()
})
</script>

<style scoped>
h2 { font-size: 18px; font-weight: 500; margin-bottom: 16px; }
.section { margin-bottom: 16px; }
.section h3 { font-size: 14px; font-weight: 500; margin-bottom: 12px; color: var(--gold); }
.row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; font-size: 13px; }
.row span:first-child { min-width: 110px; }
code { font-family: ui-monospace, monospace; font-size: 12px; color: var(--green); background: var(--bg-panel-solid); padding: 2px 8px; border-radius: 4px; }
.input { width: auto; }
.input.time { width: 110px; }
.btn.mini { padding: 2px 10px; font-size: 12px; }
.record-hint { margin-top: 8px; font-size: 12px; }
select.input { width: 130px; }
.tag-row { gap: 8px; }
.color-dot { width: 14px; height: 14px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.25); flex-shrink: 0; }
.tag-name { min-width: 56px; }
.break-label { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-dim); }
.add-tag { display: flex; gap: 8px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
.add-tag .input:first-child { flex: 1; min-width: 120px; }
.hint { font-size: 12px; margin-top: 8px; }
.mcp-config {
  width: 100%;
  min-height: 220px;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
}
.mcp-actions { display: flex; gap: 8px; margin-top: 10px; }
</style>
