import { describe, expect, it } from 'vitest'

import { createDefaultChampSelectOverlaySettings, matchesChampSelectClientSize } from './index'
import { emptyPositionSelection, positionSettingsFromSelection } from './position-calibration'

const points = {
  candidateFirst: { x: 0.25, y: 0.1 },
  teammateFirst: { x: 0.1, y: 0.2 },
  candidateNext: null,
  teammateNext: null
}
describe('visual champion selection positions', () => {
  it('maps scaled image fractions into client DIPs without modifying existing settings', () => {
    const settings = createDefaultChampSelectOverlaySettings()
    const result = positionSettingsFromSelection(settings, { width: 1280, height: 720 }, points)
    expect(result).toMatchObject({
      candidateFirstCenterX: 320,
      teammateFirstCenterY: 144,
      candidateStep: 58.5,
      teammateStep: 80,
      calibratedClientSize: { width: 1280, height: 720 }
    })
    expect(settings.candidateFirstCenterX).toBeNull()
  })
  it('derives optional spacing from adjacent centers', () => {
    const result = positionSettingsFromSelection(
      createDefaultChampSelectOverlaySettings(),
      { width: 1000, height: 800 },
      { ...points, candidateNext: { x: 0.31, y: 0.1 }, teammateNext: { x: 0.1, y: 0.3 } }
    )
    expect(result.candidateStep).toBe(60)
    expect(result.teammateStep).toBe(80)
  })
  it.each([
    emptyPositionSelection(),
    { ...points, candidateFirst: { x: NaN, y: 0 } },
    { ...points, candidateFirst: { x: 1.1, y: 0 } },
    { ...points, candidateNext: { x: 0.2, y: 0.1 } },
    { ...points, teammateNext: { x: 0.1, y: 0.21 } }
  ])('rejects missing, outside or incompatible points', (input) => {
    expect(() =>
      positionSettingsFromSelection(
        createDefaultChampSelectOverlaySettings(),
        { width: 1280, height: 720 },
        input
      )
    ).toThrow()
  })
  it('keeps legacy positioning compatible but rejects a changed calibrated size', () => {
    const settings = createDefaultChampSelectOverlaySettings()
    expect(matchesChampSelectClientSize(settings, { width: 900, height: 600 })).toBe(true)
    settings.calibratedClientSize = { width: 1280, height: 720 }
    expect(matchesChampSelectClientSize(settings, { width: 1280, height: 720 })).toBe(true)
    expect(matchesChampSelectClientSize(settings, { width: 1024, height: 576 })).toBe(false)
  })
})
