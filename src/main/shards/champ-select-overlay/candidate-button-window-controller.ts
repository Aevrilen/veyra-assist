import { getLeagueClientWindowSnapshot } from '@main/native'
import { getChampSelectCandidateWidth } from '@shared/champ-select-overlay'
import type {
  CandidateGrabButtonState,
  CandidateGrabIdentity
} from '@shared/champ-select-overlay/candidate-grab'
import { CHAMP_SELECT_GRAB_INPUT_SHAPE } from '@shared/champ-select-overlay/candidate-grab'
import { BrowserWindow, type IpcMainInvokeEvent, type WebContents, screen } from 'electron'
import { compareShallow, reaction } from 'mobx'
import path from 'node:path'

import type { AkariProtocolMain } from '../akari-protocol'
import type { LeagueClientMain } from '../league-client'
import type { AkariLogger } from '../logger-factory'
import type { OngoingGameMain } from '../ongoing-game'
import type { WindowManagerMain } from '../window-manager'
import { getCandidateButtonBounds, sameCandidateWindowBounds } from './candidate-button-placement'
import type { CandidateGrabController } from './candidate-grab-controller'
import { getChampSelectOverlayBounds } from './placement'
import { supportsChampSelectOverlay } from './platform'

interface CandidateButtonContext {
  platform: NodeJS.Platform
  leagueClient: LeagueClientMain
  ongoingGame: OngoingGameMain
  protocol: AkariProtocolMain
  windowManager: WindowManagerMain
  logger: AkariLogger
  candidateGrab: CandidateGrabController
  getCandidateBandWindow: () => BrowserWindow | null
  sendState: (sender: WebContents, state: CandidateGrabButtonState) => void
}

interface ButtonWindow {
  window: BrowserWindow
  loaded: boolean
  frame: WebContents['mainFrame'] | null
  identity: CandidateGrabIdentity | null
  nativeHeight: number
}

const PARTITION = 'persist:champ-select-grab-buttons'
const HTML_ENTRY = 'champ-select-overlay-window.html'

export class CandidateButtonWindowController {
  private readonly _buttons = new Map<number, ButtonWindow>()
  private readonly _retryAfter = new Map<number, number>()
  private _timer: NodeJS.Timeout | null = null
  private _disposeReaction: (() => void) | null = null
  private _disposeProtection: (() => void) | null = null
  private _started = false
  private _readFailed = false

  constructor(private readonly _context: CandidateButtonContext) {}

  start() {
    if (this._started || !supportsChampSelectOverlay(this._context.platform)) return
    this._started = true
    this._context.protocol.registerPartition(PARTITION)
    screen.on('display-metrics-changed', this._invalidateDisplay)
    screen.on('display-removed', this._invalidateDisplay)
    this._disposeReaction = reaction(
      () => [
        this._context.leagueClient.state.isConnected,
        this._context.leagueClient.state.auth,
        this._context.leagueClient.data.gameflow.phase,
        this._context.leagueClient.data.champSelect.session,
        this._context.leagueClient.data.champSelect.currentChampion,
        this._context.leagueClient.data.champSelect.currentPickableChampionIdArray,
        this._context.leagueClient.data.lobbyTeamBuilder.champSelect.subsetChampionList,
        this._context.ongoingGame.settings.enabled,
        JSON.stringify(this._context.ongoingGame.getChampSelectOverlaySettings())
      ],
      () => {
        if (this._timer) clearInterval(this._timer)
        this._timer = null
        this._tick()
        if (this._context.leagueClient.data.gameflow.phase === 'ChampSelect') {
          this._timer = setInterval(() => this._tick(), 100)
        }
      },
      { fireImmediately: true, equals: compareShallow }
    )
    this._disposeProtection = reaction(
      () => this._context.windowManager.settings.contentProtection,
      (enabled) => {
        for (const { window } of this._buttons.values()) window.setContentProtection(enabled)
      }
    )
  }

  /** Only our current main frame can acknowledge that its mounted button is ready. */
  rendererReady(event: IpcMainInvokeEvent) {
    const state = [...this._buttons.values()].find(
      (button) => button.window.webContents === event.sender
    )
    if (!state || event.senderFrame !== event.sender.mainFrame || event.sender.isDestroyed())
      return false
    state.frame = event.senderFrame
    this._tick()
    return true
  }

  onGrantStateChanged(sender: WebContents, identity: CandidateGrabIdentity | null) {
    const state = [...this._buttons.values()].find((button) => button.window.webContents === sender)
    if (state) state.identity = identity
    this._publishVisibility()
  }

  private _publishVisibility() {
    const visible = [...this._buttons.values()].some(
      ({ window, loaded, frame, identity }) =>
        !window.isDestroyed() &&
        loaded &&
        frame === window.webContents.mainFrame &&
        window.isVisible() &&
        identity !== null &&
        this._context.candidateGrab.isActionWindowRegistered(window, identity)
    )
    this._context.windowManager.auxWindow.setBenchCandidateButtonsVisible(visible)
  }

  private _invalidateDisplay = () => {
    this._context.candidateGrab.invalidateActionWindows()
    this._hide()
  }

  private _tick() {
    if (!this._started) return
    const { leagueClient, ongoingGame, candidateGrab } = this._context
    let view = candidateGrab.refresh()
    const bandWindow = this._context.getCandidateBandWindow()
    const session = leagueClient.data.champSelect.session
    if (
      !view.sessionId ||
      !session ||
      !bandWindow ||
      bandWindow.isDestroyed() ||
      !bandWindow.isVisible()
    ) {
      this._hide()
      return
    }
    try {
      const client = getLeagueClientWindowSnapshot(leagueClient.state.auth!.pid)
      if (!client?.isVisible || client.isMinimized || !client.isForeground) {
        this._hide()
        return
      }
      const clientBounds = screen.screenToDipRect(null, client.bounds)
      const workArea = screen.getDisplayMatching(clientBounds).workArea
      const settings = ongoingGame.getChampSelectOverlaySettings()
      const band = getChampSelectOverlayBounds(clientBounds, workArea, settings, {
        candidates: session.benchChampions.length,
        teammates: session.myTeam.length
      }).candidates
      if (!band || !sameCandidateWindowBounds(bandWindow.getBounds(), band)) {
        this._hide()
        return
      }
      const slots = new Set<number>()
      for (const candidate of view.candidates) {
        // Preserve native slots, including gaps; never slide a button after filtering own/duplicate IDs.
        const slot = session.benchChampions.findIndex(
          (row) => row.championId === candidate.championId
        )
        const bounds = getCandidateButtonBounds(
          band,
          workArea,
          slot,
          getChampSelectCandidateWidth(settings),
          settings.candidateStep
        )
        if (!bounds || slot < 0) continue
        slots.add(slot)
        if ((this._retryAfter.get(slot) ?? 0) > Date.now()) continue
        const state = this._getOrCreate(slot, bounds)
        const window = state.window
        const nativeBounds = { ...bounds, height: state.nativeHeight }
        if (!sameCandidateWindowBounds(window.getBounds(), nativeBounds)) {
          candidateGrab.invalidateActionWindows()
          window.hide()
          window.setBounds(nativeBounds, false)
          window.setShape([CHAMP_SELECT_GRAB_INPUT_SHAPE])
          view = candidateGrab.refresh()
        }
        if (
          !state.loaded ||
          state.frame !== window.webContents.mainFrame ||
          window.webContents.isLoadingMainFrame()
        )
          continue
        if (!window.isVisible()) window.showInactive()
        const latest = view
        const identity = {
          sessionId: latest.sessionId!,
          revision: latest.revision,
          championId: candidate.championId
        }
        if (candidate.eligible && latest.sessionId === session.id) {
          if (!candidateGrab.isActionWindowRegistered(window, identity)) {
            candidateGrab.registerActionWindow(
              window,
              'bench',
              identity,
              CHAMP_SELECT_GRAB_INPUT_SHAPE
            )
          }
        } else {
          candidateGrab.revokeActionWindow(window)
          this._context.sendState(window.webContents, { identity: null, busy: latest.busy })
        }
      }
      for (const [slot, state] of this._buttons) {
        if (slots.has(slot)) continue
        candidateGrab.revokeActionWindow(state.window)
        this._buttons.delete(slot)
        state.window.destroy()
      }
      this._publishVisibility()
      this._readFailed = false
    } catch (error) {
      this._hide()
      if (!this._readFailed)
        this._context.logger.warn('Candidate button windows could not follow the client', error)
      this._readFailed = true
    }
  }

  private _getOrCreate(slot: number, bounds: Electron.Rectangle): ButtonWindow {
    const existing = this._buttons.get(slot)
    if (existing) return existing
    const window = new BrowserWindow({
      ...bounds,
      title: 'Veyra Assist · Bench',
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      focusable: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      hasShadow: false,
      thickFrame: false,
      roundedCorners: false,
      skipTaskbar: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        partition: PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: true,
        additionalArguments: ['--akari-window-type=champ-select-grab-button']
      }
    })
    // Windows may enforce a 39 DIP outer height. Drawing and mouse input stay clipped to 32×22.
    window.setShape([CHAMP_SELECT_GRAB_INPUT_SHAPE])
    const state: ButtonWindow = {
      window,
      loaded: false,
      frame: null,
      identity: null,
      nativeHeight: window.getBounds().height
    }
    this._buttons.set(slot, state)
    window.setAlwaysOnTop(true, 'floating')
    window.setContentProtection(this._context.windowManager.settings.contentProtection)
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    window.webContents.on('did-start-loading', () => {
      state.loaded = false
      state.frame = null
      this._context.candidateGrab.invalidateActionWindows()
      window.hide()
      this._publishVisibility()
    })
    window.webContents.on('did-finish-load', () => {
      if (!this._started || window.isDestroyed()) return
      window.webContents.setZoomFactor(1)
      state.loaded = true
      this._tick()
    })
    window.webContents.on('zoom-changed', () => {
      state.frame = null
      window.hide()
      this._publishVisibility()
    })
    window.webContents.on('render-process-gone', () => this._discard(slot, state))
    window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) {
        this._context.logger.warn('Candidate button failed to load', { code, description })
        this._discard(slot, state)
      }
    })
    window.on('hide', () => this._publishVisibility())
    window.on('closed', () => {
      if (this._buttons.get(slot) === state) this._buttons.delete(slot)
      this._publishVisibility()
    })
    const query = { mode: 'bench-button' }
    const url = process.env.ELECTRON_RENDERER_URL
    const loaded = url
      ? window.loadURL(`${url}/${HTML_ENTRY}?mode=bench-button`)
      : window.loadFile(path.join(__dirname, '../renderer', HTML_ENTRY), { query })
    void loaded.catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ERR_ABORTED' && this._buttons.get(slot) === state) {
        this._context.logger.warn('Candidate button failed to load', error)
        this._discard(slot, state)
      }
    })
    return state
  }

  private _discard(slot: number, state: ButtonWindow) {
    if (this._buttons.get(slot) !== state) return
    this._context.candidateGrab.revokeActionWindow(state.window)
    this._buttons.delete(slot)
    this._retryAfter.set(slot, Date.now() + 2000)
    if (!state.window.isDestroyed()) state.window.destroy()
    this._publishVisibility()
  }

  private _hide() {
    for (const { window } of this._buttons.values()) {
      if (!window.isDestroyed() && window.isVisible()) window.hide()
    }
    this._publishVisibility()
  }

  dispose() {
    if (!this._started) return
    this._started = false
    this._disposeReaction?.()
    this._disposeProtection?.()
    if (this._timer) clearInterval(this._timer)
    this._timer = null
    screen.removeListener('display-metrics-changed', this._invalidateDisplay)
    screen.removeListener('display-removed', this._invalidateDisplay)
    for (const { window } of this._buttons.values()) {
      this._context.candidateGrab.revokeActionWindow(window)
      if (!window.isDestroyed()) window.destroy()
    }
    this._buttons.clear()
    this._publishVisibility()
    this._context.protocol.unregisterPartition(PARTITION)
  }
}
