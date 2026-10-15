import icon from '@resources/LA_ICON.ico?asset&asarUnpack'
import { z } from 'zod'

import { BaseAkariWindow } from '../base-akari-window'
import type { WindowManagerMainContext } from '../context'
import { OpggWindowSettings, OpggWindowState } from './state'

const WINDOW_RETIRED = { result: 'retired', reason: 'WindowRetired' } as const

export class AkariOpggWindow extends BaseAkariWindow<OpggWindowState, OpggWindowSettings> {
  static readonly NAMESPACE_SUFFIX = 'opgg-window'
  static readonly HTML_ENTRY = 'opgg-window.html'
  static readonly TITLE = 'Veyra Assist - Champion Data'
  static readonly BASE_WIDTH = 480
  static readonly BASE_HEIGHT = 720
  static readonly MIN_WIDTH = 530
  static readonly MIN_HEIGHT = 530

  public shortcutTargetId: string

  constructor(_context: WindowManagerMainContext) {
    const state = new OpggWindowState()
    state.setShow(false)
    state.setFocus('blurred')
    const settings = new OpggWindowSettings()

    super(_context, AkariOpggWindow.NAMESPACE_SUFFIX, state, settings, {
      baseWidth: AkariOpggWindow.BASE_WIDTH,
      baseHeight: AkariOpggWindow.BASE_HEIGHT,
      minWidth: AkariOpggWindow.MIN_WIDTH,
      minHeight: AkariOpggWindow.MIN_HEIGHT,
      htmlEntry: AkariOpggWindow.HTML_ENTRY,
      rememberPosition: true,
      rememberSize: true,
      repositionWindowIfInvisible: true,
      settingSchema: {
        enabled: { default: settings.enabled, schema: z.boolean() },
        autoShow: { default: settings.autoShow, schema: z.boolean() },
        showShortcut: { default: settings.showShortcut, schema: z.string().nullable() },
        showSkinSelector: { default: settings.showSkinSelector, schema: z.boolean() }
      },
      browserWindowOptions: {
        title: AkariOpggWindow.TITLE,
        icon: icon,
        show: false,
        fullscreenable: false,
        frame: false,
        maximizable: false,
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: 8, y: 8 }
      }
    })

    this.shortcutTargetId = `${this._namespace}/show`
  }

  // Retain settings, sync contracts, renderer source and shared data providers.
  // Retirement is a runtime window policy; saved enabled/autoShow/shortcut values stay intact.
  override async onInit() {
    await super.onInit()
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

  override toggleDevtools() {
    return WINDOW_RETIRED
  }

  protected override getSettingPropKeys() {
    return ['enabled', 'autoShow', 'showShortcut', 'showSkinSelector'] as const
  }
}
