import { matchAugmentName, matchOcrAugmentName } from '@shared/mayhem-assistant/data-adapter'
import {
  equipmentPresentation,
  resolveEquipmentRoles,
  resolveEquipmentTeams
} from '@shared/mayhem-assistant/equipment-rules'
import type { GameFrame, Scene } from '@shared/mayhem-assistant/fallback-calibration'
import {
  type AugmentRecognition,
  type AutomaticLocationSample,
  type AutomaticOverlayLayout,
  type Calibration,
  type Candidate,
  type Category,
  type EquipmentBuildView,
  type EquipmentGameContext,
  type OverlaySnapshot,
  type Rect,
  emptyEquipmentBindings,
  isCalibration,
  isRect,
  matchesMarkers,
  pixelDistance,
  titlePixelDistance
} from '@shared/mayhem-assistant/model'
import { MayhemSessionController } from '@shared/mayhem-assistant/session-controller'
import {
  type StartingEquipmentPreferences,
  resolveStartingEquipment,
  resolveStartingEquipmentPreferences
} from '@shared/mayhem-assistant/starting-equipment'
import type { FallbackSelectionContext } from '@shared/types/fallback-calibration'
import type { FirstRunCalibrationStatus } from '@shared/types/first-run-environment'
import { app, desktopCapturer, nativeImage, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

import type { ExtraAssetsMain } from '../extra-assets'
import type { GameClientMain } from '../game-client'
import { GameClientForegroundError } from '../game-client/context'
import type { LeagueClientMain } from '../league-client'
import type { AkariLogger } from '../logger-factory'
import type { OngoingGameMain } from '../ongoing-game'
import { MayhemDataLoader } from './data-loader'
import { FallbackCalibrationController } from './fallback-calibration-controller'
import { MayhemGameContextLoader } from './game-context-loader'
import {
  type GameFrameMapping,
  gameClientCrop,
  normalizeCardGeometry,
  resolveGameFrameMapping
} from './game-frame-layout'
import { GameUiLocator, type UiGeometryCache } from './game-ui-locator'
import {
  type BackendOcrLine,
  type MayhemBackendOcrEngine,
  matchRapidOcrName,
  ocrLineRejection
} from './ocr-contract'
import {
  DEFAULT_AUGMENT_BACKGROUND_OPACITY,
  readMayhemPreferences,
  saveAugmentBackgroundOpacity
} from './preferences'
import { ShopLocator, createShopAnchor } from './shop-locator'
import { hasAutomaticTitleTooltip, hasRecordedMiddleTooltip } from './tooltip-occlusion'
import { MayhemWindowController } from './window-controller'

export interface CaptureGameWindowSnapshot {
  ownerProcessId: number
  windowHandle: string
  bounds: { x: number; y: number; width: number; height: number }
  isForeground: boolean
  isMinimized: boolean
  isVisible: boolean
}
const OCR_CAPTURE_YIELD_MS = 150

export class MayhemOverlayController {
  readonly session = new MayhemSessionController()
  readonly windows: MayhemWindowController
  private _calibration: Calibration | null = null
  private _manualCalibrationActive = false
  private _automaticLayout: AutomaticOverlayLayout | null = null
  private _layoutRevision = 0
  private readonly _uiLocator = new GameUiLocator()
  private readonly _fallback: FallbackCalibrationController
  private _locationMethods: Record<Scene, 'automatic' | 'fallback' | null> = {
    cards: null,
    shop: null
  }
  private _geometryCache: UiGeometryCache | null = null
  private _automaticSample: AutomaticLocationSample = { scene: null, state: 'idle', message: '' }
  private _sampleSignature: string | null = null
  private readonly _shopLocator = new ShopLocator()
  private _locatedShopRect: Calibration['shopRect'] | null = null
  private _timer: ReturnType<typeof setInterval> | null = null
  private _busy = false
  private _captureRevision = 0
  private _captureSequence = 0
  private _lastCaptureSequence = 0
  private _staleInFlightSequence = 0
  private _ocrSequence = 0
  private _foregroundFrames = 0
  private _gameWindowSignature: string | null = null
  private _windowSourceRevision = 0
  private _windowCapabilitySupported: boolean | null = null
  private _ocrPreloadStarted = false
  private _ocrPreloadReady = false
  private _ocrPreloadBlockReason: string | null = null
  private _idlePreloadChecking = false
  private _disposed = false
  private _request: AbortController | null = null
  private _equipment: OverlaySnapshot['equipment'] = null
  private _augments: OverlaySnapshot['augmentData'] = null
  private _diagnostic = '等待游戏内画面自动定位'
  private _contextKey = ''
  private _titles: number[][] = []
  private _titleRevision = 0
  private _titleSessionRevision: number | null = null
  private _titlesOccluded = false
  private _occlusionRevision = 0
  private _bound: {
    key: string
    titles: number[][]
    candidates: Array<Candidate | null>
    source: 'manual' | 'ocr'
  } | null = null
  private _ocrBusy = false
  private _ocrWork: {
    done: Promise<void>
    token: number
    context: string
    calibration: Calibration | null
    layoutRevision: number
    yielded: boolean
  } | null = null
  private _ocrFailure: string | null = null
  private _ocrFrames: Array<{ id: number; frames: number } | null> = [null, null, null]
  private _lastCaptureAt = 0
  private _lastObservationAt = 0
  private _firstRunLocation: { signature: string; frames: number; observedAt: number } | null = null
  private _recognition: AugmentRecognition[] = []
  private _pauseReason: string | null = null
  private _lastReload = 0
  private _captureDiagnostics: Record<string, unknown> = {}
  private _augmentBackgroundOpacity = DEFAULT_AUGMENT_BACKGROUND_OPACITY
  private _startingEquipment: StartingEquipmentPreferences | null =
    resolveStartingEquipmentPreferences()
  private _preferencesError: string | null = null
  private _dataDirectoryWritable: boolean | undefined

  diagnostics() {
    return {
      at: Date.now(),
      diagnostic: this._diagnostic,
      pauseReason: this._pauseReason,
      capture: this._captureDiagnostics,
      lastCaptureAt: this._lastCaptureAt,
      lastObservationAt: this._lastObservationAt,
      titleRevision: this._titleRevision,
      revision: this.session.revision,
      cardsVisible: this.session.cardsVisible,
      shopVisible: this.session.shopVisible,
      suppressed: this.session.suppressed,
      temporarilyHidden: this.session.temporarilyHidden,
      ocrBusy: this._ocrBusy,
      ocrFailure: this._ocrFailure,
      ocrPreloadStarted: this._ocrPreloadStarted,
      ocrPreloadReady: this._ocrPreloadReady,
      ocrPreloadBlockReason: this._ocrPreloadBlockReason,
      ocrBackend: this._ocr.backend ?? 'tesseract',
      ocrRuntime: this._ocr.diagnostics?.() ?? null,
      stableForegroundSamples: this._foregroundFrames,
      gameWindowSnapshotAvailable: this._gameWindowSignature !== null,
      gameWindowStable: this._gameWindowSignature !== null && this._foregroundFrames >= 2,
      windowCapabilitySupported: this._windowCapabilitySupported,
      automaticLocation: !this._manualCalibrationActive,
      locationMethods: this._locationMethods,
      layoutRevision: this._layoutRevision,
      frames: this._ocrFrames,
      recognition: this._recognition,
      candidateIds: this.session.candidates.map((candidate) => candidate?.id ?? null)
    }
  }
  get legacyCalibrationPresent() {
    return this._calibration !== null
  }
  get dataDirectoryWritable() {
    return this._dataDirectoryWritable
  }
  firstRunCalibrationStatus(): FirstRunCalibrationStatus {
    this._syncIdentity()
    const supportedClientSizes = [
      { width: 1920, height: 1080 },
      { width: 2560, height: 1440 }
    ]
    const unsupported =
      process.platform !== 'win32' ||
      process.arch !== 'x64' ||
      this._windowCapabilitySupported === false ||
      this._captureDiagnostics.readinessReason === 'client-size-unsupported' ||
      this._captureDiagnostics.readinessReason === 'client-display-not-unique'
    const located =
      this._automaticLayout !== null &&
      (this._automaticLayout.cardRects.length === 3 || this._automaticLayout.shopRect !== null)
    const fresh =
      this._lastObservationAt > 0 &&
      this._lastObservationAt <= Date.now() &&
      Date.now() - this._lastObservationAt <= 1500
    const verified =
      !this._manualCalibrationActive &&
      located &&
      fresh &&
      this._foregroundFrames >= 2 &&
      this._firstRunLocation !== null &&
      this._firstRunLocation.frames >= 2
    const waiting = !this._identity() || this._lastObservationAt === 0
    const fallback = Object.values(this._locationMethods).includes('fallback')
    return {
      route: unsupported
        ? 'unsupported'
        : verified
          ? fallback
            ? 'fallback-ready'
            : 'automatic-ready'
          : waiting
            ? null
            : 'guided-sample-needed',
      phase: unsupported
        ? 'failed'
        : verified
          ? 'idle'
          : waiting
            ? 'waiting-game'
            : this._automaticSample.state === 'waiting'
              ? 'sampling'
              : 'locating',
      verified,
      method: verified
        ? fallback
          ? 'fallback'
          : this._automaticSample.state === 'confirmed'
            ? 'guided-sample'
            : 'automatic'
        : null,
      reasonCode: unsupported
        ? 'calibration-unsupported'
        : verified
          ? fallback
            ? 'fallback-calibration-ready'
            : 'calibration-ready'
          : waiting
            ? 'game-not-running'
            : 'guided-sample-needed',
      supportedClientSizes
    }
  }
  private readonly _gameContextLoader: MayhemGameContextLoader
  constructor(
    private readonly _leagueClient: LeagueClientMain,
    private readonly _gameClient: GameClientMain,
    private readonly _assets: ExtraAssetsMain,
    private readonly _loader: MayhemDataLoader,
    private readonly _directory: string,
    private readonly _logger: AkariLogger,
    private readonly _ongoingGame: OngoingGameMain,
    private readonly _ocr: MayhemBackendOcrEngine,
    private readonly _gameWindowSnapshot: () =>
      CaptureGameWindowSnapshot | null | Promise<CaptureGameWindowSnapshot | null> = () => null
  ) {
    this.windows = new MayhemWindowController(_logger, () => this._fallback.cancel())
    this._fallback = new FallbackCalibrationController(
      _directory,
      (name, value) => this._save(name, value),
      (preview) => this.windows.sendFallbackPreview(preview)
    )
    this._gameContextLoader = new MayhemGameContextLoader(_gameClient.api, _logger)
  }
  private _trace(
    stage: string,
    data: Record<string, string | number | boolean | null | Array<number | null> | string[]>
  ) {
    this._logger.info(
      '[mayhem-timing]',
      JSON.stringify({ stage, at: Date.now(), monotonicMs: performance.now(), ...data })
    )
  }
  private _resetCaptureReadiness() {
    this._fallback.resetRuntime()
    this._locationMethods = { cards: null, shop: null }
    this._foregroundFrames = 0
    this._gameWindowSignature = null
    this._shopLocator.reset()
    this._locatedShopRect = null
    this._uiLocator.reset()
    this._sampleSignature = null
    this._firstRunLocation = null
    this._automaticLayout = null
    this._layoutRevision++
  }
  private async _readGameWindow() {
    try {
      return await this._gameWindowSnapshot()
    } catch {
      return null
    }
  }
  private _pauseForForegroundError(error: GameClientForegroundError) {
    this._resetCaptureReadiness()
    this._captureDiagnostics = { readinessReason: error.reason }
    this._pause(
      error.reason === 'foreground-capability-unavailable'
        ? '游戏前台检测不可用，浮窗暂停'
        : '游戏前台检测失败，浮窗暂停',
      true
    )
    this._logger.warn('Mayhem foreground detection failed', { reason: error.reason })
  }
  private _windowReadiness(
    window: CaptureGameWindowSnapshot | null,
    display: Electron.Display,
    automatic = false,
    requireForeground = true
  ) {
    const fail = (reason: string, message: string) => ({ signature: null, reason, message })
    if (!window) return fail('window-snapshot-unavailable', '未取得有效游戏窗口快照，浮窗暂停')
    if (
      !Number.isInteger(window.ownerProcessId) ||
      window.ownerProcessId <= 0 ||
      typeof window.windowHandle !== 'string' ||
      !/^[1-9]\d*$/.test(window.windowHandle)
    )
      return fail('window-identity-invalid', '游戏窗口 PID 或 HWND 无效，浮窗暂停')
    if (requireForeground && window.isMinimized !== false)
      return fail('window-minimized', '游戏窗口已最小化或状态未知，浮窗暂停')
    if (requireForeground && window.isVisible !== true)
      return fail('window-not-visible', '游戏窗口不可见，浮窗暂停')
    if (requireForeground && window.isForeground !== true)
      return fail('window-not-foreground', '游戏窗口不在前台，浮窗暂停')
    if (!window.bounds || !Object.values(window.bounds).every(Number.isFinite))
      return fail('window-bounds-invalid', '游戏客户区坐标无效，浮窗暂停')
    if (
      !automatic &&
      (window.bounds.width !== display.size.width || window.bounds.height !== display.size.height)
    )
      return fail(
        'window-size-mismatch',
        `游戏客户区为 ${window.bounds.width}×${window.bounds.height}；本轮需 2560×1440，浮窗暂停`
      )
    if (
      !automatic &&
      (window.bounds.x !== display.bounds.x || window.bounds.y !== display.bounds.y)
    )
      return fail(
        'window-origin-mismatch',
        '游戏客户区未覆盖校准显示器；本轮需无边框全屏，浮窗暂停'
      )
    return {
      reason: null,
      message: null,
      signature: JSON.stringify([
        window.ownerProcessId,
        window.windowHandle,
        window.bounds.x,
        window.bounds.y,
        window.bounds.width,
        window.bounds.height,
        ...(automatic
          ? [String(display.id), display.scaleFactor, screen.dipToScreenRect(null, display.bounds)]
          : [])
      ])
    }
  }
  private async _preloadOcrWhenIdle() {
    const idle = () =>
      !this._disposed &&
      app.isReady() &&
      (this._leagueClient.data.gameflow.phase === null ||
        ['None', 'Lobby', 'EndOfGame', 'WaitingForStats'].includes(
          this._leagueClient.data.gameflow.phase || ''
        ))
    if (this._disposed || this._ocrPreloadStarted || this._idlePreloadChecking) return
    if (!idle()) {
      this._ocrPreloadBlockReason = app.isReady() ? 'phase-not-idle' : 'app-not-ready'
      return
    }
    this._idlePreloadChecking = true
    try {
      const pids = await this._gameClient.getRunningGameClientPids()
      if (!idle()) {
        this._ocrPreloadBlockReason = 'phase-not-idle'
        return
      }
      if (!Array.isArray(pids)) {
        this._ocrPreloadBlockReason = 'game-process-result-unknown'
        return
      }
      if (pids.length) {
        this._ocrPreloadBlockReason = 'game-process-present'
        return
      }
      this._ocrPreloadBlockReason = null
      try {
        this._trace('equipment-prewarm-start', {})
        this.windows.prewarmEquipment()
      } catch (error) {
        // A native window failure keeps the lazy path available and cannot poison OCR.
        this._trace('equipment-prewarm-failed', {})
        this._logger.warn('Mayhem idle equipment window preload failed', error)
      }
      this._ocrPreloadStarted = true
      const started = performance.now()
      this._trace('ocr-preload-start', {})
      await this._ocr.preload()
      if (!this._disposed) {
        this._ocrPreloadReady = true
        this._trace('ocr-preload-ready', { durationMs: performance.now() - started })
      }
    } catch (error) {
      if (!this._disposed) {
        if (this._ocrPreloadStarted) {
          this._ocrFailure = error instanceof Error ? error.message : String(error)
          this._trace('ocr-preload-failed', {})
          this._logger.warn('Mayhem idle OCR preload failed', error)
        } else {
          this._ocrPreloadBlockReason = 'game-process-query-failed'
        }
      }
    } finally {
      this._idlePreloadChecking = false
    }
  }
  start() {
    if (process.platform !== 'win32' || this._disposed || this._timer) return
    try {
      const preferences = readMayhemPreferences(this._directory)
      this._augmentBackgroundOpacity = preferences.appearance.augmentBackgroundOpacity
      this._startingEquipment = resolveStartingEquipmentPreferences(preferences.equipment)
    } catch (error) {
      this._preferencesError = error instanceof Error ? error.message : String(error)
      this._startingEquipment = null
      this._logger.warn('Mayhem preferences could not be loaded', error)
    }
    try {
      const calibration = JSON.parse(
        fs.readFileSync(path.join(this._directory, 'calibration.json'), 'utf8')
      )
      if (isCalibration(calibration)) this._calibration = calibration
    } catch {}
    try {
      const state = JSON.parse(fs.readFileSync(path.join(this._directory, 'session.json'), 'utf8'))
      if (typeof state?.suppressedKey === 'string') this.session.suppressedKey = state.suppressedKey
    } catch {}
    try {
      this._geometryCache = this._uiLocator.seed(
        JSON.parse(fs.readFileSync(path.join(this._directory, 'automatic-location.json'), 'utf8'))
      )
      if (!this._geometryCache) this._logger.warn('Mayhem automatic geometry cache rejected')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this._logger.warn('Mayhem automatic geometry cache could not be loaded', error)
    }
    try {
      this._fallback.load()
    } catch (error) {
      this._logger.warn('Mayhem fallback calibration could not be loaded', error)
    }
    this._timer = setInterval(() => void this._tick(), 500)
    if (process.argv.includes('--mayhem-setup')) this.windows.openSetup()
  }
  private async _yieldToOcr() {
    const work = this._ocrWork
    if (
      !work ||
      !this._ocrBusy ||
      work.yielded ||
      !this.session.cardsVisible ||
      this._bound?.source === 'manual' ||
      !this._current(work.token, work.context, work.calibration, work.layoutRevision)
    )
      return
    // Give a pending result one bounded chance before another synchronous capture.
    // A stalled batch cannot delay every subsequent poll.
    work.yielded = true
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        work.done.catch(() => {}),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, OCR_CAPTURE_YIELD_MS)
        })
      ])
    } finally {
      clearTimeout(timer)
    }
  }
  private _expireObservation(now: number) {
    if (this.session.expire(now)) {
      this._fallback.resetRuntime()
      this._trace('observation-expired', {
        sequence: this._lastCaptureSequence,
        ageMs: now - this._lastObservationAt
      })
      this._gameContextLoader.reset(this._contextKey)
      this._clearTitles()
      this._lastObservationAt = 0
      this._firstRunLocation = null
      this._pauseReason = '画面已过期，浮窗暂停'
      this._diagnostic = this._pauseReason
    }
  }
  private async _tick() {
    if (this._disposed) return
    this._syncIdentity()
    if (this._busy) {
      // Hide stale publication, but retain consecutive-source evidence until the new
      // capture is checked. Its own age and source timestamp gap still have 1500ms limits.
      if (
        this._lastObservationAt &&
        Date.now() - this._lastObservationAt > 1500 &&
        this._staleInFlightSequence !== this._lastCaptureSequence
      ) {
        this._staleInFlightSequence = this._lastCaptureSequence
        this._trace('observation-stale-in-flight', {
          sequence: this._lastCaptureSequence,
          ageMs: Date.now() - this._lastObservationAt
        })
      }
      this._publish()
      return
    }
    this._expireObservation(Date.now())
    const pollStartedAt = Date.now()
    this._busy = true
    try {
      await this._yieldToOcr()
      if (this._disposed) return
      await this._poll()
    } finally {
      this._busy = false
      this._publish()
      // A slow capture already consumed the polling interval; do not wait another tick.
      if (this._timer && Date.now() - pollStartedAt >= 500) setImmediate(() => void this._tick())
    }
  }
  private _hasFreshObservation() {
    const age = Date.now() - this._lastObservationAt
    return this._lastObservationAt > 0 && age >= 0 && age <= 1500
  }
  snapshot(): OverlaySnapshot {
    this._syncIdentity()
    const items = this._leagueClient.data.gameData.items
    const equipmentContext = this._equipmentContext()
    const starting = resolveStartingEquipment(
      this.session.championId,
      resolveEquipmentRoles(equipmentContext?.roles ?? []).starting,
      equipmentContext ? equipmentContext.startingEquipment : null
    )
    const itemAssets: OverlaySnapshot['itemAssets'] = {}
    const ids = new Set([
      ...starting.ids.filter((id): id is number => id !== null),
      ...(this.session.standardCoreIds ?? []),
      ...Object.values(this._equipment?.categories ?? {}).flatMap((rows) =>
        rows.flatMap((row) => row.ids)
      )
    ])
    for (const id of ids) {
      const item = items[id]
      itemAssets[id] = {
        name: item?.name || `未知装备 ${id}`,
        icon: item?.iconPath ? `akari://league-client${item.iconPath}` : null
      }
    }
    const observationFresh = this._hasFreshObservation()
    const snapshot: OverlaySnapshot = {
      augmentBackgroundOpacity: this._augmentBackgroundOpacity,
      sessionKey: this.session.sessionKey,
      championId: this.session.championId,
      championName: this.session.championId
        ? this._leagueClient.data.gameData.championName(this.session.championId)
        : '等待英雄',
      shopVisible: observationFresh && this.session.shopVisible,
      cardsVisible: observationFresh && this.session.cardsVisible,
      suppressed: this.session.suppressed,
      category: this.session.category,
      equipmentCollapsed: this.session.equipmentCollapsed,
      equipmentExpanded: this.session.equipmentExpanded,
      buildView: this.session.buildView,
      standardCoreIds: this.session.standardCoreIds,
      confirmedSelection: this.session.confirmedSelection,
      equipmentContext,
      candidates: observationFresh ? this.session.candidates : [null, null, null],
      equipment: this._equipment,
      augmentData: this._augments,
      itemAssets,
      diagnostic: this._diagnostic
    }
    const core = equipmentPresentation(snapshot).core
    if (core && snapshot.sessionKey && snapshot.championId) {
      this.session.pinStandardCore(snapshot.sessionKey, snapshot.championId, core.ids)
      snapshot.standardCoreIds = this.session.standardCoreIds
    }
    return snapshot
  }
  private _equipmentContext(): EquipmentGameContext | null {
    const identity = this._identity()
    if (!identity) return null
    const data = this._leagueClient.data
    const champions = data.gameData.champions
    const state = this._ongoingGame.state
    const stage = state.queryStage
    const teams =
      !state.draft &&
      stage.phase === 'in-game' &&
      stage.gameInfo.gameId === data.gameflow.session?.gameData.gameId
        ? resolveEquipmentTeams(
            state.teams,
            state.championSelections,
            data.summoner.me!.puuid,
            identity.champion,
            champions
          )
        : null
    return {
      sessionKey: identity.key,
      championId: identity.champion,
      roles: [...(champions[identity.champion]?.roles ?? [])],
      teams,
      inventory: this._gameContextLoader.inventory(this._contextKey),
      // Generic LCU names do not prove mode-specific item or augment mappings.
      bindings: emptyEquipmentBindings(),
      startingEquipment: this._startingEquipment
    }
  }
  private _refreshInventory() {
    const identity = this._identity()
    const me = this._leagueClient.data.summoner.me
    if (!identity || !me) return
    const hero = this._leagueClient.data.gameData.champions[identity.champion]
    void this._gameContextLoader
      .refresh({
        key: this._contextKey,
        gameName: me.gameName,
        tagLine: me.tagLine,
        championNames: hero ? [...new Set([hero.name, hero.alias].filter(Boolean))] : []
      })
      .then(() => {
        if (!this._disposed) this._publish()
      })
  }
  private _publish() {
    if (this._disposed) return
    // Window readiness, crashes and display positions can change without changing the snapshot.
    const calibration =
      this._calibration && this._locatedShopRect
        ? { ...this._calibration, shopRect: this._locatedShopRect }
        : this._calibration
    const timing = {
      sequence: this._lastCaptureSequence,
      capturedAt: this._lastCaptureAt,
      observedAt: this._lastObservationAt,
      pauseReason: this._pauseReason,
      temporarilyHidden: this.session.temporarilyHidden,
      equipmentWindowReady: this._foregroundFrames >= 2 && this._gameWindowSignature !== null
    }
    if (this._manualCalibrationActive) this.windows.update(this.snapshot(), calibration, timing)
    else this.windows.update(this.snapshot(), null, timing, this._automaticLayout)
  }
  private _identity() {
    const data = this._leagueClient.data
    const session = data.gameflow.session
    const me = data.summoner.me
    const active = ['GameStart', 'InProgress', 'Reconnect'].includes(data.gameflow.phase || '')
    const mayhem = session?.map.gameMode === 'KIWI' || session?.gameData.queue.gameMode === 'KIWI'
    const selected = session?.gameData.playerChampionSelections.find((p) => p.puuid === me?.puuid)
    return active && mayhem && me && session && session.gameData.gameId > 0 && selected?.championId
      ? { key: `${me.puuid}:${session.gameData.gameId}`, champion: selected.championId }
      : null
  }
  private _syncIdentity() {
    const identity = this._identity()
    const context = identity ? `${identity.key}:${identity.champion}` : ''
    if (context !== this._contextKey) {
      this._fallback.cancel()
      this._resetCaptureReadiness()
      this._captureRevision++
      this._contextKey = context
      this._gameContextLoader.reset(context)
      this.session.setSession(identity?.key ?? null, identity?.champion ?? null)
      this._clearTitles()
      this._equipment = this._augments = null
      this._lastObservationAt = 0
      this._firstRunLocation = null
      this._request?.abort()
      this._request = null
      this._lastReload = 0
      this._pauseReason = null
      this._diagnostic = identity ? '正在核对本局画面' : '等待海克斯大乱斗本局身份'
    }
    return identity
  }
  private _clearTitles() {
    if (this._titles.length || this._bound || this._titlesOccluded) this._titleRevision++
    this._titles = []
    this._titleSessionRevision = null
    this._titlesOccluded = false
    this._occlusionRevision++
    this._bound = null
    this._ocrFrames = [null, null, null]
    this._recognition = []
    this._lastCaptureAt = 0
  }
  private _pause(reason: string, preserveTitles = false) {
    this._fallback.resetRuntime()
    this._sampleSignature = null
    // An occluded scene must never leave a dormant binding across a pause/focus loss.
    if (this._titlesOccluded) preserveTitles = false
    if (this._pauseReason !== reason) {
      this._trace('overlay-paused', { reason })
      this._captureRevision++
      this.session.invalidate()
      this._gameContextLoader.reset(this._contextKey)
      this._ocrFrames = [null, null, null]
      this._recognition = []
      this._lastObservationAt = 0
      this._firstRunLocation = null
      if (this._bound?.source === 'ocr') this._bound = null
    }
    this._pauseReason = reason
    this._diagnostic = reason
    if (!preserveTitles) this._clearTitles()
  }
  private _current(
    token: number,
    context: string,
    calibration: Calibration | null,
    layoutRevision = this._layoutRevision
  ) {
    if (this._disposed) return false
    this._syncIdentity()
    return (
      token === this.session.revision &&
      context === this._contextKey &&
      layoutRevision === this._layoutRevision &&
      calibration === this._calibration
    )
  }
  private async _poll() {
    const identity = this._syncIdentity()
    if (!identity) {
      void this._preloadOcrWhenIdle()
      this._diagnostic = '等待海克斯大乱斗本局身份'
      return
    }
    const context = this._contextKey
    const calibration = this._calibration
    const automatic = !this._manualCalibrationActive
    const captureRevision = this._captureRevision
    // Expiry clears the old observation, but does not cancel an independently fresh capture.
    // Identity, calibration and explicit pauses still invalidate in-flight acquisition.
    const current = () => {
      if (this._disposed) return false
      this._syncIdentity()
      return (
        captureRevision === this._captureRevision &&
        context === this._contextKey &&
        calibration === this._calibration
      )
    }
    try {
      if (!this._lastReload || Date.now() - this._lastReload > 300000) {
        this._lastReload = Date.now()
        this._load(identity.champion, context)
      }
      if (!calibration && !automatic) {
        this._resetCaptureReadiness()
        this._pause('尚未校准，浮窗暂停')
        return
      }
      const displays = screen.getAllDisplays()
      let display = automatic
        ? undefined
        : displays.find((d) => String(d.id) === calibration!.displayId)
      if (
        !automatic &&
        (!display ||
          display.size.width !== 2560 ||
          display.size.height !== 1440 ||
          display.scaleFactor !== 1)
      ) {
        this._resetCaptureReadiness()
        this._captureDiagnostics = {
          readinessReason: !display
            ? 'calibrated-display-unavailable'
            : display.scaleFactor !== 1
              ? 'display-scale-unsupported'
              : 'display-size-unsupported'
        }
        this._pause(
          !display
            ? '校准显示器当前不可用，浮窗暂停'
            : display.scaleFactor !== 1
              ? `显示器缩放为 ${Math.round(display.scaleFactor * 100)}%；本轮需 100%，浮窗暂停`
              : `显示器为 ${display.size.width}×${display.size.height}；本轮需 2560×1440，浮窗暂停`
        )
        return
      }
      this._windowCapabilitySupported = this._gameClient.supportsGameClientWindowSnapshot()
      if (!this._windowCapabilitySupported) {
        this._resetCaptureReadiness()
        this._captureDiagnostics = { readinessReason: 'window-capability-unsupported' }
        this._pause('当前原生组件不支持游戏窗口快照，请使用本轮完整候选包；浮窗暂停', true)
        return
      }
      const foreground = await this._gameClient.isGameClientForegroundCached()
      this._captureDiagnostics = { foregroundBefore: foreground }
      if (!current()) return
      if (!foreground) {
        this._resetCaptureReadiness()
        this._pause('游戏不在前台，浮窗暂停', true)
        return
      }
      const gameWindow = await this._readGameWindow()
      if (!current()) return
      let mapping: GameFrameMapping | null = null
      if (automatic && gameWindow) {
        const resolved = resolveGameFrameMapping(
          gameWindow.bounds,
          displays.map((d) => ({
            id: String(d.id),
            bounds: screen.dipToScreenRect(null, d.bounds),
            scaleFactor: d.scaleFactor
          }))
        )
        mapping = resolved.mapping
        if (!mapping) {
          this._resetCaptureReadiness()
          this._captureDiagnostics.readinessReason = resolved.reason
          this._pause(
            `自动定位需同屏完整的 1920×1080 或 2560×1440 客户区；当前 ${gameWindow.bounds.width}×${gameWindow.bounds.height}，浮窗暂停`
          )
          return
        }
        display = displays.find((d) => String(d.id) === mapping!.displayId)
      }
      if (!display) {
        this._resetCaptureReadiness()
        this._pause('未取得有效游戏窗口快照，浮窗暂停')
        return
      }
      const readiness = this._windowReadiness(gameWindow, display, automatic)
      const windowSignature = readiness.signature
      this._captureDiagnostics.gameWindowAvailable = !!gameWindow
      this._captureDiagnostics.gameWindowReady = !!windowSignature
      this._captureDiagnostics.readinessReason = readiness.reason
      if (!windowSignature) {
        this._resetCaptureReadiness()
        this._pause(readiness.message!, true)
        return
      }
      const windowSourceChanged = windowSignature !== this._gameWindowSignature
      if (windowSourceChanged) {
        this._windowSourceRevision++
        this._fallback.resetRuntime()
        this._foregroundFrames = 0
        this._uiLocator.reset()
        if (this._geometryCache) this._uiLocator.seed(this._geometryCache)
        this._sampleSignature = null
        this._automaticLayout = null
        this._layoutRevision++
      }
      this._gameWindowSignature = windowSignature
      this._foregroundFrames = Math.min(2, this._foregroundFrames + 1)
      if (this._foregroundFrames < 2) {
        this._pause('等待游戏前台连续稳定，浮窗暂停', true)
        return
      }
      const capturedAt = Date.now()
      const sequence = ++this._captureSequence
      const captureStarted = performance.now()
      this._trace('capture-request', { sequence, capturedAt })
      const captureRequestLogMs = performance.now() - captureStarted
      this._captureDiagnostics.startedAt = capturedAt
      const callStarted = performance.now()
      const sourcesPromise = desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: mapping?.displayBounds.width ?? 2560,
          height: mapping?.displayBounds.height ?? 1440
        }
      })
      const callReturned = performance.now()
      const getSourcesCallMs = callReturned - callStarted
      const getSourcesCallReturnedAt = Date.now()
      const sources = await sourcesPromise
      const getSourcesWaitMs = performance.now() - callReturned
      this._trace('capture-return', {
        sequence,
        durationMs: performance.now() - captureStarted,
        captureRequestLogMs,
        getSourcesCallMs,
        getSourcesWaitMs,
        getSourcesCallReturnedAt,
        sourceCount: sources.length
      })
      if (!current()) {
        this._trace('capture-rejected', { sequence, reason: 'context-invalidated' })
        return
      }
      let image = sources.find((source) => source.display_id === String(display.id))?.thumbnail
      this._captureDiagnostics.completedAt = Date.now()
      this._captureDiagnostics.durationMs = Date.now() - capturedAt
      this._captureDiagnostics.size = image?.getSize() ?? null
      if (
        !image ||
        image.isEmpty() ||
        (!automatic && (image.getSize().width !== 2560 || image.getSize().height !== 1440))
      ) {
        this._trace('capture-rejected', { sequence, reason: 'image-unavailable' })
        this._pause('截图不可用，浮窗暂停')
        return
      }
      const captureSize = image.getSize()
      if (mapping) {
        const crop = gameClientCrop(mapping, image.getSize())
        if (!crop) {
          this._pause('截图尺寸与显示器物理像素不符，浮窗暂停')
          return
        }
        const full =
          crop.x === 0 &&
          crop.y === 0 &&
          crop.width === mapping.displayBounds.width &&
          crop.height === mapping.displayBounds.height
        if (!full) image = image.crop(crop)
        this._captureDiagnostics.frameMapping = mapping
      }
      const markerStarted = performance.now()
      const sample = image.resize({ width: 32, height: 18 }).toBitmap()
      let brightness = 0
      for (let i = 0; i < sample.length; i++) if (i % 4 !== 3) brightness += sample[i]
      if (sample.length !== 32 * 18 * 4 || brightness / (sample.length * 0.75) < 5) {
        this._trace('capture-rejected', { sequence, reason: 'black-image' })
        this._pause('截图黑屏，浮窗暂停')
        return
      }
      const frame: GameFrame = {
        ...image.getSize(),
        pixels: image.toBitmap(),
        sourceSequence: sequence,
        capturedAt,
        sessionKey: identity.key,
        sourceKey: this._windowReadiness(gameWindow, display, true).signature!,
        foreground: true
      }
      const pixels = (markers: Calibration['shop']) =>
        markers.map((marker) => Array.from(image.crop(marker.rect).toBitmap()))
      const cardPixels = automatic ? [] : pixels(calibration!.cards)
      const cardMarkersMatch = !automatic && matchesMarkers(calibration!.cards, cardPixels)
      let cards = cardMarkersMatch
      let shop = false
      let titleRects: Rect[] = calibration?.titleRects ?? []
      let fallbackConfirmation: Partial<Record<Scene, boolean>> = {}
      let ignoreObservation = false
      let locationIncomplete = false
      const locationDiagnostics: Record<string, string | number | boolean | null> = {
        locationMode: automatic ? 'automatic' : 'manual',
        locatorReason: null,
        locatorMode: null,
        locatorChecks: null,
        locatorDurationMs: null,
        guideScene: this._automaticSample.scene,
        guideState: this._automaticSample.state,
        fallbackCardsReason: null,
        fallbackShopReason: null,
        shopDecision: null,
        clientWidth: gameWindow!.bounds.width,
        clientHeight: gameWindow!.bounds.height,
        captureWidth: captureSize.width,
        captureHeight: captureSize.height,
        frameWidth: frame.width,
        frameHeight: frame.height,
        framePixelBytes: frame.pixels.length,
        expectedFramePixelBytes: frame.width * frame.height * 4,
        displayPixelWidth: mapping?.displayBounds.width ?? display.size.width,
        displayPixelHeight: mapping?.displayBounds.height ?? display.size.height,
        displayScaleFactor: display.scaleFactor,
        windowSourceRevision: this._windowSourceRevision
      }
      if (automatic) {
        const location = this._uiLocator.locate(
          frame,
          this._automaticSample.state === 'waiting' ? this._automaticSample.scene! : undefined
        )
        this._captureDiagnostics.uiLocation = location
        // The same physical client-area frame reaches fallback before any locator early return.
        const resolved = this._fallback.resolve(frame, location)
        Object.assign(locationDiagnostics, {
          locatorReason: location.reason,
          locatorMode: location.mode,
          locatorChecks: location.checks,
          locatorDurationMs: location.durationMs,
          fallbackCardsReason: resolved.reasons.cards ?? 'not-evaluated',
          fallbackShopReason: resolved.reasons.shop ?? 'not-evaluated',
          shopDecision: !resolved.shouldUpdate
            ? 'fallback-deferred'
            : resolved.shopRect
              ? resolved.methods.shop
              : this._automaticSample.state === 'waiting' && this._automaticSample.scene === 'cards'
                ? 'guide-excludes-shop'
                : resolved.confirmed.shop === false
                  ? 'fallback-not-visible'
                  : location.cards
                    ? 'cards-scene'
                    : `automatic-${location.reason}`
        })
        ignoreObservation = !resolved.shouldUpdate
        locationIncomplete =
          !['matched', 'not-found'].includes(location.reason) &&
          resolved.shouldUpdate &&
          Object.keys(resolved.confirmed).length === 0
        if (resolved.shouldUpdate) {
          fallbackConfirmation = resolved.confirmed
          this._locationMethods = resolved.methods
          this._captureDiagnostics.fallbackLocation = resolved.reasons
          const previous = this._automaticLayout?.cardRects ?? []
          const observed = resolved.cardRects
          const normalized = normalizeCardGeometry(previous, observed)
          if (JSON.stringify(previous) !== JSON.stringify(normalized)) {
            this._layoutRevision++
            this._clearTitles()
            this.session.setCandidates(this.session.revision, [null, null, null])
          }
          titleRects = resolved.titleRects.map((rect, index) => ({
            ...rect,
            x: rect.x + normalized[index].x - observed[index].x,
            y: rect.y + normalized[index].y - observed[index].y
          }))
          this._automaticLayout = {
            displayId: mapping!.displayId,
            clientBounds: mapping!.clientBounds,
            scaleFactor: mapping!.scaleFactor,
            cardRects: normalized,
            titleRects,
            shopRect: resolved.shopRect
          }
          cards = observed.length === 3
          shop = resolved.shopRect !== null
        }
      } else if (calibration!.shopAnchor) {
        const location = await this._shopLocator.locate(
          calibration!,
          {
            bitmap: (rect) => {
              const sample = rect ? image.crop(rect) : image
              return {
                x: rect?.x ?? 0,
                y: rect?.y ?? 0,
                ...sample.getSize(),
                pixels: sample.toBitmap()
              }
            },
            pixels: (rect) => Array.from(image.crop(rect).toBitmap())
          },
          Date.now(),
          current
        )
        if (!current()) return
        this._locatedShopRect = location.rect
        shop = location.rect !== null
        this._captureDiagnostics.shopLocation = {
          mode: location.mode,
          reason: location.reason,
          rect: location.rect
        }
        locationDiagnostics.shopDecision = `manual-anchor-${location.reason}`
      } else {
        shop = matchesMarkers(calibration!.shop, pixels(calibration!.shop))
        locationDiagnostics.shopDecision = shop
          ? 'manual-markers-matched'
          : 'manual-markers-no-match'
      }
      const titlesOccluded =
        cards &&
        !shop &&
        (automatic
          ? hasAutomaticTitleTooltip(this._automaticLayout!, (rect) => image!.crop(rect).toBitmap())
          : hasRecordedMiddleTooltip(calibration!, (rect) => image!.crop(rect).toBitmap()))
      this._captureDiagnostics.titleOcclusion = titlesOccluded ? 'recorded-middle-tooltip' : null
      const titleReadStarted = performance.now()
      const titles =
        !titlesOccluded && (cards || (this.session.cardsVisible && !shop))
          ? titleRects.map((rect) => Array.from(image!.crop(rect).toBitmap()))
          : []
      const titleReadMs = performance.now() - titleReadStarted
      const bound = this._bound
      if (
        !automatic &&
        !cards &&
        !shop &&
        this.session.cardsVisible &&
        bound?.key === identity.key
      ) {
        // Hover/reroll glow can change one border. Require fresh positive evidence:
        // both patches still prefer open, one strictly matches, and two confirmed titles agree.
        const distances = calibration!.cards.map((marker, i) => ({
          opened: Math.min(
            ...[marker.open, ...(marker.openVariants ?? [])].map((open) =>
              pixelDistance(cardPixels[i], open)
            )
          ),
          closed: pixelDistance(cardPixels[i], marker.closed)
        }))
        cards =
          distances.every(({ opened, closed }) => closed >= opened + 0.035) &&
          distances.some(({ opened }) => opened <= 0.055) &&
          titles.filter(
            (title, i) => bound.candidates[i] && titlePixelDistance(title, bound.titles[i]) <= 0.015
          ).length >= 2
      }
      locationDiagnostics.locationDecision = ignoreObservation
        ? 'deferred'
        : locationIncomplete
          ? 'incomplete'
          : 'observation'
      this._trace('roi-markers-ready', {
        sequence,
        durationMs: performance.now() - markerStarted,
        shop,
        cards,
        ...locationDiagnostics,
        cardsEvidence: cards
          ? automatic
            ? this._locationMethods.cards === 'fallback'
              ? 'fallback-template'
              : 'public-chrome'
            : cardMarkersMatch
              ? 'markers'
              : 'marker-and-title'
          : 'none'
      })
      this._captureDiagnostics.location = locationDiagnostics
      this._captureDiagnostics.cardsOpen = cards
      this._captureDiagnostics.shopOpen = shop
      const stillForeground = await this._gameClient.isGameClientForegroundCached()
      this._captureDiagnostics.foregroundAfter = stillForeground
      if (!current()) {
        this._trace('capture-rejected', { sequence, reason: 'context-invalidated' })
        return
      }
      if (!stillForeground) {
        this._resetCaptureReadiness()
        this._trace('capture-rejected', { sequence, reason: 'foreground-lost' })
        this._pause('游戏不在前台，浮窗暂停', true)
        return
      }
      const finalGameWindow = await this._readGameWindow()
      if (!current()) {
        this._trace('capture-rejected', { sequence, reason: 'context-invalidated' })
        return
      }
      const finalReadiness = this._windowReadiness(finalGameWindow, display, automatic)
      if (finalReadiness.signature !== windowSignature) {
        this._resetCaptureReadiness()
        this._trace('capture-rejected', { sequence, reason: 'game-window-changed' })
        this._captureDiagnostics.readinessReason =
          finalReadiness.reason ?? 'window-identity-or-bounds-changed'
        this._pause(
          finalReadiness.message ?? '游戏窗口 PID、HWND 或客户区在采集期间变化，浮窗暂停',
          true
        )
        return
      }
      if (Date.now() - capturedAt > 1500) {
        this._trace('capture-rejected', {
          sequence,
          reason: 'capture-expired',
          ageMs: Date.now() - capturedAt
        })
        this._pause('画面已过期，浮窗暂停')
        return
      }
      this._fallback.receive(
        frame,
        () => `data:image/png;base64,${image!.toPNG().toString('base64')}`
      )
      if (Date.now() - capturedAt > 1500) {
        this._pause('画面已过期，浮窗暂停')
        return
      }
      if (ignoreObservation) return
      if (locationIncomplete) {
        this._automaticLayout = null
        this._layoutRevision++
        this._pause('当前画面定位未完成，等待下一帧')
        return
      }
      // Wall-clock publication may have expired while this independently fresh frame
      // was in flight. Only adjacent source timestamps may continue scene/OCR evidence.
      this._expireObservation(capturedAt)
      const token = this.session.revision
      if (!this.session.observe(token, shop, cards, capturedAt, fallbackConfirmation)) {
        this._trace('capture-rejected', { sequence, reason: 'observation-invalidated' })
        return
      }
      this._lastCaptureAt = capturedAt
      this._lastObservationAt = capturedAt
      this._lastCaptureSequence = sequence
      if (automatic && (cards || shop)) {
        const signature = JSON.stringify([
          windowSignature,
          this._automaticLayout?.cardRects,
          this._automaticLayout?.shopRect
        ])
        const previous = this._firstRunLocation
        this._firstRunLocation = {
          signature,
          frames:
            fallbackConfirmation.cards === true || fallbackConfirmation.shop === true
              ? 2
              : previous?.signature === signature &&
                  capturedAt >= previous.observedAt &&
                  capturedAt - previous.observedAt <= 1500
                ? Math.min(2, previous.frames + 1)
                : 1,
          observedAt: capturedAt
        }
      } else this._firstRunLocation = null
      if (automatic && this._automaticLayout) this._observeAutomaticSample(image.getSize())
      this._trace('capture-accepted', {
        sequence,
        ageMs: Date.now() - capturedAt,
        cardsVisible: this.session.cardsVisible,
        shopVisible: this.session.shopVisible
      })
      if (this.session.shopVisible) this._refreshInventory()
      this._pauseReason = null
      const wasOccluded = this._titlesOccluded
      if (titlesOccluded !== wasOccluded) {
        this._occlusionRevision++
        this._titleRevision++
      }
      this._titlesOccluded = titlesOccluded
      if (titlesOccluded) {
        // Retain only already confirmed bindings within this scene. No occluded pixels
        // enter title comparison or OCR, and partial confirmation cannot bridge the gap.
        this._ocrFrames = this._ocrFrames.map((frame, i) =>
          this._bound?.candidates[i] ? frame : null
        )
        this._recognition = this._recognition.map((line, i) =>
          this._bound?.candidates[i]
            ? { ...line, stable: false }
            : { ...this._emptyOcrLine(), id: null, stable: false }
        )
        this.session.setCandidates(token, [null, null, null])
        this._trace('roi-titles-occluded', { sequence, titleRevision: this._titleRevision })
      } else if ((cards || (!automatic && this.session.cardsVisible)) && !shop) {
        const titleStarted = performance.now()
        const titleDistances = titles.map((title, i) =>
          this._titles[i] ? titlePixelDistance(title, this._titles[i]) : null
        )
        const boundTitleDistances = titles.map((title, i) =>
          this._bound?.titles[i] ? titlePixelDistance(title, this._bound.titles[i]) : null
        )
        const changed = this.session.updateTitles(
          titles,
          (a, b) => titlePixelDistance(a, b) > 0.015
        )
        changed.forEach((value, i) => {
          if (value) {
            this._ocrFrames[i] = null
            if (this._recognition[i])
              this._recognition[i] = { ...this._emptyOcrLine(), id: null, stable: false }
          }
        })
        if (
          this._titles.length !== 3 ||
          this._titles.some((t, i) => titlePixelDistance(t, titles[i]) > 0.015)
        ) {
          this._titleRevision++
          if (
            this._bound?.source === 'manual' &&
            this._bound.titles.some((title, i) => titlePixelDistance(title, titles[i]) > 0.015)
          ) {
            this._bound = null
            this.session.setCandidates(token, [null, null, null])
            this._ocrFrames = [null, null, null]
          }
        }
        // A single unconfirmed frame must not become a manually bindable card selection.
        this._titles = this.session.cardsVisible ? titles : []
        if (this.session.cardsVisible) this._titleSessionRevision = token
        if (this.session.cardsVisible && this._bound?.key === identity.key) {
          const bound = this._bound
          const candidates = bound.candidates.map((candidate, i) => {
            if (!candidate || titlePixelDistance(bound.titles[i], titles[i]) > 0.015) {
              bound.candidates[i] = null
              return null
            }
            const stat = this._augments?.augments.find((augment) => augment.id === candidate.id)
            const revalidated = {
              ...candidate,
              tier: stat?.tier ?? null,
              winRate: stat?.winRate ?? null,
              pickRate: stat?.pickRate ?? null
            }
            // Subsequent OCR for unconfirmed slots must retain the statistics just restored.
            if (wasOccluded) bound.candidates[i] = revalidated
            return revalidated
          })
          this.session.setCandidates(token, candidates)
          if (wasOccluded)
            this._recognition = this._recognition.map((line, i) => ({
              ...line,
              stable: !!candidates[i]
            }))
        }
        this._trace('roi-titles-ready', {
          sequence,
          durationMs: titleReadMs + performance.now() - titleStarted,
          titleRevision: this._titleRevision,
          changedCount: changed.filter(Boolean).length,
          titleDistances,
          boundTitleDistances
        })
        if (
          cards &&
          this.session.cardsVisible &&
          this.session.candidates.some((candidate) => !candidate) &&
          !this._ocrBusy &&
          !this._ocrFailure &&
          this._bound?.source !== 'manual'
        ) {
          const indices = this.session.candidates.flatMap((candidate, i) => (candidate ? [] : [i]))
          const imageStarted = performance.now()
          const images = indices.map((i) => {
            const rect = titleRects[i]
            return image
              .crop(rect)
              .resize({ width: rect.width * 2, height: rect.height * 2, quality: 'best' })
              .toPNG()
          })
          this._trace('ocr-images-ready', {
            sequence,
            durationMs: performance.now() - imageStarted,
            cardIndices: indices
          })
          const done = this._recognizeTitles(
            images,
            token,
            context,
            calibration,
            capturedAt,
            titles,
            indices,
            sequence
          )
          this._ocrWork = {
            done,
            token,
            context,
            calibration,
            layoutRevision: this._layoutRevision,
            yielded: false
          }
        }
      } else if (!this.session.cardsVisible || automatic) {
        this._clearTitles()
        if (automatic) this.session.setCandidates(token, [null, null, null])
      }
      this._diagnostic =
        shop && cards
          ? '画面特征冲突，浮窗暂停'
          : cards
            ? this._recognitionDiagnostic()
            : this.session.suppressed && shop
              ? '装备已在本局隐藏'
              : this.session.temporarilyHidden && shop
                ? '装备已收起，可在原处展开'
                : shop
                  ? '商店已打开'
                  : '正常战斗，浮窗隐藏'
    } catch (error) {
      if (!current()) return
      if (error instanceof GameClientForegroundError) {
        this._pauseForForegroundError(error)
        return
      }
      this._pause('采集失败，浮窗暂停')
      this._logger.warn('Mayhem capture failed', error)
    }
  }
  private _emptyOcrLine(): BackendOcrLine {
    return this._ocr.backend === 'rapidocr'
      ? { backend: 'rapidocr', text: '', rawScore: null }
      : { text: '', confidence: 0 }
  }
  private _recognitionDiagnostic() {
    if (this._bound?.source === 'manual') return '当前名称来自手工诊断，尚未验证自动识别'
    if (this._ocrFailure) return `识别未完成：${this._ocrFailure}；可展开手工名称诊断`
    const count = this.session.candidates.filter(Boolean).length
    return count === 3
      ? '当前三卡候选已识别，未确认实际已选海克斯'
      : `自动识别 ${count}/3；识别未完成的卡片不显示统计`
  }
  setAugmentBackgroundOpacity(value: unknown) {
    this._augmentBackgroundOpacity = saveAugmentBackgroundOpacity(this._directory, value)
    this._preferencesError = null
    this._publish()
    return true
  }
  private async _recognizeTitles(
    images: Buffer[],
    token: number,
    context: string,
    calibration: Calibration | null,
    capturedAt: number,
    titles: number[][],
    indices: number[],
    sequence: number
  ) {
    this._ocrBusy = true
    const layoutRevision = this._layoutRevision
    const occlusionRevision = this._occlusionRevision
    const batch = ++this._ocrSequence
    const started = performance.now()
    const fallbackSource =
      this._locationMethods.cards === 'fallback' ? this._gameWindowSignature : null
    this._trace('ocr-input', {
      sequence,
      batch,
      imageCount: images.length,
      cardIndices: indices,
      ageMs: Date.now() - capturedAt
    })
    const rejectionReason = () => {
      if (!this._current(token, context, calibration, layoutRevision)) return 'context-invalidated'
      if (!this.session.cardsVisible) return 'cards-closed'
      if (this._titlesOccluded) return 'titles-occluded'
      if (occlusionRevision !== this._occlusionRevision) return 'title-occlusion-changed'
      if (this._bound?.source === 'manual') return 'manual-binding'
      if (Date.now() - capturedAt > 1500) return 'ocr-input-expired'
      if (Date.now() - this._lastCaptureAt > 1500) return 'latest-capture-expired'
      return null
    }
    const current = () => rejectionReason() === null
    const reject = () => {
      const reason = rejectionReason()
      if (!reason) return false
      this._trace('ocr-rejected', { sequence, batch, reason, ageMs: Date.now() - capturedAt })
      return true
    }
    try {
      const lines = await this._ocr.recognize(images)
      this._trace('ocr-complete', {
        sequence,
        batch,
        durationMs: performance.now() - started,
        lineCount: lines.length,
        ageMs: Date.now() - capturedAt
      })
      const backendTiming = this._ocr.diagnostics?.().lastRequest as
        Record<string, unknown> | undefined
      if (backendTiming) {
        const timing: Record<string, number | boolean | null> = { sequence, batch }
        for (const key of [
          'encodeMs',
          'roundTripMs',
          'decodeCropMs',
          'recognitionMs',
          'workerMs',
          'inputWaitMs',
          'returnWaitMs',
          'timingClockValid'
        ]) {
          const value = backendTiming[key]
          timing[key] = typeof value === 'number' || typeof value === 'boolean' ? value : null
        }
        this._trace('ocr-backend-timing', timing)
      }
      if (reject()) return
      const foreground = await this._gameClient.isGameClientForegroundCached()
      if (reject()) return
      if (!foreground) {
        this._resetCaptureReadiness()
        this._trace('ocr-rejected', { sequence, batch, reason: 'foreground-lost' })
        this._pause('游戏不在前台，浮窗暂停', true)
        return
      }
      if (fallbackSource) {
        const window = await this._readGameWindow()
        if (reject()) return
        const display = screen
          .getAllDisplays()
          .find((display) => String(display.id) === this._automaticLayout?.displayId)
        if (!display || this._windowReadiness(window, display, true).signature !== fallbackSource) {
          this._resetCaptureReadiness()
          this._pause('游戏窗口来源已变化，浮窗暂停', true)
          return
        }
      }
      const previousRecognition = this._recognition
      const byIndex = new Map(indices.map((index, i) => [index, lines[i]]))
      const retained = titles.map((_, i) =>
        this._bound?.candidates[i] &&
        titlePixelDistance(this._bound.titles[i], this._titles[i]) <= 0.015
          ? this._bound.candidates[i]
          : null
      )
      const cardResults = titles.map(() => 'not-requested')
      const candidates = titles.map((_, i) => {
        if (!this._titles[i] || titlePixelDistance(titles[i], this._titles[i]) > 0.015) {
          cardResults[i] = 'title-changed'
          this._ocrFrames[i] = null
          return null
        }
        // Current pixels revalidate this card; an uncertain read of another card must not erase it.
        if (retained[i]) {
          cardResults[i] = 'retained'
          return retained[i]
        }
        const line = byIndex.get(i)
        const scoreRejection = line ? ocrLineRejection(line) : null
        const candidate =
          line && !scoreRejection
            ? this._candidate(line.text, line.backend === 'rapidocr' ? 'rapidocr' : true)
            : null
        const previous = this._ocrFrames[i]
        const frames = candidate ? (previous?.id === candidate.id ? previous.frames + 1 : 1) : 0
        this._ocrFrames[i] = candidate ? { id: candidate.id, frames } : null
        cardResults[i] = !line
          ? 'missing-line'
          : scoreRejection
            ? scoreRejection
            : !candidate
              ? 'name-unmatched'
              : frames < 2
                ? 'pending-confirmation'
                : 'accepted'
        return frames >= 2 ? candidate : null
      })
      this._recognition = titles.map((_, i) => {
        if (retained[i]) return previousRecognition[i]
        const line = byIndex.get(i) ?? this._emptyOcrLine()
        return {
          ...(this._titles[i] && titlePixelDistance(titles[i], this._titles[i]) <= 0.015
            ? line
            : this._emptyOcrLine()),
          id: this._ocrFrames[i]?.id ?? null,
          stable: !!candidates[i],
          ...(line.backend !== 'rapidocr' && this._ocrFrames[i] && !this._candidate(line.text)
            ? { corrected: true }
            : {})
        }
      })
      this._bound = {
        key: this.session.sessionKey!,
        titles,
        candidates,
        source: 'ocr'
      }
      this.session.setCandidates(token, candidates)
      this._trace('ocr-applied', {
        sequence,
        batch,
        cardResults,
        acceptedCount: candidates.filter(Boolean).length,
        retainedCount: retained.filter(Boolean).length,
        ageMs: Date.now() - capturedAt
      })
      this._diagnostic = this._recognitionDiagnostic()
    } catch (cause) {
      if (cause instanceof GameClientForegroundError) {
        if (current()) this._pauseForForegroundError(cause)
        return
      }
      this._trace('ocr-failed', { sequence, batch, durationMs: performance.now() - started })
      const message = cause instanceof Error ? cause.message : String(cause)
      if (this._disposed) return
      this._ocrFailure = message
      this._logger.warn('Mayhem local OCR unavailable', cause)
      if (current()) {
        this._ocrFrames = [null, null, null]
        this._recognition = []
        this._bound = null
        this.session.setCandidates(token, [null, null, null])
        this._diagnostic = this._recognitionDiagnostic()
      }
      // Backend recovery is independent of this frame's game/context lifetime.
      // Keep the OCR slot occupied; polling continues, but no images are queued.
      try {
        if (await this._ocr.recover?.()) {
          if (this._disposed) return
          this._ocrFailure = null
          this._ocrPreloadReady = true
          this._trace('ocr-recovered', { sequence, batch })
          // Only a subsequent fresh capture may contribute recognition results.
        }
      } catch (recoveryError) {
        if (this._disposed) return
        this._ocrFailure =
          recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
        this._trace('ocr-recovery-failed', { sequence, batch })
        this._logger.warn('Mayhem local OCR recovery failed', recoveryError)
      }
    } finally {
      this._ocrBusy = false
      this._ocrWork = null
      this._publish()
    }
  }
  private _candidate(name: string, ocr: boolean | 'rapidocr' = false): Candidate | null {
    const dictionary =
      this._assets.gtimg.kiwiAugments?.map((augment) => ({
        id: augment.augmentID,
        name: augment.name_cn,
        level: augment.level
      })) ?? []
    const id =
      ocr === 'rapidocr'
        ? matchRapidOcrName(name, dictionary)
        : (ocr ? matchOcrAugmentName : matchAugmentName)(name, dictionary)
    const entry = dictionary.find((augment) => augment.id === id)
    if (!entry || !['kGold', 'kSilver', 'kPrismatic'].includes(entry.level)) return null
    const stat = this._augments?.augments.find((augment) => augment.id === id)
    return {
      id: entry.id,
      rarity: entry.level === 'kGold' ? 'gold' : entry.level === 'kSilver' ? 'silver' : 'prismatic',
      tier: stat?.tier ?? null,
      winRate: stat?.winRate ?? null,
      pickRate: stat?.pickRate ?? null
    }
  }
  private _load(championId: number, key: string) {
    const started = performance.now()
    this._request?.abort()
    const request = new AbortController()
    this._request = request
    const accept = () => {
      this._syncIdentity()
      return (
        !this._disposed &&
        !request.signal.aborted &&
        request === this._request &&
        key === this._contextKey
      )
    }
    void this._loader
      .equipment(championId, request.signal)
      .then((data) => {
        if (accept() && data.championId === championId) {
          this._equipment = data
          this._trace('equipment-data-ready', {
            durationMs: performance.now() - started,
            rowCount: Object.values(data.categories).reduce((count, rows) => count + rows.length, 0)
          })
        }
      })
      .catch(() => {
        if (accept()) {
          this._equipment = null
          this._trace('equipment-data-failed', { durationMs: performance.now() - started })
        }
      })
      .finally(() => this._publish())
    void this._loader
      .augments(championId, request.signal)
      .then((data) => {
        if (accept() && data.championId === championId) {
          this._augments = data
          this._trace('augment-data-ready', {
            durationMs: performance.now() - started,
            rowCount: data.augments.length
          })
        }
      })
      .catch(() => {
        if (!accept()) return
        this._augments = null
        this._trace('augment-data-failed', { durationMs: performance.now() - started })
        const clearStatistics = (candidate: Candidate | null): Candidate | null =>
          candidate ? { ...candidate, tier: null, winRate: null, pickRate: null } : null
        this.session.candidates = this.session.candidates.map(clearStatistics)
        if (this._bound) this._bound.candidates = this._bound.candidates.map(clearStatistics)
      })
      .finally(() => this._publish())
  }
  setCategory(key: string, category: Category) {
    this._syncIdentity()
    if (
      !this.session.sessionKey ||
      key !== this.session.sessionKey ||
      !['items', 'shoes', 'core', 'starting'].includes(category)
    )
      return false
    this.session.category = category
    this.session.buildView = 'standard'
    this._publish()
    return true
  }
  setBuildView(key: string, view: EquipmentBuildView) {
    const snapshot = this.snapshot()
    if (
      !snapshot.sessionKey ||
      key !== snapshot.sessionKey ||
      !['standard', 'augment'].includes(view) ||
      (view === 'augment' && !equipmentPresentation(snapshot).adaptationAvailable)
    )
      return false
    this.session.buildView = view
    this.session.category = 'items'
    this._publish()
    return true
  }
  collapse(key: string) {
    this._syncIdentity()
    const result = this.session.collapse(key)
    if (result) this._publish()
    return result
  }
  suppress(key: string) {
    this._syncIdentity()
    const result = this.session.suppress(key)
    if (result) {
      try {
        this._save('session.json', { suppressedKey: key })
      } catch {
        this._diagnostic = '本局状态已生效，写盘失败，重启后需重新核对'
      }
      this._publish()
    }
    return result
  }
  restore(key: string) {
    this._syncIdentity()
    if (this.session.expire(Date.now())) this._clearTitles()
    const result = this.session.restore(key)
    if (result) {
      try {
        this._save('session.json', { suppressedKey: null })
      } catch {
        this._diagnostic = '本局状态已生效，写盘失败，重启后需重新核对'
      }
      this._publish()
    }
    return result
  }
  private _save(name: string, value: unknown) {
    try {
      fs.mkdirSync(this._directory, { recursive: true })
      const file = path.join(this._directory, name)
      fs.writeFileSync(file + '.tmp', JSON.stringify(value))
      fs.renameSync(file + '.tmp', file)
      this._dataDirectoryWritable = true
    } catch (error) {
      this._dataDirectoryWritable = false
      this._logger.warn('Mayhem local state could not be saved', error)
      throw new Error('保存失败：无法写入本地校准或会话文件，请检查目录权限')
    }
  }
  sampleAutomaticLocation(scene: unknown) {
    if (process.platform !== 'win32') throw new Error('自动定位仅支持 Windows')
    if (scene !== null && scene !== 'cards' && scene !== 'shop')
      throw new Error('请选择商店或三卡场景')
    this._manualCalibrationActive = false
    this._fallback.cancel()
    this._captureRevision++
    this._resetCaptureReadiness()
    this.session.invalidate()
    this._clearTitles()
    this._automaticSample = {
      scene,
      state: scene ? 'waiting' : 'idle',
      message: scene
        ? `请回到游戏，保持${scene === 'shop' ? '商店打开' : '三卡界面'}，等待连续两帧确认。`
        : '已恢复自动定位。'
    }
    this._publish()
    return this._automaticSample
  }
  private _observeAutomaticSample(size: { width: number; height: number }) {
    const sample = this._automaticSample
    if (sample.state !== 'waiting') return
    if (this._locationMethods[sample.scene!] !== 'automatic') return
    const layout = this._automaticLayout!
    const rects = sample.scene === 'cards' ? layout.cardRects : layout.shopRect
    const signature =
      rects && (!Array.isArray(rects) || rects.length === 3)
        ? JSON.stringify([this._gameWindowSignature, sample.scene, rects])
        : null
    if (!signature || this._sampleSignature !== signature) {
      this._sampleSignature = signature
      return
    }
    const previous = this._geometryCache
    const cache: UiGeometryCache = {
      version: 1,
      ...size,
      cards:
        sample.scene === 'cards'
          ? layout.cardRects
          : previous?.width === size.width
            ? previous.cards
            : [],
      shop:
        sample.scene === 'shop'
          ? layout.shopRect
          : previous?.width === size.width
            ? previous.shop
            : null
    }
    try {
      this._save('automatic-location.json', cache)
      this._geometryCache = cache
      this._automaticSample = {
        ...sample,
        state: 'confirmed',
        message: '已确认两帧并保存位置。后续画面继续自动核对。'
      }
    } catch (error) {
      this._automaticSample = {
        ...sample,
        state: 'failed',
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }
  setupInfo() {
    return {
      preferences: {
        augmentBackgroundOpacity: this._augmentBackgroundOpacity,
        path: path.join(this._directory, 'preferences.json'),
        error: this._preferencesError
      },
      snapshot: this.snapshot(),
      revision: this.session.revision,
      titleRevision: this._titleRevision,
      recognition: this._recognition,
      calibration: this._calibration,
      automaticLayout: this._automaticLayout,
      automaticLocation: !this._manualCalibrationActive,
      locationMethods: this._locationMethods,
      ocrBackend: this._ocr.backend ?? 'tesseract',
      automaticSample: this._automaticSample,
      ocrRuntime: this._ocr.diagnostics?.() ?? null,
      displays: screen.getAllDisplays().map((display) => ({
        id: String(display.id),
        width: display.size.width,
        height: display.size.height,
        scale: display.scaleFactor
      })),
      dictionary:
        this._assets.gtimg.kiwiAugments?.map((augment) => ({
          id: augment.augmentID,
          name: augment.name_cn,
          rarity: augment.level
        })) ?? []
    }
  }
  private async _fallbackSelectionContext(): Promise<FallbackSelectionContext | null> {
    const identity = this._syncIdentity()
    const context = this._contextKey
    if (this._disposed || !identity || !this._gameClient.supportsGameClientWindowSnapshot())
      return null
    const window = await this._readGameWindow()
    this._syncIdentity()
    if (this._disposed || context !== this._contextKey || !window) return null
    const displays = screen.getAllDisplays()
    const resolved = resolveGameFrameMapping(
      window.bounds,
      displays.map((display) => ({
        id: String(display.id),
        bounds: screen.dipToScreenRect(null, display.bounds),
        scaleFactor: display.scaleFactor
      }))
    )
    const display = displays.find((display) => String(display.id) === resolved.mapping?.displayId)
    if (!resolved.mapping || !display) return null
    // Saving geometry while Setup owns focus is allowed; it is never open-scene evidence.
    const sourceKey = this._windowReadiness(window, display, true, false).signature
    return sourceKey
      ? {
          sessionKey: identity.key,
          sourceKey,
          width: window.bounds.width,
          height: window.bounds.height
        }
      : null
  }
  async fallbackSelectionStatus() {
    return this._fallback.status(await this._fallbackSelectionContext())
  }
  beginFallbackSelection(scene: unknown) {
    if (process.platform !== 'win32') throw new Error('框选备用定位仅支持 Windows。')
    if (!this._syncIdentity()) throw new Error('请先进入海克斯大乱斗对局，再框选当前游戏画面。')
    this._fallback.begin(scene)
    return this._fallback.status(null)
  }
  cancelFallbackSelection(requestId: unknown) {
    return this._fallback.cancel(requestId)
  }
  async saveFallbackSelection(input: unknown) {
    if (process.platform !== 'win32') throw new Error('框选备用定位仅支持 Windows。')
    const currentContext = await this._fallbackSelectionContext()
    const result = this._fallback.save(input, currentContext)
    this._manualCalibrationActive = false
    this._automaticSample = { scene: null, state: 'idle', message: '' }
    this._captureRevision++
    this._resetCaptureReadiness()
    this.session.invalidate()
    this._clearTitles()
    this._pauseReason = null
    this._diagnostic = '备用位置已保存，回到游戏后确认当前画面'
    this._publish()
    return result
  }
  bindNames(key: string, revision: number, titleRevision: number, names: unknown) {
    this._syncIdentity()
    if (
      this._disposed ||
      !this.session.sessionKey ||
      key !== this.session.sessionKey ||
      (revision !== this.session.revision &&
        (this._pauseReason !== '游戏不在前台，浮窗暂停' ||
          revision !== this._titleSessionRevision)) ||
      titleRevision !== this._titleRevision ||
      (this.session.cardsVisible && !this._hasFreshObservation()) ||
      this._titlesOccluded ||
      this._titles.length !== 3 ||
      !Array.isArray(names) ||
      names.length !== 3 ||
      !Array.from(names).every((name) => typeof name === 'string' && name.trim().length > 0)
    )
      return false
    const candidates = names.map((name) => this._candidate(name))
    if (candidates.some((candidate) => !candidate)) return false
    this._bound = {
      key,
      titles: this._titles.map((title) => [...title]),
      candidates,
      source: 'manual'
    }
    // Setup takes foreground away from the game. Binding is pending until fresh game frames match.
    if (this.session.cardsVisible) this.session.setCandidates(revision, candidates)
    this._publish()
    return true
  }
  calibrate(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('校准参数无效')
    const value = input as Record<string, unknown>
    if (
      typeof value.displayId !== 'string' ||
      !value.displayId.trim() ||
      ![value.cardRects, value.titleRects].every(
        (rects) => Array.isArray(rects) && rects.length === 3 && Array.from(rects).every(isRect)
      ) ||
      !isRect(value.shopRect)
    )
      throw new Error('校准区域无效：需要三个卡片、三个标题和有效商店区域')
    return this.saveCalibration({
      version: 1,
      displayId: value.displayId,
      shop: this.makeMarkers(value.shopOpen, value.closed, value.shopMarkers),
      cards: this.makeMarkers(value.cardsOpen, value.closed, value.cardMarkers),
      cardRects: value.cardRects,
      titleRects: value.titleRects,
      shopRect: value.shopRect,
      shopAnchor: createShopAnchor(
        {
          x: 0,
          y: 0,
          width: 2560,
          height: 1440,
          pixels: nativeImage.createFromDataURL(value.shopOpen as string).toBitmap()
        },
        value.shopRect
      )
    })
  }
  saveCalibration(value: unknown) {
    if (!isCalibration(value))
      throw new Error('校准无效：需两个可区分开/关状态的特征，且截图为 2560×1440')
    const display = screen
      .getAllDisplays()
      .find((display) => String(display.id) === value.displayId)
    if (
      !display ||
      display.size.width !== 2560 ||
      display.size.height !== 1440 ||
      display.scaleFactor !== 1
    ) {
      throw new Error('校准显示器不可用：需 2560×1440 和 100% 缩放')
    }
    this._save('calibration.json', value)
    this._manualCalibrationActive = true
    this._automaticSample = { scene: null, state: 'idle', message: '' }
    this._captureRevision++
    this._resetCaptureReadiness()
    this._calibration = value
    this.session.invalidate()
    this._clearTitles()
    this._pauseReason = null
    this._diagnostic = '校准已保存，等待游戏画面确认'
    this._publish()
    return true
  }
  makeMarkers(open: unknown, closed: unknown, rects: unknown) {
    if (
      !Array.isArray(rects) ||
      rects.length !== 2 ||
      !Array.from(rects).every((rect) => isRect(rect) && rect.width === 24 && rect.height === 24)
    ) {
      throw new Error('校准特征无效：需要两个边界内的 24×24 区域')
    }
    if (
      ![open, closed].every(
        (url) => typeof url === 'string' && /^data:image\/(png|jpeg);base64,/.test(url)
      )
    ) {
      throw new Error('截图无效：请导入 PNG 或 JPEG 原图')
    }
    const images = [
      nativeImage.createFromDataURL(open as string),
      nativeImage.createFromDataURL(closed as string)
    ]
    if (
      images.some(
        (image) =>
          image.isEmpty() || image.getSize().width !== 2560 || image.getSize().height !== 1440
      )
    ) {
      throw new Error('必须使用原始 2560×1440 截图')
    }
    return rects.map((rect) => {
      const [opened, closed] = images.map((image) => Array.from(image.crop(rect).toBitmap()))
      if (opened.length !== 24 * 24 * 4 || closed.length !== 24 * 24 * 4)
        throw new Error('截图像素尺寸无效')
      return { rect, open: opened, closed }
    })
  }
  dispose() {
    this._disposed = true
    if (this._timer) clearInterval(this._timer)
    this._timer = null
    this._request?.abort()
    this._fallback.cancel()
    this._fallback.resetRuntime()
    this._gameContextLoader.dispose()
    this._ocr.dispose()
    this.session.invalidate()
    this._clearTitles()
    this.windows.dispose()
  }
}
