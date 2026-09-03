import {
  DEFAULT_TIMELINE_ZOOM_INDEX,
  TIMELINE_ZOOM_MINUTES,
  buildTimelineVisualPieces,
  buildTimelineRuler,
  createTimelineViewport,
  followTimelineViewport,
  panTimelineViewport,
  projectTimeline,
  startOfLocalDay,
  zoomTimelineViewport
} from './timeline-model.js'

const FOLLOW_RESET_MS = 5000
const WHEEL_GESTURE_IDLE_MS = 160
const WHEEL_STEP_THRESHOLD = 40
const DRAG_THRESHOLD_PX = 4

function formatClock(ts) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function segmentKey(segment) {
  return `segment:${segment.entryId}:${segment.kind}:${segment.pointId ?? 'base'}`
}

function keyframeKey(point) {
  return `keyframe:${point.id ?? point.ts}`
}

function wheelPixels(event, root) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * root.clientHeight
  return event.deltaY
}

function keyframeScale(zoomMinutes) {
  if (zoomMinutes >= 12 * 60) return 8
  if (zoomMinutes >= 3 * 60) return 9
  if (zoomMinutes >= 60) return 11
  if (zoomMinutes >= 30) return 13
  return 14
}

export function createMiniTimeline({ root, ruler, track, playhead, keyframeIcon, getTagName, onSegmentClick }) {
  let entry = null
  let entries = []
  let points = []
  let markers = []
  let viewport = null
  let followResetTimer = null
  let wheelGestureTimer = null
  let wheelGesture = null
  let pointerGesture = null
  let pickerOpen = false
  let timelineHovered = false
  let skipNextClick = false
  let segmentTargets = new Map()
  let latestFrame = null

  function clearFollowReset() {
    clearTimeout(followResetTimer)
    followResetTimer = null
  }

  function clearWheelGesture() {
    clearTimeout(wheelGestureTimer)
    wheelGestureTimer = null
    wheelGesture = null
  }

  function resetViewport(anchorTs = Date.now(), anchorRatio = 0.8) {
    viewport = createTimelineViewport({ anchorTs, anchorRatio, zoomIndex: DEFAULT_TIMELINE_ZOOM_INDEX })
    clearWheelGesture()
    root.classList.remove('is-interacting', 'is-dragging')
    render()
  }

  function scheduleFollowReset() {
    clearFollowReset()
    if (!entry || pickerOpen || timelineHovered || pointerGesture) return
    followResetTimer = setTimeout(() => resetViewport(Date.now(), 0.8), FOLLOW_RESET_MS)
  }

  function ensureViewport(now) {
    const dayStart = startOfLocalDay(now)
    if (viewport?.dayStart === dayStart) return
    const anchorTs = entry.start_time >= dayStart ? entry.start_time : dayStart
    viewport = createTimelineViewport({
      anchorTs,
      anchorRatio: entry.start_time >= dayStart ? 0.2 : 0,
      dayStart
    })
  }

  function syncFrame(frame) {
    const existing = new Map([...track.children].map((node) => [node.dataset.timelineKey, node]))
    const retained = new Set()
    segmentTargets = new Map()
    const holeSize = Number.parseFloat(root.style.getPropertyValue('--timeline-marker-hole-size')) || 0
    const trackWidth = Math.max(1, track.clientWidth || root.clientWidth - 8)

    frame.segments.forEach((segment) => {
      const tagName = getTagName(segment.tagId) || '未分类'
      const timeRange = `${formatClock(segment.start)}–${formatClock(segment.end)}`
      const pieces = buildTimelineVisualPieces({
        segment,
        markers: frame.keyframes,
        trackWidth,
        holeSizePx: holeSize
      })
      pieces.forEach((piece) => {
        const key = `${segmentKey(segment)}:piece:${piece.index}`
        let node = existing.get(key)
        if (!node) {
          node = document.createElement('button')
          node.type = 'button'
          node.dataset.timelineKey = key
        }
        node.className = `timeline-segment${segment.live && piece.endsAtSegmentEnd ? ' is-live' : ''}`
        node.dataset.segmentKey = key
        node.style.left = `${piece.left}%`
        node.style.width = `${piece.width}%`
        node.style.minWidth = '0'
        node.title = `${tagName} · ${timeRange}（点击归类，拖动可平移）`
        node.setAttribute('aria-label', node.title)
        segmentTargets.set(key, segment)
        retained.add(key)
        track.appendChild(node)
      })
    })

    frame.keyframes.forEach((point) => {
      const key = keyframeKey(point)
      let node = existing.get(key)
      if (!node) {
        node = document.createElement('img')
        node.className = 'timeline-keyframe'
        node.dataset.timelineKey = key
        node.src = keyframeIcon
        node.alt = ''
        node.setAttribute('aria-hidden', 'true')
      }
      node.style.left = `${point.left}%`
      retained.add(key)
      track.appendChild(node)
    })

    existing.forEach((node, key) => {
      if (!retained.has(key)) node.remove()
    })
  }

  function syncRuler() {
    const { ticks } = buildTimelineRuler({ viewport })
    const existing = new Map([...ruler.children].map((node) => [node.dataset.tickTs, node]))
    const retained = new Set()

    ticks.forEach((tick) => {
      const key = String(tick.ts)
      let node = existing.get(key)
      if (!node) {
        node = document.createElement('span')
        node.className = 'timeline-ruler-tick'
        node.dataset.tickTs = key
      }
      node.className = `timeline-ruler-tick${tick.major ? ' is-major' : ''}${tick.edge ? ` is-${tick.edge}` : ''}`
      node.style.left = `${tick.left}%`
      node.replaceChildren()
      if (tick.label) {
        const label = document.createElement('time')
        label.className = 'timeline-ruler-label'
        label.dateTime = new Date(tick.ts).toISOString()
        label.textContent = tick.label
        node.appendChild(label)
      }
      retained.add(key)
      ruler.appendChild(node)
    })

    existing.forEach((node, key) => {
      if (!retained.has(key)) node.remove()
    })
  }

  function syncPlayhead() {
    playhead.hidden = true
  }

  function render(now = Date.now()) {
    if (!entry) {
      track.replaceChildren()
      ruler.replaceChildren()
      playhead.hidden = true
      segmentTargets = new Map()
      return
    }

    ensureViewport(now)
    viewport = followTimelineViewport(viewport, now)
    const zoomMinutes = TIMELINE_ZOOM_MINUTES[viewport.zoomIndex]
    const iconSize = keyframeScale(zoomMinutes)
    root.style.setProperty('--timeline-keyframe-size', `${iconSize}px`)
    root.style.setProperty('--timeline-marker-hole-size', `${iconSize + 6}px`)
    latestFrame = projectTimeline({ entry, entries, points, markers, now, viewport })
    syncFrame(latestFrame)
    syncRuler()
    syncPlayhead()

    const zoomLabel = zoomMinutes >= 60 ? `${zoomMinutes / 60} 小时` : `${zoomMinutes} 分钟`
    root.dataset.zoomMinutes = String(zoomMinutes)
    root.title = `当前显示 ${zoomLabel}；滚轮缩放，拖动平移，点击时间段归类`
    root.setAttribute('aria-label', `当日记录时间轴，当前显示 ${zoomLabel}`)
  }

  function setData(nextEntry, nextPoints = [], nextEntries = [], nextMarkers = []) {
    const entryChanged = Number(entry?.id || 0) !== Number(nextEntry?.id || 0)
    entry = nextEntry || null
    entries = entry
      ? (nextEntries.length ? nextEntries : [entry]).slice().sort((left, right) => left.start_time - right.start_time)
      : []
    const timelineEntryIds = new Set(entries.map((item) => Number(item.id)))
    points = entry
      ? nextPoints.filter((point) => timelineEntryIds.has(Number(point.entry_id))).sort((a, b) => a.ts - b.ts)
      : []
    markers = entry ? nextMarkers.slice().sort((left, right) => left.ts - right.ts) : []
    if (!entry || entryChanged) {
      viewport = null
      pointerGesture = null
      latestFrame = null
      clearFollowReset()
      clearWheelGesture()
      root.classList.remove('is-interacting', 'is-dragging')
    }
  }

  function enter({ anchorTs = Date.now(), anchorRatio = 0.8 } = {}) {
    if (!entry) return
    resetViewport(anchorTs, anchorRatio)
  }

  function setPickerOpen(next) {
    pickerOpen = !!next
    if (pickerOpen) clearFollowReset()
    else scheduleFollowReset()
  }

  function openSegment(segmentElement, event) {
    const segment = segmentTargets.get(segmentElement?.dataset.segmentKey)
    if (segment) onSegmentClick(segment, event)
  }

  function handleClick(event) {
    if (skipNextClick) {
      skipNextClick = false
      return
    }
    if (event.target.closest('.timeline-segment-picker')) return
    const segmentElement = event.target.closest('.timeline-segment')
    if (segmentElement) openSegment(segmentElement, event)
  }

  function handleWheel(event) {
    if (event.target.closest('.timeline-segment-picker')) {
      event.stopPropagation()
      return
    }
    event.preventDefault()
    if (!viewport) return
    const delta = wheelPixels(event, root)
    const direction = Math.sign(delta)
    if (!direction) return

    if (!wheelGesture || wheelGesture.direction !== direction) wheelGesture = { direction, amount: 0, stepped: false }
    wheelGesture.amount += Math.abs(delta)
    clearTimeout(wheelGestureTimer)
    wheelGestureTimer = setTimeout(() => { wheelGesture = null }, WHEEL_GESTURE_IDLE_MS)

    if (!wheelGesture.stepped && wheelGesture.amount >= WHEEL_STEP_THRESHOLD) {
      const rect = root.getBoundingClientRect()
      viewport = zoomTimelineViewport(viewport, {
        pointerRatio: (event.clientX - rect.left) / Math.max(1, rect.width),
        zoomIn: direction < 0
      })
      wheelGesture.stepped = true
      root.classList.add('is-interacting')
      render()
    }
    scheduleFollowReset()
  }

  function handlePointerEnter() {
    timelineHovered = true
    root.classList.add('is-hovered')
    clearFollowReset()
  }

  function handlePointerLeave() {
    timelineHovered = false
    root.classList.remove('is-hovered')
    scheduleFollowReset()
  }

  function clearTimelineHoverOnBlur() {
    timelineHovered = false
    pointerGesture = null
    root.classList.remove('is-hovered', 'is-interacting', 'is-dragging')
    scheduleFollowReset()
  }

  function handleVisibilityChange() {
    if (document.hidden) clearTimelineHoverOnBlur()
  }

  function handlePointerDown(event) {
    if (!viewport || event.button !== 0) return
    if (event.target.closest('.timeline-segment-picker')) return
    event.preventDefault()
    clearFollowReset()
    pointerGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      viewStart: viewport.viewStart,
      segmentElement: event.target.closest('.timeline-segment'),
      moved: false
    }
    root.classList.add('is-interacting')
    root.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event) {
    if (!pointerGesture || pointerGesture.pointerId !== event.pointerId) return
    const distance = Math.hypot(event.clientX - pointerGesture.startX, event.clientY - pointerGesture.startY)
    if (!pointerGesture.moved && distance < DRAG_THRESHOLD_PX) return

    pointerGesture.moved = true
    root.classList.add('is-dragging')
    viewport = panTimelineViewport(viewport, {
      deltaPx: event.clientX - pointerGesture.startX,
      widthPx: root.getBoundingClientRect().width,
      originViewStart: pointerGesture.viewStart
    })
    render()
  }

  function finishPointerGesture(event) {
    if (!pointerGesture || pointerGesture.pointerId !== event.pointerId) return
    const gesture = pointerGesture
    pointerGesture = null
    root.classList.remove('is-dragging')
    try { root.releasePointerCapture(event.pointerId) } catch (_) {}

    if (event.type !== 'pointercancel' && !gesture.moved && gesture.segmentElement) openSegment(gesture.segmentElement, event)
    skipNextClick = true
    setTimeout(() => { skipNextClick = false }, 0)
    scheduleFollowReset()
  }

  root.addEventListener('click', handleClick)
  root.addEventListener('wheel', handleWheel, { passive: false })
  root.addEventListener('pointerenter', handlePointerEnter)
  root.addEventListener('pointerleave', handlePointerLeave)
  root.addEventListener('pointerdown', handlePointerDown)
  root.addEventListener('pointermove', handlePointerMove)
  root.addEventListener('pointerup', finishPointerGesture)
  root.addEventListener('pointercancel', finishPointerGesture)
  window.addEventListener('blur', clearTimelineHoverOnBlur)
  document.addEventListener('visibilitychange', handleVisibilityChange)

  return {
    enter,
    render,
    setData,
    setPickerOpen,
    getActiveSegment: () => latestFrame?.segments.find((segment) => segment.live && Number(segment.entryId) === Number(entry?.id)) || null,
    getLastPointTimestamp: () => Number(markers.at(-1)?.ts || 0),
    destroy() {
      clearFollowReset()
      clearWheelGesture()
      root.removeEventListener('click', handleClick)
      root.removeEventListener('wheel', handleWheel)
      root.removeEventListener('pointerenter', handlePointerEnter)
      root.removeEventListener('pointerleave', handlePointerLeave)
      root.removeEventListener('pointerdown', handlePointerDown)
      root.removeEventListener('pointermove', handlePointerMove)
      root.removeEventListener('pointerup', finishPointerGesture)
      root.removeEventListener('pointercancel', finishPointerGesture)
      window.removeEventListener('blur', clearTimelineHoverOnBlur)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }
}
