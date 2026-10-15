import { AppCommonRenderer } from '@renderer-shared/shards/app-common'
import { ClientInstallationRenderer } from '@renderer-shared/shards/client-installation'
import { AkariIpcRenderer } from '@renderer-shared/shards/ipc'
import { LeagueClientRenderer } from '@renderer-shared/shards/league-client'
import { LeagueClientUxRenderer } from '@renderer-shared/shards/league-client-ux'
import { SettingUtilsRenderer } from '@renderer-shared/shards/setting-utils'
import { SetupInAppScopeRenderer } from '@renderer-shared/shards/setup-in-app-scope'
import { Dep, IAkariShardInitDispose, Shard } from '@shared/akari-shard'

import { watchAutoReconnectNotification } from './connection-notifications'
import {
  LAST_DISMISS_LIVE_STREAMING_STREAMER_MODE_SETTING_KEY,
  NEVER_SHOW_BAD_SGP_CONNECTION_SETTING_KEY,
  NEVER_SHOW_LIVE_STREAMING_STREAMER_MODE_SETTING_KEY,
  SIMPLE_NOTIFICATIONS_RENDERER_ID,
  type SimpleNotificationsRendererContext
} from './context'
import { registerDeclarationModal } from './declaration-modal'
import { createElevatedStartupNotificationSetup } from './elevated-startup-notification'
import { registerFunnyPricingModal } from './funny-pricing-modal'
import { watchSpecialKeyboardCombo } from './keyboard-combo-controller'
import { watchQueueingProgress } from './queueing-progress-task'
import { setupStreamerModeNotifications } from './streamer-mode-notifications'
import {
  watchAskUserToRunAsAdministrator,
  watchBadSgpConnectionWarning,
  watchCannotGetUxCommandLine,
  watchHigherVersionDbWarning,
  watchRunInTempDirWarning
} from './system-warning-dialogs'

/**
 * 主窗口常驻通知中心。
 */
@Shard(SimpleNotificationsRenderer.id)
export class SimpleNotificationsRenderer implements IAkariShardInitDispose {
  static id = SIMPLE_NOTIFICATIONS_RENDERER_ID

  static NEVER_SHOW_SETTING_KEY = NEVER_SHOW_LIVE_STREAMING_STREAMER_MODE_SETTING_KEY
  static LAST_DISMISS_SETTING_KEY = LAST_DISMISS_LIVE_STREAMING_STREAMER_MODE_SETTING_KEY
  static NEVER_SHOW_BAD_SGP_CONNECTION_SETTING_KEY = NEVER_SHOW_BAD_SGP_CONNECTION_SETTING_KEY

  private readonly context: SimpleNotificationsRendererContext

  constructor(
    @Dep(ClientInstallationRenderer) readonly clientInstallation: ClientInstallationRenderer,
    @Dep(AppCommonRenderer) readonly appCommon: AppCommonRenderer,
    @Dep(SettingUtilsRenderer) settingUtils: SettingUtilsRenderer,
    @Dep(LeagueClientRenderer) leagueClient: LeagueClientRenderer,
    @Dep(SetupInAppScopeRenderer) private readonly setupInAppScope: SetupInAppScopeRenderer,
    @Dep(LeagueClientUxRenderer) readonly leagueClientUx: LeagueClientUxRenderer,
    @Dep(AkariIpcRenderer) readonly ipc: AkariIpcRenderer
  ) {
    this.context = {
      clientInstallation,
      appCommon,
      settingUtils,
      leagueClient,
      setupInAppScope,
      leagueClientUx,
      ipc
    }
  }

  async onInit() {
    registerDeclarationModal(this.context)
    registerFunnyPricingModal(this.context)

    this.setupInAppScope.addSetupFn(createElevatedStartupNotificationSetup())
    this.setupInAppScope.addSetupFn(() => watchSpecialKeyboardCombo())
    this.setupInAppScope.addSetupFn(() => setupStreamerModeNotifications(this.context))
    this.setupInAppScope.addSetupFn(() => watchQueueingProgress())
    this.setupInAppScope.addSetupFn(() => watchAskUserToRunAsAdministrator())
    this.setupInAppScope.addSetupFn(() => watchCannotGetUxCommandLine())
    this.setupInAppScope.addSetupFn(() => watchHigherVersionDbWarning())
    this.setupInAppScope.addSetupFn(() => watchBadSgpConnectionWarning(this.context))
    this.setupInAppScope.addSetupFn(() => watchAutoReconnectNotification())
    this.setupInAppScope.addSetupFn(() => watchRunInTempDirWarning())
  }
}
