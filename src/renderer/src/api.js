// 渲染层 API：双通道适配。
// Electron 窗口内走 window.niuma（IPC），浏览器里自动降级为 HTTP fetch + token。
const hasNiuma = typeof window !== 'undefined' && !!window.niuma

async function call(channel, args = {}) {
  if (hasNiuma) {
    return window.niuma.invoke(channel, args)
  }
  const res = await fetch('/api/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, args })
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('unauthorized')
    return { ok: false, error: `HTTP ${res.status}` }
  }
  return res.json()
}

// 统一处理：失败抛错，成功返回 data
async function api(channel, args) {
  const r = await call(channel, args)
  if (!r || r.ok === false) throw new Error((r && r.error) || '未知错误')
  return r
}

// 事件订阅（仅 Electron 宿主可用；浏览器通过轮询替代）
function on(event, cb) {
  if (hasNiuma) return window.niuma.on(event, cb)
  return () => {}
}

export { api, call, on, hasNiuma }
