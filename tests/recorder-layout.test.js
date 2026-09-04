import { describe, expect, it } from 'vitest'
import constants from '../src/shared/constants.js'
import recorderLayout from '../src/main/recorder-layout.js'

const { DEFAULT_SETTINGS } = constants
const { buildRecorderLayout, normalizeCollapsedMode } = recorderLayout

describe('recorder collapsed mode layout', () => {
  it('first install defaults to mini mode', () => {
    expect(DEFAULT_SETTINGS.recorder.collapsedMode).toBe('mini')
    expect(buildRecorderLayout(DEFAULT_SETTINGS.recorder.collapsedMode)).toMatchObject({
      collapsedMode: 'mini',
      collapsedWidth: 280,
      collapsedHeight: 168,
      expandedWidth: 280,
      expandedHeight: 390
    })
  })

  it('capsule mode uses the compact capsule bounds without changing expanded size', () => {
    expect(buildRecorderLayout('capsule')).toMatchObject({
      collapsedMode: 'capsule',
      collapsedWidth: 176,
      collapsedHeight: 54,
      expandedWidth: 280,
      expandedHeight: 390
    })
  })

  it('unknown or legacy values safely fall back to mini mode', () => {
    expect(normalizeCollapsedMode()).toBe('mini')
    expect(normalizeCollapsedMode('panel')).toBe('mini')
    expect(buildRecorderLayout('horse').collapsedMode).toBe('mini')
  })
})
