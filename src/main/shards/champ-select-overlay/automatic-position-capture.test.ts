import { createDefaultChampSelectOverlaySettings } from '@shared/champ-select-overlay'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AutomaticPositionCapture } from './automatic-position-capture-executor'
import type { AutomaticPositionSnapshot } from './automatic-position-lifecycle-controller'

const mocks = vi.hoisted(() => ({
  getSources: vi.fn(),
  display: vi.fn(),
  physical: vi.fn(),
  probe: vi.fn()
}))
vi.mock('electron', () => ({
  desktopCapturer: { getSources: mocks.getSources },
  screen: { getDisplayMatching: mocks.display, dipToScreenRect: mocks.physical }
}))
vi.mock('./verified-client-geometry-executor', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  probeClientGeometry: mocks.probe
}))
function fixture() {
  const rect = { x: 100, y: 100, width: 1280, height: 720 }
  const s: AutomaticPositionSnapshot = {
    epoch: 1,
    manualBusy: false,
    settings: createDefaultChampSelectOverlaySettings(),
    context: {
      sessionKey: 'secret',
      pid: 42,
      windowHandle: '123',
      displayId: '1',
      physicalClient: { ...rect },
      dipClient: { ...rect },
      counts: { candidates: 3, teammates: 5 },
      phase: 'ChampSelect',
      foreground: true
    }
  }
  const image = {
    isEmpty: () => false,
    getSize: () => ({ width: 1280, height: 720 }),
    toDataURL: () => 'secret-pixels'
  }
  mocks.probe.mockResolvedValue({
    windowHandle: '123',
    ownerProcessId: 42,
    client: rect,
    window: rect,
    extended: rect,
    isForeground: true,
    isVisible: true,
    isMinimized: false
  })
  mocks.display.mockReturnValue({ id: 1, scaleFactor: 1, workArea: rect, bounds: rect })
  mocks.physical.mockReturnValue(rect)
  mocks.getSources.mockResolvedValue([{ id: 'window:123:0', thumbnail: image }])
  return { s, adapter: new AutomaticPositionCapture(() => s), diagnostic: vi.fn(), rect, image }
}
beforeEach(() => vi.clearAllMocks())
describe('automatic HWND capture integration', () => {
  it('proves borderless geometry before two explicit HWND requests, without a monitor fallback', async () => {
    const f = fixture()
    expect(await f.adapter.prepare(f.s, f.diagnostic)).toBe(true)
    for (let i = 0; i < 2; i++) {
      const frame = await f.adapter.capture(f.s, f.diagnostic)
      expect(frame?.source).toBe('hwnd-selected-window')
      expect(frame?.payload.imageUrl).toBe('secret-pixels')
    }
    expect(mocks.probe).toHaveBeenCalledTimes(1)
    expect(
      mocks.getSources.mock.calls.every((c) => JSON.stringify(c[0].types) === '["window"]')
    ).toBe(true)
    expect(JSON.stringify(f.diagnostic.mock.calls)).not.toContain('secret')
  })
  it('does not capture without geometry preparation', async () => {
    const f = fixture()
    expect(await f.adapter.capture(f.s, f.diagnostic)).toBeNull()
    expect(mocks.getSources).not.toHaveBeenCalled()
  })
  it('rejects a decorated window even when thumbnail was resized to the requested dimensions', async () => {
    const f = fixture()
    mocks.probe.mockResolvedValue({
      windowHandle: '123',
      ownerProcessId: 42,
      client: f.rect,
      window: { ...f.rect, height: 750 },
      extended: f.rect,
      isForeground: true,
      isVisible: true,
      isMinimized: false
    })
    expect(await f.adapter.prepare(f.s, f.diagnostic)).toBe(false)
    expect(await f.adapter.capture(f.s, f.diagnostic)).toBeNull()
  })
  it('rejects session turnover while the PowerShell probe is pending', async () => {
    const f = fixture()
    const g = await mocks.probe()
    mocks.probe.mockImplementation(async () => {
      f.s.epoch++
      return g
    })
    const original = structuredClone(f.s)
    expect(await f.adapter.prepare(original, f.diagnostic)).toBe(false)
  })
  it('rejects geometry change after certification', async () => {
    const f = fixture()
    await f.adapter.prepare(f.s, f.diagnostic)
    f.s.context!.physicalClient.x++
    expect(await f.adapter.capture(f.s, f.diagnostic)).toBeNull()
  })
  it('rejects same-title unrelated window because HWND is the only selector', async () => {
    const f = fixture()
    await f.adapter.prepare(f.s, f.diagnostic)
    mocks.getSources.mockResolvedValue([
      { id: 'window:456:0', thumbnail: f.image, name: 'League of Legends' }
    ])
    expect(await f.adapter.capture(f.s, f.diagnostic)).toBeNull()
  })
  it('rejects close or foreground loss while capture is pending', async () => {
    const f = fixture()
    await f.adapter.prepare(f.s, f.diagnostic)
    mocks.getSources.mockImplementation(async () => {
      f.s.context = null
      return [{ id: 'window:123:0', thumbnail: f.image }]
    })
    expect(await f.adapter.capture(f.s, f.diagnostic)).toBeNull()
  })
  it('rejects display scale change after capture', async () => {
    const f = fixture()
    await f.adapter.prepare(f.s, f.diagnostic)
    mocks.display.mockReturnValue({ id: 1, scaleFactor: 1.25, workArea: f.rect, bounds: f.rect })
    expect(await f.adapter.capture(f.s, f.diagnostic)).toBeNull()
  })
  it('invalidate immediately revokes a geometry certificate', async () => {
    const f = fixture()
    await f.adapter.prepare(f.s, f.diagnostic)
    f.adapter.invalidate()
    expect(await f.adapter.capture(f.s, f.diagnostic)).toBeNull()
  })
  it('probe errors are a safe diagnostic rejection without exception text', async () => {
    const f = fixture()
    mocks.probe.mockRejectedValue(Error('secret-path'))
    expect(await f.adapter.prepare(f.s, f.diagnostic)).toBe(false)
    expect(JSON.stringify(f.diagnostic.mock.calls)).not.toContain('secret-path')
  })
})

it('does not spawn repeated PowerShell probes while a timed-out Electron capture remains pending', async () => {
  vi.useFakeTimers()
  try {
    const f = fixture()
    await f.adapter.prepare(f.s, f.diagnostic)
    let release!: (v: unknown[]) => void
    mocks.getSources.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        })
    )
    const first = f.adapter.capture(f.s, f.diagnostic)
    await vi.advanceTimersByTimeAsync(4000)
    expect(await first).toBeNull()
    f.adapter.invalidate()
    f.s.epoch++
    expect(await f.adapter.prepare(f.s, f.diagnostic)).toBe(false)
    expect(mocks.probe).toHaveBeenCalledTimes(1)
    expect(f.diagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'automatic-capture-needs-restart' })
    )
    release([])
    await vi.runAllTimersAsync()
    expect(await f.adapter.prepare(f.s, f.diagnostic)).toBe(true)
    expect(mocks.probe).toHaveBeenCalledTimes(2)
  } finally {
    vi.useRealTimers()
  }
})
