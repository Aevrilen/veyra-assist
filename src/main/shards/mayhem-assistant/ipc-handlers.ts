import {
  FIRST_RUN_ENVIRONMENT_STATUS_CALL,
  type FirstRunEnvironmentStatus
} from '@shared/types/first-run-environment'

import type { AkariIpcMain } from '../ipc'
import type { MayhemOverlayController } from './overlay-controller'

export class MayhemIpcHandlers {
  constructor(
    private readonly _ipc: AkariIpcMain,
    private readonly _controller: MayhemOverlayController,
    private readonly _ownsMainWindow: (id: number) => boolean,
    private readonly _getFirstRunEnvironmentStatus: () => FirstRunEnvironmentStatus
  ) {}
  register() {
    const registerMainWindow = (name: string, fn: () => unknown) =>
      this._ipc.onCall('mayhem-assistant-main', name, (event, ...args: unknown[]) => {
        const reject = (message: string): never => {
          const failure = new Error(message)
          if (name === FIRST_RUN_ENVIRONMENT_STATUS_CALL) failure.stack = undefined
          throw failure
        }
        if (!this._ownsMainWindow(event.sender.id)) reject('Main window permission denied')
        if (args.length) reject('Calibration entry does not accept arguments')
        return fn()
      })
    registerMainWindow('setupStatus', () => ({
      supported: process.platform === 'win32',
      calibrated: process.platform === 'win32' && this._controller.setupInfo().calibration !== null
    }))
    registerMainWindow('openSetup', () => {
      if (process.platform !== 'win32') throw new Error('Calibration is supported on Windows only')
      this._controller.windows.openSetup()
    })
    registerMainWindow(FIRST_RUN_ENVIRONMENT_STATUS_CALL, () =>
      this._getFirstRunEnvironmentStatus()
    )
    const register = (name: string, setup: boolean, fn: (...args: any[]) => unknown) =>
      this._ipc.onCall('mayhem-assistant-main', name, (event, ...args) => {
        if (
          !(setup
            ? this._controller.windows.ownsSetup(event.sender.id)
            : this._controller.windows.owns(event.sender.id))
        )
          throw new Error('Overlay window permission denied')
        return fn(...args)
      })
    register('snapshot', false, () => this._controller.snapshot())
    register('category', false, (key, category) => this._controller.setCategory(key, category))
    register('buildView', false, (key, view) => this._controller.setBuildView(key, view))
    register('suppress', false, (key) => this._controller.suppress(key))
    register('collapse', false, (key) => this._controller.collapse(key))
    this._ipc.onCall('mayhem-assistant-main', 'restore', (event, key) => {
      const id = event.sender.id
      if (!this._controller.windows.ownsSetup(id) && !this._controller.windows.ownsRestore(id))
        throw new Error('Overlay window permission denied')
      return this._controller.restore(key)
    })
    register('setupInfo', true, () => this._controller.setupInfo())
    const registerFallback = (name: string, count: number, fn: (...args: unknown[]) => unknown) =>
      register(name, true, (...args: unknown[]) => {
        if (process.platform !== 'win32') throw new Error('框选备用定位仅支持 Windows。')
        if (args.length !== count) throw new Error('框选请求参数无效。')
        return fn(...args)
      })
    registerFallback('fallbackSelectionStatus', 0, () => this._controller.fallbackSelectionStatus())
    registerFallback('beginFallbackSelection', 1, (scene) =>
      this._controller.beginFallbackSelection(scene)
    )
    registerFallback('cancelFallbackSelection', 1, (requestId) =>
      this._controller.cancelFallbackSelection(requestId)
    )
    registerFallback('saveFallbackSelection', 1, (input) =>
      this._controller.saveFallbackSelection(input)
    )
    register('sampleAutomaticLocation', true, (scene: unknown) =>
      this._controller.sampleAutomaticLocation(scene)
    )
    register('backgroundOpacity', true, (value) =>
      this._controller.setAugmentBackgroundOpacity(value)
    )
    register('bindNames', true, (key, revision, titleRevision, names) =>
      this._controller.bindNames(key, revision, titleRevision, names)
    )
    register('calibrate', true, (input: unknown) => this._controller.calibrate(input))
  }
}
