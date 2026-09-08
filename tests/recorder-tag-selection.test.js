import { describe, expect, it } from 'vitest'
import { resolveSelectedTagId } from '../src/renderer/src/recorder/tag-selection.js'

describe('recorder tag selection authority', () => {
  it('uses the active timeline segment tag while recording', () => {
    expect(resolveSelectedTagId({ tag_id: 1, active_tag_id: 3 }, 2)).toBe(3)
  })

  it('falls back to the entry tag when no active point tag exists', () => {
    expect(resolveSelectedTagId({ tag_id: 2 }, 1)).toBe(2)
  })

  it('keeps the preselected tag only while idle', () => {
    expect(resolveSelectedTagId(null, 4)).toBe(4)
    expect(resolveSelectedTagId({ tag_id: null, active_tag_id: null }, 4)).toBeNull()
  })
})
