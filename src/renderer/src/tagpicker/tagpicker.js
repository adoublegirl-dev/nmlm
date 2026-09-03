// TagPicker：结束记录后弹出，数字键 1-9 秒选标签，Esc 取消，备注可输入。
import { api } from '../api'
import './tagpicker.css'

const params = new URLSearchParams(location.search)
const entryId = params.get('entryId')
const segmentMode = params.get('mode') === 'segment'
const target = params.get('target') || 'base'
const pointId = params.get('pointId') || null

const app = document.getElementById('tagpicker-app')
app.innerHTML = segmentMode ? `
  <div class="tp tp-segment">
    <div class="tp-title">选择工作类型</div>
    <div id="tags" class="tp-tags"></div>
  </div>
` : `
  <div class="tp">
    <div class="tp-title">这段在做什么？</div>
    <div id="tags" class="tp-tags"></div>
    <input id="detail" class="input tp-input" placeholder="备注（可选），Enter 归档" />
    <div class="tp-foot muted">按数字键快速选择 · Esc 取消</div>
  </div>
`

let tags = []

async function loadTags() {
  const r = await api('tags:list')
  tags = r.tags || []
  const el = document.getElementById('tags')
  el.innerHTML = tags.map((t) => `
    <button class="tp-tag" data-id="${t.id}" data-key="${t.shortcut_key ?? ''}">
      ${segmentMode ? '' : `<span class="k">${t.shortcut_key != null ? t.shortcut_key : '·'}</span>`}
      <span class="tp-tag-name">${escapeHtml(t.name)}</span>
    </button>
  `).join('')
  el.querySelectorAll('.tp-tag').forEach((b) => {
    b.addEventListener('click', () => confirmTag(Number(b.dataset.id)))
  })
}

async function confirmTag(tagId) {
  const detail = document.getElementById('detail')?.value.trim() || null
  const channel = segmentMode ? 'tagpicker:confirmSegment' : 'tagpicker:confirm'
  const r = await api(channel, { entryId, target, pointId, tagId, detail })
  if (r.ok) {
    try { window.close() } catch { location.href = 'about:blank' }
  }
}

async function cancel() {
  await api('tagpicker:cancel')
  try { window.close() } catch { location.href = 'about:blank' }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    cancel()
    return
  }
  if (!segmentMode && e.key === 'Enter') {
    const detail = document.getElementById('detail').value.trim()
    const other = tags.find((t) => t.shortcut_key === 0)
    confirmTag(other ? other.id : tags[0]?.id)
    return
  }
  if (!segmentMode && /^[0-9]$/.test(e.key)) {
    const n = Number(e.key)
    const tag = tags.find((t) => t.shortcut_key === n)
    if (tag) confirmTag(tag.id)
  }
})

loadTags()

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
}
