import { dialog } from 'electron'

import { AkariIpcError } from '../ipc'
import type { MainWindowUiMainContext } from './context'

export class MainWindowUiMainIpcHandlers {
  constructor(private readonly _context: MainWindowUiMainContext) {}

  register() {
    this._context.ipc.onCall(
      this._context.namespace,
      'selectClientExecutable',
      async (_, defaultPath?: unknown) => {
        if (process.platform !== 'win32' && process.platform !== 'darwin') {
          throw new AkariIpcError(
            'Client selection is unsupported on this platform',
            'UnsupportedPlatform'
          )
        }
        const result = await dialog.showOpenDialog(this._getMainWindow(), {
          defaultPath: typeof defaultPath === 'string' ? defaultPath || undefined : undefined,
          properties: ['openFile'],
          filters: [
            { name: 'Game clients', extensions: process.platform === 'win32' ? ['exe'] : ['app'] }
          ]
        })
        return result.canceled ? null : (result.filePaths[0] ?? null)
      }
    )

    this._context.ipc.onCall(
      this._context.namespace,
      'selectBackgroundFile',
      async (_, defaultPath?: string) => {
        const result = await dialog.showOpenDialog(this._getMainWindow(), {
          defaultPath: defaultPath || undefined,
          properties: ['openFile'],
          filters: [
            {
              name: 'Wallpapers',
              extensions: [
                'png',
                'jpg',
                'jpeg',
                'webp',
                'bmp',
                'gif',
                'avif',
                'mp4',
                'webm',
                'mov',
                'm4v',
                'ogv'
              ]
            }
          ]
        })

        if (result.canceled) {
          return null
        }

        return result.filePaths[0] ?? null
      }
    )
  }

  private _getMainWindow() {
    const window = this._context.windowManager.mainWindow.window

    if (!window) {
      throw new AkariIpcError('Main window not found', 'MainWindowNotFound')
    }

    return window
  }
}
