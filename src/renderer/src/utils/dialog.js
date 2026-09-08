let activeDialog = null

function ensureStyle() {
  if (document.getElementById('nmlm-dialog-style')) return
  const style = document.createElement('style')
  style.id = 'nmlm-dialog-style'
  style.textContent = `
.nmlm-dialog-mask{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--overlay,rgba(31,27,22,.66));backdrop-filter:blur(12px);animation:nmlmFade .14s ease both}.nmlm-dialog{position:relative;width:min(460px,calc(100vw - 48px));border:1px solid var(--border-strong,rgba(146,80,23,.36));border-radius:18px;background:linear-gradient(145deg,var(--paper-strong,#fffdf5),var(--paper,#f8f3e5));box-shadow:0 30px 90px rgba(35,25,14,.38),inset 0 1px 0 rgba(255,255,255,.32);color:var(--text-main,#322b24);overflow:hidden;animation:nmlmPop .18s cubic-bezier(.2,1.2,.35,1) both}.nmlm-dialog:before{content:"";position:absolute;left:18px;right:18px;top:0;height:2px;border-radius:0 0 999px 999px;background:linear-gradient(90deg,transparent,var(--brass,#c69b42),transparent)}.nmlm-dialog-head{padding:20px 20px 8px}.nmlm-dialog-title{font-size:17px;font-weight:700;color:var(--brown,#925017)}.nmlm-dialog-body{padding:4px 20px 20px;color:var(--text-dim,#7b6a57);font-size:13px;line-height:1.7;white-space:pre-wrap}.nmlm-dialog-actions{display:flex;justify-content:flex-end;gap:8px;padding:14px 16px;border-top:1px solid var(--border,rgba(122,87,47,.22));background:var(--surface-soft,rgba(230,222,195,.52))}.nmlm-dialog-btn{min-height:32px;border:1px solid var(--border,rgba(122,87,47,.22));border-radius:9px;background:var(--paper-strong,#fffdf5);color:var(--brown-text,#6f5841);padding:7px 13px;font-size:13px;font-weight:500;cursor:pointer;transition:transform .14s ease,background .14s ease,border-color .14s ease}.nmlm-dialog-btn:hover{transform:translateY(-1px);background:var(--paper-deep,#e7ddc3);border-color:var(--border-strong,rgba(146,80,23,.36))}.nmlm-dialog-btn:focus-visible{outline:2px solid var(--brass,#c69b42);outline-offset:2px}.nmlm-dialog-btn.primary{border-color:rgba(104,54,15,.52);background:linear-gradient(180deg,#b87834,#925017);color:#fff9e9;box-shadow:inset 0 1px 0 rgba(255,255,255,.24)}:root[data-panel-theme="night"] .nmlm-dialog-btn.primary{border-color:rgba(236,211,157,.28);background:linear-gradient(180deg,#d5b06b,#a77438);color:#231c13}.nmlm-dialog-btn.danger{border-color:color-mix(in srgb,var(--danger,#a54d3a) 46%,transparent);background:color-mix(in srgb,var(--danger,#a54d3a) 14%,var(--paper-strong,#fffdf5));color:var(--danger,#a54d3a)}@keyframes nmlmFade{from{opacity:0}to{opacity:1}}@keyframes nmlmPop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}`
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
