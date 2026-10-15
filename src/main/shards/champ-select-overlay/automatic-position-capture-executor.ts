import { automaticPositionContextKey } from '@shared/champ-select-overlay/automatic-position'
import {
  type AutomaticPositionDiagnosticReason,
  type AutomaticPositionDiagnosticSink,
  reportAutomaticPositionDiagnostic
} from '@shared/champ-select-overlay/automatic-position/diagnostics'
import { type NativeImage, desktopCapturer, screen } from 'electron'

import type {
  AutomaticPositionFrame,
  AutomaticPositionSnapshot
} from './automatic-position-lifecycle-controller'
import { matchesAutomaticCaptureScale } from './automatic-position-scale'
import type { CapturedPosition } from './position-calibration-controller'
import {
  isVerifiedBorderlessClient,
  probeClientGeometry
} from './verified-client-geometry-executor'
import {
  type TargetSnapshot,
  WindowCaptureError,
  WindowSurfaceCaptureAdapter
} from './window-surface-capture-executor'

const key = (s: AutomaticPositionSnapshot) =>
  s.context ? JSON.stringify([s.epoch, automaticPositionContextKey(s.context)]) : ''
/** Windows candidate adapter. No monitor fallback and no attempt to focus or move the client. */
export class AutomaticPositionCapture {
  private _verifiedKey = ''
  private readonly _adapter: WindowSurfaceCaptureAdapter<NativeImage>
  constructor(private readonly _snapshot: () => AutomaticPositionSnapshot) {
    this._adapter = new WindowSurfaceCaptureAdapter({
      now: Date.now,
      snapshot: async () => this.target(),
      getSources: (options) => desktopCapturer.getSources(options)
    })
  }
  stop() {
    this._verifiedKey = ''
    this._adapter.stop()
  }
  invalidate() {
    this._verifiedKey = ''
    this._adapter.invalidate()
  }
  private target(): TargetSnapshot | null {
    const s = this._snapshot(),
      c = s.context
    if (!c || !this._verifiedKey || this._verifiedKey !== key(s) || s.manualBusy) return null
    const display = screen.getDisplayMatching(c.dipClient)
    if (String(display.id) !== c.displayId || !matchesAutomaticCaptureScale(c, display.scaleFactor))
      return null
    return {
      lifecycleId: String(s.epoch) + ':' + c.sessionKey,
      ownerProcessId: c.pid,
      windowHandle: c.windowHandle,
      bounds: { ...c.physicalClient },
      dipBounds: { ...c.dipClient },
      displayId: c.displayId,
      scaleFactor: display.scaleFactor,
      isForeground: c.foreground && c.phase === 'ChampSelect',
      isVisible: true,
      isMinimized: false
    }
  }
  async prepare(s: AutomaticPositionSnapshot, diagnostic: AutomaticPositionDiagnosticSink) {
    this._verifiedKey = ''
    if (this._adapter.isWaitingForTimedOutCapture) {
      reportAutomaticPositionDiagnostic(diagnostic, {
        stage: 'controller',
        reason: 'automatic-capture-needs-restart',
        metrics: {}
      })
      return false
    }
    const c = s.context
    if (!c) return false
    try {
      const g = await probeClientGeometry(c.windowHandle, c.pid)
      if (
        !isVerifiedBorderlessClient(g, c.windowHandle, c.pid, c.physicalClient) ||
        key(this._snapshot()) !== key(s)
      )
        throw Error('unverified')
      this._verifiedKey = key(s)
      return true
    } catch {
      reportAutomaticPositionDiagnostic(diagnostic, {
        stage: 'controller',
        reason: 'automatic-geometry-unverified',
        metrics: {}
      })
      return false
    }
  }
  async capture(
    s: AutomaticPositionSnapshot,
    diagnostic: AutomaticPositionDiagnosticSink
  ): Promise<AutomaticPositionFrame<CapturedPosition> | null> {
    try {
      const c = s.context
      if (!c || key(s) !== this._verifiedKey) return null
      const captured = await this._adapter.capture()
      const display = screen.getDisplayMatching(c.dipClient)
      if (
        String(display.id) !== c.displayId ||
        display.scaleFactor !== captured.evidence.target.scaleFactor ||
        !matchesAutomaticCaptureScale(c, display.scaleFactor)
      ) {
        reportAutomaticPositionDiagnostic(diagnostic, {
          stage: 'controller',
          reason: 'automatic-display-changed',
          metrics: {}
        })
        return null
      }
      reportAutomaticPositionDiagnostic(diagnostic, {
        stage: 'capture',
        reason: 'captured',
        metrics: { windowSelected: true, pixelTimestampKnown: false, nativeAtomic: false }
      })
      const { requestStartedAt, requestFinishedAt } = captured.evidence
      return {
        source: 'hwnd-selected-window',
        epoch: s.epoch,
        context: structuredClone(c),
        startedAt: requestStartedAt,
        finishedAt: requestFinishedAt,
        payload: {
          imageUrl: captured.image.toDataURL(),
          width: c.physicalClient.width,
          height: c.physicalClient.height,
          client: { ...c.dipClient },
          workArea: { ...display.workArea },
          capture: {
            startedAt: requestStartedAt,
            finishedAt: requestFinishedAt,
            physicalClient: { ...c.physicalClient },
            physicalDisplay: screen.dipToScreenRect(null, display.bounds),
            displayId: c.displayId,
            scaleFactor: display.scaleFactor,
            geometryCheck: 'bracketed'
          }
        }
      }
    } catch (error) {
      const reasons: Record<string, AutomaticPositionDiagnosticReason> = {
        'target-source-missing': 'automatic-source-missing',
        'ambiguous-source': 'automatic-source-ambiguous',
        'empty-window-image': 'automatic-image-empty',
        'client-surface-size-mismatch': 'automatic-image-size-mismatch',
        'capture-timeout': 'automatic-capture-timeout',
        busy: 'automatic-capture-busy',
        'source-invalidated': 'automatic-source-changed'
      }
      const reason =
        error instanceof WindowCaptureError
          ? (reasons[error.code] ?? 'automatic-window-source-rejected')
          : 'automatic-window-source-rejected'
      reportAutomaticPositionDiagnostic(diagnostic, { stage: 'controller', reason, metrics: {} })
      return null
    }
  }
}
