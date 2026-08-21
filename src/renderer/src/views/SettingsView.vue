<template>
  <div class="settings-page">
    <div class="settings-hero">
      <div>
        <p class="eyebrow">Control Center</p>
        <h2>设置中心</h2>
        <p class="muted">把记录、证据、隐私、Agent 接入分开管理，避免功能堆在一起。</p>
      </div>
      <button class="btn primary" @click="$emit('open-setup')">重新打开首次设置向导</button>
    </div>

    <div class="settings-layout">
      <aside class="settings-nav card">
        <a v-for="item in navs" :key="item.id" :href="'#' + item.id" class="settings-nav-item">
          <span>{{ item.icon }}</span><b>{{ item.label }}</b>
        </a>
      </aside>

      <main class="settings-main">
        <section id="basic" class="settings-section card">
          <div class="section-head">
            <div><p class="eyebrow">Basic</p><h3>基础与本地服务</h3></div>
            <button class="btn" @click="openBrowser">浏览器打开后台</button>
          </div>
          <div class="setting-grid">
            <div class="setting-item"><span>本机访问</span><code>{{ urls.local || '…' }}</code></div>
            <div class="setting-item"><span>局域网访问</span><code>{{ (urls.lan || []).join(' ') || '…' }}</code></div>
            <div class="setting-item"><span>访问令牌</span><code>{{ maskedToken }}</code><button class="btn mini" @click="resetToken">重置</button></div>
            <div class="setting-item"><span>版本</span><code>{{ appVersion || '…' }}</code></div>
            <div class="setting-item wide"><span>数据目录</span><code>{{ userData || '…' }}</code></div>
          </div>
        </section>

        <section id="record" class="settings-section card">
          <div class="section-head">
            <div><p class="eyebrow">Recorder</p><h3>记录器、快捷键与标签</h3></div>
          </div>
          <div class="setting-row soft-row">
            <div><b>启动时显示悬浮记录器</b><p class="muted">关闭后不会自动挂在桌面，需要从托盘手动打开。</p></div>
            <label class="switch"><input type="checkbox" :checked="recorder.enabled" @change="setRecorder('enabled', $event.target.checked)" /><i></i></label>
          </div>
          <div class="sub-card">
            <div class="sub-title">快捷键</div>
            <div v-for="(acc, name) in shortcuts" :key="name" class="compact-row">
              <span>{{ labelOf(name) }}</span><code>{{ acc || '未启用' }}</code>
              <button class="btn mini" @click="recordKey(name)">录制</button>
              <button class="btn mini" @click="clearShortcut(name)">清空</button>
            </div>
            <div v-if="recordingKey" class="record-hint muted">按下新的组合键…（Esc 取消）</div>
          </div>
          <div class="sub-card">
            <div class="sub-title">标签</div>
            <div v-for="t in tags" :key="t.id" class="tag-row">
              <span class="color-dot" :style="{ background: t.color }"></span>
              <span class="tag-name">{{ t.name }}</span>
              <input type="color" :value="t.color" @change="setTagColor(t, $event.target.value)" />
              <input class="input mini-input" type="number" min="0" max="9" :value="t.shortcut_key ?? ''" @change="setTagKey(t, $event)" />
              <label class="break-label"><input type="checkbox" :checked="!!t.is_break" @change="setTagBreak(t, $event.target.checked)" /> 暂停/离开</label>
              <button class="btn mini danger" @click="deleteTag(t)">删除</button>
            </div>
            <div class="add-tag">
              <input v-model="newTag.name" class="input" placeholder="新标签名" @keyup.enter="addTag" />
              <input type="color" v-model="newTag.color" />
              <input class="input mini-input" type="number" min="0" max="9" v-model.number="newTag.key" placeholder="数字键" />
              <label class="break-label"><input type="checkbox" v-model="newTag.isBreak" /> 暂停/离开</label>
              <button class="btn primary" @click="addTag">添加</button>
            </div>
          </div>
        </section>

        <section id="activity" class="settings-section card">
          <div class="section-head">
            <div><p class="eyebrow">Privacy & Activity</p><h3>活动轨迹与隐私</h3></div>
          </div>
          <div class="setting-row soft-row">
            <div><b>启用被动活动记录</b><p class="muted">只记录前台应用、窗口标题和空闲秒数，不记录键盘输入内容。</p></div>
            <label class="switch"><input type="checkbox" :checked="activity.enabled !== false" @change="setActivity('enabled', $event.target.checked)" /><i></i></label>
          </div>
          <div class="setting-row soft-row">
            <div><b>敏感窗口标题脱敏</b><p class="muted">默认关闭。开启后，命中进程或标题关键词的轨迹会显示为“敏感窗口 · 已脱敏”。</p></div>
            <label class="switch"><input type="checkbox" :checked="privacy.blurSensitiveWindows" @change="setPrivacy('blurSensitiveWindows', $event.target.checked)" /><i></i></label>
          </div>
          <div class="form-grid">
            <label>采样间隔（秒）<input class="input" type="number" min="10" :value="activity.pollIntervalSec || 30" @change="setActivity('pollIntervalSec', Number($event.target.value))" /></label>
            <label>空闲阈值（秒）<input class="input" type="number" min="30" :value="activity.idleThresholdSec || 300" @change="setActivity('idleThresholdSec', Number($event.target.value))" /></label>
            <label>最短线索（秒）<input class="input" type="number" min="15" :value="activity.minSuggestionSec || 60" @change="setActivity('minSuggestionSec', Number($event.target.value))" /></label>
          </div>
          <div class="sub-card privacy-card">
            <div class="sub-title">脱敏与噪声规则</div>
            <label>敏感进程（逗号或换行分隔）<textarea class="input list-input" :value="listText('sensitiveProcesses')" @change="setPrivacyList('sensitiveProcesses', $event.target.value)" rows="3"></textarea></label>
            <label>敏感标题关键词<textarea class="input list-input" :value="listText('sensitiveTitlePatterns')" @change="setPrivacyList('sensitiveTitlePatterns', $event.target.value)" rows="3" placeholder="身份证、密码、薪资…"></textarea></label>
            <label>忽略为空闲/噪声的进程<textarea class="input list-input" :value="listText('activityIgnoredProcesses')" @change="setPrivacyList('activityIgnoredProcesses', $event.target.value)" rows="3"></textarea></label>
            <label>忽略为空闲/噪声的窗口标题<textarea class="input list-input" :value="listText('activityIgnoredTitles')" @change="setPrivacyList('activityIgnoredTitles', $event.target.value)" rows="3"></textarea></label>
          </div>
        </section>

        <section id="evidence" class="settings-section card">
          <div class="section-head">
            <div><p class="eyebrow">Evidence</p><h3>证据库</h3></div>
            <button class="btn" @click="openScreenshotsDir">打开证据库目录</button>
          </div>
          <div class="notice-box">原始证据永久保留在 raw 目录，系统不会加水印、压缩替换或自动物理删除。</div>
          <div class="setting-grid">
            <div class="setting-item"><span>缩略图缓存保留天数</span><input class="input mini-input" type="number" :value="evidence.keepDays" @change="setEvidence('keepDays', Number($event.target.value))" /></div>
            <div class="setting-item"><span>导出副本加水印</span><label class="switch"><input type="checkbox" :checked="evidence.watermark" @change="setEvidence('watermark', $event.target.checked)" /><i></i></label></div>
            <div class="setting-item wide"><span>自定义根目录</span><code>{{ evidence.dir || '默认用户数据目录' }}</code></div>
          </div>
          <button class="btn primary" @click="migrateEvidenceDir">迁移证据库位置</button>
        </section>

        <section id="agent" class="settings-section card">
          <div class="section-head">
            <div><p class="eyebrow">Agent</p><h3>MCP 接入</h3></div>
            <button class="btn" @click="loadMcpConfig">刷新配置</button>
          </div>
          <div class="setting-grid">
            <div class="setting-item wide"><span>API</span><code>{{ mcp.api || '…' }}</code></div>
            <div class="setting-item wide"><span>启动脚本</span><code>{{ mcp.scriptPath || '…' }}</code></div>
          </div>
          <textarea class="input mcp-config" readonly :value="mcp.configJson || ''" rows="10"></textarea>
          <button class="btn primary" @click="copyMcpConfig">复制 MCP 配置</button>
          <div class="muted hint">当前支持待办、台账查询、证据查询；证据导入暂不开放，避免污染证据库。</div>
        </section>

        <section id="model" class="settings-section card">
          <div class="section-head"><div><p class="eyebrow">Model</p><h3>模型（预留）</h3></div></div>
          <div class="form-grid">
            <label>provider<select class="input" :value="model.provider" @change="setModel('provider', $event.target.value)"><option value="ollama">ollama</option><option value="openai">openai</option></select></label>
            <label>baseURL<input class="input" :value="model.baseURL" @change="setModel('baseURL', $event.target.value)" /></label>
            <label>model<input class="input" :value="model.model" @change="setModel('model', $event.target.value)" /></label>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'
import { showAlert, showConfirm } from '../utils/dialog'

defineEmits(['open-setup'])

const navs = [
  { id: 'basic', label: '基础', icon: '◎' },
  { id: 'record', label: '记录', icon: '◷' },
  { id: 'activity', label: '轨迹隐私', icon: '⌁' },
  { id: 'evidence', label: '证据', icon: '◈' },
  { id: 'agent', label: 'Agent', icon: '✦' },
  { id: 'model', label: '模型', icon: '◇' }
]

const urls = ref({})
const token = ref('')
const userData = ref('')
const appVersion = ref('')
const shortcuts = ref({})
const reminder = ref({})
const evidence = ref({})
const activity = ref({})
const privacy = ref({})
const model = ref({})
const recorder = ref({})
const mcp = ref({})
const tags = ref([])
const newTag = ref({ name: '', color: '#e0bc72', key: null, isBreak: false })
const recordingKey = ref(null)
const recordingName = ref('')

const maskedToken = computed(() => token.value ? token.value.slice(0, 6) + '••••' : '…')
const LABELS = { start: '开始/暂停记录', stop: '停止记录', screenshot: '快捷截图', pack: '打包证据链', openPanel: '打开面板' }
function labelOf(name) { return LABELS[name] || name }
function parseList(value) { return String(value || '').split(/[\n,，]/).map((x) => x.trim()).filter(Boolean) }
function listText(key) { return (privacy.value[key] || []).join('\n') }

async function load() {
  const r = await api('settings:getAll')
  const s = r.settings
  urls.value = s.server.urls || {}
  token.value = s.server.token || ''
  shortcuts.value = s.shortcuts || {}
  reminder.value = s.reminder || {}
  evidence.value = s.evidence || {}
  activity.value = s.activity || {}
  privacy.value = s.privacy || {}
  model.value = s.model || {}
  recorder.value = s.recorder || s.mini || {}
  const info = await api('server:info')
  urls.value = info.urls || urls.value
  token.value = info.token || token.value
  userData.value = info.userData || ''
  appVersion.value = info.version || ''
  const tagRes = await api('tags:list')
  tags.value = tagRes.tags || []
  await loadMcpConfig()
}
async function setReminder(key, val) { await api('settings:set', { key: `reminder.${key}`, value: val }); reminder.value[key] = val }
async function setEvidence(key, val) { await api('settings:set', { key: `evidence.${key}`, value: val }); evidence.value[key] = val }
async function setActivity(key, val) { await api('settings:set', { key: `activity.${key}`, value: val }); activity.value[key] = val }
async function setPrivacy(key, val) { await api('settings:set', { key: `privacy.${key}`, value: val }); privacy.value[key] = val }
async function setPrivacyList(key, val) { await setPrivacy(key, parseList(val)) }
async function setModel(key, val) { await api('settings:set', { key: `model.${key}`, value: val }); model.value[key] = val }
async function setRecorder(key, val) { await api('settings:set', { key: `recorder.${key}`, value: val }); recorder.value[key] = val }

async function resetToken() {
  const ok = await showConfirm('重置后旧的局域网/Agent 访问令牌会失效，是否继续？', { title: '重置访问令牌', confirmText: '重置' })
  if (!ok) return
  const t = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  await api('settings:set', { key: 'server.token', value: t })
  token.value = t
  await showAlert('令牌已重置')
}
async function setTagColor(t, color) { await api('tags:update', { id: t.id, color }); t.color = color }
async function setTagKey(t, e) { const v = e.target.value === '' ? null : Number(e.target.value); await api('tags:update', { id: t.id, shortcutKey: v }); t.shortcut_key = v }
async function setTagBreak(t, isBreak) { await api('tags:update', { id: t.id, isBreak: isBreak ? 1 : 0 }); t.is_break = isBreak ? 1 : 0 }
async function deleteTag(t) {
  const ok = await showConfirm(`删除标签「${t.name}」？相关记录将变为未分类。`, { title: '删除标签', confirmText: '删除', danger: true })
  if (!ok) return
  await api('tags:delete', { id: t.id })
  tags.value = tags.value.filter((x) => x.id !== t.id)
}
async function addTag() {
  const name = newTag.value.name.trim()
  if (!name) return
  await api('tags:create', { name, color: newTag.value.color, shortcutKey: newTag.value.key, isBreak: newTag.value.isBreak ? 1 : 0 })
  newTag.value = { name: '', color: '#e0bc72', key: null, isBreak: false }
  const tagRes = await api('tags:list')
  tags.value = tagRes.tags || []
}
function openBrowser() { api('server:openBrowser') }
function openScreenshotsDir() { api('app:openScreenshotsDir') }
async function migrateEvidenceDir() {
  try {
    const r = await api('evidence:migrateDir')
    if (r.canceled) return
    if (r.skipped) return showAlert('新旧证据库位置相同，无需迁移')
    await load()
    await showAlert(`证据库迁移完成：${r.count || 0} 个文件。旧目录已保留。`)
  } catch (e) { await showAlert(`迁移失败：${e.message}`, '迁移失败') }
}
async function loadMcpConfig() { const r = await api('server:mcpConfig'); if (r.ok) mcp.value = r }
async function copyMcpConfig() {
  if (!mcp.value.configJson) await loadMcpConfig()
  try { await navigator.clipboard.writeText(mcp.value.configJson || '') } catch (_) {
    const ta = document.createElement('textarea'); ta.value = mcp.value.configJson || ''; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
  }
  await showAlert('MCP 配置已复制')
}
function recordKey(name) { recordingName.value = name; recordingKey.value = true; window.addEventListener('keydown', onKeyDown, true) }
async function onKeyDown(e) {
  e.preventDefault(); e.stopPropagation()
  if (e.key === 'Escape') return finishRecord(null)
  const mods = []
  if (e.ctrlKey) mods.push('CommandOrControl')
  if (e.shiftKey) mods.push('Shift')
  if (e.altKey) mods.push('Alt')
  if (e.metaKey) mods.push('Meta')
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return
  const isFunctionKey = /^F([1-9]|1[0-9]|2[0-4])$/.test(key)
  if (mods.length === 0 && !isFunctionKey) return
  const combo = [...mods, key].join('+')
  if (/(Shift|Alt)\+[0-9]$/.test(combo)) return showAlert('数字组合在 Windows 全局快捷键里容易撞系统/显卡/桌面热键，建议用 F8/F9/F10 这类功能键。')
  finishRecord(combo)
}
async function applyShortcut(name, combo) {
  try {
    await api('settings:set', { key: `shortcuts.${name}`, value: combo || '' })
    shortcuts.value[name] = combo || ''
    await showAlert(combo ? `快捷键已更新：${combo}` : '快捷键已清空')
  } catch (e) { await showAlert(`快捷键设置失败：${e.message}`, '快捷键设置失败') }
}
async function clearShortcut(name) {
  const ok = await showConfirm(`清空「${labelOf(name)}」快捷键？`, { title: '清空快捷键', confirmText: '清空' })
  if (!ok) return
  applyShortcut(name, '')
}
function finishRecord(combo) { window.removeEventListener('keydown', onKeyDown, true); recordingKey.value = false; const name = recordingName.value; recordingName.value = ''; if (combo) applyShortcut(name, combo) }
onMounted(load)
</script>

<style scoped>
.settings-page { max-width: 1180px; margin: 0 auto; }
.settings-hero { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 18px; padding: 18px 20px; border: 1px solid var(--border); border-radius: 18px; background: linear-gradient(135deg, rgba(224,188,114,.12), rgba(127,169,140,.07)); backdrop-filter: blur(14px); }
.settings-hero h2 { font-size: 24px; font-weight: 800; margin: 2px 0 6px; }
.eyebrow { color: var(--green); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 4px; }
.settings-layout { display: grid; grid-template-columns: 188px minmax(0, 1fr); gap: 16px; align-items: start; }
.settings-nav { position: sticky; top: 86px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
.settings-nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 11px; border-radius: 11px; color: var(--text-dim); text-decoration: none; }
.settings-nav-item:hover { background: var(--bg-hover); color: var(--text-main); }
.settings-nav-item span { color: var(--gold); }
.settings-main { display: flex; flex-direction: column; gap: 16px; }
.settings-section { padding: 18px; border-radius: 18px; }
.section-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
.section-head h3 { font-size: 17px; font-weight: 700; color: var(--text-main); }
.setting-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.setting-item, .setting-row, .compact-row, .tag-row { border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.045); border-radius: 12px; padding: 10px 12px; }
.setting-item { display: flex; align-items: center; gap: 10px; min-height: 42px; }
.setting-item.wide { grid-column: 1 / -1; }
.setting-item span, .compact-row span { min-width: 92px; color: var(--text-dim); font-size: 12px; }
.setting-row { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-bottom: 10px; }
.setting-row p { margin-top: 4px; font-size: 12px; line-height: 1.5; }
.sub-card { margin-top: 12px; padding: 12px; border: 1px solid rgba(255,255,255,.08); border-radius: 14px; background: rgba(0,0,0,.08); }
.sub-title { color: var(--gold); font-size: 13px; font-weight: 700; margin-bottom: 10px; }
.compact-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.form-grid label, .privacy-card label { display: flex; flex-direction: column; gap: 6px; color: var(--text-dim); font-size: 12px; }
code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; color: var(--green); background: var(--bg-panel-solid); padding: 3px 8px; border-radius: 6px; word-break: break-all; }
.input { width: 100%; }
.mini-input { width: 96px; }
.btn.mini { padding: 3px 10px; font-size: 12px; }
.switch { position: relative; width: 42px; height: 24px; display: inline-block; flex: 0 0 auto; }
.switch input { display: none; }
.switch i { position: absolute; inset: 0; border-radius: 999px; background: rgba(255,255,255,.13); border: 1px solid rgba(255,255,255,.12); transition: .16s; }
.switch i::after { content: ''; position: absolute; width: 18px; height: 18px; left: 2px; top: 2px; border-radius: 999px; background: var(--text-dim); transition: .16s; }
.switch input:checked + i { background: rgba(224,188,114,.24); border-color: rgba(224,188,114,.42); }
.switch input:checked + i::after { transform: translateX(18px); background: var(--gold); }
.tag-row { display: grid; grid-template-columns: 18px minmax(80px, 1fr) 46px 90px 120px auto; gap: 8px; align-items: center; margin-bottom: 8px; }
.color-dot { width: 14px; height: 14px; border-radius: 50%; border: 1px solid rgba(255,255,255,.25); }
.break-label { display: inline-flex; align-items: center; gap: 5px; color: var(--text-dim); font-size: 12px; }
.add-tag { display: grid; grid-template-columns: minmax(120px, 1fr) 46px 96px 120px auto; gap: 8px; align-items: center; }
.record-hint, .hint { font-size: 12px; margin-top: 8px; }
.list-input { resize: vertical; min-height: 70px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.privacy-card { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.privacy-card .sub-title { grid-column: 1 / -1; }
.notice-box { margin-bottom: 12px; border: 1px solid rgba(127,169,140,.28); background: rgba(127,169,140,.10); color: var(--text-main); border-radius: 12px; padding: 10px 12px; font-size: 13px; }
.mcp-config { width: 100%; min-height: 190px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; line-height: 1.5; resize: vertical; margin-bottom: 10px; }
@media (max-width: 920px) { .settings-layout { grid-template-columns: 1fr; } .settings-nav { position: static; flex-direction: row; flex-wrap: wrap; } .setting-grid, .form-grid, .privacy-card { grid-template-columns: 1fr; } .tag-row, .add-tag { grid-template-columns: 1fr; } }
</style>
