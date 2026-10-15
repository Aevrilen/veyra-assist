import { equipmentPresentationHeight } from '@shared/mayhem-assistant/equipment-rules'
import {
  type AutomaticOverlayLayout,
  type Calibration,
  EQUIPMENT_ACTIONS_HEIGHT,
  EQUIPMENT_ACTIONS_WIDTH,
  EQUIPMENT_CONTROLS_HEIGHT,
  EQUIPMENT_PANEL_WIDTH,
  type OverlayDispatchMeta,
  type OverlaySnapshot,
  equipmentPanelHeight
} from '@shared/mayhem-assistant/model'
import {
  FALLBACK_PREVIEW_EVENT,
  type FallbackSelectionPreview
} from '@shared/types/fallback-calibration'
import { BrowserWindow, screen } from 'electron'
import path from 'node:path'

import type { AkariLogger } from '../logger-factory'

export const MAYHEM_WINDOW_PARTITION = 'persist:mayhem-overlay-window'

export class MayhemWindowController {
  private _windows = new Map<string, BrowserWindow>()
  private _ready = new Set<string>()
  setupWindow: BrowserWindow | null = null
  private _snapshot: OverlaySnapshot | null = null
  private _calibration: Calibration | null = null
  private _automaticLayout: AutomaticOverlayLayout | null = null
  // Placement is UI state only. It cannot authorize a shop or any augment score.
  private _equipmentPlacement: {
    context: string
    displayId: string
    automatic: Pick<AutomaticOverlayLayout, 'clientBounds' | 'scaleFactor'> | null
    rect: Electron.Rectangle
    zoom: number
  } | null = null
  private _disposed = false
  private _hidden = false
  private _captureTiming: {
    sequence: number
    capturedAt: number
    observedAt?: number
    pauseReason?: string | null
    temporarilyHidden?: boolean
    equipmentWindowReady?: boolean
  } | null = null
  private _hideReasons = new WeakMap<BrowserWindow, string>()
  private _updatedAt = 0
  private _snapshotVersion = 0

  constructor(
    private readonly _logger: Pick<AkariLogger, 'info'>,
    private readonly _onSetupClosed: () => void = () => {}
  ) {}

  sendFallbackPreview(preview: FallbackSelectionPreview) {
    const window = this.setupWindow
    if (window && !window.isDestroyed()) window.webContents.send(FALLBACK_PREVIEW_EVENT, preview)
  }

  private _trace(
    stage: string,
    role: string,
    data: Record<string, string | number | boolean | null> = {}
  ) {
    this._logger.info(
      '[mayhem-timing]',
      JSON.stringify({
        stage,
        role,
        at: Date.now(),
        monotonicMs: performance.now(),
        sequence: this._captureTiming?.sequence ?? null,
        snapshotVersion: this._snapshotVersion,
        captureAgeMs: this._captureTiming?.capturedAt
          ? Date.now() - this._captureTiming.capturedAt
          : null,
        snapshotAgeMs: this._updatedAt ? Date.now() - this._updatedAt : null,
        observationAgeMs:
          this._captureTiming?.observedAt === undefined
            ? null
            : Date.now() - this._captureTiming.observedAt,
        cardsVisible: this._snapshot?.cardsVisible ?? false,
        shopVisible: this._snapshot?.shopVisible ?? false,
        candidateCount: this._snapshot?.candidates.filter(Boolean).length ?? 0,
        suppressed: this._snapshot?.suppressed ?? false,
        temporarilyHidden: this._captureTiming?.temporarilyHidden ?? false,
        equipmentCollapsed: this._snapshot?.equipmentCollapsed ?? false,
        pauseReason: this._captureTiming?.pauseReason ?? null,
        ...data
      })
    )
  }
  owns(id: number) {
    return [...this._windows.values()].some((w) => !w.isDestroyed() && w.webContents.id === id)
  }
  ownsSetup(id: number) {
    return (
      !!this.setupWindow &&
      !this.setupWindow.isDestroyed() &&
      this.setupWindow.webContents.id === id
    )
  }
  ownsRestore(id: number) {
    const window = this._windows.get('equipment-restore')
    return !!window && !window.isDestroyed() && window.webContents.id === id
  }

  // Called only after the controller's idle/no-game check. Loading these roles
  // never publishes a scene; the latest observation still owns their visibility.
  prewarmEquipment() {
    if (this._disposed) return
    this._create('equipment', {
      x: 0,
      y: 0,
      width: EQUIPMENT_PANEL_WIDTH,
      height: equipmentPanelHeight(0, 'items')
    })
    this._create(
      'controls',
      { x: 0, y: 0, width: EQUIPMENT_PANEL_WIDTH, height: EQUIPMENT_CONTROLS_HEIGHT },
      true
    )
    this._create(
      'equipment-actions',
      { x: 0, y: 0, width: EQUIPMENT_ACTIONS_WIDTH, height: EQUIPMENT_ACTIONS_HEIGHT },
      true
    )
  }

  private _hide(window: BrowserWindow, reason: string) {
    if (window.isDestroyed() || !window.isVisible()) return
    this._hideReasons.set(window, reason)
    window.hide()
  }

  private _forget(role: string, window: BrowserWindow) {
    if (this._windows.get(role) !== window) return
    this._ready.delete(role)
    this._windows.delete(role)
    if (this.setupWindow === window) {
      this.setupWindow = null
      this._onSetupClosed()
    }
    if (role === 'equipment' || role === 'controls') {
      const peer = this._windows.get(role === 'equipment' ? 'controls' : 'equipment')
      if (peer) this._hide(peer, 'peer-closed')
      const actions = this._windows.get('equipment-actions')
      if (actions) this._hide(actions, 'peer-closed')
    }
  }

  private _discard(role: string, window: BrowserWindow) {
    this._forget(role, window)
    if (!window.isDestroyed()) window.destroy()
  }

  private _create(role: string, rect: Electron.Rectangle, interactive = false) {
    const existing = this._windows.get(role)
    if (existing && !existing.isDestroyed()) return existing
    const constructionStarted = performance.now()
    const window = new BrowserWindow({
      ...rect,
      show: false,
      frame: role === 'setup',
      transparent: role !== 'setup',
      focusable: role === 'setup',
      resizable: role === 'setup',
      skipTaskbar: role !== 'setup',
      alwaysOnTop: role !== 'setup',
      hasShadow: false,
      backgroundColor: role === 'setup' ? '#11151e' : '#00000000',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        partition: MAYHEM_WINDOW_PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: true
      }
    })
    const createdAt = performance.now()
    const windowId = window.webContents.id
    let loadRequestedAt: number | null = null
    let loadStartedAt: number | null = null
    let loadAttempt = 0
    let firstShow = true
    this._windows.set(role, window)
    if (role !== 'setup') {
      this._trace('window-created', role, {
        windowId,
        constructionMs: createdAt - constructionStarted,
        backgroundThrottling: true
      })
      window.on('show', () => {
        this._hideReasons.delete(window)
        this._trace('window-show', role, {
          windowId,
          sinceCreatedMs: performance.now() - createdAt,
          firstShow
        })
        firstShow = false
      })
      window.on('hide', () =>
        this._trace('window-hide', role, {
          windowId,
          reason: this._hideReasons.get(window) ?? 'native-hide'
        })
      )
    }
    if (role !== 'setup') {
      window.setAlwaysOnTop(true, 'screen-saver')
      window.setIgnoreMouseEvents(!interactive)
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    }
    window.webContents.on('did-start-loading', () => {
      if (this._windows.get(role) !== window || window.isDestroyed()) return
      if (role === 'setup') this._onSetupClosed()
      this._ready.delete(role)
      loadStartedAt = performance.now()
      loadAttempt++
      if (role !== 'setup') {
        this._trace('window-load-start', role, {
          windowId,
          loadAttempt,
          sinceCreatedMs: loadStartedAt - createdAt,
          visible: window.isVisible()
        })
        this._hide(window, 'renderer-loading')
        const peer = this._windows.get(role === 'equipment' ? 'controls' : 'equipment')
        if ((role === 'equipment' || role === 'controls') && peer) this._hide(peer, 'peer-loading')
        if (role === 'equipment' || role === 'controls') {
          const actions = this._windows.get('equipment-actions')
          if (actions) this._hide(actions, 'peer-loading')
        }
      }
    })
    window.webContents.on('did-finish-load', () => {
      if (this._disposed || this._windows.get(role) !== window || window.isDestroyed()) return
      this._ready.add(role)
      if (role !== 'setup')
        this._trace('window-ready', role, {
          windowId,
          loadAttempt,
          sinceCreatedMs: performance.now() - createdAt,
          loadRequestMs: loadRequestedAt === null ? null : performance.now() - loadRequestedAt,
          loadMs: loadStartedAt === null ? null : performance.now() - loadStartedAt,
          visible: window.isVisible()
        })
      this._renderLatest()
    })
    window.webContents.on('render-process-gone', () => {
      this._discard(role, window)
    })
    window.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
      if (isMainFrame && errorCode !== -3) this._discard(role, window)
    })
    window.on('closed', () => {
      this._forget(role, window)
    })
    const query = { role }
    const url = process.env.ELECTRON_RENDERER_URL
    loadRequestedAt = performance.now()
    if (role !== 'setup')
      this._trace('window-load-request', role, {
        windowId,
        sinceCreatedMs: loadRequestedAt - createdAt,
        visible: window.isVisible()
      })
    const loaded = url
      ? window.loadURL(`${url}/mayhem-overlay-window.html?${new URLSearchParams(query)}`)
      : window.loadFile(path.join(__dirname, '../renderer/mayhem-overlay-window.html'), { query })
    void loaded.catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ERR_ABORTED') this._discard(role, window)
    })
    return window
  }
  openSetup() {
    if (this._disposed) return
    this.setupWindow = this._create('setup', { x: 100, y: 100, width: 1180, height: 900 }, true)
    if (this.setupWindow.isMinimized()) this.setupWindow.restore()
    this.setupWindow.show()
    this.setupWindow.focus()
  }
  update(
    snapshot: OverlaySnapshot,
    calibration: Calibration | null,
    captureTiming?: {
      sequence: number
      capturedAt: number
      observedAt?: number
      pauseReason?: string | null
      temporarilyHidden?: boolean
      equipmentWindowReady?: boolean
    },
    automaticLayout?: AutomaticOverlayLayout | null
  ) {
    if (this._disposed) return
    this._snapshot = snapshot
    this._snapshotVersion++
    this._calibration = calibration
    this._automaticLayout = automaticLayout ?? null
    this._captureTiming = captureTiming ?? null
    this._updatedAt = Date.now()
    this._hidden = false
    this._renderLatest()
  }
  private _setBoundsIfChanged(window: BrowserWindow, rect: Electron.Rectangle) {
    const previous = window.getBounds()
    if (
      previous.x === rect.x &&
      previous.y === rect.y &&
      previous.width === rect.width &&
      previous.height === rect.height
    )
      return false
    window.setBounds(rect)
    return true
  }
  private _renderLatest() {
    if (this._disposed || !this._snapshot) return
    const snapshot = this._snapshot
    const calibration = this._calibration
    const automatic = this._automaticLayout
    const layout = automatic ?? calibration
    const context = JSON.stringify([snapshot.sessionKey, snapshot.championId])
    if (
      this._equipmentPlacement &&
      ((snapshot.sessionKey && this._equipmentPlacement.context !== context) ||
        (layout &&
          (layout.displayId !== this._equipmentPlacement.displayId ||
            !!automatic !== !!this._equipmentPlacement.automatic ||
            (automatic &&
              JSON.stringify(automatic.clientBounds) !==
                JSON.stringify(this._equipmentPlacement.automatic?.clientBounds)))))
    )
      this._equipmentPlacement = null
    const displayId = layout?.displayId ?? this._equipmentPlacement?.displayId
    const display = screen.getAllDisplays().find((d) => String(d.id) === displayId)
    const placementAutomatic =
      automatic ?? (!calibration ? this._equipmentPlacement?.automatic : null)
    const valid =
      display &&
      (placementAutomatic
        ? display.scaleFactor === placementAutomatic.scaleFactor
        : display.size.width === 2560 && display.size.height === 1440 && display.scaleFactor === 1)
    // A renderer can finish before the next polling tick expires the last frame.
    const observedAt = this._captureTiming?.observedAt ?? this._captureTiming?.capturedAt
    const expired = observedAt !== undefined && Date.now() - observedAt > 1500
    const shop = !this._hidden && !expired && !!valid && !!layout?.shopRect && snapshot.shopVisible
    const userEquipment =
      !this._hidden &&
      !!valid &&
      !!snapshot.sessionKey &&
      !snapshot.suppressed &&
      !!this._equipmentPlacement &&
      (this._captureTiming?.equipmentWindowReady ?? true)
    const collapsed = userEquipment && !!snapshot.equipmentCollapsed
    const equipment = shop || (userEquipment && !!snapshot.equipmentExpanded)
    const cards =
      !this._hidden &&
      !expired &&
      !!valid &&
      layout?.cardRects.length === 3 &&
      snapshot.cardsVisible
    let equipmentRestacked = false
    if (valid && layout && (shop || cards)) {
      const origin = automatic?.clientBounds ?? display.bounds
      const scale = automatic ? automatic.clientBounds.height / 1440 : 1
      const viewport = automatic?.clientBounds ?? display.size
      const panelWidth = EQUIPMENT_PANEL_WIDTH * scale
      const windowRect = (rect: Electron.Rectangle) => {
        const rounded = {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
        return automatic ? screen.screenToDipRect(null, rounded) : rounded
      }
      if (shop) {
        const height = equipmentPresentationHeight(snapshot) * scale
        const right = layout.shopRect!.x + layout.shopRect!.width + 28 * scale
        const left = layout.shopRect!.x - 28 * scale - panelWidth
        const preferredX = right + panelWidth <= viewport.width ? right : left
        // Clamp toward the left if neither side fits, preserving the shop's right-hand chrome.
        const x = origin.x + Math.max(0, Math.min(viewport.width - panelWidth, preferredX))
        const y = origin.y + Math.max(0, Math.min(viewport.height - height, layout.shopRect!.y))
        if (shop) {
          const infoRect = windowRect({ x, y, width: panelWidth, height })
          this._equipmentPlacement = {
            context,
            displayId: layout.displayId,
            automatic: automatic
              ? { clientBounds: automatic.clientBounds, scaleFactor: automatic.scaleFactor }
              : null,
            rect: infoRect,
            zoom: automatic ? scale / automatic.scaleFactor : 1
          }
          const info = this._create('equipment', infoRect)
          equipmentRestacked = this._setBoundsIfChanged(info, infoRect)
          const controlsRect = windowRect({
            x,
            y,
            width: panelWidth,
            height: EQUIPMENT_CONTROLS_HEIGHT * scale
          })
          const controls = this._create('controls', controlsRect, true)
          this._setBoundsIfChanged(controls, controlsRect)
          const actionsRect = windowRect({
            x: x + panelWidth - (EQUIPMENT_ACTIONS_WIDTH + 14) * scale,
            y: y + height - (EQUIPMENT_ACTIONS_HEIGHT + 10) * scale,
            width: EQUIPMENT_ACTIONS_WIDTH * scale,
            height: EQUIPMENT_ACTIONS_HEIGHT * scale
          })
          this._setBoundsIfChanged(
            this._create('equipment-actions', actionsRect, true),
            actionsRect
          )
        }
      }
      if (cards)
        layout.cardRects.forEach((r, i) => {
          const rect = windowRect({
            x: origin.x + r.x + 32 * scale,
            y: origin.y + r.y + r.height - 112 * scale,
            width: r.width - 64 * scale,
            height: 72 * scale
          })
          this._setBoundsIfChanged(this._create(`augment-${i}`, rect), rect)
        })
    }
    const placement = this._equipmentPlacement
    if (collapsed && placement) {
      const rect = {
        x: placement.rect.x,
        y: placement.rect.y,
        width: Math.round(168 * placement.zoom),
        height: Math.round(36 * placement.zoom)
      }
      this._setBoundsIfChanged(this._create('equipment-restore', rect, true), rect)
    }
    if (equipment && !shop && placement) {
      const rect = {
        ...placement.rect,
        height: Math.round(equipmentPresentationHeight(snapshot) * placement.zoom)
      }
      equipmentRestacked = this._setBoundsIfChanged(this._create('equipment', rect), rect)
      const controlsRect = {
        ...rect,
        height: Math.round(EQUIPMENT_CONTROLS_HEIGHT * placement.zoom)
      }
      this._setBoundsIfChanged(this._create('controls', controlsRect, true), controlsRect)
      const actionsRect = {
        x: rect.x + rect.width - Math.round((EQUIPMENT_ACTIONS_WIDTH + 14) * placement.zoom),
        y: rect.y + rect.height - Math.round((EQUIPMENT_ACTIONS_HEIGHT + 10) * placement.zoom),
        width: Math.round(EQUIPMENT_ACTIONS_WIDTH * placement.zoom),
        height: Math.round(EQUIPMENT_ACTIONS_HEIGHT * placement.zoom)
      }
      this._setBoundsIfChanged(this._create('equipment-actions', actionsRect, true), actionsRect)
    }
    // A recovered equipment window may be newer than its controls. Show the
    // controls last so the opaque equipment surface cannot cover their buttons.
    const orderedWindows = [...this._windows.entries()].sort(
      ([a], [b]) =>
        Number(a === 'controls' || a === 'equipment-actions') -
        Number(b === 'controls' || b === 'equipment-actions')
    )
    orderedWindows.forEach(([role, w]) => {
      if (w.isDestroyed()) return
      if (role !== 'setup') {
        const zoom = automatic
          ? automatic.clientBounds.height / 1440 / automatic.scaleFactor
          : calibration
            ? 1
            : (placement?.zoom ?? 1)
        if (w.webContents.getZoomFactor() !== zoom) w.webContents.setZoomFactor(zoom)
      }
      if (this._ready.has(role)) {
        const metadata: OverlayDispatchMeta = {
          snapshotVersion: this._snapshotVersion,
          captureSequence: this._captureTiming?.sequence ?? null
        }
        w.webContents.send('mayhem-snapshot', snapshot, metadata)
        if (role !== 'setup') this._trace('window-snapshot-dispatched', role)
      }
      if (role === 'setup') return
      const visible = role.startsWith('augment-')
        ? cards
        : role === 'equipment-restore'
          ? collapsed
          : equipment && this._ready.has('equipment') && this._ready.has('controls')
      const shown = w.isVisible()
      if (visible && this._ready.has(role)) {
        if (
          !shown ||
          ((role === 'controls' || role === 'equipment-actions') && equipmentRestacked)
        ) {
          w.showInactive()
          if (role === 'equipment') equipmentRestacked = true
        }
      } else if (shown) {
        const reason = this._hidden
          ? 'explicit-hide'
          : !layout && !this._equipmentPlacement
            ? 'layout-unavailable'
            : !valid
              ? 'display-invalid'
              : expired
                ? 'observation-expired'
                : !this._ready.has(role)
                  ? 'renderer-loading'
                  : role.startsWith('augment-')
                    ? 'cards-not-visible'
                    : snapshot.suppressed
                      ? 'session-suppressed'
                      : snapshot.equipmentCollapsed
                        ? 'equipment-collapsed'
                        : this._captureTiming?.temporarilyHidden
                          ? 'equipment-temporarily-hidden'
                          : role === 'equipment-restore'
                            ? 'restore-not-visible'
                            : !shop
                              ? 'shop-not-visible'
                              : 'equipment-pair-loading'
        this._hide(w, reason)
      }
    })
  }
  hide() {
    this._hidden = true
    this._windows.forEach((w, r) => {
      if (r !== 'setup') this._hide(w, 'explicit-hide')
    })
  }
  dispose() {
    this._disposed = true
    this._windows.forEach((w) => {
      if (!w.isDestroyed()) w.destroy()
    })
    this._windows.clear()
    this._ready.clear()
    this.setupWindow = null
    this._snapshot = null
    this._calibration = null
    this._automaticLayout = null
    this._equipmentPlacement = null
  }
}
