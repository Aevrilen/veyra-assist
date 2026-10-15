import { createDefaultChampSelectOverlaySettings } from '@shared/champ-select-overlay'
import { describe, expect, it } from 'vitest'

import { getChampSelectOverlayBounds } from './placement'

// Deliberate test anchors, not a claim about the origins of the reference crops.
const configured = {
  ...createDefaultChampSelectOverlaySettings(),
  candidateFirstCenterX: 300,
  teammateFirstCenterY: 200
}
const client = { x: 640, y: 300, width: 1280, height: 720 }
const workArea = { x: 0, y: 0, width: 2560, height: 1400 }
const counts = { candidates: 7, teammates: 5 }

describe('champion select group placement', () => {
  it('pauses a visual calibration after the client size changes without moving its anchors', () => {
    const measured = {
      ...configured,
      calibratedClientSize: { width: client.width, height: client.height }
    }
    expect(
      getChampSelectOverlayBounds(client, workArea, measured, counts).candidates
    ).not.toBeNull()
    expect(
      getChampSelectOverlayBounds(
        { ...client, width: 1024, height: 576 },
        workArea,
        measured,
        counts
      )
    ).toEqual({ candidates: null, teammates: null })
  })
  it('fits the measured 1280x720 client and the approved 76px narrow fallback without moving row centers', () => {
    const anchors = {
      backgroundOpacity: 65,
      candidateFirstCenterX: 376.5,
      teammateFirstCenterY: 135,
      candidateStep: 58.5,
      teammateStep: 80
    }
    const measured = { x: 640, y: 340, width: 1280, height: 720 }
    const observedCounts = { candidates: 10, teammates: 5 }
    expect(getChampSelectOverlayBounds(measured, workArea, anchors, observedCounts)).toEqual({
      candidates: { x: 990, y: 269, width: 581, height: 67 },
      teammates: { x: 512, y: 441, width: 120, height: 388 }
    })
    expect(
      getChampSelectOverlayBounds({ ...measured, x: 80 }, workArea, anchors, observedCounts)
        .teammates
    ).toEqual({ x: 2, y: 441, width: 76, height: 388 })
    expect(
      getChampSelectOverlayBounds({ ...measured, x: 79 }, workArea, anchors, observedCounts)
        .teammates
    ).toBeNull()
    expect(
      getChampSelectOverlayBounds({ ...measured, y: 70 }, workArea, anchors, observedCounts)
        .candidates
    ).toBeNull()
  })
  it('keeps configured candidate centers above the client and teammate rows outside its left edge', () => {
    expect(getChampSelectOverlayBounds(client, workArea, configured, counts)).toEqual({
      candidates: { x: 913, y: 229, width: 405, height: 67 },
      teammates: { x: 512, y: 466, width: 120, height: 388 }
    })
  })
  it('requires an actual origin for each group and does not infer it from a crop', () => {
    const unset = createDefaultChampSelectOverlaySettings()
    expect(getChampSelectOverlayBounds(client, workArea, unset, counts)).toEqual({
      candidates: null,
      teammates: null
    })
    expect(
      getChampSelectOverlayBounds(
        client,
        workArea,
        { ...configured, candidateFirstCenterX: null },
        counts
      ).candidates
    ).toBeNull()
  })
  it('hides groups independently when top or left desktop space is insufficient', () => {
    const topMissing = getChampSelectOverlayBounds(
      { ...client, y: 70 },
      workArea,
      configured,
      counts
    )
    expect(topMissing.candidates).toBeNull()
    expect(topMissing.teammates).not.toBeNull()
    const leftMissing = getChampSelectOverlayBounds(
      { ...client, x: 79 },
      workArea,
      configured,
      counts
    )
    expect(leftMissing.teammates).toBeNull()
    expect(leftMissing.candidates).not.toBeNull()
    expect(
      getChampSelectOverlayBounds({ ...client, x: 80 }, workArea, configured, counts).teammates
    ).toEqual({ x: 2, y: 466, width: 76, height: 388 })
  })
  it('preserves the chosen display work area without clamping an off-screen row to a different center', () => {
    expect(
      getChampSelectOverlayBounds(
        { x: -1600, y: 250, width: 1280, height: 720 },
        { x: -1920, y: 87, width: 1920, height: 1040 },
        configured,
        counts
      )
    ).toEqual({
      candidates: { x: -1327, y: 179, width: 405, height: 67 },
      teammates: { x: -1728, y: 416, width: 120, height: 388 }
    })
    expect(
      getChampSelectOverlayBounds({ ...client, y: 1000 }, workArea, configured, counts).teammates
    ).toBeNull()
    expect(
      getChampSelectOverlayBounds(
        client,
        workArea,
        { ...configured, teammateFirstCenterY: 500 },
        counts
      ).teammates
    ).toBeNull()
  })
  it('uses explicit DIP spacing after client resizing, never an inferred client-width scale', () => {
    const resized = { ...client, width: 960, height: 540 }
    const profile = { ...configured, teammateFirstCenterY: 99, candidateStep: 54, teammateStep: 64 }
    expect(getChampSelectOverlayBounds(resized, workArea, profile, counts)).toEqual({
      candidates: { x: 913, y: 229, width: 378, height: 67 },
      teammates: { x: 512, y: 368, width: 120, height: 318 }
    })
    expect(
      getChampSelectOverlayBounds(resized, workArea, { ...profile, candidateStep: 44 }, counts)
        .candidates
    ).toBeNull()
  })
  it('does not fabricate empty groups or extend the band beyond the configured portrait area', () => {
    expect(
      getChampSelectOverlayBounds(client, workArea, configured, { candidates: 0, teammates: 0 })
    ).toEqual({ candidates: null, teammates: null })
    expect(
      getChampSelectOverlayBounds(
        client,
        workArea,
        { ...configured, candidateFirstCenterX: 1200 },
        counts
      ).candidates
    ).toBeNull()
    expect(
      getChampSelectOverlayBounds(
        { x: 0, y: 0, width: 1920, height: 1080 },
        { x: 0, y: 0, width: 1920, height: 1040 },
        configured,
        counts
      )
    ).toEqual({ candidates: null, teammates: null })
  })
})
