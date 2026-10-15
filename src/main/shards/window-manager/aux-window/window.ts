import icon from '@resources/LA_ICON.ico?asset&asarUnpack'
import { z } from 'zod'

import { BaseAkariWindow } from '../base-akari-window'
import type { WindowManagerMainContext } from '../context'
import { AuxWindowSettings, AuxWindowState } from './state'

const WINDOW_RETIRED = { result: 'retired', reason: 'WindowRetired' } as const

export class AkariAuxWindow extends BaseAkariWindow<AuxWindowState, AuxWindowSettings> {
  static readonly NAMESPACE_SUFFIX = 'aux-window'
  static readonly HTML_ENTRY = 'aux-window.html'
  static readonly TITLE = 'Veyra Assist - Mini'
  static readonly BASE_WIDTH = 340
  static readonly BASE_HEIGHT = 420
  static readonly MIN_WIDTH = 340
  static readonly MIN_HEIGHT = 420

  constructor(_context: WindowManagerMainContext) {
    const state = new AuxWindowState()
    state.setShow(false)
    state.setFocus('blurred')
    const settings = new AuxWindowSettings()

    super(_context, AkariAuxWindow.NAMESPACE_SUFFIX, state, settings, {
      baseWidth: AkariAuxWindow.BASE_WIDTH,
      baseHeight: AkariAuxWindow.BASE_HEIGHT,
      minWidth: AkariAuxWindow.MIN_WIDTH,
      minHeight: AkariAuxWindow.MIN_HEIGHT,
      htmlEntry: AkariAuxWindow.HTML_ENTRY,
      rememberPosition: true,
      rememberSize: true,
      repositionWindowIfInvisible: true,
      settingSchema: {
        enabled: { default: settings.enabled, schema: z.boolean() },
        autoShow: { default: settings.autoShow, schema: z.boolean() }
      },
      browserWindowOptions: {
        title: AkariAuxWindow.TITLE,
        icon: icon,
        show: false,
        frame: false,
        fullscreenable: false,
        maximizable: false,
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: 8, y: 8 }
      }
    })
  }

  // Keep legacy settings and renderer sync compatible, but never create the retired Mini UI.
  // Saved enabled/autoShow values are ignored rather than rewriting the user's configuration.
  override async onInit() {
    await super.onInit()
    this._ipc.onCall(this._namespace, 'repositionToAlignLeagueClientUx', () => WINDOW_RETIRED)
    this._logger.info(
      'Legacy Mini window retired: automatic/manual entry disabled; saved settings preserved'
    )
  }

  protected override _createWindow() {
    return WINDOW_RETIRED
  }

  override createWindow() {
    return WINDOW_RETIRED
  }

  override show(_inactive = false) {
    return WINDOW_RETIRED
  }

  override showOrRestore(_inactive = false) {
    return WINDOW_RETIRED
  }

  override toggleMinimizedAndFocused() {
    return WINDOW_RETIRED
  }

  override toggleDevtools() {
    return WINDOW_RETIRED
  }

  // Candidate-button visibility still publishes here; it must no longer revive a Mini fallback.
  setBenchCandidateButtonsVisible(_visible: boolean) {
    return WINDOW_RETIRED
  }

  protected override getSettingPropKeys() {
    return ['enabled', 'autoShow'] as const
  }
}
