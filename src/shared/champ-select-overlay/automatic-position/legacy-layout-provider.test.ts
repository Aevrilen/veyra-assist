import { describe, expect, it } from 'vitest'

import { createDefaultChampSelectOverlaySettings } from '..'
import { AutomaticPositionResolver } from './index'
import {
  type GrayClientFrame,
  inspectNormalizedLegacyLayout,
  observeLegacyLayout,
  observeNormalizedLegacyLayout
} from './legacy-layout-provider'

/** Artificial chrome, not a screenshot and not evidence of recognition accuracy. */
function syntheticFrame(): GrayClientFrame {
  const pixels = new Uint8Array(1280 * 720)
  for (let slot = 0; slot < 10; slot++) {
    const left = Math.round(351.5 + 58.5 * slot)
    for (let offset = 5; offset < 45; offset += 5) pixels[10 * 1280 + left + offset] = 100
  }
  for (let row = 0; row < 5; row++)
    for (let angle = 0; angle < 16; angle++) {
      const theta = (2 * Math.PI * angle) / 16
      pixels[
        Math.round(135 + 80 * row + 29 * Math.sin(theta)) * 1280 +
          Math.round(86 + 29 * Math.cos(theta))
      ] = 120
    }
  return {
    width: 1280,
    height: 720,
    pixels,
    sequence: 1,
    capturedAt: 100,
    context: {
      sessionKey: 'synthetic',
      pid: 42,
      windowHandle: 'synthetic',
      displayId: 'synthetic',
      physicalClient: { x: 640, y: 340, width: 1280, height: 720 },
      dipClient: { x: 640, y: 340, width: 1280, height: 720 },
      foreground: true,
      phase: 'ChampSelect',
      counts: { candidates: 3, teammates: 5 }
    }
  }
}

describe('limited legacy layout provider (synthetic contract tests)', () => {
  it.each([1280, 1600, 1920, 2560])(
    'reuses the reference chrome at physical width %i without replacing native context',
    (width) => {
      const frame = syntheticFrame(),
        source = frame.pixels,
        scale = width / 1280
      const height = (width * 720) / 1280
      frame.pixels = new Uint8Array(width * height)
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          frame.pixels[y * width + x] = source[Math.floor(y / scale) * 1280 + Math.floor(x / scale)]
      frame.width = width
      frame.height = height
      frame.context.physicalClient.width = width
      frame.context.physicalClient.height = height
      const result = observeNormalizedLegacyLayout(frame)
      expect(result?.referenceId).toBe('legacy-normalized-candidate-v1')
      expect(result?.context.physicalClient.width).toBe(width)
      expect(result?.context.dipClient.width).toBe(1280)
      expect(result?.selection.candidateFirst?.x).toBe(376.5 / 1280)
      frame.pixels.fill(0)
      expect(observeNormalizedLegacyLayout(frame)).toBeNull()
    }
  )
  it('does not normalize a changed aspect ratio or a client whose DIP slots cannot fit', () => {
    const frame = syntheticFrame()
    frame.context.dipClient = { x: 0, y: 0, width: 1024, height: 576 }
    expect(observeNormalizedLegacyLayout(frame)).toBeNull()
    frame.context.dipClient = { x: 0, y: 0, width: 1280, height: 800 }
    expect(observeNormalizedLegacyLayout(frame)).toBeNull()
  })
  it('feeds the resolver with measured legacy geometry without changing saved defaults', () => {
    const frame = syntheticFrame(),
      resolver = new AutomaticPositionResolver()
    const settings = createDefaultChampSelectOverlaySettings()
    const evaluate = () =>
      resolver.evaluate({
        enabled: true,
        current: frame.context,
        settings,
        observation: observeLegacyLayout(frame),
        now: frame.capturedAt
      })
    expect(evaluate()).toEqual({ kind: 'confirming' })
    frame.sequence++
    frame.capturedAt += 500
    expect(evaluate()).toMatchObject({
      kind: 'suggestion',
      settings: {
        candidateFirstCenterX: 376.5,
        candidateStep: 58.5,
        teammateFirstCenterY: 135,
        teammateStep: 80
      }
    })
    expect(settings).toEqual(createDefaultChampSelectOverlaySettings())
  })
  it.each(['blank', 'missing-bench', 'missing-team', 'weak-edges'] as const)(
    'refuses %s instead of using size alone',
    (change) => {
      const frame = syntheticFrame()
      if (change === 'blank') frame.pixels.fill(0)
      if (change === 'missing-bench') frame.pixels.fill(0, 0, 70 * 1280)
      if (change === 'missing-team')
        for (let y = 70; y < 550; y++) frame.pixels.fill(0, y * 1280, y * 1280 + 140)
      if (change === 'weak-edges') frame.pixels = frame.pixels.map((n) => (n ? 10 : 0))
      expect(observeLegacyLayout(frame)).toBeNull()
    }
  )
  it.each(['dpi', 'size', 'phase', 'foreground', 'counts', 'truncated'] as const)(
    'does not extrapolate unsupported %s',
    (change) => {
      const frame = syntheticFrame()
      if (change === 'dpi') frame.context.dipClient = { x: 0, y: 0, width: 1024, height: 576 }
      if (change === 'size') frame.context.physicalClient.width = 1600
      if (change === 'phase') frame.context.phase = 'Lobby'
      if (change === 'foreground') frame.context.foreground = false
      if (change === 'counts') frame.context.counts.teammates = 4
      if (change === 'truncated') frame.pixels = new Uint8Array(100)
      expect(observeLegacyLayout(frame)).toBeNull()
    }
  )
})

describe('diagnostic branch evidence without threshold changes', () => {
  it.each([
    [
      'unsupported-width',
      (f: GrayClientFrame) => {
        f.width = 1024
      }
    ],
    [
      'unsupported-aspect',
      (f: GrayClientFrame) => {
        f.height = 800
      }
    ],
    [
      'pixel-length-mismatch',
      (f: GrayClientFrame) => {
        f.pixels = new Uint8Array(1)
      }
    ],
    [
      'physical-size-mismatch',
      (f: GrayClientFrame) => {
        f.context.physicalClient.width++
      }
    ],
    [
      'unsupported-dip-width',
      (f: GrayClientFrame) => {
        f.context.dipClient.width = 1024
      }
    ],
    [
      'unsupported-dip-aspect',
      (f: GrayClientFrame) => {
        f.context.dipClient.height = 800
      }
    ],
    [
      'inactive',
      (f: GrayClientFrame) => {
        f.context.foreground = false
      }
    ],
    [
      'teammate-count',
      (f: GrayClientFrame) => {
        f.context.counts.teammates = 4
      }
    ],
    [
      'candidate-count',
      (f: GrayClientFrame) => {
        f.context.counts.candidates = 11
      }
    ],
    [
      'bench-slot-edges',
      (f: GrayClientFrame) => {
        f.pixels.fill(0, 0, 70 * 1280)
      }
    ],
    [
      'teammate-row-edges',
      (f: GrayClientFrame) => {
        f.pixels.fill(0, 70 * 1280)
      }
    ]
  ] as const)('identifies %s and still returns no observation', (reason, mutate) => {
    const f = syntheticFrame()
    mutate(f)
    const result = inspectNormalizedLegacyLayout(f)
    expect(result.observation).toBeNull()
    expect(result.diagnostic.reason).toBe(reason)
    expect(observeNormalizedLegacyLayout(f)).toBeNull()
    expect(JSON.stringify(result.diagnostic)).not.toContain('synthetic')
  })
  it('distinguishes enough local edges but insufficient aggregate bench support', () => {
    const f = syntheticFrame()
    for (let slot = 0; slot < 10; slot++) {
      const left = Math.round(351.5 + 58.5 * slot)
      for (const offset of [30, 35, 40]) f.pixels[10 * 1280 + left + offset] = 0
    }
    expect(inspectNormalizedLegacyLayout(f)).toMatchObject({
      observation: null,
      diagnostic: {
        reason: 'bench-total-edges',
        metrics: { benchTotal: 50, required: 60 }
      }
    })
  })
  it('distinguishes enough ring edges per row but insufficient aggregate team support', () => {
    const f = syntheticFrame()
    for (let row = 0; row < 5; row++)
      for (const angle of [0, 4, 8]) {
        const theta = (2 * Math.PI * angle) / 16
        f.pixels[
          Math.round(135 + 80 * row + 29 * Math.sin(theta)) * 1280 +
            Math.round(86 + 29 * Math.cos(theta))
        ] = 0
      }
    expect(inspectNormalizedLegacyLayout(f)).toMatchObject({
      observation: null,
      diagnostic: {
        reason: 'teammate-total-edges',
        metrics: { teammateTotal: 65, required: 72 }
      }
    })
  })
  it('reports synthetic matching edge counts without claiming measured probability', () => {
    const result = inspectNormalizedLegacyLayout(syntheticFrame())
    expect(result.observation).not.toBeNull()
    expect(result.diagnostic).toMatchObject({
      reason: 'matched',
      metrics: { benchTotal: 80, teammateTotal: 80 }
    })
  })
})
