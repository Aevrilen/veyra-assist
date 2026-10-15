import { AkariIpcRenderer } from '@renderer-shared/shards/ipc'
import { LeagueClientRenderer } from '@renderer-shared/shards/league-client'
import { LoggerRenderer } from '@renderer-shared/shards/logger'
import { SettingUtilsRenderer } from '@renderer-shared/shards/setting-utils'
import { SetupInAppScopeRenderer } from '@renderer-shared/shards/setup-in-app-scope'
import { WindowManagerRenderer } from '@renderer-shared/shards/window-manager'
import { Dep, IAkariShardInitDispose, Shard } from '@shared/akari-shard'
import type {
  PositionCalibrationStatus,
  PositionSelection
} from '@shared/champ-select-overlay/position-calibration'
import type { ClientLaunchConfiguration } from '@shared/shards/client-installation'
import {
  FIRST_RUN_ENVIRONMENT_STATUS_CALL,
  type FirstRunEnvironmentStatus
} from '@shared/types/first-run-environment'

import { watchAutoRouteWhenGameStarts } from './auto-route-watcher'
import {
  MainWindowBackgroundController,
  type MainWindowBackgroundMode
} from './background-controller'
import {
  MAIN_WINDOW_UI_MAIN_NAMESPACE,
  MAIN_WINDOW_UI_RENDERER_NAMESPACE,
  type MainWindowUiRendererContext
} from './context'
import { syncMainWindowUiSettings } from './settings-sync'
import { useMainWindowUiStore } from './store'

export type { MainWindowBackgroundMode } from './background-controller'

@Shard(MainWindowUiRenderer.id)
export class MainWindowUiRenderer implements IAkariShardInitDispose {
  static id = MAIN_WINDOW_UI_RENDERER_NAMESPACE

  private readonly _context: MainWindowUiRendererContext
  private readonly _backgroundController: MainWindowBackgroundController

  constructor(
    @Dep(AkariIpcRenderer) private readonly _ipc: AkariIpcRenderer,
    @Dep(SettingUtilsRenderer) private readonly _settingUtils: SettingUtilsRenderer,
    @Dep(LeagueClientRenderer) private readonly _leagueClient: LeagueClientRenderer,
    @Dep(LoggerRenderer) private readonly _logger: LoggerRenderer,
    @Dep(SetupInAppScopeRenderer) private readonly _setupInAppScope: SetupInAppScopeRenderer,
    @Dep(WindowManagerRenderer) private readonly _windowManager: WindowManagerRenderer
  ) {
    this._context = {
      namespace: MainWindowUiRenderer.id,
      ipc: this._ipc,
      settingUtils: this._settingUtils,
      leagueClient: this._leagueClient,
      logger: this._logger,
      setupInAppScope: this._setupInAppScope,
      windowManager: this._windowManager
    }
    this._backgroundController = new MainWindowBackgroundController(this._context)
  }

  async onInit() {
    await syncMainWindowUiSettings(this._context)
    this._setupInAppScope.addSetupFn(() => {
      this._backgroundController.setup()
      watchAutoRouteWhenGameStarts()
    })
  }

  async onDispose() {}

  getMayhemSetupStatus(): Promise<{ supported: boolean; calibrated: boolean }> {
    return this._context.ipc.call('mayhem-assistant-main', 'setupStatus')
  }

  openMayhemSetup(): Promise<void> {
    return this._context.ipc.call('mayhem-assistant-main', 'openSetup')
  }

  getFirstRunEnvironmentStatus(): Promise<FirstRunEnvironmentStatus> {
    return this._context.ipc.call('mayhem-assistant-main', FIRST_RUN_ENVIRONMENT_STATUS_CALL)
  }

  getChampSelectPositionStatus(): Promise<PositionCalibrationStatus> {
    return this._ipc.call('champ-select-overlay-main', 'positionStatus')
  }
  beginChampSelectPosition(): Promise<PositionCalibrationStatus> {
    return this._ipc.call('champ-select-overlay-main', 'beginPosition')
  }
  beginAutomaticChampSelectPosition(): Promise<PositionCalibrationStatus> {
    return this._ipc.call('champ-select-overlay-main', 'beginAutomaticPosition')
  }
  exportChampSelectPositionSample(requestId: string): Promise<boolean> {
    return this._ipc.call('champ-select-overlay-main', 'exportPositionSample', requestId)
  }
  getChampSelectPositionPreview(requestId: string): Promise<string | null> {
    return this._ipc.call('champ-select-overlay-main', 'positionPreview', requestId)
  }
  cancelChampSelectPosition(): Promise<boolean> {
    return this._ipc.call('champ-select-overlay-main', 'cancelPosition')
  }
  saveChampSelectPosition(
    requestId: string,
    selection: PositionSelection
  ): Promise<PositionCalibrationStatus> {
    // Vue refs expose proxies that Electron cannot clone across the preload boundary.
    // Copy only this JSON-shaped payload; keep the live editing draft intact on failure.
    const plainSelection: PositionSelection = JSON.parse(JSON.stringify(selection))
    return this._ipc.call('champ-select-overlay-main', 'savePosition', {
      requestId,
      selection: plainSelection
    })
  }

  selectClientExecutable(defaultPath?: string): Promise<string | null> {
    return this._context.ipc.call(
      MAIN_WINDOW_UI_MAIN_NAMESPACE,
      'selectClientExecutable',
      defaultPath
    )
  }

  async setClientLaunchConfiguration(configuration: ClientLaunchConfiguration) {
    await this._context.settingUtils.set(
      MAIN_WINDOW_UI_RENDERER_NAMESPACE,
      'clientLaunchConfiguration',
      configuration
    )
    useMainWindowUiStore().frontendSettings.clientLaunchConfiguration = configuration
  }

  useBackgroundPresentation() {
    return this._backgroundController.usePresentation()
  }

  useBackgroundMode() {
    return this._backgroundController.useMode()
  }

  setBackgroundMode(mode: MainWindowBackgroundMode) {
    return this._backgroundController.setMode(mode)
  }

  useCustomBackgroundSettings() {
    return this._backgroundController.useCustomBackgroundSettings()
  }

  selectCustomBackgroundFile() {
    return this._backgroundController.selectCustomBackgroundFile()
  }

  setCustomBackgroundOverlayStrength(strength: number) {
    return this._backgroundController.setCustomBackgroundOverlayStrength(strength)
  }

  reportBackgroundMediaLoadFailure(url: string) {
    return this._backgroundController.reportBackgroundMediaLoadFailure(url)
  }
}
