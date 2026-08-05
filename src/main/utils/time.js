// 时间工具：日期边界、格式化。全部纯函数，可单测。

const DAY_MS = 24 * 60 * 60 * 1000

function pad(n) {
  return String(n).padStart(2, '0')
}

// 本地日期 → 当日 0 点毫秒时间戳
function startOfDay(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function endOfDay(ts) {
  return startOfDay(ts) + DAY_MS
}

function startOfWeek(ts) {
  const d = new Date(startOfDay(ts))
  const day = d.getDay() // 0=周日
  const diff = day === 0 ? -6 : 1 - day // 周一为一周起点
  return d.getTime() + diff * DAY_MS
}

function startOfMonth(ts) {
  const d = new Date(ts)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function formatDate(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatTime(ts) {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDateTime(ts) {
  const d = new Date(ts)
  return `${formatDate(ts)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 秒 → "1h40m" / "25m" / "45s"
function formatDuration(sec) {
  if (sec < 60) return `${sec}s`
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h${m > 0 ? pad(m) : ''}m`
}

// 一个自然日内的区间列表（跨天场景：start 到 start+DAY_MS）
function dayRange(ts) {
  return { start: startOfDay(ts), end: endOfDay(ts) }
}

module.exports = {
  DAY_MS,
  startOfDay,
  endOfDay,
  startOfWeek,
  startOfMonth,
  formatDate,
  formatTime,
  formatDateTime,
  formatDuration,
  dayRange
}
