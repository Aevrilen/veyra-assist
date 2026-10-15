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
function setup() {
  const context = {
    pid: 42 as number | null,
    phase: 'Lobby',
    counts: { candidates: 5, teammates: 5 },
    settings: createDefaultChampSelectOverlaySettings()
  }
  const window = {
    windowHandle: '100',
    ownerProcessId: 43,
    isForeground: true,
    isVisible: true,
    isMinimized: false,
    bounds: { x: 200, y: 100, width: 1280, height: 720 }
  }
  const capture = vi.fn().mockResolvedValue({
    imageUrl: 'MEMORY_ONLY',
    width: 1280,
    height: 720,
    client: { ...window.bounds },
    workArea: { x: 0, y: 0, width: 1920, height: 1080 }
  })
  const save = vi.fn(async (value) => {
    context.settings = value
  })
  const read = vi.fn(() => window)
  const controller = new ChampSelectPositionCalibrationController({
    platform: 'win32',
    context: () => context,
    readWindow: read,
    toDip: (bounds) => ({ ...bounds }),
    capture,
    save
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
    expect(f.controller.status()).toMatchObject({ state: 'error', reason: 'capture-unavailable' })
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
    expect(f.context.settings.calibratedClientSize).toEqual({ width: 1280, height: 720 })
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
    expect(f.controller.status()).toMatchObject({ state: 'ready', reason: 'save-failed' })
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
    expect(f.controller.status()).toMatchObject({ state: 'error', reason: 'capture-unavailable' })
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
