import type { getLeagueClientWindowSnapshot } from '@main/native'
import { automaticPositionContextKey } from '@shared/champ-select-overlay/automatic-position'
import type { AutomaticPositionDiagnosticRecord } from '@shared/champ-select-overlay/automatic-position/diagnostics'
import type { Display, Rectangle } from 'electron'
import { type IReactionDisposer, reaction } from 'mobx'

import type { LeagueClientMain } from '../league-client'
import type { OngoingGameMain } from '../ongoing-game'
import { AutomaticPositionCapture } from './automatic-position-capture-executor'
import { observeOfflineAutomaticPositionImage } from './automatic-position-image'
import {
  AutomaticPositionLifecycle,
  type AutomaticPositionSnapshot
} from './automatic-position-lifecycle-controller'
import type { CapturedPosition } from './position-calibration-controller'

interface AutomaticPositionControllerContext {
  platform: NodeJS.Platform
  leagueClient: LeagueClientMain
  ongoingGame: OngoingGameMain
  manualEditing: () => boolean
  diagnostic: (record: AutomaticPositionDiagnosticRecord) => void
  readWindow: typeof getLeagueClientWindowSnapshot
  toDip: (bounds: Rectangle) => Rectangle
  getDisplay: (bounds: Rectangle) => Display
}

/** Owns automatic selection positioning lifecycle; no renderer IPC capability or game OCR. */
export class AutomaticPositionController {
  private readonly _snapshot: () => AutomaticPositionSnapshot
  private readonly _capture: AutomaticPositionCapture
  private readonly _lifecycle: AutomaticPositionLifecycle<CapturedPosition>
  private _epoch = 0
  private _reaction: IReactionDisposer | null = null
  private _disposed = false

  constructor(private readonly _context: AutomaticPositionControllerContext) {
    this._snapshot = () => {
      const base: AutomaticPositionSnapshot = {
        epoch: this._epoch,
        context: null,
        settings: { ...this._context.ongoingGame.settings.champSelectOverlay },
        manualBusy: this._context.manualEditing(),
        waitingReason: 'waiting-client'
      }
      if (!this._context.ongoingGame.settings.enabled)
        return { ...base, waitingReason: 'automatic-disabled' }
      if (
        this._context.platform !== 'win32' ||
        !this._context.leagueClient.state.isConnected ||
        !this._context.leagueClient.state.auth?.pid
      )
        return base
      if (this._context.leagueClient.data.gameflow.phase !== 'ChampSelect')
        return { ...base, waitingReason: 'waiting-selection' }
      const session = this._context.leagueClient.data.champSelect.session
      const sessionKey = session?.id || String(session?.gameId || '')
      const counts = {
        candidates: session?.benchEnabled ? session.benchChampions.length : 0,
        teammates: session?.myTeam.length ?? 0
      }
      if (!sessionKey || !counts.candidates || !counts.teammates)
        return { ...base, waitingReason: 'waiting-portraits' }
      try {
        const window = this._context.readWindow(this._context.leagueClient.state.auth.pid)
        if (
          !window?.isVisible ||
          window.isMinimized ||
          !window.windowHandle ||
          !window.ownerProcessId
        )
          return base
        const dip = this._context.toDip(window.bounds)
        const display = this._context.getDisplay(dip)
        return {
          ...base,
          waitingReason: 'waiting-foreground',
          context: {
            sessionKey,
            pid: window.ownerProcessId,
            windowHandle: window.windowHandle,
            displayId: String(display.id),
            physicalClient: { ...window.bounds },
            dipClient: dip,
            counts,
            foreground: window.isForeground,
            phase: 'ChampSelect'
          }
        }
      } catch {
        return base
      }
    }
    this._capture = new AutomaticPositionCapture(this._snapshot)
    this._lifecycle = new AutomaticPositionLifecycle({
      snapshot: this._snapshot,
      prepare: (snapshot, diagnostic) => this._capture.prepare(snapshot, diagnostic),
      capture: (snapshot, diagnostic) => this._capture.capture(snapshot, diagnostic),
      observe: (frame, sequence, diagnostic) =>
        observeOfflineAutomaticPositionImage(frame.payload, frame.context, sequence, diagnostic),
      readCache: () => this._context.ongoingGame.readAutomaticChampSelectOverlayCache(),
      writeCache: (value) => this._context.ongoingGame.saveAutomaticChampSelectOverlayCache(value),
      diagnostic: this._context.diagnostic,
      apply: (settings, lease) =>
        this._context.ongoingGame.setAutomaticChampSelectOverlay(
          settings,
          lease
            ? () => {
                const live = this._snapshot()
                return (
                  live.epoch === lease.epoch &&
                  !live.manualBusy &&
                  !!live.context &&
                  !!lease.context &&
                  live.context.phase === 'ChampSelect' &&
                  automaticPositionContextKey(live.context) ===
                    automaticPositionContextKey(lease.context)
                )
              }
            : undefined
        )
    })
  }
  start() {
    if (this._disposed || this._reaction) return
    // Synchronous invalidation observes connection identity by reference without retaining an account ID.
    this._reaction = reaction(
      () =>
        [
          this._context.leagueClient.state.connectionState,
          this._context.leagueClient.state.auth,
          this._context.leagueClient.data.gameflow.phase,
          this._context.leagueClient.data.champSelect.session?.id,
          this._context.leagueClient.data.champSelect.session?.gameId
        ] as const,
      () => {
        this._epoch++
        this._capture.invalidate()
        this._context.ongoingGame.setAutomaticChampSelectOverlay(null)
        void this._lifecycle.tick()
      },
      { fireImmediately: true, equals: (a, b) => a.every((value, index) => value === b[index]) }
    )
    if (this._context.platform === 'win32') this._lifecycle.start()
  }
  flush() {
    this._lifecycle.flush()
  }
  dispose() {
    if (this._disposed) return
    this._disposed = true
    this._reaction?.()
    this._reaction = null
    this._capture.stop()
    this._lifecycle.dispose()
  }
}
