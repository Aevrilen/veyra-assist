import type { AutomaticPositionContext } from '@shared/champ-select-overlay/automatic-position'
import { describe, expect, it } from 'vitest'

import { matchesAutomaticCaptureScale } from './automatic-position-scale'

const context = (pw: number, ph: number, dw: number, dh: number) =>
  ({
    physicalClient: { width: pw, height: ph },
    dipClient: { width: dw, height: dh }
  }) as AutomaticPositionContext
describe('real display scale and integer DIP rounding', () => {
  it.each([
    [2560, 1440, 1707, 960, 1.5],
    [1600, 900, 1280, 720, 1.25],
    [1920, 1080, 1097, 617, 1.75],
    [1280, 720, 1280, 720, 1]
  ])('accepts %i×%i at rounded %i×%i and scale %f', (pw, ph, dw, dh, s) => {
    expect(matchesAutomaticCaptureScale(context(pw, ph, dw, dh), s)).toBe(true)
  })
  it('rejects a scale change and geometry outside rounding tolerance', () => {
    expect(matchesAutomaticCaptureScale(context(2560, 1440, 1707, 960), 1.25)).toBe(false)
    expect(matchesAutomaticCaptureScale(context(2560, 1440, 1709, 960), 1.5)).toBe(false)
  })
  it.each([0, NaN, Infinity, 5])('rejects invalid scale %f', (s) =>
    expect(matchesAutomaticCaptureScale(context(1280, 720, 1280, 720), s)).toBe(false)
  )
})
