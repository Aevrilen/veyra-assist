import type { LeagueClientWindowSnapshot } from '@main/native'
import {
  type ChampSelectOverlaySettings,
  matchesChampSelectClientSize
} from '@shared/champ-select-overlay'
import {
  type PositionCalibrationReason,
  type PositionCalibrationStatus,
  type PositionPreview,
  positionSettingsFromSelection
} from '@shared/champ-select-overlay/position-calibration'
import { desktopCapturer, screen } from 'electron'
import { randomUUID } from 'node:crypto'

interface PositionContext {
  pid: number | null
  phase: string | null
  counts: { candidates: number; teammates: number }
  settings: ChampSelectOverlaySettings
}
interface CapturedPosition {
  imageUrl: string
  width: number
  height: number
  client: Electron.Rectangle
  workArea: Electron.Rectangle
}
interface Dependencies {
  platform: NodeJS.Platform
  context: () => PositionContext
  readWindow: (pid: number) => LeagueClientWindowSnapshot | null
  toDip: (bounds: Electron.Rectangle) => Electron.Rectangle
  capture: (window: LeagueClientWindowSnapshot) => Promise<CapturedPosition | null>
  save: (settings: ChampSelectOverlaySettings) => Promise<unknown>
}

/** One opt-in snapshot, owned by main; never written to disk or sent to an overlay window. */
export class ChampSelectPositionCalibrationController {
  private _state: PositionCalibrationStatus['state'] = 'idle'
  private _reason: PositionCalibrationReason = 'idle'
  private _retained: {
    preview: PositionPreview
    imageUrl: string
    pid: number
    hwnd: string
  } | null = null
  private _timer: NodeJS.Timeout | null = null
  private _generation = 0
  private _busy = false
  private _stable: string | null = null
  private _disposed = false

  constructor(private readonly _deps: Dependencies) {}

  status(): PositionCalibrationStatus {
    const context = this._deps.context()
    let mismatch = false
    if (context.pid !== null) {
      try {
        const window = this._deps.readWindow(context.pid)
        if (window?.isVisible && !window.isMinimized) {
          mismatch = !matchesChampSelectClientSize(
            context.settings,
            this._deps.toDip(window.bounds)
          )
        }
      } catch {
        /* No fresh geometry is available; do not invent a successful check. */
      }
    }
    return {
      state: this._state,
      reason: this._reason,
      preview: this._retained?.preview ?? null,
      geometryMismatch: mismatch
    }
  }

  begin() {
    if (this._state === 'saving') throw new Error('position-save-in-progress')
    this.cancel()
    if (this._disposed || this._deps.platform !== 'win32') {
      this._fail('unsupported')
      return this.status()
    }
    this._state = 'waiting'
    this._reason = 'waiting-selection'
    this._timer = setInterval(() => void this._tick(), 500)
    void this._tick()
    return this.status()
  }

  preview(requestId: unknown) {
    return typeof requestId === 'string' && requestId === this._retained?.preview.requestId
      ? this._retained.imageUrl
      : null
  }

  cancel() {
    if (this._state === 'saving') return false
    this._generation++
    this._stop()
    this._retained = null
    this._stable = null
    this._state = 'idle'
    this._reason = 'idle'
    return true
  }

  async save(input: unknown) {
    if (!input || typeof input !== 'object' || this._state !== 'ready' || !this._retained)
      throw new Error('position-preview-expired')
    const value = input as { requestId?: unknown; selection?: unknown }
    const retained = this._retained
    if (value.requestId !== retained.preview.requestId) throw new Error('position-preview-expired')
    const context = this._deps.context()
    if (context.pid !== retained.pid) {
      this._fail('source-changed')
      throw new Error('source-changed')
    }
    const current = this._deps.readWindow(retained.pid)
    if (current && current.windowHandle !== retained.hwnd) {
      this._fail('source-changed')
      throw new Error('source-changed')
    }
    // A phase change alone is intentionally allowed. A hidden client can be checked next time
    // it becomes visible by the persisted size guard in placement.ts.
    if (
      current?.isVisible &&
      !current.isMinimized &&
      !matchesChampSelectClientSize(
        { ...context.settings, calibratedClientSize: retained.preview.client },
        this._deps.toDip(current.bounds)
      )
    ) {
      this._fail('geometry-changed')
      throw new Error('geometry-changed')
    }
    const next = positionSettingsFromSelection(
      context.settings,
      retained.preview.client,
      value.selection
    )
    const { client, counts } = retained.preview
    if (
      next.candidateFirstCenterX! + (counts.candidates - 1) * next.candidateStep > client.width ||
      next.teammateFirstCenterY! + (counts.teammates - 1) * next.teammateStep > client.height
    )
      throw new Error('outside')
    this._state = 'saving'
    try {
      await this._deps.save(next)
      this._retained = null
      this._state = 'saved'
      this._reason = 'saved'
    } catch {
      this._state = 'ready'
      this._reason = 'save-failed'
      throw new Error('save-failed')
    }
    return this.status()
  }

  dispose() {
    this._disposed = true
    this._generation++
    this._stop()
    this._retained = null
  }

  private _stop() {
    if (this._timer) clearInterval(this._timer)
    this._timer = null
  }
  private _fail(reason: PositionCalibrationReason) {
    this._stop()
    this._retained = null
    this._state = 'error'
    this._reason = reason
  }
  private _windowKey(window: LeagueClientWindowSnapshot) {
    return JSON.stringify([window.windowHandle, window.ownerProcessId, window.bounds])
  }
  private async _tick() {
    if (this._busy || this._state !== 'waiting' || this._disposed) return
    const generation = this._generation
    const context = this._deps.context()
    const wait = (reason: PositionCalibrationReason) => {
      this._stable = null
      this._reason = reason
    }
    if (!context.pid) {
      wait('waiting-client')
      return
    }
    if (context.phase !== 'ChampSelect') {
      wait('waiting-selection')
      return
    }
    if (!context.counts.candidates || !context.counts.teammates) {
      wait('waiting-portraits')
      return
    }
    this._busy = true
    try {
      const before = this._deps.readWindow(context.pid)
      if (!before?.isForeground || !before.isVisible || before.isMinimized) {
        wait('waiting-foreground')
        return
      }
      if (!before.windowHandle) {
        this._fail('capture-unavailable')
        return
      }
      const signature = this._windowKey(before)
      if (signature !== this._stable) {
        this._stable = signature
        this._reason = 'waiting-stable'
        return
      }
      const capture = await this._deps.capture(before)
      if (generation !== this._generation || this._disposed) return
      const after = this._deps.readWindow(context.pid)
      const latest = this._deps.context()
      if (
        latest.pid !== context.pid ||
        latest.phase !== 'ChampSelect' ||
        !after?.isForeground ||
        !after.isVisible ||
        after.isMinimized ||
        this._windowKey(after) !== signature
      ) {
        wait('waiting-stable')
        return
      }
      if (!capture) {
        this._fail('capture-unavailable')
        return
      }
      if (
        !matchesChampSelectClientSize(
          { ...latest.settings, calibratedClientSize: capture.client },
          this._deps.toDip(after.bounds)
        )
      ) {
        wait('waiting-stable')
        return
      }
      this._retained = {
        preview: {
          requestId: randomUUID(),
          width: capture.width,
          height: capture.height,
          client: capture.client,
          workArea: capture.workArea,
          counts: context.counts
        },
        imageUrl: capture.imageUrl,
        pid: context.pid,
        hwnd: before.windowHandle
      }
      this._state = 'ready'
      this._reason = 'ready'
      this._stop()
    } catch {
      if (generation === this._generation && !this._disposed) this._fail('capture-unavailable')
    } finally {
      this._busy = false
    }
  }
}

/** Require an exact physical screen image; never guess offsets from a resized thumbnail. */
export function positionPreviewCrop(
  client: Electron.Rectangle,
  display: Electron.Rectangle,
  image: { width: number; height: number }
) {
  if (
    image.width !== display.width ||
    image.height !== display.height ||
    client.width <= 0 ||
    client.height <= 0 ||
    client.x < display.x ||
    client.y < display.y ||
    client.x + client.width > display.x + display.width ||
    client.y + client.height > display.y + display.height
  )
    return null
  return {
    x: client.x - display.x,
    y: client.y - display.y,
    width: client.width,
    height: client.height
  }
}

export async function captureChampSelectPosition(
  window: LeagueClientWindowSnapshot
): Promise<CapturedPosition | null> {
  const client = screen.screenToDipRect(null, window.bounds)
  const matches = screen
    .getAllDisplays()
    .map((display) => ({ display, physical: screen.dipToScreenRect(null, display.bounds) }))
    .filter(({ physical }) => positionPreviewCrop(window.bounds, physical, physical) !== null)
  if (matches.length !== 1 || client.width > 4096 || client.height > 4096) return null
  const { display, physical } = matches[0]
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: physical.width, height: physical.height }
  })
  const image = sources.find((source) => source.display_id === String(display.id))?.thumbnail
  if (!image || image.isEmpty()) return null
  const crop = positionPreviewCrop(window.bounds, physical, image.getSize())
  if (!crop) return null
  const cropped = image.crop(crop)
  if (cropped.isEmpty()) return null
  return {
    imageUrl: cropped.toDataURL(),
    width: crop.width,
    height: crop.height,
    client,
    workArea: display.workArea
  }
}
