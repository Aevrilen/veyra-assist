import { getLeagueClientWindowSnapshot } from '@main/native'
import type { ChampSelectOverlayGroup } from '@shared/champ-select-overlay'
import { BrowserWindow, screen } from 'electron'
import { compareShallow, reaction } from 'mobx'
import path from 'node:path'

import type { AkariProtocolMain } from '../akari-protocol'
import type { LeagueClientMain } from '../league-client'
import type { AkariLogger } from '../logger-factory'
import type { OngoingGameMain } from '../ongoing-game'
import type { WindowManagerMain } from '../window-manager'
import { getChampSelectOverlayBounds } from './placement'
import { supportsChampSelectOverlay } from './platform'

interface ChampSelectOverlayContext {
  platform: NodeJS.Platform
  leagueClient: LeagueClientMain
  ongoingGame: OngoingGameMain
  protocol: AkariProtocolMain
  windowManager: WindowManagerMain
  logger: AkariLogger
}

interface GroupWindow {
  window: BrowserWindow | null
  ready: boolean
  retryAfter: number
}

const PARTITION = 'persist:champ-select-overlay-window'
const HTML_ENTRY = 'champ-select-overlay-window.html'
const POLL_INTERVAL = 100
const GROUPS = ['candidates', 'teammates'] as const

export class ChampSelectOverlayWindowController {
  private readonly _groups: Record<ChampSelectOverlayGroup, GroupWindow> = {
    candidates: { window: null, ready: false, retryAfter: 0 },
    teammates: { window: null, ready: false, retryAfter: 0 }
  }
  private _timer: NodeJS.Timeout | null = null
  private _disposePhaseReaction: (() => void) | null = null
  private _disposeProtectionReaction: (() => void) | null = null
  private _started = false
  private _disposed = false
  private _readFailed = false
  private _diagnostics: Record<string, unknown> = { reason: 'not-started' }

  diagnostics() {
    return this._diagnostics
  }

  getCandidateBandWindow() {
    return this._groups.candidates.ready ? this._groups.candidates.window : null
  }

  private _record(reason: string, fields: Record<string, unknown> = {}) {
    this._diagnostics = {
      at: Date.now(),
      reason,
      phase: this._context.leagueClient.data.gameflow.phase,
      targetPid: this._context.leagueClient.state.auth?.pid ?? null,
      ...fields
    }
  }

  constructor(private readonly _context: ChampSelectOverlayContext) {}

  start() {
    if (this._started || this._disposed || !supportsChampSelectOverlay(this._context.platform))
      return
    this._started = true
    this._context.protocol.registerPartition(PARTITION)
    this._disposePhaseReaction = reaction(
      () => [
        this._context.leagueClient.state.isConnected,
        this._context.leagueClient.state.auth?.pid,
        this._context.leagueClient.data.gameflow.phase,
        this._context.ongoingGame.settings.enabled
      ],
      () => {
        if (this._timer) clearInterval(this._timer)
        this._timer = null
        if (this._clientPid() !== null) {
          this._tick()
          this._timer = setInterval(() => this._tick(), POLL_INTERVAL)
        } else {
          this._record('phase-or-connection-ineligible')
          this._hide()
        }
      },
      { fireImmediately: true, equals: compareShallow }
    )
    this._disposeProtectionReaction = reaction(
      () => this._context.windowManager.settings.contentProtection,
      (enabled) => {
        for (const { window } of Object.values(this._groups)) window?.setContentProtection(enabled)
      }
    )
  }

  private _clientPid() {
    const { leagueClient, ongoingGame } = this._context
    if (
      !this._started ||
      this._disposed ||
      !leagueClient.state.isConnected ||
      leagueClient.data.gameflow.phase !== 'ChampSelect' ||
      !ongoingGame.settings.enabled
    ) {
      return null
    }
    return leagueClient.state.auth?.pid ?? null
  }

  private _tick() {
    const pid = this._clientPid()
    if (pid === null) {
      this._record('phase-or-connection-ineligible')
      this._hide()
      return
    }
    try {
      const client = getLeagueClientWindowSnapshot(pid)
      if (!client || !client.isVisible || client.isMinimized || !client.isForeground) {
        this._record(
          !client
            ? 'native-window-missing'
            : !client.isVisible
              ? 'client-hidden'
              : client.isMinimized
                ? 'client-minimized'
                : 'client-not-foreground',
          { client }
        )
        this._hide()
        return
      }
      const clientBounds = screen.screenToDipRect(null, client.bounds)
      const workArea = screen.getDisplayMatching(clientBounds).workArea
      const session = this._context.leagueClient.data.champSelect.session
      const bounds = getChampSelectOverlayBounds(
        clientBounds,
        workArea,
        this._context.ongoingGame.getChampSelectOverlaySettings(),
        {
          candidates: session?.benchEnabled ? session.benchChampions.length : 0,
          teammates: session?.myTeam.length ?? 0
        }
      )
      for (const group of GROUPS) {
        const groupBounds = bounds[group]
        if (!groupBounds) {
          this._hide(group)
          continue
        }
        const state = this._groups[group]
        if (Date.now() < state.retryAfter) continue
        const window = this._getOrCreateWindow(group, groupBounds)
        const currentBounds = window.getBounds()
        if (
          currentBounds.x !== groupBounds.x ||
          currentBounds.y !== groupBounds.y ||
          currentBounds.width !== groupBounds.width ||
          currentBounds.height !== groupBounds.height
        ) {
          window.setBounds(groupBounds, false)
        }
        if (state.ready && !window.isVisible()) window.showInactive()
      }
      const groups = Object.fromEntries(
        GROUPS.map((group) => {
          const state = this._groups[group],
            window = state.window
          return [
            group,
            {
              bounds: bounds[group],
              ready: state.ready,
              retryAfter: state.retryAfter,
              visible: window?.isVisible() ?? false,
              focusable: window?.isFocusable() ?? false,
              focused: window?.isFocused() ?? false
            }
          ]
        })
      )
      this._record(
        Object.values(groups).some((group) => group.visible)
          ? 'visible'
          : Object.values(bounds).some(Boolean)
            ? 'renderer-loading-or-retry'
            : 'no-valid-group-bounds',
        { client, clientBounds, workArea, overlayBounds: bounds, groups }
      )
      this._readFailed = false
    } catch (error) {
      this._record('native-or-window-error', {
        error: error instanceof Error ? error.message : String(error)
      })
      this._hide()
      if (!this._readFailed) {
        this._context.logger.warn('Failed to follow the champion-select client window', error)
        this._readFailed = true
      }
    }
  }

  private _getOrCreateWindow(group: ChampSelectOverlayGroup, bounds: Electron.Rectangle) {
    const state = this._groups[group]
    if (state.window && !state.window.isDestroyed()) return state.window
    const window = new BrowserWindow({
      ...bounds,
      title: `Akari Champion Select · ${group}`,
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
        additionalArguments: ['--akari-window-type=champ-select-overlay-window']
      }
    })
    state.window = window
    state.ready = false
    window.setIgnoreMouseEvents(true)
    window.setAlwaysOnTop(true, 'floating')
    window.setContentProtection(this._context.windowManager.settings.contentProtection)
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    window.webContents.on('did-start-loading', () => {
      if (state.window !== window) return
      state.ready = false
      this._hide(group)
    })
    window.webContents.on('did-finish-load', () => {
      if (state.window !== window || window.isDestroyed() || this._disposed) return
      state.ready = true
      this._tick()
    })
    window.webContents.on('render-process-gone', () => this._discard(group, window))
    window.webContents.on('did-fail-load', (_event, errorCode, description, _url, isMainFrame) => {
      if (isMainFrame && errorCode !== -3) {
        this._context.logger.warn(`Champion-select ${group} failed to load`, description)
        this._discard(group, window)
      }
    })
    window.on('closed', () => {
      if (state.window !== window) return
      state.window = null
      state.ready = false
    })
    const url = process.env.ELECTRON_RENDERER_URL
    const loaded = url
      ? window.loadURL(`${url}/${HTML_ENTRY}?group=${group}`)
      : window.loadFile(path.join(__dirname, '../renderer', HTML_ENTRY), { query: { group } })
    void loaded.catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ERR_ABORTED' && state.window === window && !this._disposed) {
        this._context.logger.warn(`Champion-select ${group} failed to load`, error)
        this._discard(group, window)
      }
    })
    return window
  }

  private _hide(group?: ChampSelectOverlayGroup) {
    for (const key of group ? [group] : GROUPS) {
      const window = this._groups[key].window
      if (window && !window.isDestroyed() && window.isVisible()) window.hide()
    }
  }

  private _discard(group: ChampSelectOverlayGroup, window: BrowserWindow) {
    const state = this._groups[group]
    if (state.window !== window) return
    state.window = null
    state.ready = false
    state.retryAfter = Date.now() + 2000
    if (!window.isDestroyed()) window.destroy()
  }

  dispose() {
    this._disposed = true
    this._disposePhaseReaction?.()
    this._disposeProtectionReaction?.()
    if (this._timer) clearInterval(this._timer)
    this._timer = null
    for (const state of Object.values(this._groups)) {
      if (state.window && !state.window.isDestroyed()) state.window.destroy()
      state.window = null
      state.ready = false
    }
    if (this._started) this._context.protocol.unregisterPartition(PARTITION)
    this._started = false
  }
}
