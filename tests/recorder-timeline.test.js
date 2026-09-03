import { describe, expect, it } from 'vitest'
import {
  DAY_MS,
  TIMELINE_ZOOM_MINUTES,
  TIMELINE_ZOOMS,
  buildTimelineVisualPieces,
  buildTimelineRuler,
  buildTimelineSegments,
  createTimelineViewport,
  followTimelineViewport,
  panTimelineViewport,
  projectTimeline,
  startOfLocalDay,
  zoomTimelineViewport
} from '../src/renderer/src/recorder/timeline-model.js'

const hour = 60 * 60 * 1000

describe('recorder timeline model', () => {
  it('splits an entry at keyframes and keeps each segment tag target', () => {
    const dayStart = new Date(2026, 8, 1, 0, 0, 0, 0).getTime()
    const entry = { id: 7, start_time: dayStart + 9 * hour, tag_id: 11 }
    const points = [
      { id: 101, entry_id: 7, ts: dayStart + 10 * hour, tag_id: 12 },
      { id: 102, entry_id: 7, ts: dayStart + 11 * hour, tag_id: null }
    ]

    expect(buildTimelineSegments({ entry, points, now: dayStart + 12 * hour, dayStart })).toEqual([
      { start: dayStart + 9 * hour, end: dayStart + 10 * hour, tagId: 11, kind: 'base', pointId: null },
      { start: dayStart + 10 * hour, end: dayStart + 11 * hour, tagId: 12, kind: 'point', pointId: 101 },
      { start: dayStart + 11 * hour, end: dayStart + 12 * hour, tagId: null, kind: 'point', pointId: 102 }
    ])
  })

  it('clips a cross-midnight entry to the selected local day', () => {
    const now = new Date(2026, 8, 1, 0, 30, 0, 0).getTime()
    const dayStart = startOfLocalDay(now)
    const entry = { id: 8, start_time: dayStart - hour, tag_id: 11 }

    expect(buildTimelineSegments({ entry, points: [], now, dayStart })).toEqual([
      { start: dayStart, end: now, tagId: 11, kind: 'base', pointId: null }
    ])
  })

  it('places the initial anchor at 20% in the default thirty-minute viewport', () => {
    const anchorTs = new Date(2026, 8, 1, 10, 0, 0, 0).getTime()
    const viewport = createTimelineViewport({ anchorTs, anchorRatio: 0.2 })

    expect(TIMELINE_ZOOMS[viewport.zoomIndex]).toBe(30 * 60 * 1000)
    expect(viewport.viewStart).toBe(anchorTs - 0.2 * 30 * 60 * 1000)
    expect(viewport.following).toBe(true)
  })

  it('keeps the pointer time fixed while zooming and clamps panning to the day', () => {
    const dayStart = new Date(2026, 8, 1, 0, 0, 0, 0).getTime()
    const viewport = createTimelineViewport({ anchorTs: dayStart + 12 * hour, anchorRatio: 0.5 })
    const pointerRatio = 0.25
    const beforePointerTime = viewport.viewStart + TIMELINE_ZOOMS[viewport.zoomIndex] * pointerRatio
    const zoomed = zoomTimelineViewport(viewport, { pointerRatio, zoomIn: false })
    const afterPointerTime = zoomed.viewStart + TIMELINE_ZOOMS[zoomed.zoomIndex] * pointerRatio

    expect(afterPointerTime).toBe(beforePointerTime)
    expect(zoomed.following).toBe(false)
    expect(panTimelineViewport(zoomed, { deltaPx: 10000, widthPx: 248 }).viewStart).toBe(dayStart)
    expect(panTimelineViewport(zoomed, { deltaPx: -10000, widthPx: 248 }).viewStart)
      .toBe(dayStart + DAY_MS - TIMELINE_ZOOMS[zoomed.zoomIndex])
  })

  it('follows only after the current time reaches 80% of the viewport', () => {
    const dayStart = new Date(2026, 8, 1, 0, 0, 0, 0).getTime()
    const viewport = createTimelineViewport({ anchorTs: dayStart + 10 * hour, anchorRatio: 0.2 })
    const duration = TIMELINE_ZOOMS[viewport.zoomIndex]

    expect(followTimelineViewport(viewport, viewport.viewStart + duration * 0.79)).toBe(viewport)
    expect(followTimelineViewport(viewport, viewport.viewStart + duration * 0.81).viewStart)
      .toBe(viewport.viewStart + duration * 0.01)
  })

  it('builds AE-style clock-aligned major and minor ruler ticks for the visible hour', () => {
    const dayStart = new Date(2026, 8, 2, 0, 0, 0, 0).getTime()
    const viewport = {
      dayStart,
      zoomIndex: 4,
      viewStart: dayStart + 9 * hour + 7 * 60 * 1000,
      following: false
    }
    const ruler = buildTimelineRuler({ viewport })

    expect(ruler.zoomHours).toBe(1)
    expect(ruler.ticks.find((tick) => tick.ts === dayStart + 9 * hour + 10 * 60 * 1000))
      .toMatchObject({ major: false, label: null })
    expect(ruler.ticks.find((tick) => tick.ts === dayStart + 9 * hour + 15 * 60 * 1000))
      .toMatchObject({ major: true, label: '09:15' })
  })

  it('includes the end-of-day 24:00 tick in the all-day view', () => {
    const dayStart = new Date(2026, 8, 2, 0, 0, 0, 0).getTime()
    const ruler = buildTimelineRuler({
      viewport: { dayStart, zoomIndex: 0, viewStart: dayStart, following: false }
    })

    expect(ruler.ticks.at(-1)).toMatchObject({
      ts: dayStart + DAY_MS,
      major: true,
      label: '24:00',
      edge: 'end'
    })
  })

  it('provides a five-minute nearest zoom level with minute ruler labels', () => {
    const dayStart = new Date(2026, 8, 2, 0, 0, 0, 0).getTime()
    const zoomIndex = TIMELINE_ZOOM_MINUTES.indexOf(5)
    const ruler = buildTimelineRuler({
      viewport: { dayStart, zoomIndex, viewStart: dayStart + 9 * hour, following: false }
    })

    expect(ruler.zoomMinutes).toBe(5)
    expect(ruler.ticks.find((tick) => tick.ts === dayStart + 9 * hour + 60 * 1000))
      .toMatchObject({ major: true, label: '09:01' })
  })

  it('marks only the growing final segment as live for the right-edge indicator', () => {
    const dayStart = new Date(2026, 8, 2, 0, 0, 0, 0).getTime()
    const now = dayStart + 10 * hour
    const viewport = { dayStart, zoomIndex: 4, viewStart: dayStart + 9 * hour, following: false }
    const entry = { id: 7, start_time: dayStart + 9 * hour, tag_id: 11 }
    const points = [{ id: 101, entry_id: 7, ts: dayStart + 9.5 * hour, tag_id: 12 }]

    expect(projectTimeline({ entry, points, now, viewport }).segments.map((segment) => segment.live))
      .toEqual([false, true])
  })

  it('keeps earlier split entries visible after tagging a later time segment', () => {
    const dayStart = new Date(2026, 8, 2, 0, 0, 0, 0).getTime()
    const now = dayStart + 10 * hour
    const viewport = { dayStart, zoomIndex: 4, viewStart: dayStart + 9 * hour, following: false }
    const entries = [
      { id: 7, start_time: dayStart + 9 * hour, end_time: dayStart + 9.5 * hour, tag_id: 11 },
      { id: 8, start_time: dayStart + 9.5 * hour, end_time: null, tag_id: 12 }
    ]

    expect(projectTimeline({ entry: entries[1], entries, points: [], now, viewport }).segments)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ entryId: 7, tagId: 11, live: false }),
        expect.objectContaining({ entryId: 8, tagId: 12, live: true })
      ]))
  })

  it('keeps a completed entry point as a real time boundary for tooltip ranges', () => {
    const dayStart = new Date(2026, 8, 2, 0, 0, 0, 0).getTime()
    const entry = {
      id: 7,
      start_time: dayStart + 9 * hour + 42 * 60 * 1000,
      end_time: dayStart + 9 * hour + 59 * 60 * 1000,
      tag_id: 11
    }
    const pointTs = dayStart + 9 * hour + 50 * 60 * 1000
    const viewport = { dayStart, zoomIndex: 4, viewStart: dayStart + 9 * hour, following: false }
    const points = [{ id: 101, entry_id: entry.id, ts: pointTs, tag_id: 12 }]
    const segments = projectTimeline({ entry, entries: [entry], points, now: dayStart + 10 * hour, viewport }).segments

    expect(segments).toEqual([
      expect.objectContaining({ start: entry.start_time, end: pointTs, tagId: 11 }),
      expect.objectContaining({ start: pointTs, end: entry.end_time, tagId: 12 })
    ])
  })

  it('projects persistent keyframe markers independently from split pause points', () => {
    const dayStart = new Date(2026, 8, 2, 0, 0, 0, 0).getTime()
    const viewport = { dayStart, zoomIndex: 4, viewStart: dayStart + 9 * hour, following: false }
    const entry = { id: 8, start_time: dayStart + 9 * hour, end_time: null, tag_id: 12 }
    const marker = { id: 301, entry_id: 7, ts: dayStart + 9.5 * hour }

    expect(projectTimeline({ entry, entries: [entry], points: [], markers: [marker], now: dayStart + 10 * hour, viewport }).keyframes)
      .toEqual([expect.objectContaining({ id: 301, ts: marker.ts, left: 50 })])
  })

  it('cuts a transparent visual hole for a marker inside an otherwise continuous segment', () => {
    const segment = { start: 0, end: 1000, left: 0, width: 100 }
    const markers = [{ ts: 500, left: 50 }]

    const pieces = buildTimelineVisualPieces({ segment, markers, trackWidth: 240, holeSizePx: 20 })

    expect(pieces).toHaveLength(2)
    expect(pieces[0]).toMatchObject({ left: 0, endsAtSegmentEnd: false })
    expect(pieces[0].width).toBeCloseTo(45.833, 2)
    expect(pieces[1]).toMatchObject({ endsAtSegmentEnd: true })
    expect(pieces[1].left).toBeCloseTo(54.167, 2)
    expect(pieces[1].width).toBeCloseTo(45.833, 2)
  })
})
