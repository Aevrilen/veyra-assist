import { createDefaultChampSelectOverlaySettings } from '@shared/champ-select-overlay'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ChampSelectPositionCalibrationController,
  positionPreviewCrop
} from './position-calibration-controller'

vi.mock('electron', () => ({ desktopCapturer: {}, screen: {} }))
const selection = {
  candidateFirst: { x: 0.25, y: 0.1 },
  teammateFirst: { x: 0.1, y: 0.2 },
  candidateNext: null,
  teammateNext: null
}
function setup(
  extra: Partial<ConstructorParameters<typeof ChampSelectPositionCalibrationController>[0]> = {}
) {
  const context = {
    pid: 42 as number | null,
    phase: 'Lobby',
    counts: { candidates: 5, teammates: 5 },
    settings: createDefaultChampSelectOverlaySettings(),
    sessionKey: 'synthetic-selection'
  }
  const window = {
    windowHandle: '100',
    ownerProcessId: 43,
    isForeground: true,
    isVisible: true,
    isMinimized: false,
    bounds: { x: 200, y: 100, width: 1280, height: 720 }
  }
  const capture = vi.fn().mockImplementation(async () => ({
    imageUrl: 'MEMORY_ONLY',
    width: 1280,
    height: 720,
    client: { ...window.bounds },
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    capture: {
      startedAt: Date.now(),
      finishedAt: Date.now(),
      physicalClient: { ...window.bounds },
      physicalDisplay: { x: 0, y: 0, width: 1920, height: 1080 },
      displayId: 'synthetic',
      scaleFactor: 1,
      geometryCheck: 'bracketed' as const
    }
  }))
  const save = vi.fn(async (value) => {
    context.settings = value
  })
  const read = vi.fn(() => window)
  const controller = new ChampSelectPositionCalibrationController({
    platform: 'win32',
    context: () => ({ ...context, counts: { ...context.counts } }),
    readWindow: read,
    toDip: (bounds) => ({ ...bounds }),
    capture,
    save,
    ...extra
  })
  return { controller, context, window, capture, save, read }
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
async function ready(f: ReturnType<typeof setup>) {
  f.context.phase = 'ChampSelect'
  f.controller.begin()
  await vi.advanceTimersByTimeAsync(500)
  return f.controller.status().preview!
}
describe('opt-in static selection preview', () => {
  it('rejects legacy native snapshots without a window identity', async () => {
    const f = setup()
    delete (f.window as { windowHandle?: string }).windowHandle
    await ready(f)
    expect(f.capture).not.toHaveBeenCalled()
    expect(f.controller.status()).toMatchObject({
      state: 'error',
      reason: 'capture-unavailable'
    })
    f.controller.dispose()
  })
  it('does not capture until armed and a stable foreground selection is available', async () => {
    const f = setup()
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.capture).not.toHaveBeenCalled()
    f.controller.begin()
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.controller.status().reason).toBe('waiting-selection')
    expect(f.capture).not.toHaveBeenCalled()
    f.context.phase = 'ChampSelect'
    f.window.isForeground = false
    await vi.advanceTimersByTimeAsync(500)
    expect(f.controller.status().reason).toBe('waiting-foreground')
    f.window.isForeground = true
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.capture).toHaveBeenCalledTimes(1)
    expect(f.controller.status().state).toBe('ready')
    f.controller.dispose()
  })
  it('retains one frame after countdown, saves existing fields and releases media', async () => {
    const f = setup(),
      preview = await ready(f)
    f.context.phase = 'InProgress'
    f.window.isMinimized = true
    f.window.isVisible = false
    await vi.advanceTimersByTimeAsync(10000)
    expect(f.capture).toHaveBeenCalledTimes(1)
    expect(f.controller.preview(preview.requestId)).toBe('MEMORY_ONLY')
    expect(f.controller.preview('wrong')).toBeNull()
    await f.controller.save({ requestId: preview.requestId, selection })
    expect(f.context.settings.candidateFirstCenterX).toBe(320)
    expect(f.context.settings.teammateFirstCenterY).toBe(144)
    expect(f.context.settings.calibratedClientSize).toEqual({
      width: 1280,
      height: 720
    })
    expect(f.controller.preview(preview.requestId)).toBeNull()
    expect(f.controller.status().state).toBe('saved')
    f.controller.dispose()
  })
  it.each(['cancel', 'dispose'] as const)(
    'discards a pending capture on %s without changing settings',
    async (action) => {
      const f = setup()
      let finish!: (v: any) => void
      f.capture.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve
        })
      )
      f.context.phase = 'ChampSelect'
      f.controller.begin()
      await vi.advanceTimersByTimeAsync(500)
      f.controller[action]()
      finish({
        imageUrl: 'LATE',
        width: 1280,
        height: 720,
        client: f.window.bounds,
        workArea: f.window.bounds
      })
      await vi.advanceTimersByTimeAsync(500)
      expect(f.controller.status().preview).toBeNull()
      expect(f.save).not.toHaveBeenCalled()
      expect(f.context.settings.candidateFirstCenterX).toBeNull()
    }
  )
  it.each(['focus', 'window', 'phase'] as const)(
    'rejects capture when %s changes during sampling',
    async (change) => {
      const f = setup()
      f.capture.mockImplementation(async () => {
        if (change === 'focus') f.window.isForeground = false
        if (change === 'window') f.window.windowHandle = '200'
        if (change === 'phase') f.context.phase = 'InProgress'
        return {
          imageUrl: 'UNTRUSTED',
          width: 1280,
          height: 720,
          client: f.window.bounds,
          workArea: f.window.bounds
        }
      })
      await ready(f)
      expect(f.controller.status().preview).toBeNull()
      f.controller.dispose()
    }
  )
  it.each(['pid', 'window', 'size'] as const)(
    'preserves old settings when %s changed before save',
    async (change) => {
      const f = setup(),
        preview = await ready(f)
      if (change === 'pid') f.context.pid = 77
      if (change === 'window') f.window.windowHandle = '200'
      if (change === 'size') f.window.bounds.width = 1024
      await expect(f.controller.save({ requestId: preview.requestId, selection })).rejects.toThrow()
      expect(f.save).not.toHaveBeenCalled()
      expect(f.context.settings.candidateFirstCenterX).toBeNull()
      expect(f.controller.status().state).toBe('error')
      f.controller.dispose()
    }
  )
  it('keeps draft and previous settings after a write failure', async () => {
    const f = setup(),
      preview = await ready(f)
    f.save.mockRejectedValueOnce(new Error('write unavailable'))
    await expect(f.controller.save({ requestId: preview.requestId, selection })).rejects.toThrow(
      'save-failed'
    )
    expect(f.controller.status()).toMatchObject({
      state: 'ready',
      reason: 'save-failed'
    })
    expect(f.context.settings.candidateFirstCenterX).toBeNull()
    expect(f.controller.preview(preview.requestId)).toBe('MEMORY_ONLY')
    f.controller.dispose()
  })
  it('does not write forged, invalid or overflowing geometry', async () => {
    const f = setup(),
      preview = await ready(f)
    await expect(f.controller.save({ requestId: 'wrong', selection })).rejects.toThrow()
    await expect(
      f.controller.save({
        requestId: preview.requestId,
        selection: { ...selection, candidateFirst: { x: 0.99, y: 0.1 } }
      })
    ).rejects.toThrow('outside')
    expect(f.save).not.toHaveBeenCalled()
    f.controller.dispose()
  })
  it('reports incompatible saved dimensions while retaining legacy settings', () => {
    const f = setup()
    expect(f.controller.status().geometryMismatch).toBe(false)
    f.context.settings.calibratedClientSize = { width: 1024, height: 576 }
    expect(f.controller.status().geometryMismatch).toBe(true)
    f.controller.dispose()
  })
  it('stops after a failed capture rather than recording repeatedly', async () => {
    const f = setup()
    f.capture.mockResolvedValue(null)
    await ready(f)
    await vi.advanceTimersByTimeAsync(5000)
    expect(f.capture).toHaveBeenCalledTimes(1)
    expect(f.controller.status()).toMatchObject({
      state: 'error',
      reason: 'capture-unavailable'
    })
    f.controller.dispose()
  })
})
describe('opt-in automatic candidate path', () => {
  it.each(['session', 'counts'] as const)(
    'rejects an automatic capture whose %s changed while pixels were pending',
    async (changed) => {
      const automaticObservation = vi.fn(),
        f = setup({ automaticObservation })
      const capture = f.capture.getMockImplementation()!
      f.capture.mockImplementationOnce(async () => {
        const image = await capture()
        if (changed === 'session') f.context.sessionKey = 'next-natural-selection'
        else f.context.counts.candidates++
        return image
      })
      f.context.phase = 'ChampSelect'
      f.controller.beginAutomatic()
      await vi.advanceTimersByTimeAsync(500)
      expect(f.controller.status().preview).toBeNull()
      expect(automaticObservation).not.toHaveBeenCalled()
      expect(f.save).not.toHaveBeenCalled()
      f.controller.dispose()
    }
  )
  const observe = () =>
    vi.fn((_capture, context, sequence) => ({
      context,
      sequence,
      capturedAt: Date.now(),
      referenceId: 'synthetic-only',
      confidence: 'high' as const,
      ambiguous: false,
      independentAnchors: 2,
      selection: {
        candidateFirst: { x: 376.5 / 1280, y: 35 / 720 },
        candidateNext: { x: 435 / 1280, y: 35 / 720 },
        teammateFirst: { x: 86 / 1280, y: 135 / 720 },
        teammateNext: { x: 86 / 1280, y: 215 / 720 }
      }
    }))
  it('requires explicit opt-in and two new frames; only a suggestion is retained', async () => {
    const automaticObservation = observe(),
      f = setup({ automaticObservation })
    f.context.phase = 'ChampSelect'
    f.controller.beginAutomatic()
    await vi.advanceTimersByTimeAsync(500)
    expect(f.controller.status().preview).toBeNull()
    await vi.advanceTimersByTimeAsync(500)
    expect(f.controller.status().preview?.automatic?.reason).toBe('suggested')
    expect(f.capture).toHaveBeenCalledTimes(2)
    expect(f.save).not.toHaveBeenCalled()
    expect(f.context.settings.candidateFirstCenterX).toBeNull()
    f.controller.dispose()
  })
  it('never calls the automatic observer during normal manual preparation', async () => {
    const automaticObservation = observe(),
      f = setup({ automaticObservation })
    await ready(f)
    expect(automaticObservation).not.toHaveBeenCalled()
    expect(f.capture).toHaveBeenCalledTimes(1)
    expect(f.controller.status().preview?.automatic).toBeUndefined()
    f.controller.dispose()
  })
  it('keeps partial manual configuration ahead of automatic recognition', async () => {
    const automaticObservation = observe(),
      f = setup({ automaticObservation })
    f.context.settings.candidateFirstCenterX = 400
    f.context.phase = 'ChampSelect'
    f.controller.beginAutomatic()
    await vi.advanceTimersByTimeAsync(500)
    expect(f.controller.status().preview?.automatic).toEqual({
      reason: 'manual-priority',
      selection: null
    })
    expect(automaticObservation).not.toHaveBeenCalled()
    expect(f.context.settings.candidateFirstCenterX).toBe(400)
    f.controller.dispose()
  })
  it('falls back to one static manual preview when recognition is uncertain', async () => {
    const f = setup({ automaticObservation: () => null })
    f.context.phase = 'ChampSelect'
    f.controller.beginAutomatic()
    await vi.advanceTimersByTimeAsync(500)
    expect(f.controller.status().preview?.automatic).toEqual({
      reason: 'uncertain',
      selection: null
    })
    expect(f.capture).toHaveBeenCalledTimes(1)
    expect(f.save).not.toHaveBeenCalled()
    f.controller.dispose()
  })
  it('turns the trial off when rearmed manually and does not revive its pending suggestion', async () => {
    const automaticObservation = observe(),
      f = setup({ automaticObservation })
    f.context.phase = 'ChampSelect'
    f.controller.beginAutomatic()
    await vi.advanceTimersByTimeAsync(500)
    f.controller.begin()
    await vi.advanceTimersByTimeAsync(500)
    expect(f.controller.status().preview?.automatic).toBeUndefined()
    expect(automaticObservation).toHaveBeenCalledTimes(1)
    f.controller.dispose()
  })
  it('exports only the retained request and pairs its image with capture metadata', async () => {
    const exportSample = vi.fn(async () => true),
      f = setup({ exportSample })
    const preview = await ready(f)
    await expect(f.controller.exportSample('forged')).rejects.toThrow('position-preview-expired')
    await expect(f.controller.exportSample(preview.requestId)).resolves.toBe(true)
    expect(exportSample).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
        imageUrl: 'MEMORY_ONLY',
        preview: expect.objectContaining({
          capture: expect.objectContaining({
            physicalClient: f.window.bounds,
            scaleFactor: 1,
            geometryCheck: 'bracketed',
            nativeBeforeAt: expect.any(Number),
            nativeAfterAt: expect.any(Number)
          })
        })
      })
    )
    f.controller.cancel()
    await expect(f.controller.exportSample(preview.requestId)).rejects.toThrow(
      'position-preview-expired'
    )
    expect(exportSample).toHaveBeenCalledTimes(1)
    f.controller.dispose()
  })
  it('never captures more than two frames if the window keeps moving during capture', async () => {
    const f = setup({ automaticObservation: observe() })
    f.capture.mockImplementation(async () => {
      f.window.bounds.x++
      return null
    })
    f.context.phase = 'ChampSelect'
    f.controller.beginAutomatic()
    await vi.advanceTimersByTimeAsync(10000)
    expect(f.capture).toHaveBeenCalledTimes(2)
    expect(f.controller.status().state).toBe('error')
    expect(f.save).not.toHaveBeenCalled()
    f.controller.dispose()
  })
})

describe('physical preview crop', () => {
  it('preserves negative display origins and exact client coordinates', () => {
    expect(
      positionPreviewCrop(
        { x: -1700, y: 200, width: 1280, height: 720 },
        { x: -1920, y: 80, width: 1920, height: 1080 },
        { width: 1920, height: 1080 }
      )
    ).toEqual({ x: 220, y: 120, width: 1280, height: 720 })
  })
  it('rejects resized images and a client spanning displays', () => {
    const display = { x: 0, y: 0, width: 1920, height: 1080 }
    expect(
      positionPreviewCrop({ x: 100, y: 100, width: 1280, height: 720 }, display, {
        width: 1280,
        height: 720
      })
    ).toBeNull()
    expect(
      positionPreviewCrop({ x: 1500, y: 100, width: 1280, height: 720 }, display, display)
    ).toBeNull()
  })
})

describe('complete automatic diagnostic lifecycle', () => {
  it('distinguishes one null frame and retains its reason after a manual save', async () => {
    const automaticDiagnostic = vi.fn(),
      f = setup({
        automaticDiagnostic,
        automaticObservation: (_capture, _context, _sequence, report) => {
          report?.({
            stage: 'provider',
            reason: 'bench-slot-edges',
            metrics: { benchSlot: 0, benchEdges: 0, required: 3 }
          })
          return null
        }
      })
    f.context.phase = 'ChampSelect'
    f.controller.beginAutomatic()
    await vi.advanceTimersByTimeAsync(500)
    const preview = f.controller.status().preview!
    const before = preview.automaticDiagnostics!
    expect(before.map((d) => d.reason)).toEqual([
      'trial-started',
      'waiting-stable',
      'capture-started',
      'capture-finished',
      'bench-slot-edges',
      'no-observation',
      'preview-retained'
    ])
    expect(before.find((d) => d.reason === 'no-observation')?.metrics.captureOrdinal).toBe(1)
    await f.controller.save({ requestId: preview.requestId, selection })
    expect(f.controller.status().state).toBe('saved')
    expect(f.controller.status().automaticDiagnostics?.map((d) => d.reason)).toEqual([
      ...before.map((d) => d.reason),
      'manual-save-requested',
      'manual-save-started',
      'manual-save-succeeded'
    ])
    const ids = new Set(automaticDiagnostic.mock.calls.map(([d]) => d.attemptId))
    expect(ids.size).toBe(1)
    expect([...ids][0]).toMatch(/^[0-9a-f-]{36}$/)
    const text = JSON.stringify(automaticDiagnostic.mock.calls)
    for (const value of [
      'MEMORY_ONLY',
      'synthetic-selection',
      'displayId',
      'windowHandle',
      'imageUrl'
    ])
      expect(text).not.toContain(value)
    f.controller.dispose()
  })
  it('deduplicates only consecutive unchanged waits and flushes repeats on cancel', async () => {
    const automaticDiagnostic = vi.fn(),
      f = setup({ automaticDiagnostic })
    f.controller.beginAutomatic()
    await vi.advanceTimersByTimeAsync(5000)
    expect(
      automaticDiagnostic.mock.calls.filter(([d]) => d.reason === 'waiting-selection')
    ).toHaveLength(1)
    f.controller.cancel()
    const waits = automaticDiagnostic.mock.calls
      .map(([d]) => d)
      .filter((d) => d.reason === 'waiting-selection')
    expect(waits).toHaveLength(2)
    expect(waits[1].repeatCount).toBe(10)
    expect(waits[1].lastAt - waits[1].firstAt).toBe(4500)
    expect(automaticDiagnostic.mock.calls.at(-1)?.[0].reason).toBe('trial-cancelled')
    f.controller.dispose()
  })
  it('records manual-save recovery after failure while preserving the original rejection', async () => {
    const automaticDiagnostic = vi.fn(),
      f = setup({ automaticDiagnostic, automaticObservation: () => null })
    f.context.phase = 'ChampSelect'
    f.controller.beginAutomatic()
    await vi.advanceTimersByTimeAsync(500)
    const preview = f.controller.status().preview!
    f.save.mockRejectedValueOnce(new Error('PRIVATE_PATH'))
    await expect(f.controller.save({ requestId: preview.requestId, selection })).rejects.toThrow(
      'save-failed'
    )
    await f.controller.save({ requestId: preview.requestId, selection })
    const reasons = automaticDiagnostic.mock.calls.map(([d]) => d.reason)
    expect(reasons).toContain('no-observation')
    expect(reasons.slice(-6)).toEqual([
      'manual-save-requested',
      'manual-save-started',
      'manual-save-failed',
      'manual-save-requested',
      'manual-save-started',
      'manual-save-succeeded'
    ])
    expect(JSON.stringify(automaticDiagnostic.mock.calls)).not.toContain('PRIVATE_PATH')
    f.controller.dispose()
  })
  it('ignores diagnostic sink failures and emits nothing for a manual-only flow', async () => {
    const automaticDiagnostic = vi.fn(() => {
        throw new Error('SINK_BROKEN')
      }),
      f = setup({ automaticDiagnostic })
    await ready(f)
    expect(f.controller.status().state).toBe('ready')
    expect(automaticDiagnostic).not.toHaveBeenCalled()
    f.controller.cancel()
    f.controller.beginAutomatic()
    await vi.advanceTimersByTimeAsync(500)
    expect(f.controller.status().state).toBe('ready')
    expect(f.controller.status().preview?.automatic?.reason).toBe('uncertain')
    f.controller.dispose()
  })
})

describe('diagnostic generation ownership', () => {
  it.each(['rearm', 'dispose'] as const)(
    'discards late capture diagnostics after %s',
    async (action) => {
      const automaticDiagnostic = vi.fn(),
        f = setup({ automaticDiagnostic })
      let finish!: () => void
      f.capture.mockImplementationOnce(
        (_window, report) =>
          new Promise((resolve) => {
            finish = () => {
              report?.({ stage: 'capture', reason: 'empty-crop', metrics: {} })
              resolve(null)
            }
          })
      )
      f.context.phase = 'ChampSelect'
      f.controller.beginAutomatic()
      await vi.advanceTimersByTimeAsync(500)
      if (action === 'rearm') f.controller.beginAutomatic()
      else f.controller.dispose()
      const count = automaticDiagnostic.mock.calls.length
      finish()
      await Promise.resolve()
      await Promise.resolve()
      expect(automaticDiagnostic.mock.calls).toHaveLength(count)
      expect(automaticDiagnostic.mock.calls.some(([d]) => d.reason === 'empty-crop')).toBe(false)
      if (action === 'rearm') f.controller.dispose()
    }
  )
})

it('records two-frame mismatch separately from a first-frame null without taking a third frame', async () => {
  const automaticDiagnostic = vi.fn()
  const f = setup({
    automaticDiagnostic,
    automaticObservation: (_capture, context, sequence) => ({
      context,
      sequence,
      capturedAt: Date.now(),
      referenceId: 'synthetic-only',
      confidence: 'high',
      ambiguous: false,
      independentAnchors: 2,
      selection: {
        candidateFirst: { x: (376.5 + sequence) / 1280, y: 35 / 720 },
        candidateNext: { x: (435 + sequence) / 1280, y: 35 / 720 },
        teammateFirst: { x: 86 / 1280, y: 135 / 720 },
        teammateNext: { x: 86 / 1280, y: 215 / 720 }
      }
    })
  })
  f.context.phase = 'ChampSelect'
  f.controller.beginAutomatic()
  await vi.advanceTimersByTimeAsync(5000)
  expect(f.capture).toHaveBeenCalledTimes(2)
  expect(f.controller.status().preview?.automatic).toEqual({ reason: 'uncertain', selection: null })
  const records = f.controller.status().automaticDiagnostics!
  expect(records.find((d) => d.reason === 'first-frame')?.metrics.captureOrdinal).toBe(1)
  expect(records.find((d) => d.reason === 'frame-mismatch')).toMatchObject({
    metrics: { captureOrdinal: 2, candidateFirstDelta: 1 }
  })
  expect(records.some((d) => d.reason === 'confirmation-exhausted')).toBe(true)
  expect(records.some((d) => d.reason === 'no-observation')).toBe(false)
  expect(f.save).not.toHaveBeenCalled()
  f.controller.dispose()
})
