import { BrowserWindow } from 'electron'
import { observable, reaction, runInAction } from 'mobx'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BaseAkariWindow } from '../base-akari-window'
import { AkariOpggWindow } from './window'

vi.mock('@resources/LA_ICON.ico?asset&asarUnpack', () => ({ default: 'offline-icon' }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('@main/i18n', () => ({ i18next: { t: (key: string) => key } }))
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  Notification: vi.fn(),
  app: {},
  dialog: {},
  shell: {}
}))
vi.mock('../window-position-service', () => ({
  repositionWindowIfInvisible: vi.fn(),
  repositionToAlignLeagueClientUx: vi.fn()
}))

const disposers: (() => void)[] = []
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose())
  vi.clearAllMocks()
})

function createContext() {
  const calls = new Map<string, Function>()
  const storageSet = vi.fn()
  const persisted = {
    enabled: true,
    autoShow: true,
    showShortcut: 'Control+Alt+O',
    showSkinSelector: true
  }
  const keyboardShortcuts = { register: vi.fn(), unregisterByTargetId: vi.fn() }
  const context = {
    namespace: 'window-manager-main',
    ipc: {
      onCall: (namespace: string, name: string, fn: Function) =>
        calls.set(`${namespace}:${name}`, fn)
    },
    settingFactory: {
      register: vi.fn((_namespace, _schema, settings) => ({
        applyToState: vi.fn(async () => {
          runInAction(() => Object.assign(settings, persisted))
        }),
        _getFromStorage: vi.fn(async (key) => (key === 'quickCloseTip' ? true : undefined)),
        _saveToStorage: storageSet,
        set: storageSet
      }))
    },
    loggerFactory: { create: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }) },
    appCommon: {},
    gameClient: {},
    leagueClient: {
      state: observable({ connectionState: 'connected' }),
      data: {
        gameflow: observable({ phase: 'ChampSelect' }),
        champSelect: { session: { isSpectating: false } }
      }
    },
    protocol: { registerPartition: vi.fn() },
    keyboardShortcuts,
    windowManager: {
      settings: observable({ contentProtection: false }),
      state: observable({ isManagerFinishedInit: false }),
      opggWindow: { settings: { enabled: true, autoShow: true }, state: { show: true } }
    },
    mobxUtils: {
      propSync: vi.fn(),
      reaction: (expression: any, effect: any, options: any) => {
        const dispose = reaction(expression, effect, options)
        disposers.push(dispose)
        return dispose
      }
    },
    shared: { global: { platform: 'win32', isReadyToQuit: false } }
  }
  return { context, calls, persisted, storageSet, keyboardShortcuts }
}

describe('retired OP.GG window with saved enabled flags', () => {
  it('reads and syncs saved values but cannot create, show, restore or open DevTools', async () => {
    const f = createContext()
    const window = new AkariOpggWindow(f.context as any)
    await window.onInit()
    runInAction(() => (f.context.windowManager.state.isManagerFinishedInit = true))
    const retired = { result: 'retired', reason: 'WindowRetired' }
    expect(window.createWindow()).toEqual(retired)
    expect(window.show()).toEqual(retired)
    expect(window.show(true)).toEqual(retired)
    expect(window.showOrRestore()).toEqual(retired)
    expect(window.toggleDevtools()).toEqual(retired)
    BaseAkariWindow.prototype.createWindow.call(window)
    expect(f.calls.get('window-manager-main/opgg-window:show')!({}, false)).toEqual(retired)
    expect(await f.calls.get('window-manager-main/opgg-window:toggleDevtools')!({})).toEqual(
      retired
    )
    expect(BrowserWindow).not.toHaveBeenCalled()
    expect(window.state.show).toBe(false)
    expect(window.state.ready).toBe(false)
    expect(window.settings.enabled).toBe(true)
    expect(window.settings.autoShow).toBe(true)
    expect(window.settings.showShortcut).toBe(f.persisted.showShortcut)
    expect(window.settings.showSkinSelector).toBe(true)
    expect(f.keyboardShortcuts.register).not.toHaveBeenCalled()
    expect(f.storageSet).not.toHaveBeenCalled()
  })

  it('does not register shortcuts when old settings are changed after initialization', async () => {
    const f = createContext()
    const window = new AkariOpggWindow(f.context as any)
    await window.onInit()
    runInAction(() => {
      window.settings.setEnabled(false)
      window.settings.setEnabled(true)
      window.settings.setAutoShow(true)
      window.settings.setShowShortcut('Alt+O')
    })
    expect(f.keyboardShortcuts.register).not.toHaveBeenCalled()
    expect(BrowserWindow).not.toHaveBeenCalled()
    expect(f.storageSet).not.toHaveBeenCalled()
  })
})
