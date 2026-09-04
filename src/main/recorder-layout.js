const RECORDER_WIDTH = 280
const RECORDER_HEIGHT = 390
const RECORDER_MINI_WIDTH = 280
const RECORDER_MINI_HEIGHT = 168
const RECORDER_CAPSULE_WIDTH = 176
const RECORDER_CAPSULE_HEIGHT = 54

function normalizeCollapsedMode(mode) {
  return mode === 'capsule' ? 'capsule' : 'mini'
}

function buildRecorderLayout(mode) {
  const collapsedMode = normalizeCollapsedMode(mode)
  const collapsedWidth = collapsedMode === 'capsule' ? RECORDER_CAPSULE_WIDTH : RECORDER_MINI_WIDTH
  const collapsedHeight = collapsedMode === 'capsule' ? RECORDER_CAPSULE_HEIGHT : RECORDER_MINI_HEIGHT
  return {
    expandedWidth: RECORDER_WIDTH,
    expandedHeight: RECORDER_HEIGHT,
    collapsedMode,
    displayMode: collapsedMode === 'capsule' ? 'capsule' : 'panel',
    panelWidth: RECORDER_MINI_WIDTH,
    panelHeight: RECORDER_MINI_HEIGHT,
    capsuleWidth: RECORDER_CAPSULE_WIDTH,
    capsuleHeight: RECORDER_CAPSULE_HEIGHT,
    collapsedWidth,
    collapsedHeight
  }
}

module.exports = {
  RECORDER_WIDTH,
  RECORDER_HEIGHT,
  RECORDER_MINI_WIDTH,
  RECORDER_MINI_HEIGHT,
  RECORDER_CAPSULE_WIDTH,
  RECORDER_CAPSULE_HEIGHT,
  normalizeCollapsedMode,
  buildRecorderLayout
}
