import type { LeagueClientWindowSnapshot } from '@main/native'
import {
  type ChampSelectOverlaySettings,
  matchesChampSelectClientSize
} from '@shared/champ-select-overlay'
import {
  type AutomaticPositionContext,
  type AutomaticPositionObservation,
  AutomaticPositionResolver
} from '@shared/champ-select-overlay/automatic-position'
import {
  type AutomaticPositionDiagnostic,
  AutomaticPositionDiagnosticJournal,
  type AutomaticPositionDiagnosticMetrics,
  type AutomaticPositionDiagnosticReason,
  type AutomaticPositionDiagnosticRecord,
  type AutomaticPositionDiagnosticSink,
  reportAutomaticPositionDiagnostic,
  sanitizeAutomaticPositionDiagnostic
} from '@shared/champ-select-overlay/automatic-position/diagnostics'
import {
  type PositionCalibrationReason,
  type PositionCalibrationStatus,
  type PositionCaptureEvidence,
  type PositionPreview,
  type PositionSample,
  positionPreviewCrop,
  positionSettingsFromSelection
} from '@shared/champ-select-overlay/position-calibration'
import { desktopCapturer, screen } from 'electron'
import { randomUUID } from 'node:crypto'

export { positionPreviewCrop } from '@shared/champ-select-overlay/position-calibration'

interface PositionContext {
  pid: number | null
  phase: string | null
  counts: { candidates: number; teammates: number }
  settings: ChampSelectOverlaySettings
  sessionKey?: string
}
export interface CapturedPosition {
  imageUrl: string
  width: number
  height: number
  client: Electron.Rectangle
  workArea: Electron.Rectangle
  capture?: PositionCaptureEvidence
}
interface Dependencies {
  platform: NodeJS.Platform
  context: () => PositionContext
  readWindow: (pid: number) => LeagueClientWindowSnapshot | null
  toDip: (bounds: Electron.Rectangle) => Electron.Rectangle
  capture: (
    window: LeagueClientWindowSnapshot,
    diagnostic?: AutomaticPositionDiagnosticSink
  ) => Promise<CapturedPosition | null>
  save: (settings: ChampSelectOverlaySettings) => Promise<unknown>
  automaticObservation?: (
    capture: CapturedPosition,
    context: AutomaticPositionContext,
    sequence: number,
    diagnostic?: AutomaticPositionDiagnosticSink
  ) => AutomaticPositionObservation | null
  automaticDiagnostic?: (record: AutomaticPositionDiagnosticRecord) => void
  exportSample?: (sample: PositionSample) => Promise<boolean>
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
  private _automatic = false
  private _automaticSequence = 0
  private _automaticCaptures = 0
  private _diagnosticJournal: AutomaticPositionDiagnosticJournal | null = null
  private _automaticStartedAt = 0
  private readonly _automaticResolver = new AutomaticPositionResolver()

  constructor(private readonly _deps: Dependencies) {}

  isEditing() {
    return this._state === 'waiting' || this._state === 'ready' || this._state === 'saving'
  }

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
      geometryMismatch: mismatch,
      ...(this._automatic
        ? { automaticDiagnostics: this._diagnosticJournal?.snapshot() ?? [] }
        : {})
    }
  }

  begin(automatic = false) {
    if (this._state === 'saving') throw new Error('position-save-in-progress')
    this.cancel()
    this._automatic = automatic
    this._automaticStartedAt = Date.now()
    if (automatic) {
      this._diagnosticJournal = new AutomaticPositionDiagnosticJournal(
        randomUUID(),
        this._deps.automaticDiagnostic
      )
      this._diagnose('trial-started', {
        candidates: this._deps.context().counts.candidates,
        teammates: this._deps.context().counts.teammates
      })
    }
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

  flushAutomaticDiagnostics() {
    this._diagnosticJournal?.flush()
  }

  beginAutomatic() {
    return this.begin(true)
  }

  async exportSample(requestId: unknown) {
    if (
      typeof requestId !== 'string' ||
      requestId !== this._retained?.preview.requestId ||
      !this._deps.exportSample
    )
      throw new Error('position-preview-expired')
    return this._deps.exportSample({
      version: 1,
      imageUrl: this._retained.imageUrl,
      preview: this._retained.preview,
      note: 'Local user-requested sample. Image may contain player information. Native geometry brackets capture; not atomic pixel-time ground truth. Automatic markers are unverified suggestions.'
    })
  }

  preview(requestId: unknown) {
    return typeof requestId === 'string' && requestId === this._retained?.preview.requestId
      ? this._retained.imageUrl
      : null
  }

  cancel() {
    if (this._state === 'saving') return false
    this._diagnose('trial-cancelled')
    this._diagnosticJournal?.flush()
    this._generation++
    this._stop()
    this._retained = null
    this._stable = null
    this._automatic = false
    this._automaticSequence = 0
    this._automaticCaptures = 0
    this._diagnosticJournal = null
    this._automaticResolver.reset()
    this._state = 'idle'
    this._reason = 'idle'
    return true
  }

  async save(input: unknown) {
    this._diagnose('manual-save-requested')
    if (!input || typeof input !== 'object' || this._state !== 'ready' || !this._retained) {
      this._diagnose('save-preview-expired')
      throw new Error('position-preview-expired')
    }
    const value = input as { requestId?: unknown; selection?: unknown }
    const retained = this._retained
    if (value.requestId !== retained.preview.requestId) {
      this._diagnose('save-preview-expired')
      throw new Error('position-preview-expired')
    }
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
    let next: ChampSelectOverlaySettings
    try {
      next = positionSettingsFromSelection(
        context.settings,
        retained.preview.client,
        value.selection
      )
    } catch (error) {
      this._diagnose('save-invalid-selection')
      throw error
    }
    const { client, counts } = retained.preview
    if (
      next.candidateFirstCenterX! + (counts.candidates - 1) * next.candidateStep > client.width ||
      next.teammateFirstCenterY! + (counts.teammates - 1) * next.teammateStep > client.height
    ) {
      this._diagnose('save-outside')
      throw new Error('outside')
    }
    this._state = 'saving'
    this._diagnose('manual-save-started')
    try {
      await this._deps.save(next)
      this._retained = null
      this._state = 'saved'
      this._reason = 'saved'
      this._diagnose('manual-save-succeeded')
      this._diagnosticJournal?.flush()
    } catch {
      this._state = 'ready'
      this._reason = 'save-failed'
      this._diagnose('manual-save-failed')
      this._diagnosticJournal?.flush()
      throw new Error('save-failed')
    }
    return this.status()
  }

  dispose() {
    this._diagnose('trial-disposed')
    this._diagnosticJournal?.flush()
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
    this._diagnose(reason as AutomaticPositionDiagnosticReason)
    this._stop()
    this._retained = null
    this._automaticResolver.reset()
    this._state = 'error'
    this._reason = reason
  }
  private _diagnose(
    reason: AutomaticPositionDiagnosticReason,
    metrics: AutomaticPositionDiagnosticMetrics = {}
  ) {
    this._recordAutomaticDiagnostic({ stage: 'controller', reason, metrics })
  }
  private _recordAutomaticDiagnostic = (input: AutomaticPositionDiagnostic) => {
    if (!this._automatic) return
    const safe = sanitizeAutomaticPositionDiagnostic(input)
    if (!safe) return
    const now = Date.now()
    this._diagnosticJournal?.record(
      {
        ...safe,
        metrics: {
          ...safe.metrics,
          captureOrdinal: this._automaticCaptures,
          elapsedMs: Math.max(0, now - this._automaticStartedAt)
        }
      },
      now
    )
  }
  private _windowKey(window: LeagueClientWindowSnapshot) {
    return JSON.stringify([window.windowHandle, window.ownerProcessId, window.bounds])
  }
  private async _tick() {
    if (this._busy || this._state !== 'waiting' || this._disposed) return
    const generation = this._generation
    const journal = this._diagnosticJournal
    // Async work from a cancelled/rearmed attempt must never write into its successor.
    const diagnostic: AutomaticPositionDiagnosticSink = (entry) => {
      if (generation !== this._generation || this._disposed || journal !== this._diagnosticJournal)
        return
      this._recordAutomaticDiagnostic(entry)
    }
    const context = this._deps.context()
    const wait = (reason: PositionCalibrationReason) => {
      this._stable = null
      this._reason = reason
      this._diagnose(reason as AutomaticPositionDiagnosticReason, {
        candidates: context.counts.candidates,
        teammates: context.counts.teammates,
        champSelect: context.phase === 'ChampSelect'
      })
      this._automaticResolver.reset()
      this._automaticSequence = 0
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
      const nativeBeforeAt = Date.now()
      const before = this._deps.readWindow(context.pid)
      if (!before?.isForeground || !before.isVisible || before.isMinimized) {
        wait('waiting-foreground')
        return
      }
      if (!before.windowHandle) {
        this._diagnose('missing-window-identity')
        this._fail('capture-unavailable')
        return
      }
      const signature = this._windowKey(before)
      if (signature !== this._stable) {
        this._stable = signature
        this._reason = 'waiting-stable'
        this._diagnose('waiting-stable', {
          physicalX: before.bounds.x,
          physicalY: before.bounds.y,
          width: before.bounds.width,
          height: before.bounds.height
        })
        return
      }
      if (this._automatic && ++this._automaticCaptures > 2) {
        this._diagnose('capture-limit')
        this._fail('capture-unavailable')
        return
      }
      this._diagnose('capture-started', {
        width: before.bounds.width,
        height: before.bounds.height
      })
      const capture = await this._deps.capture(before, diagnostic)
      if (generation !== this._generation || this._disposed) return
      const after = this._deps.readWindow(context.pid)
      const nativeAfterAt = Date.now()
      const latest = this._deps.context()
      this._diagnose('capture-finished', {
        observationPresent: !!capture,
        captureDurationMs: nativeAfterAt - nativeBeforeAt
      })
      if (
        latest.pid !== context.pid ||
        latest.phase !== 'ChampSelect' ||
        (this._automatic &&
          (latest.sessionKey !== context.sessionKey ||
            JSON.stringify(latest.counts) !== JSON.stringify(context.counts))) ||
        !after?.isForeground ||
        !after.isVisible ||
        after.isMinimized ||
        this._windowKey(after) !== signature
      ) {
        this._diagnose('capture-context-changed', {
          pidChanged: latest.pid !== context.pid,
          phaseChanged: latest.phase !== 'ChampSelect',
          sessionChanged: latest.sessionKey !== context.sessionKey,
          countsChanged: JSON.stringify(latest.counts) !== JSON.stringify(context.counts),
          foreground: !!after?.isForeground && !!after.isVisible && !after.isMinimized,
          windowChanged: !after || this._windowKey(after) !== signature
        })
        if (this._automatic && this._automaticCaptures >= 2) {
          this._fail('capture-unavailable')
          return
        }
        wait('waiting-stable')
        return
      }
      if (!capture) {
        this._diagnose('capture-null')
        this._fail('capture-unavailable')
        return
      }
      if (
        !matchesChampSelectClientSize(
          { ...latest.settings, calibratedClientSize: capture.client },
          this._deps.toDip(after.bounds)
        )
      ) {
        this._diagnose('capture-dip-mismatch', {
          width: capture.width,
          height: capture.height,
          dipWidth: capture.client.width,
          dipHeight: capture.client.height
        })
        wait('waiting-stable')
        return
      }
      let automatic: PositionPreview['automatic']
      if (this._automatic) {
        automatic = { reason: 'unavailable', selection: null }
        if (capture.capture && latest.sessionKey && after.ownerProcessId && after.windowHandle) {
          const automaticContext: AutomaticPositionContext = {
            sessionKey: latest.sessionKey,
            pid: after.ownerProcessId,
            windowHandle: after.windowHandle,
            displayId: capture.capture.displayId,
            physicalClient: { ...after.bounds },
            dipClient: { ...capture.client },
            foreground: true,
            phase: 'ChampSelect',
            counts: { ...latest.counts }
          }
          const manuallyConfigured =
            latest.settings.candidateFirstCenterX !== null ||
            latest.settings.teammateFirstCenterY !== null
          let observation: AutomaticPositionObservation | null = null
          if (!manuallyConfigured) {
            if (!this._deps.automaticObservation) this._diagnose('observer-unavailable')
            try {
              observation =
                this._deps.automaticObservation?.(
                  capture,
                  automaticContext,
                  ++this._automaticSequence,
                  diagnostic
                ) ?? null
            } catch {
              this._diagnose('observer-exception')
              throw new Error('automatic-observer-failed')
            }
          }
          const decision = this._automaticResolver.evaluate({
            enabled: true,
            current: automaticContext,
            settings: latest.settings,
            observation,
            now: Date.now(),
            diagnostic
          })
          if (decision.kind === 'confirming' && this._automaticCaptures < 2) {
            this._reason = 'waiting-stable'
            return
          }
          if (decision.kind === 'confirming') this._diagnose('confirmation-exhausted')
          if (decision.kind === 'suggestion' && observation)
            automatic = {
              reason: 'suggested',
              selection: observation.selection
            }
          else
            automatic = {
              reason: decision.kind === 'manual' ? 'manual-priority' : 'uncertain',
              selection: null
            }
        } else {
          this._diagnose('missing-automatic-context', {
            hasEvidence: !!capture.capture,
            hasSession: !!latest.sessionKey,
            hasOwner: !!after.ownerProcessId,
            hasWindow: !!after.windowHandle
          })
        }
        this._diagnose('preview-retained', {
          width: capture.width,
          height: capture.height,
          dipWidth: capture.client.width,
          dipHeight: capture.client.height,
          candidates: latest.counts.candidates,
          teammates: latest.counts.teammates,
          ...(capture.capture
            ? {
                captureDurationMs: capture.capture.finishedAt - capture.capture.startedAt
              }
            : {}),
          previewSuggested: automatic.reason === 'suggested',
          manualPriority: automatic.reason === 'manual-priority'
        })
      }
      this._retained = {
        preview: {
          requestId: randomUUID(),
          width: capture.width,
          height: capture.height,
          client: capture.client,
          workArea: capture.workArea,
          counts: context.counts,
          capture: capture.capture
            ? { ...capture.capture, nativeBeforeAt, nativeAfterAt }
            : undefined,
          automatic,
          ...(this._automatic
            ? {
                automaticDiagnostics: this._diagnosticJournal?.snapshot() ?? []
              }
            : {})
        },
        imageUrl: capture.imageUrl,
        pid: context.pid,
        hwnd: before.windowHandle
      }
      this._state = 'ready'
      this._reason = 'ready'
      this._stop()
    } catch {
      if (generation === this._generation && !this._disposed) {
        this._diagnose('capture-exception')
        this._fail('capture-unavailable')
      }
    } finally {
      this._busy = false
    }
  }
}

export async function captureChampSelectPosition(
  window: LeagueClientWindowSnapshot,
  diagnostic?: AutomaticPositionDiagnosticSink
): Promise<CapturedPosition | null> {
  const reject = (
    reason: AutomaticPositionDiagnosticReason,
    metrics: AutomaticPositionDiagnosticMetrics = {}
  ) => {
    reportAutomaticPositionDiagnostic(diagnostic, {
      stage: 'capture',
      reason,
      metrics
    })
    return null
  }
  const client = screen.screenToDipRect(null, window.bounds)
  const matches = screen
    .getAllDisplays()
    .map((display) => ({
      display,
      physical: screen.dipToScreenRect(null, display.bounds)
    }))
    .filter(({ physical }) => positionPreviewCrop(window.bounds, physical, physical) !== null)
  if (matches.length !== 1)
    return reject('display-match-count', { matchingDisplays: matches.length })
  if (client.width > 4096 || client.height > 4096)
    return reject('oversized-client', {
      dipWidth: client.width,
      dipHeight: client.height
    })
  const { display, physical } = matches[0]
  const startedAt = Date.now()
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: physical.width, height: physical.height }
  })
  const image = sources.find((source) => source.display_id === String(display.id))?.thumbnail
  if (!image) return reject('missing-screen-thumbnail')
  if (image.isEmpty()) return reject('empty-screen-thumbnail')
  const crop = positionPreviewCrop(window.bounds, physical, image.getSize())
  if (!crop)
    return reject('invalid-crop', {
      physicalX: window.bounds.x,
      physicalY: window.bounds.y,
      width: window.bounds.width,
      height: window.bounds.height,
      imageWidth: image.getSize().width,
      imageHeight: image.getSize().height
    })
  const cropped = image.crop(crop)
  if (cropped.isEmpty()) return reject('empty-crop')
  reportAutomaticPositionDiagnostic(diagnostic, {
    stage: 'capture',
    reason: 'captured',
    metrics: {
      width: crop.width,
      height: crop.height,
      dipWidth: client.width,
      dipHeight: client.height,
      scaleFactor: display.scaleFactor,
      captureDurationMs: Date.now() - startedAt
    }
  })
  return {
    imageUrl: cropped.toDataURL(),
    width: crop.width,
    height: crop.height,
    client,
    workArea: display.workArea,
    capture: {
      startedAt,
      finishedAt: Date.now(),
      physicalClient: { ...window.bounds },
      physicalDisplay: physical,
      displayId: String(display.id),
      scaleFactor: display.scaleFactor,
      geometryCheck: 'bracketed'
    }
  }
}
