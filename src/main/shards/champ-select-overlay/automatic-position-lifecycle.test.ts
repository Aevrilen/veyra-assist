import { createDefaultChampSelectOverlaySettings } from '@shared/champ-select-overlay'
import type { AutomaticPositionObservation } from '@shared/champ-select-overlay/automatic-position'
import { describe, expect, it, vi } from 'vitest'

import {
  type AutomaticPositionCache,
  type AutomaticPositionFrame,
  AutomaticPositionLifecycle,
  type AutomaticPositionSnapshot,
  validAutomaticPositionCache
} from './automatic-position-lifecycle-controller'

function fixture() {
  let now = 1000
  const rect = { x: 100, y: 100, width: 1280, height: 720 }
  const state: AutomaticPositionSnapshot = {
    epoch: 1,
    manualBusy: false,
    settings: createDefaultChampSelectOverlaySettings(),
    context: {
      sessionKey: 'SECRET_SESSION',
      pid: 42,
      windowHandle: 'SECRET_HWND',
      displayId: 'SECRET_DISPLAY',
      physicalClient: { ...rect },
      dipClient: { ...rect },
      counts: { candidates: 3, teammates: 5 },
      foreground: true,
      phase: 'ChampSelect'
    }
  }
  const selection = {
    candidateFirst: { x: 0.3, y: 0.2 },
    candidateNext: { x: 0.35, y: 0.2 },
    teammateFirst: { x: 0.05, y: 0.2 },
    teammateNext: { x: 0.05, y: 0.32 }
  }
  const capture = vi.fn(
    async (snapshot: AutomaticPositionSnapshot): Promise<AutomaticPositionFrame<string>> => {
      const startedAt = now
      now += 100
      return {
        payload: 'SECRET_PIXELS',
        source: 'hwnd-selected-window',
        epoch: snapshot.epoch,
        context: structuredClone(snapshot.context!),
        startedAt,
        finishedAt: now
      }
    }
  )
  const observe = vi.fn(
    async (
      frame: AutomaticPositionFrame<string>,
      sequence: number
    ): Promise<AutomaticPositionObservation | null> => ({
      context: frame.context,
      capturedAt: frame.finishedAt,
      sequence,
      referenceId: 'layout-v1',
      confidence: 'high',
      ambiguous: false,
      independentAnchors: 2,
      selection: structuredClone(selection)
    })
  )
  const apply = vi.fn(),
    writeCache = vi.fn(async (_cache: AutomaticPositionCache) => {}),
    readCache = vi.fn(async (): Promise<unknown> => null),
    diagnostic = vi.fn()
  const controller = new AutomaticPositionLifecycle({
    snapshot: () => state,
    capture,
    observe,
    apply,
    writeCache,
    readCache,
    diagnostic,
    now: () => now,
    wait: async (ms) => {
      now += ms
    }
  })
  const ready = async () => {
    await controller.tick()
    now += 500
    await controller.tick()
  }
  return {
    controller,
    state,
    capture,
    observe,
    apply,
    writeCache,
    readCache,
    diagnostic,
    ready,
    advance: (ms: number) => {
      now += ms
    }
  }
}
const applied = (f: ReturnType<typeof fixture>) => f.apply.mock.calls.filter((c) => c[0] !== null)
const reasons = (f: ReturnType<typeof fixture>) => f.diagnostic.mock.calls.map((c) => c[0].reason)

describe('automatic lifecycle admission and offline analysis', () => {
  it('automatically captures two frames before any analysis, validates, saves and applies without clicks', async () => {
    const f = fixture()
    const order: string[] = []
    f.capture.mockImplementation(async (s) => {
      order.push('capture')
      f.advance(100)
      return {
        payload: '',
        source: 'hwnd-selected-window',
        context: s.context!,
        epoch: s.epoch,
        startedAt: 1500 + (order.length - 1) * 350,
        finishedAt: 1600 + (order.length - 1) * 350
      }
    })
    const original = f.observe.getMockImplementation()!
    f.observe.mockImplementation(async (...args) => {
      order.push('analyse')
      return original(...args)
    })
    await f.ready()
    expect(order).toEqual(['capture', 'capture', 'analyse', 'analyse'])
    expect(f.writeCache).toHaveBeenCalledTimes(1)
    expect(applied(f)).toHaveLength(1)
    expect(reasons(f)).toContain('automatic-applied')
    await f.controller.tick()
    expect(f.capture).toHaveBeenCalledTimes(2)
  })
  it('finishes sealed pair analysis after client closes but never saves or applies it', async () => {
    const f = fixture()
    const original = f.observe.getMockImplementation()!
    f.observe.mockImplementation(async (...args) => {
      f.state.context = null
      f.state.epoch++
      return original(...args)
    })
    await f.ready()
    expect(f.observe).toHaveBeenCalledTimes(2)
    expect(reasons(f)).toContain('automatic-analysis-complete')
    expect(reasons(f)).toContain('automatic-save-stale')
    expect(f.writeCache).not.toHaveBeenCalled()
    expect(applied(f)).toHaveLength(0)
  })
  it('keeps analysis independent of CPU delay without relaxing acquisition gap', async () => {
    const f = fixture()
    const original = f.observe.getMockImplementation()!
    f.observe.mockImplementation(async (...args) => {
      f.advance(5000)
      return original(...args)
    })
    await f.ready()
    expect(applied(f)).toHaveLength(1)
  })
  it.each(['low', 'ambiguous', 'anchors', 'mismatch', 'missing', 'sequence', 'timestamp'] as const)(
    'never saves %s observations',
    async (kind) => {
      const f = fixture()
      const original = f.observe.getMockImplementation()!
      f.observe.mockImplementation(async (...args) => {
        const o = (await original(...args))!
        if (kind === 'low') o.confidence = 'low'
        if (kind === 'ambiguous') o.ambiguous = true
        if (kind === 'anchors') o.independentAnchors = 1
        if (kind === 'mismatch' && args[1] === 2) o.selection.candidateFirst!.x += 0.01
        if (kind === 'missing') return null
        if (kind === 'sequence') o.sequence = 1
        if (kind === 'timestamp') o.capturedAt--
        return o
      })
      await f.ready()
      expect(f.writeCache).not.toHaveBeenCalled()
      expect(applied(f)).toHaveLength(0)
    }
  )
  it.each([
    'epoch',
    'session',
    'hwnd',
    'pid',
    'size',
    'display',
    'counts',
    'settings',
    'manual',
    'phase'
  ] as const)('rejects %s change during acquisition', async (kind) => {
    const f = fixture()
    const original = f.capture.getMockImplementation()!
    f.capture.mockImplementation(async (...args) => {
      const result = await original(...args)
      if (kind === 'epoch') f.state.epoch++
      if (kind === 'session') f.state.context!.sessionKey = 'NEXT'
      if (kind === 'hwnd') f.state.context!.windowHandle = 'NEXT'
      if (kind === 'pid') f.state.context!.pid++
      if (kind === 'size') f.state.context!.physicalClient.width++
      if (kind === 'display') f.state.context!.displayId = 'NEXT'
      if (kind === 'counts') f.state.context!.counts.candidates++
      if (kind === 'settings') f.state.settings.backgroundOpacity++
      if (kind === 'manual') f.state.settings.candidateFirstCenterX = 400
      if (kind === 'phase') f.state.context!.phase = 'InProgress'
      return result
    })
    await f.ready()
    expect(f.observe).not.toHaveBeenCalled()
    expect(f.writeCache).not.toHaveBeenCalled()
  })
  it.each(['first', 'partial', 'editor'])(
    'respects %s manual priority before capturing',
    async (kind) => {
      const f = fixture()
      if (kind === 'first') f.state.settings.candidateFirstCenterX = 400
      if (kind === 'partial') f.state.settings.teammateFirstCenterY = 100
      if (kind === 'editor') f.state.manualBusy = true
      await f.ready()
      expect(f.capture).not.toHaveBeenCalled()
    }
  )
  it('manual save while an automatic cache write is pending wins', async () => {
    const f = fixture()
    f.writeCache.mockImplementation(async () => {
      f.state.settings.candidateFirstCenterX = 440
    })
    await f.ready()
    expect(applied(f)).toHaveLength(0)
    expect(f.state.settings.candidateFirstCenterX).toBe(440)
  })
  it('new epoch while disk write is pending cannot attach old result to new HWND', async () => {
    const f = fixture()
    f.writeCache.mockImplementation(async () => {
      f.state.epoch++
      f.state.context!.windowHandle = 'NEXT'
    })
    await f.ready()
    expect(applied(f)).toHaveLength(0)
  })
  it('revalidates a loaded cache with two frames and reuses it without a write', async () => {
    const f = fixture()
    await f.ready()
    const cache = f.writeCache.mock.calls[0][0]
    const restarted = fixture()
    restarted.readCache.mockResolvedValue(cache)
    await restarted.ready()
    expect(restarted.capture).toHaveBeenCalledTimes(2)
    expect(restarted.writeCache).not.toHaveBeenCalled()
    expect(applied(restarted)).toHaveLength(1)
    expect(reasons(restarted)).toContain('automatic-cache-reused')
  })
  it('does not blindly apply cache before verifying a new client', async () => {
    const f = fixture()
    f.readCache.mockResolvedValue({ version: 1 })
    await f.controller.tick()
    expect(applied(f)).toHaveLength(0)
  })
  it('clears runtime lease immediately on size change and reacquires after stability', async () => {
    const f = fixture()
    await f.ready()
    f.state.context!.physicalClient.width += 128
    f.state.context!.dipClient.width += 128
    await f.controller.tick()
    expect(f.apply).toHaveBeenLastCalledWith(null)
    f.advance(500)
    await f.controller.tick()
    expect(f.capture).toHaveBeenCalledTimes(4)
    expect(f.writeCache).toHaveBeenCalledTimes(2)
  })
  it('saves account-free geometry only and logs no identities or pixels', async () => {
    const f = fixture()
    await f.ready()
    const serialized = JSON.stringify([f.writeCache.mock.calls, f.diagnostic.mock.calls])
    expect(serialized).not.toContain('SECRET')
    expect(serialized).not.toContain('sessionKey')
    expect(serialized).not.toContain('pid')
    expect(serialized).not.toContain('image')
  })
  it('retries after a failure with backoff, never in a hot loop', async () => {
    const f = fixture()
    f.observe.mockResolvedValue(null)
    await f.ready()
    await f.controller.tick()
    expect(f.capture).toHaveBeenCalledTimes(2)
    f.advance(2000)
    await f.controller.tick()
    expect(f.capture).toHaveBeenCalledTimes(4)
  })
  it('does not duplicate acquisition when tick overlaps', async () => {
    const f = fixture()
    let release!: () => void
    f.readCache.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(null)
        })
    )
    await f.controller.tick()
    f.advance(500)
    const running = f.controller.tick()
    await f.controller.tick()
    release()
    await running
    expect(f.capture).toHaveBeenCalledTimes(2)
  })
  it('dispose suppresses apply during analysis and clears active lease', async () => {
    const f = fixture()
    const original = f.observe.getMockImplementation()!
    f.observe.mockImplementation(async (...args) => {
      f.controller.dispose()
      return original(...args)
    })
    await f.ready()
    expect(applied(f)).toHaveLength(0)
    expect(f.writeCache).not.toHaveBeenCalled()
  })
  it('rejects monitor crops even if forged through untyped dependency', async () => {
    const f = fixture()
    const original = f.capture.getMockImplementation()!
    f.capture.mockImplementation(async (...args) => ({
      ...(await original(...args)),
      source: 'screen' as never
    }))
    await f.ready()
    expect(f.observe).not.toHaveBeenCalled()
  })
  it('rejects captures outside the existing 1500ms acquisition-age limit', async () => {
    const f = fixture()
    const original = f.capture.getMockImplementation()!
    f.capture.mockImplementation(async (...args) => {
      const frame = await original(...args)
      f.advance(1501)
      return frame
    })
    await f.ready()
    expect(f.observe).not.toHaveBeenCalled()
  })
  it('contains disk errors without applying unpersisted geometry', async () => {
    const f = fixture()
    f.writeCache.mockRejectedValue(new Error('SECRET_PATH'))
    await f.ready()
    expect(applied(f)).toHaveLength(0)
    expect(reasons(f)).toContain('automatic-attempt-failed')
    expect(JSON.stringify(f.diagnostic.mock.calls)).not.toContain('SECRET_PATH')
  })
  it('contains logging exceptions without interrupting successful calibration', async () => {
    const f = fixture()
    f.diagnostic.mockImplementation(() => {
      throw Error('log')
    })
    await f.ready()
    expect(applied(f)).toHaveLength(1)
  })
  it('rejects malformed cache dimensions', () => {
    expect(validAutomaticPositionCache(null)).toBe(false)
    expect(
      validAutomaticPositionCache({
        version: 1,
        provider: 'legacy-layout-v1',
        physicalWidth: Infinity
      })
    ).toBe(false)
  })
})
