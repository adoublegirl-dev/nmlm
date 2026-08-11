// 渲染层格式化工具（与主进程 utils/time.js 逻辑一致，纯前端版）

export function formatDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0))
  if (sec < 60) return `${sec}s`
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}m`
}

export function formatTime(ts, { seconds = false } = {}) {
  const d = new Date(ts)
  const base = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (!seconds) return base
  return `${base}:${String(d.getSeconds()).padStart(2, '0')}`
}

export function formatDate(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dayLabel(ts) {
  const d = new Date(ts)
  const today = new Date()
  const yest = new Date(today.getTime() - 86400000)
  if (d.toDateString() === today.toDateString()) return '今天'
  if (d.toDateString() === yest.toDateString()) return '昨天'
  return formatDate(ts)
}
