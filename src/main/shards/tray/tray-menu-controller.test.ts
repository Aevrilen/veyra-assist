import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

import { TrayMenuController } from './tray-menu-controller'
import { TrayStateWatcher } from './tray-state-watcher'

vi.mock('@resources/LA_ICON.ico?asset', () => ({ default: 'offline-icon' }))
vi.mock('@resources/iconTemplate.png?asset', () => ({ default: 'offline-macos-icon' }))
vi.mock('../app-common', () => ({ AppCommonMain: { id: 'app-common-main' } }))
vi.mock('i18next', () => ({ default: { t: (key: string) => key } }))
const { menus } = vi.hoisted(() => ({ menus: [] as any[][] }))
vi.mock('electron', () => ({
  MenuItem: class {
    constructor(options: object) {
      Object.assign(this, options)
    }
  },
  Menu: {
    buildFromTemplate: (template: any[]) => {
      menus.push(template)
      return { items: template }
    },
    setApplicationMenu: vi.fn()
  },
  Tray: class extends EventEmitter {
    setToolTip() {}
  },
  app: {},
  nativeImage: {}
}))

describe('tray windows after legacy window retirement', () => {
  it('retains active window tools without Mini or OP.GG open/developer entries', () => {
    menus.length = 0
    const createWindow = () => ({
      settings: { enabled: true },
      state: { ready: true },
      showOrRestore: vi.fn(),
      toggleDevtools: vi.fn(),
      repositionWindowIfInvisible: vi.fn(),
      close: vi.fn()
    })
    const windowManager = {
      mainWindow: createWindow(),
      auxWindow: createWindow(),
      opggWindow: createWindow(),
      ongoingGameWindow: createWindow(),
      cdTimerWindow: createWindow()
    }
    const reactions: { read: Function; effect: Function }[] = []
    const context = {
      windowManager,
      ipc: {},
      appCommon: { settings: { locale: 'zh-CN' } },
      mobxUtils: {
        reaction: (read: Function, effect: Function, options: any) => {
          reactions.push({ read, effect })
          if (options?.fireImmediately) effect(read())
        }
      }
    }
    const controller = new TrayMenuController(context as any)
    controller.build()
    new TrayStateWatcher(context as any, controller).watch()
    expect(controller.ongoingGameWindowDevTrayItem.enabled).toBe(true)
    expect(controller.cdTimerWindowDevTrayItem.enabled).toBe(true)
    windowManager.ongoingGameWindow.state.ready = false
    windowManager.cdTimerWindow.state.ready = false
    for (const { read, effect } of reactions.slice(0, 2)) effect(read())
    expect(controller.ongoingGameWindowDevTrayItem.enabled).toBe(false)
    expect(controller.cdTimerWindowDevTrayItem.enabled).toBe(false)
    const items = menus.flat()
    expect(items.find((item) => item.label === 'tray.opggWindow')).toBeUndefined()
    expect(items.find((item) => item.label === 'tray.dev.toggleOpggWindowDevtools')).toBeUndefined()
    expect(items.find((item) => item.label === 'tray.auxWindow')).toBeUndefined()
    expect(items.find((item) => item.label === 'tray.dev.toggleAuxWindowDevtools')).toBeUndefined()
    expect(items.find((item) => item.id === 'aux-window-dev')).toBeUndefined()
    items.find((item) => item.label === 'Veyra Assist').click()
    expect(windowManager.mainWindow.showOrRestore).toHaveBeenCalledOnce()
    expect(windowManager.auxWindow.showOrRestore).not.toHaveBeenCalled()
    items.find((item) => item.label === 'tray.adjustAllWindowPositions').click()
    expect(windowManager.opggWindow.repositionWindowIfInvisible).not.toHaveBeenCalled()
    expect(windowManager.mainWindow.repositionWindowIfInvisible).toHaveBeenCalledOnce()
    expect(windowManager.auxWindow.repositionWindowIfInvisible).not.toHaveBeenCalled()
    expect(windowManager.ongoingGameWindow.repositionWindowIfInvisible).toHaveBeenCalledOnce()
    expect(windowManager.cdTimerWindow.repositionWindowIfInvisible).toHaveBeenCalledOnce()
  })
})
