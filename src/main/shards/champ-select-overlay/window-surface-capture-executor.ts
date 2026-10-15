/** Main-process only. No application-level screen fallback, title matching, OCR or persistence.
 * Electron selects a window source; its internal capture backend is not exposed or attested. */
export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}
export interface TargetSnapshot {
  /** Caller derives this from the active LCU connection/ChampSelect lifecycle, not a renderer. */
  lifecycleId: string
  ownerProcessId: number
  windowHandle: string
  bounds: Bounds
  dipBounds: Bounds
  displayId: string
  scaleFactor: number
  isForeground: boolean
  isVisible: boolean
  isMinimized: boolean
}
export interface WindowImage {
  isEmpty(): boolean
  getSize(): { width: number; height: number }
}
export interface WindowSource<I extends WindowImage> {
  id: string
  thumbnail: I
}
export interface WindowCaptureDependencies<I extends WindowImage> {
  snapshot(): Promise<TargetSnapshot | null>
  getSources(options: {
    types: ['window']
    thumbnailSize: { width: number; height: number }
    fetchWindowIcons: false
  }): Promise<WindowSource<I>[]>
  /** Monotonic milliseconds, e.g. performance.now(). Not an acquisition clock. */
  now(): number
}
export class WindowCaptureError extends Error {
  constructor(public code: string) {
    super(code)
  }
}
function fail(code: string): never {
  throw new WindowCaptureError(code)
}
function validBounds(b: Bounds, integer: boolean) {
  return (
    b &&
    [b.x, b.y, b.width, b.height].every(
      (v) => Number.isFinite(v) && (!integer || Number.isInteger(v))
    ) &&
    b.width > 0 &&
    b.height > 0
  )
}
function valid(s: TargetSnapshot | null): s is TargetSnapshot {
  return (
    !!s &&
    !!s.lifecycleId &&
    Number.isInteger(s.ownerProcessId) &&
    s.ownerProcessId > 0 &&
    /^[1-9]\d*$/.test(s.windowHandle) &&
    s.isForeground &&
    s.isVisible &&
    !s.isMinimized &&
    validBounds(s.bounds, true) &&
    validBounds(s.dipBounds, false) &&
    s.bounds.width * s.bounds.height <= 16777216 &&
    Number.isFinite(s.scaleFactor) &&
    s.scaleFactor > 0 &&
    !!s.displayId
  )
}
function same(a: TargetSnapshot, b: TargetSnapshot) {
  return (
    a.lifecycleId === b.lifecycleId &&
    a.ownerProcessId === b.ownerProcessId &&
    a.windowHandle === b.windowHandle &&
    a.displayId === b.displayId &&
    a.scaleFactor === b.scaleFactor &&
    (['x', 'y', 'width', 'height'] as const).every(
      (k) => a.bounds[k] === b.bounds[k] && a.dipBounds[k] === b.dipBounds[k]
    )
  )
}
function copy(s: TargetSnapshot): TargetSnapshot {
  return { ...s, bounds: { ...s.bounds }, dipBounds: { ...s.dipBounds } }
}
export interface WindowSurfaceCapture<I> {
  image: I
  evidence: {
    source: 'electron-window-thumbnail'
    binding: 'hwnd-selected-window'
    coordinateSpace: 'window-thumbnail'
    sourceId: string
    target: TargetSnapshot
    requestStartedAt: number
    requestFinishedAt: number
    /** Electron thumbnails do not expose original frame timestamps. Never restamp as capturedAt. */
    freshness: 'request-bracket-only'
    requestSequence: number
    adapterEpoch: number
  }
}
export class WindowSurfaceCaptureAdapter<I extends WindowImage> {
  private busy = false
  private epoch = 0
  private sequence = 0
  private stopped = false
  private timedOut = false
  get isWaitingForTimedOutCapture() {
    return this.busy && this.timedOut
  }
  constructor(
    private readonly deps: WindowCaptureDependencies<I>,
    private readonly timeoutMs = 4000
  ) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) fail('invalid-timeout')
  }
  /** Call on LCU disconnect, phase exit, new lobby, move/resize or source replacement events. */
  invalidate() {
    this.epoch++
  }
  stop() {
    this.stopped = true
    this.invalidate()
  }
  async capture(): Promise<WindowSurfaceCapture<I>> {
    if (this.stopped) fail('stopped')
    if (this.busy) fail('busy')
    this.busy = true
    this.timedOut = false
    const epoch = this.epoch
    const startedAt = this.deps.now()
    let timer: ReturnType<typeof setTimeout> | undefined
    let expired = false
    const assertCurrent = () => {
      if (this.stopped || epoch !== this.epoch) fail('source-invalidated')
      const elapsed = this.deps.now() - startedAt
      if (expired || elapsed < 0 || elapsed > this.timeoutMs) fail('capture-timeout')
    }
    const work = (async () => {
      const raw = await this.deps.snapshot()
      assertCurrent()
      if (!valid(raw)) fail('verified-foreground-window-required')
      const before = copy(raw)
      const sources = await this.deps.getSources({
        types: ['window'],
        thumbnailSize: { width: before.bounds.width, height: before.bounds.height },
        fetchWindowIcons: false
      })
      assertCurrent()
      // HWND decimal string stays lossless. Never Number(), name matching or first-window fallback.
      const sourceId = `window:${before.windowHandle}:0`
      const matches = sources.filter((s) => s.id === sourceId)
      if (matches.length !== 1) fail(matches.length ? 'ambiguous-source' : 'target-source-missing')
      const image = matches[0].thumbnail
      if (image.isEmpty()) fail('empty-window-image')
      const size = image.getSize()
      // Thumbnail sizing is not guaranteed by Electron. Exact output dimensions are only
      // a resolution check: a resized decorated window can have the same dimensions.
      // Caller must prove the window-to-client mapping separately before persisting an ROI.
      if (size.width !== before.bounds.width || size.height !== before.bounds.height)
        fail('client-surface-size-mismatch')
      const after = await this.deps.snapshot()
      assertCurrent()
      if (!valid(after) || !same(before, after)) fail('source-invalidated')
      return {
        image,
        evidence: {
          source: 'electron-window-thumbnail',
          binding: 'hwnd-selected-window',
          coordinateSpace: 'window-thumbnail',
          sourceId,
          target: before,
          requestStartedAt: startedAt,
          requestFinishedAt: this.deps.now(),
          freshness: 'request-bracket-only',
          requestSequence: ++this.sequence,
          adapterEpoch: epoch
        }
      } as WindowSurfaceCapture<I>
    })()
    // A timed-out Electron operation cannot be cancelled. Keep single-flight until it settles.
    const tracked = work.finally(() => {
      this.busy = false
      this.timedOut = false
      if (timer) clearTimeout(timer)
    })
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        expired = true
        this.timedOut = true
        reject(new WindowCaptureError('capture-timeout'))
      }, this.timeoutMs)
    })
    return Promise.race([tracked, timeout])
  }
}
