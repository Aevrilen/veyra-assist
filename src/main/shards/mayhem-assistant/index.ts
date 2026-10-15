import { NATIVE_SUPPORT, isElevated } from '@main/native'
import { IAkariShardInitDispose, Shard } from '@shared/akari-shard'
import { app } from 'electron'
import path from 'node:path'

import { AkariProtocolMain } from '../akari-protocol'
import { ExtraAssetsMain } from '../extra-assets'
import { GameClientMain } from '../game-client'
import { AkariIpcMain } from '../ipc'
import { LeagueClientMain } from '../league-client'
import { LoggerFactoryMain } from '../logger-factory'
import { NetworkMain } from '../network'
import { OngoingGameMain } from '../ongoing-game'
import { StorageMain } from '../storage'
import { WindowManagerMain } from '../window-manager'
import { MayhemDataLoader } from './data-loader'
import { FirstRunEnvironmentController } from './first-run-environment-controller'
import { MayhemIpcHandlers } from './ipc-handlers'
import { createMayhemOcrBackend } from './ocr-executor'
import { MayhemOverlayController } from './overlay-controller'
import { MAYHEM_WINDOW_PARTITION } from './window-controller'

@Shard(MayhemAssistantMain.id)
export class MayhemAssistantMain implements IAkariShardInitDispose {
  static id = 'mayhem-assistant-main'
  private readonly _controller: MayhemOverlayController
  private readonly _handlers: MayhemIpcHandlers
  constructor(
    leagueClient: LeagueClientMain,
    gameClient: GameClientMain,
    assets: ExtraAssetsMain,
    network: NetworkMain,
    loggerFactory: LoggerFactoryMain,
    ipc: AkariIpcMain,
    ongoingGame: OngoingGameMain,
    private readonly _protocol: AkariProtocolMain,
    windowManager: WindowManagerMain,
    storage: StorageMain
  ) {
    const logger = loggerFactory.create(MayhemAssistantMain.id)
    const directory = path.join(app.getPath('userData'), 'mayhem-assistant')
    const loader = new MayhemDataLoader(
      network.createAxiosClient({ timeout: 8000 }),
      path.join(directory, 'statistics'),
      logger
    )
    this._controller = new MayhemOverlayController(
      leagueClient,
      gameClient,
      assets,
      loader,
      directory,
      logger,
      ongoingGame,
      createMayhemOcrBackend(
        path.join(app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked'), 'resources', 'ocr')
      ),
      () => gameClient.getGameClientWindowSnapshot()
    )
    const firstRunEnvironment = new FirstRunEnvironmentController(() => {
      const diagnostics = this._controller.diagnostics()
      const data = leagueClient.data
      const gameActive = data.gameflow.phase === 'InProgress' && data.gameflow.session !== null
      const ownSummoner = data.summoner.me
      const gameId = data.gameflow.session?.gameData.gameId
      const currentSession =
        gameActive &&
        ownSummoner !== null &&
        this._controller.session.sessionKey === `${ownSummoner.puuid}:${gameId}`
      return {
        platform: process.platform,
        arch: process.arch,
        elevated: isElevated,
        nativeInitialized: NATIVE_SUPPORT.getLeagueClientWindowPlacement.available,
        databaseInitialized: storage.dataSource.isInitialized,
        dataDirectoryWritable: this._controller.dataDirectoryWritable,
        ocr: {
          started: diagnostics.ocrPreloadStarted,
          ready: diagnostics.ocrPreloadReady,
          failed: diagnostics.ocrFailure !== null
        },
        clientConnected: leagueClient.state.connectionState === 'connected',
        gameActive,
        gameObservation:
          currentSession && diagnostics.lastObservationAt > 0
            ? {
                observedAt: diagnostics.lastObservationAt,
                windowStable: diagnostics.gameWindowStable,
                displayCompatible: diagnostics.capture.gameWindowReady === true,
                foreground:
                  diagnostics.capture.foregroundAfter === true
                    ? true
                    : diagnostics.capture.foregroundAfter === false
                      ? false
                      : null,
                captureSucceeded:
                  diagnostics.capture.foregroundAfter === true &&
                  diagnostics.capture.readinessReason === null
              }
            : null,
        legacyCalibrationPresent: this._controller.legacyCalibrationPresent,
        calibration: this._controller.firstRunCalibrationStatus()
      }
    })
    this._handlers = new MayhemIpcHandlers(
      ipc,
      this._controller,
      (id) => {
        const window = windowManager.mainWindow.window
        return !!window && !window.isDestroyed() && window.webContents.id === id
      },
      () => firstRunEnvironment.getStatus()
    )
  }
  async onInit() {
    if (process.platform === 'win32') this._protocol.registerPartition(MAYHEM_WINDOW_PARTITION)
    this._handlers.register()
    this._controller.start()
  }
  async onDispose() {
    this._controller.dispose()
    if (process.platform === 'win32') this._protocol.unregisterPartition(MAYHEM_WINDOW_PARTITION)
  }
}
