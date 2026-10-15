import { BrowserWindow, Notification } from 'electron'
import { observable, reaction, runInAction } from 'mobx'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BaseAkariWindow } from '../base-akari-window'
import { AkariAuxWindow } from './window'

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
vi.mock('../window-position-service', () => ({ repositionWindowIfInvisible: vi.fn() }))

const disposers: (() => void)[] = []
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose())
  vi.useRealTimers()
  vi.clearAllMocks()
})

function createContext(enabled = true) {
  const calls = new Map<string, Function>()
  const storageSet = vi.fn()
  const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
  const persisted = { enabled, autoShow: true, pinned: false, opacity: 0.7 }
  const trackedBounds = { x: 120, y: 80, width: 340, height: 420 }
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
        _getFromStorage: vi.fn(async (key) => (key === 'trackedBounds' ? trackedBounds : false)),
        _saveToStorage: storageSet,
        set: storageSet
      }))
    },
    loggerFactory: { create: () => logger },
    appCommon: {},
    gameClient: {},
    leagueClient: {
      state: observable({ connectionState: 'connected' }),
      data: {
        gameflow: observable({ phase: 'None' }),
        champSelect: { session: { isSpectating: false } }
      }
    },
    protocol: { registerPartition: vi.fn() },
    keyboardShortcuts,
    windowManager: {
      settings: observable({ contentProtection: false }),
      state: observable({ isManagerFinishedInit: false })
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
  return { context, calls, persisted, trackedBounds, storageSet, keyboardShortcuts, logger }
}

const retired = { result: 'retired', reason: 'WindowRetired' }

describe('retired legacy Mini window', () => {
  it.each([true, false])(
    'ignores saved enabled=%s without rewriting the user settings',
    async (enabled) => {
      vi.useFakeTimers()
      const f = createContext(enabled)
      const window = new AkariAuxWindow(f.context as any)
      await window.onInit()
      runInAction(() => (f.context.windowManager.state.isManagerFinishedInit = true))
      for (const phase of [
        'Lobby',
        'Matchmaking',
        'ReadyCheck',
        'ChampSelect',
        'InProgress',
        'EndOfGame',
        'None'
      ]) {
        runInAction(() => (f.context.leagueClient.data.gameflow.phase = phase))
        await vi.advanceTimersByTimeAsync(600)
      }
      expect(BrowserWindow).not.toHaveBeenCalled()
      expect(Notification).not.toHaveBeenCalled()
      expect(window.state.show).toBe(false)
      expect(window.state.ready).toBe(false)
      expect(window.state.focus).toBe('blurred')
      expect(window.state.trackedBounds).toEqual(f.trackedBounds)
      expect(window.settings).toMatchObject(f.persisted)
      expect(f.keyboardShortcuts.register).not.toHaveBeenCalled()
      expect(f.storageSet).not.toHaveBeenCalled()
      expect(f.logger.info).toHaveBeenCalledExactlyOnceWith(
        'Legacy Mini window retired: automatic/manual entry disabled; saved settings preserved'
      )
      expect(f.context.mobxUtils.propSync).toHaveBeenCalledWith(
        'window-manager-main/aux-window',
        'settings',
        window.settings,
        ['opacity', 'pinned', 'enabled', 'autoShow']
      )
    }
  )

  it('rejects direct, inherited creation and legacy IPC open paths', async () => {
    const f = createContext()
    const window = new AkariAuxWindow(f.context as any)
    await window.onInit()
    expect(window.createWindow()).toEqual(retired)
    expect(window.show()).toEqual(retired)
    expect(window.show(true)).toEqual(retired)
    expect(window.showOrRestore()).toEqual(retired)
    expect(window.showOrRestore(true)).toEqual(retired)
    expect(window.toggleMinimizedAndFocused()).toEqual(retired)
    expect(window.toggleDevtools()).toEqual(retired)
    BaseAkariWindow.prototype.createWindow.call(window)
    expect(f.calls.get('window-manager-main/aux-window:show')!({}, false)).toEqual(retired)
    expect(await f.calls.get('window-manager-main/aux-window:toggleDevtools')!({})).toEqual(retired)
    expect(
      f.calls.get('window-manager-main/aux-window:repositionToAlignLeagueClientUx')!({})
    ).toEqual(retired)
    for (const name of ['restore', 'maximize', 'unmaximize']) {
      await f.calls.get(`window-manager-main/aux-window:${name}`)!({})
    }
    expect(BrowserWindow).not.toHaveBeenCalled()
    expect(window.window).toBeNull()
    expect(window.state.show).toBe(false)
    expect(f.storageSet).not.toHaveBeenCalled()
    expect(f.logger.info).toHaveBeenCalledExactlyOnceWith(
      'Legacy Mini window retired: automatic/manual entry disabled; saved settings preserved'
    )
  })

  it('cannot revive through saved-setting changes, reconnects or candidate-button fallback', async () => {
    vi.useFakeTimers()
    const f = createContext()
    const window = new AkariAuxWindow(f.context as any)
    await window.onInit()
    runInAction(() => {
      f.context.windowManager.state.isManagerFinishedInit = true
      window.settings.setEnabled(false)
      window.settings.setAutoShow(false)
    })
    await vi.advanceTimersByTimeAsync(600)
    runInAction(() => {
      window.settings.setEnabled(true)
      window.settings.setAutoShow(true)
      f.context.leagueClient.data.gameflow.phase = 'ChampSelect'
    })
    for (const visible of [true, false, true, false]) {
      expect(window.setBenchCandidateButtonsVisible(visible)).toEqual(retired)
    }
    runInAction(() => (f.context.leagueClient.state.connectionState = 'disconnected'))
    runInAction(() => (f.context.leagueClient.state.connectionState = 'connected'))
    await vi.advanceTimersByTimeAsync(600)
    expect(BrowserWindow).not.toHaveBeenCalled()
    expect(window.state.show).toBe(false)
    expect(window.state.ready).toBe(false)
    expect(f.keyboardShortcuts.register).not.toHaveBeenCalled()
    expect(f.storageSet).not.toHaveBeenCalled()
    expect(f.logger.info).toHaveBeenCalledExactlyOnceWith(
      'Legacy Mini window retired: automatic/manual entry disabled; saved settings preserved'
    )
  })
})
