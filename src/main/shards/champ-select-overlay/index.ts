import { getLeagueClientWindowSnapshot } from '@main/native'
import { IAkariShardInitDispose, Shard } from '@shared/akari-shard'
import type {
  CandidateCardRole,
  CandidateGrabIdentity
} from '@shared/champ-select-overlay/candidate-grab'
import { CANDIDATE_GRAB_NAMESPACE } from '@shared/champ-select-overlay/candidate-grab'
import { type BrowserWindow, screen } from 'electron'

import { AkariProtocolMain } from '../akari-protocol'
import { AkariIpcMain } from '../ipc'
import { LeagueClientMain } from '../league-client'
import { LoggerFactoryMain } from '../logger-factory'
import { OngoingGameMain } from '../ongoing-game'
import { WindowManagerMain } from '../window-manager'
import { observeAutomaticPositionImage } from './automatic-position-image'
import { CandidateButtonWindowController } from './candidate-button-window-controller'
import { CandidateGrabController } from './candidate-grab-controller'
import { ChampSelectOverlayIpcHandlers } from './ipc-handlers'
import {
  ChampSelectPositionCalibrationController,
  captureChampSelectPosition
} from './position-calibration-controller'
import { registerPositionCalibrationIpc } from './position-calibration-ipc'
import { exportPositionSample } from './position-sample-executor'
import { ChampSelectOverlayWindowController } from './window-controller'

@Shard(ChampSelectOverlayMain.id)
export class ChampSelectOverlayMain implements IAkariShardInitDispose {
  static readonly id = CANDIDATE_GRAB_NAMESPACE

  private readonly _windowController: ChampSelectOverlayWindowController
  private readonly _candidateGrabController: CandidateGrabController
  private readonly _candidateButtonWindowController: CandidateButtonWindowController
  private readonly _ipcHandlers: ChampSelectOverlayIpcHandlers
  private readonly _positionCalibration: ChampSelectPositionCalibrationController

  constructor(
    _leagueClient: LeagueClientMain,
    _ongoingGame: OngoingGameMain,
    _protocol: AkariProtocolMain,
    private readonly _windowManager: WindowManagerMain,
    _loggerFactory: LoggerFactoryMain,
    private readonly _ipc: AkariIpcMain
  ) {
    const logger = _loggerFactory.create(ChampSelectOverlayMain.id)
    const automaticDiagnostic = _loggerFactory.createAutomaticPositionDiagnosticSink(() =>
      this._positionCalibration.flushAutomaticDiagnostics()
    )
    this._positionCalibration = new ChampSelectPositionCalibrationController({
      platform: process.platform,
      context: () => ({
        pid: _leagueClient.state.isConnected ? (_leagueClient.state.auth?.pid ?? null) : null,
        phase: _leagueClient.data.gameflow.phase,
        counts: {
          candidates: _leagueClient.data.champSelect.session?.benchEnabled
            ? _leagueClient.data.champSelect.session.benchChampions.length
            : 0,
          teammates: _leagueClient.data.champSelect.session?.myTeam.length ?? 0
        },
        settings: _ongoingGame.settings.champSelectOverlay,
        sessionKey:
          _leagueClient.data.champSelect.session?.id ||
          String(_leagueClient.data.champSelect.session?.gameId || '')
      }),
      readWindow: getLeagueClientWindowSnapshot,
      toDip: (bounds) => screen.screenToDipRect(null, bounds),
      capture: captureChampSelectPosition,
      save: (value) => _ongoingGame.setChampSelectOverlay(value),
      automaticObservation: observeAutomaticPositionImage,
      automaticDiagnostic,
      exportSample: exportPositionSample
    })
    this._windowController = new ChampSelectOverlayWindowController({
      platform: process.platform,
      leagueClient: _leagueClient,
      ongoingGame: _ongoingGame,
      protocol: _protocol,
      windowManager: _windowManager,
      logger
    })
    this._candidateGrabController = new CandidateGrabController({
      platform: process.platform,
      leagueClient: _leagueClient,
      ongoingGame: _ongoingGame,
      logger,
      readClientWindow: getLeagueClientWindowSnapshot,
      onViewChanged: (sender, view, identity) => {
        _ipc.sendEventToWebContents(sender, ChampSelectOverlayMain.id, 'candidate-grab-state', {
          identity,
          busy: view.busy
        })
        this._candidateButtonWindowController.onGrantStateChanged(sender, identity)
      },
      onResult: (identity, result) =>
        _ipc.sendEvent(ChampSelectOverlayMain.id, 'candidate-grab-feedback', {
          identity,
          result
        })
    })
    this._candidateButtonWindowController = new CandidateButtonWindowController({
      platform: process.platform,
      leagueClient: _leagueClient,
      ongoingGame: _ongoingGame,
      protocol: _protocol,
      windowManager: _windowManager,
      logger,
      candidateGrab: this._candidateGrabController,
      getCandidateBandWindow: () => this._windowController.getCandidateBandWindow(),
      sendState: (sender, state) =>
        _ipc.sendEventToWebContents(
          sender,
          ChampSelectOverlayMain.id,
          'candidate-grab-state',
          state
        )
    })
    this._ipcHandlers = new ChampSelectOverlayIpcHandlers(
      _ipc,
      ChampSelectOverlayMain.id,
      this._candidateGrabController,
      this._candidateButtonWindowController
    )
  }

  async onInit() {
    registerPositionCalibrationIpc(
      this._ipc,
      ChampSelectOverlayMain.id,
      this._positionCalibration,
      () => this._windowManager.mainWindow.window?.webContents
    )
    this._ipcHandlers.register()
    this._candidateGrabController.start()
    this._windowController.start()
    this._candidateButtonWindowController.start()
  }

  getCandidateGrabView() {
    return this._candidateGrabController.refresh()
  }

  /** Main-only registration. Personal cards and statistics windows cannot obtain this capability. */
  registerCandidateActionWindow(
    window: BrowserWindow,
    role: CandidateCardRole,
    identity: CandidateGrabIdentity
  ) {
    return this._candidateGrabController.registerActionWindow(window, role, identity)
  }

  async onDispose() {
    this._positionCalibration.dispose()
    this._candidateButtonWindowController.dispose()
    this._candidateGrabController.dispose()
    this._windowController.dispose()
  }
}
