export const DAY_MS = 24 * 60 * 60 * 1000
export const TIMELINE_ZOOM_MINUTES = [24 * 60, 12 * 60, 6 * 60, 3 * 60, 60, 30, 15, 5]
export const TIMELINE_ZOOMS = TIMELINE_ZOOM_MINUTES.map((minutes) => minutes * 60 * 1000)
export const DEFAULT_TIMELINE_ZOOM_INDEX = TIMELINE_ZOOM_MINUTES.indexOf(30)

const MINUTE_MS = 60 * 1000
const SECOND_MS = 1000
const RULER_STEPS = new Map([
  [5, { major: MINUTE_MS, minor: 30 * SECOND_MS }],
  [15, { major: 5 * MINUTE_MS, minor: MINUTE_MS }],
  [30, { major: 10 * MINUTE_MS, minor: 5 * MINUTE_MS }],
  [60, { major: 15 * MINUTE_MS, minor: 5 * MINUTE_MS }],
  [3 * 60, { major: 30 * MINUTE_MS, minor: 15 * MINUTE_MS }],
  [6 * 60, { major: 60 * MINUTE_MS, minor: 30 * MINUTE_MS }],
  [12 * 60, { major: 2 * 60 * MINUTE_MS, minor: 60 * MINUTE_MS }],
  [24 * 60, { major: 4 * 60 * MINUTE_MS, minor: 60 * MINUTE_MS }]
])

export function startOfLocalDay(ts = Date.now()) {
  const date = new Date(ts)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function clampTimelineViewStart(viewStart, duration, dayStart) {
  const lastStart = Math.max(dayStart, dayStart + DAY_MS - duration)
  return Math.min(Math.max(viewStart, dayStart), lastStart)
}

export function createTimelineViewport({
  anchorTs = Date.now(),
  anchorRatio = 0.8,
  zoomIndex = DEFAULT_TIMELINE_ZOOM_INDEX,
  dayStart = startOfLocalDay(anchorTs)
} = {}) {
  const duration = TIMELINE_ZOOMS[zoomIndex]
  return {
    dayStart,
    zoomIndex,
    viewStart: clampTimelineViewStart(anchorTs - duration * anchorRatio, duration, dayStart),
    following: true
  }
}

export function zoomTimelineViewport(viewport, { pointerRatio, zoomIn }) {
  const ratio = Math.min(1, Math.max(0, pointerRatio))
  const direction = zoomIn ? 1 : -1
  const zoomIndex = Math.min(TIMELINE_ZOOMS.length - 1, Math.max(0, viewport.zoomIndex + direction))
  if (zoomIndex === viewport.zoomIndex) return viewport

  const pointerTime = viewport.viewStart + TIMELINE_ZOOMS[viewport.zoomIndex] * ratio
  const duration = TIMELINE_ZOOMS[zoomIndex]
  return {
    ...viewport,
    zoomIndex,
    viewStart: clampTimelineViewStart(pointerTime - duration * ratio, duration, viewport.dayStart),
    following: false
  }
}

export function panTimelineViewport(viewport, { deltaPx, widthPx, originViewStart = viewport.viewStart }) {
  const duration = TIMELINE_ZOOMS[viewport.zoomIndex]
  const deltaMs = (deltaPx / Math.max(1, widthPx)) * duration
  return {
    ...viewport,
    viewStart: clampTimelineViewStart(originViewStart - deltaMs, duration, viewport.dayStart),
    following: false
  }
}

export function followTimelineViewport(viewport, now, threshold = 0.8) {
  if (!viewport.following) return viewport
  const duration = TIMELINE_ZOOMS[viewport.zoomIndex]
  if (now < viewport.viewStart + duration * threshold) return viewport
  return {
    ...viewport,
    viewStart: clampTimelineViewStart(now - duration * threshold, duration, viewport.dayStart)
  }
}

function formatTimelineTime(ts, dayStart) {
  if (ts === dayStart + DAY_MS) return '24:00'
  const date = new Date(ts)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function buildTimelineRuler({ viewport }) {
  const duration = TIMELINE_ZOOMS[viewport.zoomIndex]
  const viewEnd = viewport.viewStart + duration
  const zoomMinutes = TIMELINE_ZOOM_MINUTES[viewport.zoomIndex]
  const { major, minor } = RULER_STEPS.get(zoomMinutes)
  const offset = Math.max(0, viewport.viewStart - viewport.dayStart)
  const firstTick = viewport.dayStart + Math.ceil(offset / minor) * minor
  const ticks = []

  for (let ts = firstTick; ts <= viewEnd; ts += minor) {
    const left = ((ts - viewport.viewStart) / duration) * 100
    const isMajor = (ts - viewport.dayStart) % major === 0
    ticks.push({
      ts,
      left,
      major: isMajor,
      label: isMajor ? formatTimelineTime(ts, viewport.dayStart) : null,
      edge: left <= 0.5 ? 'start' : (left >= 99.5 ? 'end' : null)
    })
  }

  return { zoomMinutes, zoomHours: zoomMinutes / 60, ticks }
}

export function buildTimelineSegments({ entry, points = [], now = Date.now(), dayStart = startOfLocalDay(now) }) {
  if (!entry) return []

  const validPoints = points
    .filter((point) => Number(point.entry_id) === Number(entry.id) && point.ts > entry.start_time && point.ts < now)
    .sort((a, b) => a.ts - b.ts)
  const segments = []
  let start = entry.start_time
  let tagId = entry.tag_id || null
  let target = { kind: 'base', pointId: null }

  for (const point of validPoints) {
    segments.push({ start, end: point.ts, tagId, ...target })
    start = point.ts
    tagId = point.tag_id || null
    target = { kind: 'point', pointId: point.id }
  }
  segments.push({ start, end: now, tagId, ...target })

  const dayEnd = dayStart + DAY_MS
  return segments
    .map((segment) => ({
      ...segment,
      start: Math.max(segment.start, dayStart),
      end: Math.min(segment.end, dayEnd)
    }))
    .filter((segment) => segment.end > segment.start)
}

export function projectTimeline({ entry, entries = [], points = [], markers = [], now = Date.now(), viewport }) {
  const duration = TIMELINE_ZOOMS[viewport.zoomIndex]
  const viewEnd = viewport.viewStart + duration
  const sourceEntries = entries.length ? entries : (entry ? [entry] : [])
  const segments = sourceEntries
    .flatMap((item) => buildTimelineSegments({
      entry: item,
      points,
      now: item.end_time || now,
      dayStart: viewport.dayStart
    }).map((segment) => ({
      ...segment,
      entryId: item.id,
      live: !item.end_time && segment.end === now
    })))
    .map((segment) => {
      const visibleStart = Math.max(segment.start, viewport.viewStart)
      const visibleEnd = Math.min(segment.end, viewEnd)
      if (visibleEnd <= visibleStart) return null
      return {
        ...segment,
        left: ((visibleStart - viewport.viewStart) / duration) * 100,
        width: ((visibleEnd - visibleStart) / duration) * 100
      }
    })
    .filter(Boolean)

  const keyframes = markers
    .filter((marker) => marker.ts >= viewport.viewStart && marker.ts <= viewEnd && marker.ts >= viewport.dayStart)
    .map((marker) => ({
      ...marker,
      left: ((marker.ts - viewport.viewStart) / duration) * 100
    }))

  return { segments, keyframes }
}

export function buildTimelineVisualPieces({
  segment,
  markers = [],
  trackWidth,
  holeSizePx,
  minPieceWidthPx = 3
}) {
  const width = Math.max(1, trackWidth)
  const segmentStartPx = (segment.left / 100) * width
  const segmentEndPx = ((segment.left + segment.width) / 100) * width
  const halfHole = Math.max(0, holeSizePx / 2)
  const holes = markers
    .filter((marker) => marker.ts >= segment.start && marker.ts <= segment.end)
    .map((marker) => {
      const center = (marker.left / 100) * width
      return {
        start: Math.max(segmentStartPx, center - halfHole),
        end: Math.min(segmentEndPx, center + halfHole)
      }
    })
    .filter((hole) => hole.end > hole.start)
    .sort((left, right) => left.start - right.start)

  const pieces = []
  let cursor = segmentStartPx
  holes.forEach((hole) => {
    if (hole.end <= cursor) return
    if (hole.start - cursor >= minPieceWidthPx) pieces.push({ startPx: cursor, endPx: hole.start })
    cursor = Math.max(cursor, hole.end)
  })
  if (segmentEndPx - cursor >= minPieceWidthPx) pieces.push({ startPx: cursor, endPx: segmentEndPx })

  return pieces.map((piece, index) => ({
    ...piece,
    index,
    left: (piece.startPx / width) * 100,
    width: ((piece.endPx - piece.startPx) / width) * 100,
    endsAtSegmentEnd: Math.abs(piece.endPx - segmentEndPx) < 0.01
  }))
}
