<template>
  <div class="system-page">
    <div class="page-head">
      <div><h2>系统与恢复</h2><p class="muted">安装、升级、数据找回、备份恢复和更新都集中在这里。</p></div>
      <button class="btn" @click="loadAll">刷新状态</button>
    </div>

    <div class="card section">
      <h3>运行诊断</h3>
      <div class="summary" :class="diagnostics.ok ? 'ok' : 'bad'">{{ diagnostics.ok ? '当前检查通过' : '发现需要处理的问题' }}</div>
      <div v-for="c in diagnostics.checks || []" :key="c.key" class="check-row">
        <span :class="c.ok ? 'check-ok' : 'check-bad'">{{ c.ok ? '✓' : '!' }}</span>
        <b>{{ c.label }}</b><span class="muted detail">{{ c.detail }}</span>
      </div>
      <div class="actions">
        <button class="btn" @click="exportDiagnostic">导出诊断报告</button>
        <button class="btn" @click="openBackups">打开备份目录</button>
      </div>
    </div>

    <div class="card section">
      <h3>证据库连接</h3>
      <div class="row"><span>当前路径</span><code>{{ diagnostics.evidence?.root || '…' }}</code></div>
      <div class="row"><span>状态</span><b :class="diagnostics.evidence?.ok ? 'check-ok' : 'check-bad'">{{ diagnostics.evidence?.ok ? '可读写' : diagnostics.evidence?.error || '不可用' }}</b></div>
      <p class="muted hint">配置过的证据盘失联时，程序不会自动创建一个假空库，也不会继续截图写入。</p>
      <div class="actions">
        <button class="btn primary" @click="relocateEvidence">重新定位已有证据库</button>
        <button class="btn" @click="rebuildEvidence">从 meta 重建证据索引</button>
      </div>
    </div>

    <div class="card section">
      <h3>配置迁移</h3>
      <p class="muted hint">配置文件不包含数据库、证据原件和访问 Token。导入后建议重启应用。</p>
      <div class="actions">
        <button class="btn" @click="exportConfig">导出配置</button>
        <button class="btn" @click="importConfig">导入配置</button>
      </div>
    </div>

    <div class="card section">
      <h3>数据库备份与恢复</h3>
      <div class="actions"><button class="btn primary" @click="backupNow">立即备份</button></div>
      <div v-if="!(diagnostics.backups || []).length" class="muted empty">暂无备份</div>
      <div v-for="b in diagnostics.backups || []" :key="b.id" class="backup-row">
        <div><b>{{ backupTime(b.createdAt) }}</b><div class="muted">{{ b.reason }} · schema {{ b.schemaVersion }} · {{ b.fromVersion || '?' }} → {{ b.toVersion || '?' }}</div></div>
        <button class="btn danger" @click="restoreBackup(b)">恢复此备份</button>
      </div>
    </div>

    <div class="card section">
      <h3>应用更新</h3>
      <div class="row"><span>当前版本</span><code>{{ diagnostics.appVersion || '…' }}</code></div>
      <div class="row"><span>更新通道</span><select class="input small" v-model="updateChannel" @change="saveUpdateSetting('channel', updateChannel)"><option value="stable">稳定版</option><option value="beta">测试版</option></select></div>
      <div class="row"><span>自动检查</span><input type="checkbox" v-model="autoCheck" @change="saveUpdateSetting('autoCheck', autoCheck)" /></div>
      <div class="row"><span>清单地址</span><input class="input url-input" v-model="manifestUrl" @change="saveUpdateSetting('manifestUrl', manifestUrl)" /></div>
      <div v-if="update.latest" class="update-box">
        <b>最新版本 {{ update.latest.version }}</b>
        <span class="muted">{{ update.latest.available ? '发现新版本' : '已经是最新版本' }}</span>
        <pre v-if="update.latest.notes">{{ update.latest.notes }}</pre>
      </div>
      <div v-if="update.error" class="error-box">{{ update.error }}</div>
      <div v-if="update.status === 'downloading'" class="progress"><i :style="{ width: update.progress + '%' }"></i></div>
      <div class="actions">
        <button class="btn" @click="checkUpdate" :disabled="busy">检查更新</button>
        <button class="btn primary" v-if="update.latest?.available && update.status !== 'downloaded'" @click="downloadUpdate" :disabled="busy">下载并校验</button>
        <button class="btn primary" v-if="update.status === 'downloaded'" @click="installUpdate">安装更新</button>
      </div>
      <p class="muted hint">更新仅接受 HTTPS，且必须通过 SHA256 校验；安装前由用户确认，不静默覆盖。</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api'

const diagnostics = ref({})
const update = ref({ status: 'idle' })
const manifestUrl = ref('')
const autoCheck = ref(false)
const updateChannel = ref('stable')
const busy = ref(false)

function backupTime(ts) { return ts ? new Date(ts).toLocaleString() : '未知时间' }
async function loadAll() {
  const [d, s, u] = await Promise.all([api('lifecycle:diagnostics'), api('settings:getAll'), api('update:status')])
  diagnostics.value = d.report || {}
  update.value = u
  manifestUrl.value = s.settings?.update?.manifestUrl || ''
  autoCheck.value = !!s.settings?.update?.autoCheck
  updateChannel.value = s.settings?.update?.channel || 'stable'
}
async function exportDiagnostic() { const r = await api('lifecycle:exportReport'); if (!r.canceled) alert(`诊断报告已保存：${r.filePath}`) }
async function openBackups() { await api('lifecycle:openBackups') }
async function relocateEvidence() { const r = await api('evidence:relocate'); if (!r.canceled) { alert(`已连接证据库；重建 ${r.inserted || 0} 条索引。`); await loadAll() } }
async function rebuildEvidence() { const r = await api('evidence:rebuildIndex'); alert(`扫描 ${r.scanned || 0} 个 meta，新增 ${r.inserted || 0} 条，错误 ${(r.errors || []).length} 条。`); await loadAll() }
async function exportConfig() { const r = await api('settings:export'); if (!r.canceled) alert(`配置已导出：${r.filePath}`) }
async function importConfig() { const r = await api('settings:import'); if (!r.canceled && confirm('配置已导入，需要重启应用。现在重启？')) await api('lifecycle:restart') }
async function backupNow() { await api('lifecycle:backup'); await loadAll(); alert('数据库备份完成') }
async function restoreBackup(b) {
  if (!confirm(`恢复 ${backupTime(b.createdAt)} 的数据库备份？当前数据库会在重启前先保留，证据原件不会被修改。`)) return
  await api('lifecycle:restore', { backupId: b.id })
  if (confirm('恢复任务已安排，必须重启应用才能生效。现在重启？')) await api('lifecycle:restart')
}
async function saveUpdateSetting(key, value) { await api('settings:set', { key: `update.${key}`, value }) }
async function checkUpdate() { busy.value = true; try { update.value = await api('update:check') } catch (e) { alert(`检查失败：${e.message}`) } finally { busy.value = false } }
async function downloadUpdate() { busy.value = true; try { update.value = await api('update:download'); if (update.value.status === 'downloaded') alert('更新包下载并校验完成') } catch (e) { alert(`下载失败：${e.message}`) } finally { busy.value = false } }
async function installUpdate() { if (!confirm('将启动新版安装器并退出牛马联盟。继续？')) return; await api('update:install') }

onMounted(loadAll)
</script>

<style scoped>
.page-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 16px; }
h2 { font-size: 18px; font-weight: 500; margin-bottom: 3px; }
.section { margin-bottom: 16px; }
.section h3 { color: var(--gold); font-size: 14px; font-weight: 500; margin-bottom: 12px; }
.summary { padding: 10px 12px; border-radius: 8px; margin-bottom: 10px; }
.summary.ok { background: rgba(127,169,140,.14); color: var(--green); }
.summary.bad, .error-box { background: rgba(208,106,92,.14); color: var(--danger); }
.check-row, .row, .backup-row { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
.check-row .detail { margin-left: auto; text-align: right; max-width: 60%; word-break: break-all; }
.check-ok { color: var(--green); }
.check-bad { color: var(--danger); }
.row > span:first-child { width: 110px; flex: 0 0 110px; }
.row code { color: var(--green); word-break: break-all; }
.backup-row { justify-content: space-between; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.hint { font-size: 12px; line-height: 1.55; }
.empty { padding: 18px 0; }
.input.small { width: 130px; }
.url-input { flex: 1; min-width: 280px; }
.update-box { display: flex; flex-direction: column; gap: 6px; padding: 12px; margin-top: 10px; background: var(--bg-panel-solid); border-radius: 8px; }
.update-box pre { white-space: pre-wrap; max-height: 180px; overflow: auto; color: var(--text-dim); font-family: inherit; font-size: 12px; }
.error-box { padding: 10px; border-radius: 8px; margin-top: 10px; }
.progress { height: 6px; background: var(--bg-panel-solid); border-radius: 999px; overflow: hidden; margin-top: 12px; }
.progress i { display: block; height: 100%; background: var(--green); transition: width .2s; }
</style>
