import { compareShallow } from 'mobx'

import type { TrayMainContext } from './context'
import type { TrayMenuController } from './tray-menu-controller'

export class TrayStateWatcher {
  constructor(
    private readonly context: TrayMainContext,
    private readonly menuController: TrayMenuController
  ) {}

  watch() {
    this._watchOngoingGameWindow()
    this._watchCdTimerWindow()
    this._watchLocale()
  }

  private _watchOngoingGameWindow() {
    const { mobxUtils, windowManager } = this.context

    mobxUtils.reaction(
      () => [
        windowManager.ongoingGameWindow.settings.enabled,
        windowManager.ongoingGameWindow.state.ready
      ],
      ([enabled, ready]) => {
        if (enabled && ready) {
          this.menuController.ongoingGameWindowDevTrayItem.enabled = true
        } else {
          this.menuController.ongoingGameWindowDevTrayItem.enabled = false
        }
      },
      { fireImmediately: true, equals: compareShallow }
    )
  }

  private _watchCdTimerWindow() {
    const { mobxUtils, windowManager } = this.context

    mobxUtils.reaction(
      () => [windowManager.cdTimerWindow.settings.enabled, windowManager.cdTimerWindow.state.ready],
      ([enabled, ready]) => {
        if (enabled && ready) {
          this.menuController.cdTimerWindowDevTrayItem.enabled = true
        } else {
          this.menuController.cdTimerWindowDevTrayItem.enabled = false
        }
      },
      { fireImmediately: true }
    )
  }

  private _watchLocale() {
    this.context.mobxUtils.reaction(
      () => this.context.appCommon.settings.locale,
      () => {
        this.menuController.rebuild()
      }
    )
  }
}
