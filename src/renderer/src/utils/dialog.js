let activeDialog = null

function ensureStyle() {
  if (document.getElementById('nmlm-dialog-style')) return
  const style = document.createElement('style')
  style.id = 'nmlm-dialog-style'
  style.textContent = `
.nmlm-dialog-mask{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.48);backdrop-filter:blur(10px);animation:nmlmFade .14s ease both}.nmlm-dialog{width:min(460px,calc(100vw - 48px));border:1px solid rgba(255,255,255,.14);border-radius:18px;background:linear-gradient(180deg,rgba(38,43,52,.98),rgba(25,28,34,.98));box-shadow:0 30px 90px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08);color:#efede8;overflow:hidden;animation:nmlmPop .18s cubic-bezier(.2,1.2,.35,1) both}.nmlm-dialog-head{padding:18px 20px 8px}.nmlm-dialog-title{font-size:16px;font-weight:700;color:#e0bc72}.nmlm-dialog-body{padding:4px 20px 18px;color:#c9c1b3;font-size:13px;line-height:1.7;white-space:pre-wrap}.nmlm-dialog-actions{display:flex;justify-content:flex-end;gap:8px;padding:14px 16px;border-top:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.035)}.nmlm-dialog-btn{border:1px solid rgba(255,255,255,.14);border-radius:10px;background:transparent;color:#efede8;padding:7px 13px;font-size:13px;cursor:pointer}.nmlm-dialog-btn:hover{background:rgba(255,255,255,.08)}.nmlm-dialog-btn.primary{border-color:rgba(224,188,114,.42);background:rgba(224,188,114,.16);color:#e0bc72}.nmlm-dialog-btn.danger{border-color:rgba(208,106,92,.42);background:rgba(208,106,92,.12);color:#e08a7f}@keyframes nmlmFade{from{opacity:0}to{opacity:1}}@keyframes nmlmPop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}`
  document.head.appendChild(style)
}

function closeDialog(value) {
  if (!activeDialog) return
  const { mask, resolve, onKey } = activeDialog
  window.removeEventListener('keydown', onKey, true)
  activeDialog = null
  mask.remove()
  resolve(value)
}

function showDialog({ title = '提示', message = '', confirmText = '确定', cancelText = null, danger = false } = {}) {
  ensureStyle()
  if (activeDialog) closeDialog(false)
  return new Promise((resolve) => {
    const mask = document.createElement('div')
    mask.className = 'nmlm-dialog-mask'
    mask.innerHTML = `
      <div class="nmlm-dialog" role="dialog" aria-modal="true">
        <div class="nmlm-dialog-head"><div class="nmlm-dialog-title"></div></div>
        <div class="nmlm-dialog-body"></div>
        <div class="nmlm-dialog-actions"></div>
      </div>`
    mask.querySelector('.nmlm-dialog-title').textContent = title
    mask.querySelector('.nmlm-dialog-body').textContent = message
    const actions = mask.querySelector('.nmlm-dialog-actions')
    if (cancelText) {
      const cancel = document.createElement('button')
      cancel.className = 'nmlm-dialog-btn'
      cancel.textContent = cancelText
      cancel.addEventListener('click', () => closeDialog(false))
      actions.appendChild(cancel)
    }
    const ok = document.createElement('button')
    ok.className = `nmlm-dialog-btn primary${danger ? ' danger' : ''}`
    ok.textContent = confirmText
    ok.addEventListener('click', () => closeDialog(true))
    actions.appendChild(ok)
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeDialog(false) }
      if (e.key === 'Enter') { e.preventDefault(); closeDialog(true) }
    }
    activeDialog = { mask, resolve, onKey }
    document.body.appendChild(mask)
    window.addEventListener('keydown', onKey, true)
    setTimeout(() => ok.focus(), 0)
  })
}

export function showAlert(message, title = '提示') {
  return showDialog({ title, message, confirmText: '知道了' })
}

export function showConfirm(message, { title = '确认操作', confirmText = '确认', cancelText = '取消', danger = false } = {}) {
  return showDialog({ title, message, confirmText, cancelText, danger })
}
