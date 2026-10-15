import { WindowSurfaceCaptureAdapter } from '@main/shards/champ-select-overlay/window-surface-capture-executor'
import { expect, it, vi } from 'vitest'

it('audit: an unresolved Electron getSources blocks even a new session after timeout', async () => {
  vi.useFakeTimers()
  let id = 'session1'
  const rect = { x: 0, y: 0, width: 1280, height: 720 }
  const getSources = vi.fn(() => new Promise<any[]>(() => {}))
  const adapter = new WindowSurfaceCaptureAdapter(
    {
      now: () => Date.now(),
      getSources,
      snapshot: async () => ({
        lifecycleId: id,
        ownerProcessId: 42,
        windowHandle: '123',
        bounds: rect,
        dipBounds: rect,
        displayId: '1',
        scaleFactor: 1,
        isForeground: true,
        isVisible: true,
        isMinimized: false
      })
    },
    4000
  )
  const first = expect(adapter.capture()).rejects.toMatchObject({ code: 'capture-timeout' })
  await vi.advanceTimersByTimeAsync(4001)
  await first
  id = 'session2'
  adapter.invalidate()
  await expect(adapter.capture()).rejects.toMatchObject({ code: 'busy' })
  expect(getSources).toHaveBeenCalledTimes(1)
  vi.useRealTimers()
})
