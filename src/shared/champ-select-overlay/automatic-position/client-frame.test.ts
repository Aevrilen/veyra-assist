import { describe, expect, it } from 'vitest'

import { createDefaultChampSelectOverlaySettings } from '..'
import { getChampSelectOverlayBounds } from '../../../main/shards/champ-select-overlay/placement'
import { prepareAutomaticPositionFrame } from './client-frame'
import { type AutomaticPositionContext, AutomaticPositionResolver } from './index'
import { observeLegacyLayout } from './legacy-layout-provider'

const cases = [
  {
    name: '1080p 100% window',
    screen: [0, 0, 1920, 1080],
    physical: [320, 180, 1280, 720],
    dip: [320, 180, 1280, 720],
    offset: [320, 180]
  },
  {
    name: '1440p 100% window',
    screen: [0, 0, 2560, 1440],
    physical: [640, 340, 1280, 720],
    dip: [640, 340, 1280, 720],
    offset: [640, 340]
  },
  {
    name: '1440p 125% window',
    screen: [0, 0, 2560, 1440],
    physical: [480, 250, 1600, 900],
    dip: [384, 200, 1280, 720],
    offset: [480, 250]
  },
  {
    name: '1440p 150% window',
    screen: [0, 0, 2560, 1440],
    physical: [320, 180, 1920, 1080],
    dip: [320 / 1.5, 120, 1280, 720],
    offset: [320, 180]
  },
  {
    name: 'negative monitor origin',
    screen: [-1920, 80, 1920, 1080],
    physical: [-1700, 200, 1280, 720],
    dip: [-1700, 200, 1280, 720],
    offset: [220, 120]
  }
]
function rect(value: number[]) {
  return { x: value[0], y: value[1], width: value[2], height: value[3] }
}
function setup(example = cases[0]) {
  const display = rect(example.screen),
    physical = rect(example.physical)
  const context: AutomaticPositionContext = {
    sessionKey: 'synthetic-capture',
    pid: 42,
    windowHandle: 'synthetic-client',
    displayId: 'synthetic-monitor',
    physicalClient: physical,
    dipClient: rect(example.dip),
    counts: { candidates: 3, teammates: 5 },
    foreground: true,
    phase: 'ChampSelect'
  }
  const pixels = new Uint8Array(display.width * display.height).fill(9)
  // Literal scenario offsets are the crop oracle; no Electron or screenshot capture is involved.
  const [x, y] = example.offset
  pixels[y * display.width + x] = 17
  pixels[y * display.width + x + physical.width - 1] = 33
  pixels[(y + physical.height - 1) * display.width + x] = 57
  pixels[(y + physical.height - 1) * display.width + x + physical.width - 1] = 73
  return {
    image: { width: display.width, height: display.height, pixels },
    physicalDisplay: display,
    before: structuredClone(context),
    after: context,
    sequence: 1,
    capturedAt: 100
  }
}

describe('offline screen-to-client geometry (synthetic only)', () => {
  it.each(cases)('crops physical pixels exactly for $name without resampling', (example) => {
    const input = setup(example),
      frame = prepareAutomaticPositionFrame(input)!
    expect(frame).not.toBeNull()
    expect([frame.width, frame.height]).toEqual(example.physical.slice(2))
    expect([
      frame.pixels[0],
      frame.pixels[frame.width - 1],
      frame.pixels[(frame.height - 1) * frame.width],
      frame.pixels.at(-1)
    ]).toEqual([17, 33, 57, 73])
    expect(frame.context.dipClient).toEqual(rect(example.dip))
    expect(frame.pixels).not.toBe(input.image.pixels)
    // DPI crop success does not imply support by the measured 100% recognizer.
    if (example.physical[2] !== example.dip[2]) expect(observeLegacyLayout(frame)).toBeNull()
  })
  it.each([
    [1920, 1080],
    [2560, 1440]
  ])(
    'accepts an entire %ix%i borderless client but keeps unsupported recognition off',
    (width, height) => {
      const input = setup({
        name: 'synthetic borderless full client',
        screen: [0, 0, width, height],
        physical: [0, 0, width, height],
        dip: [0, 0, width, height],
        offset: [0, 0]
      })
      const frame = prepareAutomaticPositionFrame(input)!
      expect(frame.width).toBe(width)
      expect(observeLegacyLayout(frame)).toBeNull()
      const resolver = new AutomaticPositionResolver()
      const settings = createDefaultChampSelectOverlaySettings()
      expect(
        resolver.evaluate({ current: input.after, settings, observation: null, now: 100 })
      ).toEqual({ kind: 'unavailable', reason: 'disabled' })
      const manual = {
        ...settings,
        candidateFirstCenterX: 376.5,
        teammateFirstCenterY: 135,
        calibratedClientSize: { width, height }
      }
      expect(
        resolver.evaluate({
          enabled: true,
          current: input.after,
          settings: manual,
          observation: null,
          now: 100
        })
      ).toEqual({ kind: 'manual', settings: manual })
      // Existing placement hides outside-client bands if a full-screen client leaves no margin.
      expect(
        getChampSelectOverlayBounds(
          input.after.dipClient,
          input.physicalDisplay,
          manual,
          input.after.counts
        )
      ).toEqual({ candidates: null, teammates: null })
    }
  )
  it.each(['move', 'resize', 'window', 'display', 'focus'] as const)(
    'rejects %s during capture',
    (change) => {
      const input = setup()
      if (change === 'move') input.after.physicalClient.x++
      if (change === 'resize') input.after.physicalClient.height++
      if (change === 'window') input.after.windowHandle = 'recreated'
      if (change === 'display') input.after.displayId = 'other'
      if (change === 'focus') input.after.foreground = false
      expect(prepareAutomaticPositionFrame(input)).toBeNull()
    }
  )
  it.each(['resized-image', 'truncated-image', 'spanning-displays', 'fractional-origin'] as const)(
    'refuses %s without guessing',
    (change) => {
      const input = setup()
      if (change === 'resized-image') {
        input.image = { width: 1280, height: 720, pixels: new Uint8Array(1280 * 720) }
      }
      if (change === 'truncated-image') input.image.pixels = new Uint8Array(100)
      if (change === 'spanning-displays')
        input.before.physicalClient.x = input.after.physicalClient.x = 1500
      if (change === 'fractional-origin')
        input.before.physicalClient.x = input.after.physicalClient.x = 320.5
      expect(prepareAutomaticPositionFrame(input)).toBeNull()
    }
  )
  it('keeps captured metadata and pixels independent of later caller mutations', () => {
    const input = setup(),
      frame = prepareAutomaticPositionFrame(input)!
    input.after.physicalClient.x++
    input.after.dipClient.x++
    input.after.counts.candidates++
    input.image.pixels.fill(0)
    expect(frame.context.physicalClient.x).toBe(320)
    expect(frame.context.dipClient.x).toBe(320)
    expect(frame.context.counts.candidates).toBe(3)
    expect(frame.pixels[0]).toBe(17)
    expect(
      new AutomaticPositionResolver().evaluate({
        enabled: true,
        current: input.after,
        settings: createDefaultChampSelectOverlaySettings(),
        now: 100,
        observation: {
          context: frame.context,
          sequence: 1,
          capturedAt: 100,
          referenceId: 'synthetic-only',
          confidence: 'high',
          ambiguous: false,
          independentAnchors: 2,
          selection: {
            candidateFirst: null,
            candidateNext: null,
            teammateFirst: null,
            teammateNext: null
          }
        }
      })
    ).toEqual({ kind: 'unavailable', reason: 'context-changed' })
  })
})
