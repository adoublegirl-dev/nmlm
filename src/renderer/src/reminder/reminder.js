// Reminder 提醒弹窗（P1 完整接入，P0 提供可用的兜底 UI）
import { api } from '../api'
import '../styles/theme.css'

const params = new URLSearchParams(location.search)
let payload = {}
try {
  payload = JSON.parse(decodeURIComponent(params.get('payload') || '{}'))
} catch {
  payload = {}
}

const app = document.getElementById('reminder-app')
app.innerHTML = `
  <div class="rm">
    <div class="rm-title">${payload.message || '到点了，该存档了'}</div>
    <div class="rm-sub muted">${payload.upgraded ? '今天已工作较久，建议留存证据' : '加班时间记得留证据'}</div>
    <div class="rm-actions">
      <button id="rm-ledger" class="btn primary">开始记录加班</button>
      <button id="rm-shot" class="btn">截图存证</button>
      <button id="rm-close" class="btn">忽略</button>
    </div>
  </div>
`

document.getElementById('rm-ledger').addEventListener('click', () => {
  api('ledger:start').then(() => window.close())
})
document.getElementById('rm-shot').addEventListener('click', () => {
  api('evidence:capture').then(() => window.close())
})
document.getElementById('rm-close').addEventListener('click', () => window.close())

// 30s 自动关闭
setTimeout(() => {
  try { window.close() } catch { /* noop */ }
}, 30000)
