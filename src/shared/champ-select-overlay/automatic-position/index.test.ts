import { describe, expect, it } from 'vitest'

import { createDefaultChampSelectOverlaySettings } from '..'
import { getChampSelectOverlayBounds } from '../../../main/shards/champ-select-overlay/placement'
import {
  type AutomaticPositionContext,
  type AutomaticPositionObservation,
  AutomaticPositionResolver
} from './index'

function context(): AutomaticPositionContext {
  return {
    sessionKey: 'synthetic-session',
    pid: 42,
    windowHandle: 'synthetic-window',
    displayId: 'display-1',
    physicalClient: { x: 400, y: 200, width: 1280, height: 720 },
    dipClient: { x: 400, y: 200, width: 1280, height: 720 },
    foreground: true,
    phase: 'ChampSelect',
    counts: { candidates: 5, teammates: 5 }
  }
}
function setup() {
  const current = context()
  const observation: AutomaticPositionObservation = {
    context: structuredClone(current),
    sequence: 1,
    capturedAt: 100,
    referenceId: 'synthetic-contract-only',
    confidence: 'high',
    ambiguous: false,
    independentAnchors: 2,
    selection: {
      candidateFirst: { x: 320 / 1280, y: 60 / 720 },
      candidateNext: { x: 380 / 1280, y: 60 / 720 },
      teammateFirst: { x: 40 / 1280, y: 160 / 720 },
      teammateNext: { x: 40 / 1280, y: 240 / 720 }
    }
  }
  return {
    enabled: true,
    current,
    observation,
    settings: createDefaultChampSelectOverlaySettings(),
    now: 100
  }
}
function next(input: ReturnType<typeof setup>) {
  return {
    ...input,
    now: 600,
    observation: { ...input.observation, sequence: 2, capturedAt: 600 }
  }
}
describe('automatic position provider boundary (synthetic observations only)', () => {
  it('passes a confirmed proposal through existing placement without a second coordinate transform', () => {
    const input = setup(),
      resolver = new AutomaticPositionResolver()
    resolver.evaluate(input)
    const result = resolver.evaluate(next(input))
    if (result.kind !== 'suggestion') throw new Error('expected suggestion')
    expect(
      getChampSelectOverlayBounds(
        input.current.dipClient,
        { x: 0, y: 0, width: 1920, height: 1080 },
        result.settings,
        input.current.counts
      )
    ).toEqual({
      candidates: { x: 693, y: 129, width: 294, height: 67 },
      teammates: { x: 272, y: 326, width: 120, height: 388 }
    })
  })
  it('defaults off and needs two independent fresh observations before suggesting existing DIP settings', () => {
    const resolver = new AutomaticPositionResolver(),
      input = setup()
    expect(resolver.evaluate({ ...input, enabled: undefined })).toEqual({
      kind: 'unavailable',
      reason: 'disabled'
    })
    expect(resolver.evaluate(input)).toEqual({ kind: 'confirming' })
    const result = resolver.evaluate(next(input))
    expect(result).toMatchObject({
      kind: 'suggestion',
      settings: {
        candidateFirstCenterX: 320,
        teammateFirstCenterY: 160,
        candidateStep: 60,
        teammateStep: 80,
        calibratedClientSize: { width: 1280, height: 720 }
      }
    })
    expect(input.settings).toEqual(createDefaultChampSelectOverlaySettings())
  })
  it('keeps complete or partial manual calibration ahead of automatic observations and the switch', () => {
    for (const settings of [
      {
        ...createDefaultChampSelectOverlaySettings(),
        candidateFirstCenterX: 321,
        teammateFirstCenterY: 161
      },
      {
        ...createDefaultChampSelectOverlaySettings(),
        teammateFirstCenterY: 161
      }
    ]) {
      const input = setup(),
        resolver = new AutomaticPositionResolver()
      expect(resolver.evaluate({ ...input, enabled: false, settings })).toEqual({
        kind: 'manual',
        settings
      })
    }
  })
  it('refuses to replace a saved manual calibration after its client size changes', () => {
    const input = setup()
    input.settings.candidateFirstCenterX = 320
    input.settings.calibratedClientSize = { width: 1600, height: 900 }
    expect(new AutomaticPositionResolver().evaluate(input)).toEqual({
      kind: 'unavailable',
      reason: 'manual-geometry-changed'
    })
  })
  it.each(['low', 'ambiguous', 'one-anchor', 'no-reference'] as const)(
    'rejects %s evidence and resets confirmation',
    (change) => {
      const input = setup(),
        resolver = new AutomaticPositionResolver()
      resolver.evaluate(input)
      const bad = next(input)
      if (change === 'low') bad.observation.confidence = 'low'
      if (change === 'ambiguous') bad.observation.ambiguous = true
      if (change === 'one-anchor') bad.observation.independentAnchors = 1
      if (change === 'no-reference') bad.observation.referenceId = ''
      expect(resolver.evaluate(bad)).toEqual({
        kind: 'unavailable',
        reason: 'uncertain'
      })
      expect(resolver.evaluate(next(input))).toEqual({ kind: 'confirming' })
    }
  )
  it.each(['window', 'session', 'pid', 'display', 'move', 'size', 'counts'] as const)(
    'invalidates captured evidence on %s changes',
    (change) => {
      const input = setup(),
        resolver = new AutomaticPositionResolver()
      resolver.evaluate(input)
      const changed = next(input)
      changed.current = structuredClone(input.current)
      if (change === 'window') changed.current.windowHandle = 'new-window'
      if (change === 'session') changed.current.sessionKey = 'new-session'
      if (change === 'pid') changed.current.pid = 43
      if (change === 'display') changed.current.displayId = 'display-2'
      if (change === 'move') changed.current.physicalClient.x++
      if (change === 'size') {
        changed.current.dipClient.width++
        changed.current.physicalClient.width++
      }
      if (change === 'counts') changed.current.counts.candidates++
      expect(resolver.evaluate(changed)).toEqual({
        kind: 'unavailable',
        reason: 'context-changed'
      })
    }
  )
  it('falls back when disabled or the provider has no result and requires confirmation after re-enabling', () => {
    const input = setup(),
      resolver = new AutomaticPositionResolver()
    resolver.evaluate(input)
    expect(resolver.evaluate({ ...next(input), observation: null })).toEqual({
      kind: 'unavailable',
      reason: 'no-observation'
    })
    expect(resolver.evaluate(next(input))).toEqual({ kind: 'confirming' })
    expect(resolver.evaluate({ ...next(input), enabled: false })).toEqual({
      kind: 'unavailable',
      reason: 'disabled'
    })
    expect(resolver.evaluate(next(input))).toEqual({ kind: 'confirming' })
  })
  it.each(['focus', 'phase'] as const)('revokes the pending result on lost %s', (change) => {
    const input = setup(),
      resolver = new AutomaticPositionResolver()
    resolver.evaluate(input)
    if (change === 'focus') input.current.foreground = false
    else input.current.phase = 'InProgress'
    expect(resolver.evaluate(next(input))).toEqual({
      kind: 'unavailable',
      reason: 'inactive'
    })
  })
  it('refuses duplicate, expired, future and out-of-order observations', () => {
    for (const change of ['duplicate', 'expired', 'future', 'out-of-order']) {
      const input = setup(),
        resolver = new AutomaticPositionResolver()
      resolver.evaluate(input)
      const bad = next(input)
      if (change === 'duplicate') {
        bad.observation.sequence = 1
        bad.observation.capturedAt = 100
      }
      if (change === 'expired') bad.now = 2101
      if (change === 'future') bad.observation.capturedAt = 601
      if (change === 'out-of-order') bad.observation.sequence = 0
      expect(resolver.evaluate(bad)).toEqual({
        kind: 'unavailable',
        reason: 'stale'
      })
    }
  })
  it.each([1, 1.25, 1.5, 2])(
    'handles synthetic physical-to-DIP mapping at scale %s without screen-resolution assumptions',
    (scale) => {
      const input = setup(),
        resolver = new AutomaticPositionResolver()
      input.current.physicalClient = {
        x: -1920,
        y: 0,
        width: 1280 * scale,
        height: 720 * scale
      }
      input.current.dipClient.x = -1280
      input.observation.context = structuredClone(input.current)
      resolver.evaluate(input)
      expect(resolver.evaluate(next(input))).toMatchObject({
        kind: 'suggestion',
        settings: { candidateFirstCenterX: 320, teammateFirstCenterY: 160 }
      })
    }
  )
  it('rejects nonuniform DPI mapping and invalid or incomplete geometry', () => {
    const input = setup()
    input.current.physicalClient.height = 1080
    expect(new AutomaticPositionResolver().evaluate(input)).toEqual({
      kind: 'unavailable',
      reason: 'invalid-context'
    })
    for (const change of ['missing-point', 'spacing', 'outside', 'skew']) {
      const invalid = setup()
      if (change === 'missing-point') invalid.observation.selection.candidateNext = null
      if (change === 'spacing') invalid.observation.selection.candidateNext!.x = 0.26
      if (change === 'outside')
        invalid.current.counts.candidates = invalid.observation.context.counts.candidates = 20
      if (change === 'skew') invalid.observation.selection.teammateNext!.x += 0.1
      expect(new AutomaticPositionResolver().evaluate(invalid)).toEqual({
        kind: 'unavailable',
        reason: 'invalid-selection'
      })
    }
  })
  it('starts over after reset or after a long gap between otherwise matching samples', () => {
    const input = setup(),
      resolver = new AutomaticPositionResolver()
    resolver.evaluate(input)
    resolver.reset()
    expect(resolver.evaluate(next(input))).toEqual({ kind: 'confirming' })
    expect(
      resolver.evaluate({
        ...input,
        now: 2200,
        observation: { ...input.observation, sequence: 3, capturedAt: 2200 }
      })
    ).toEqual({ kind: 'confirming' })
  })
})

describe('resolver diagnostic reasons preserve public decisions', () => {
  it('separates first-frame, geometry mismatch and later confirmation', () => {
    const resolver = new AutomaticPositionResolver(),
      input = setup(),
      reports: any[] = []
    const diagnostic = (d: unknown) => reports.push(d)
    expect(resolver.evaluate({ ...input, diagnostic })).toEqual({
      kind: 'confirming'
    })
    const changed = next(input)
    changed.observation.selection = {
      ...changed.observation.selection,
      candidateFirst: { x: 321 / 1280, y: 60 / 720 },
      candidateNext: { x: 381 / 1280, y: 60 / 720 }
    }
    expect(resolver.evaluate({ ...changed, diagnostic })).toEqual({
      kind: 'confirming'
    })
    expect(reports.map((d) => d.reason)).toEqual(['first-frame', 'frame-mismatch'])
    expect(reports[1].metrics).toMatchObject({
      sameContext: true,
      sameReference: true,
      candidateFirstDelta: 1,
      frameGapMs: 500
    })
    expect(JSON.stringify(reports)).not.toContain('synthetic-session')
  })
  it('reports invalid timestamp order without changing stale rejection', () => {
    const resolver = new AutomaticPositionResolver(),
      input = setup(),
      reports: any[] = []
    resolver.evaluate(input)
    expect(resolver.evaluate({ ...input, diagnostic: (d) => reports.push(d) })).toEqual({
      kind: 'unavailable',
      reason: 'stale'
    })
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      reason: 'stale',
      metrics: { increasingSequence: false, increasingTime: false }
    })
  })
})
