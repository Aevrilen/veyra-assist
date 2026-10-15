import assert from 'node:assert/strict'
import { test } from 'vitest'

import { WindowSurfaceCaptureAdapter } from './window-surface-capture-executor'
import type { TargetSnapshot } from './window-surface-capture-executor'

const target = (): TargetSnapshot => ({
  lifecycleId: 'lcu42:champ7',
  ownerProcessId: 42,
  windowHandle: '9007199254740999',
  bounds: { x: -1920, y: 0, width: 1280, height: 720 },
  dipBounds: { x: -1280, y: 0, width: 853.3333333333334, height: 480 },
  displayId: '2',
  scaleFactor: 1.5,
  isForeground: true,
  isVisible: true,
  isMinimized: false
})
const image = (w = 1280, h = 720) => ({
  isEmpty: () => false,
  getSize: () => ({ width: w, height: h })
})
function setup() {
  let snapshot = target()
  let sources = [{ id: `window:${snapshot.windowHandle}:0`, thumbnail: image() }]
  let count = 0
  const adapter = new WindowSurfaceCaptureAdapter({
    snapshot: async () => snapshot,
    getSources: async (options) => {
      count++
      assert.deepEqual(options.types, ['window'])
      return sources
    },
    now: () => 10
  })
  return {
    adapter,
    setSnapshot: (s: TargetSnapshot) => {
      snapshot = s
    },
    setSources: (s: typeof sources) => {
      sources = s
    },
    count: () => count
  }
}
test('exact lossless HWND, negative coordinates, request-time honesty', async () => {
  const x = setup()
  const r = await x.adapter.capture()
  assert.equal(r.evidence.sourceId, 'window:9007199254740999:0')
  assert.equal(r.evidence.freshness, 'request-bracket-only')
  assert.equal(r.evidence.target.bounds.x, -1920)
  assert.equal(r.evidence.requestSequence, 1)
})
test('never falls back to screen or same-title/different HWND', async () => {
  const x = setup()
  x.setSources([
    { id: 'screen:2:0', thumbnail: image() },
    { id: 'window:42:0', thumbnail: image() }
  ])
  await assert.rejects(x.adapter.capture(), { code: 'target-source-missing' })
})
test('rejects scaled thumbnails instead of guessing crop', async () => {
  const x = setup()
  x.setSources([{ id: 'window:9007199254740999:0', thumbnail: image(853, 480) }])
  await assert.rejects(x.adapter.capture(), { code: 'client-surface-size-mismatch' })
})
test('rejects background before capture', async () => {
  const x = setup()
  x.setSnapshot({ ...target(), isForeground: false })
  await assert.rejects(x.adapter.capture(), { code: 'verified-foreground-window-required' })
  assert.equal(x.count(), 0)
})
test('rejects lifecycle/geometry/owner changes during capture', async () => {
  for (const patch of [
    { lifecycleId: 'new' },
    { ownerProcessId: 43 },
    { windowHandle: '55' },
    { bounds: { ...target().bounds, x: 0 } },
    { scaleFactor: 2 },
    { isForeground: false }
  ]) {
    let n = 0
    const a = new WindowSurfaceCaptureAdapter({
      snapshot: async () => (++n === 1 ? target() : { ...target(), ...patch }),
      getSources: async () => [{ id: 'window:9007199254740999:0', thumbnail: image() }],
      now: () => 10
    })
    await assert.rejects(a.capture(), { code: 'source-invalidated' })
  }
})
test('invalidation rejects delayed in-flight result and busy rejects overlap', async () => {
  let unblock!: (x: any) => void
  const a = new WindowSurfaceCaptureAdapter({
    snapshot: async () => target(),
    getSources: () =>
      new Promise<{ id: string; thumbnail: ReturnType<typeof image> }[]>((r) => {
        unblock = r
      }),
    now: () => 10
  })
  const p = a.capture()
  await new Promise((r) => setImmediate(r))
  await assert.rejects(a.capture(), { code: 'busy' })
  a.invalidate()
  unblock([{ id: 'window:9007199254740999:0', thumbnail: image() }])
  await assert.rejects(p, { code: 'source-invalidated' })
})
test('timeout retains busy until uncancellable operation settles', async () => {
  let unblock!: (x: any) => void
  const a = new WindowSurfaceCaptureAdapter(
    {
      snapshot: async () => target(),
      getSources: () =>
        new Promise<{ id: string; thumbnail: ReturnType<typeof image> }[]>((r) => {
          unblock = r
        }),
      now: () => 10
    },
    10
  )
  await assert.rejects(a.capture(), { code: 'capture-timeout' })
  await assert.rejects(a.capture(), { code: 'busy' })
  unblock([])
  await new Promise((r) => setImmediate(r))
  a.stop()
  await assert.rejects(a.capture(), { code: 'stopped' })
})
test('duplicate matching sources rejected', async () => {
  const x = setup()
  x.setSources([1, 2].map(() => ({ id: 'window:9007199254740999:0', thumbnail: image() })))
  await assert.rejects(x.adapter.capture(), { code: 'ambiguous-source' })
})
