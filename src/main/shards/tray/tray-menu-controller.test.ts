import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

import { TrayMenuController } from './tray-menu-controller'

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

describe('tray windows after OP.GG retirement', () => {
  it('retains Mini and other window tools without an OP.GG open or developer entry', () => {
    menus.length = 0
    const createWindow = () => ({
      settings: { enabled: true },
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
    new TrayMenuController({ windowManager, ipc: {} } as any).build()
    const items = menus.flat()
    expect(items.find((item) => item.label === 'tray.opggWindow')).toBeUndefined()
    expect(items.find((item) => item.label === 'tray.dev.toggleOpggWindowDevtools')).toBeUndefined()
    items.find((item) => item.label === 'tray.auxWindow').click()
    expect(windowManager.auxWindow.showOrRestore).toHaveBeenCalledOnce()
    items.find((item) => item.label === 'tray.adjustAllWindowPositions').click()
    expect(windowManager.opggWindow.repositionWindowIfInvisible).not.toHaveBeenCalled()
    expect(windowManager.mainWindow.repositionWindowIfInvisible).toHaveBeenCalledOnce()
    expect(windowManager.auxWindow.repositionWindowIfInvisible).toHaveBeenCalledOnce()
    expect(windowManager.ongoingGameWindow.repositionWindowIfInvisible).toHaveBeenCalledOnce()
    expect(windowManager.cdTimerWindow.repositionWindowIfInvisible).toHaveBeenCalledOnce()
  })
})
