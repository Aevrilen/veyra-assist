import 'reflect-metadata'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MainWindowUiMainContext } from './context'
import { MainWindowUiMainIpcHandlers } from './ipc-handlers'

const mock = vi.hoisted(() => ({ showOpenDialog: vi.fn() }))
vi.mock('electron', () => ({ dialog: mock, ipcMain: {}, webContents: {} }))

let select: (_event: unknown, defaultPath?: unknown) => Promise<string | null>
const window = {}
beforeEach(() => {
  mock.showOpenDialog.mockReset()
  const context = {
    namespace: 'main-window-ui-main',
    windowManager: { mainWindow: { window } },
    ipc: {
      onCall: (_namespace: string, name: string, callback: typeof select) => {
        if (name === 'selectClientExecutable') select = callback
      }
    }
  }
  new MainWindowUiMainIpcHandlers(context as unknown as MainWindowUiMainContext).register()
})
describe('client installation file picker', () => {
  it('passes only a string default path and returns one selected file', async () => {
    mock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['fixture-client-path', 'ignored-second-file']
    })
    expect(await select(undefined, 'C:\\游戏 中文\\Launcher\\Client.exe')).toBe(
      'fixture-client-path'
    )
    expect(mock.showOpenDialog).toHaveBeenLastCalledWith(
      window,
      expect.objectContaining({
        defaultPath: 'C:\\游戏 中文\\Launcher\\Client.exe',
        properties: ['openFile']
      })
    )
    expect(await select(undefined, { invalid: 'native argument' })).toBe('fixture-client-path')
    expect(mock.showOpenDialog).toHaveBeenLastCalledWith(
      window,
      expect.objectContaining({ defaultPath: undefined })
    )
  })
  it('returns null for cancellation without any save or launch action', async () => {
    mock.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    expect(await select(undefined)).toBeNull()
  })
})
