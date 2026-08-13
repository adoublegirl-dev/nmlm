<template>
  <div class="setup-mask">
    <div class="setup-card card">
      <div class="setup-kicker">首次使用</div>
      <h1>把牛马联盟安顿好</h1>
      <p class="lead">先确认几个关键选项。这里的设置都能跳过，之后可在“设置”页面重新调整。</p>

      <div class="setup-step">
        <div class="step-no">1</div>
        <div class="step-body">
          <h3>证据库位置</h3>
          <p>截图和导入材料的 raw 原件会永久保留。建议选择空间充足、方便备份的磁盘。</p>
          <code>{{ evidenceDir || '默认：当前用户数据目录' }}</code>
          <button class="btn" @click="chooseEvidenceDir" :disabled="moving">{{ moving ? '迁移中…' : '选择证据库位置' }}</button>
        </div>
      </div>

      <div class="setup-step">
        <div class="step-no">2</div>
        <div class="step-body">
          <h3>桌面记录器</h3>
          <label class="toggle-row">
            <input type="checkbox" v-model="recorderEnabled" />
            <span>开机启动应用时显示悬浮记录器</span>
          </label>
        </div>
      </div>

      <div class="setup-step">
        <div class="step-no">3</div>
        <div class="step-body">
          <h3>提醒</h3>
          <label class="toggle-row">
            <input type="checkbox" v-model="reminderEnabled" />
            <span>开启待办与加班留证提醒</span>
          </label>
        </div>
      </div>

      <div class="shortcut-note">
        默认快捷键：F8 开始/暂停，F9 停止，F10 截图。可在设置页修改并检测冲突。
      </div>

      <div class="setup-actions">
        <button class="btn" @click="finish(true)">先跳过</button>
        <button class="btn primary" @click="finish(false)">保存并开始使用</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api'

const emit = defineEmits(['done'])
const evidenceDir = ref('')
const recorderEnabled = ref(true)
const reminderEnabled = ref(true)
const moving = ref(false)

async function load() {
  const r = await api('settings:getAll')
  const s = r.settings || {}
  evidenceDir.value = s.evidence?.dir || ''
  recorderEnabled.value = s.recorder?.enabled !== false
  reminderEnabled.value = s.reminder?.enabled !== false
}

async function chooseEvidenceDir() {
  moving.value = true
  try {
    const r = await api('evidence:migrateDir')
    if (!r.canceled) {
      evidenceDir.value = r.evidenceDir || evidenceDir.value
      if (!r.skipped) alert(`证据库位置已设置。旧目录已保留，共校验 ${r.count || 0} 个文件。`)
    }
  } catch (e) {
    alert(`设置证据库失败：${e.message}`)
  } finally {
    moving.value = false
  }
}

async function finish(skipped) {
  try {
    if (!skipped) {
      await api('settings:set', { key: 'recorder.enabled', value: recorderEnabled.value })
      await api('settings:set', { key: 'reminder.enabled', value: reminderEnabled.value })
    }
    await api('settings:set', { key: 'onboarding.completed', value: true })
    emit('done')
  } catch (e) {
    alert(`保存失败：${e.message}`)
  }
}

onMounted(load)
</script>

<style scoped>
.setup-mask { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px; background: rgba(3,8,12,.78); backdrop-filter: blur(18px); }
.setup-card { width: min(680px, 96vw); max-height: 92vh; overflow: auto; padding: 28px; background: rgba(13,24,21,.90); box-shadow: 0 28px 90px rgba(0,0,0,.48); }
.setup-kicker { color: var(--green); font-size: 12px; letter-spacing: .14em; margin-bottom: 6px; }
h1 { font-size: 26px; font-weight: 650; color: var(--gold); margin-bottom: 8px; }
.lead { color: var(--text-dim); line-height: 1.65; margin-bottom: 22px; }
.setup-step { display: grid; grid-template-columns: 32px 1fr; gap: 12px; padding: 16px 0; border-top: 1px solid var(--border); }
.step-no { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 50%; background: var(--gold-dim); color: var(--gold); font-size: 12px; }
.step-body { display: flex; flex-direction: column; align-items: flex-start; gap: 9px; }
.step-body h3 { font-size: 15px; color: var(--text-main); }
.step-body p { color: var(--text-dim); font-size: 12px; line-height: 1.55; }
.step-body code { max-width: 100%; word-break: break-all; color: var(--green); font-size: 12px; }
.toggle-row { display: flex; align-items: center; gap: 9px; color: var(--text-dim); font-size: 13px; }
.shortcut-note { margin-top: 10px; padding: 12px 14px; border-radius: 9px; background: var(--gold-dim); color: var(--text-dim); font-size: 12px; }
.setup-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }
</style>
