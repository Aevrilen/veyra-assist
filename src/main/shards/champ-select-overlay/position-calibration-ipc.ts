import type { WebContents } from 'electron'

import type { AkariIpcMain } from '../ipc'
import type { ChampSelectPositionCalibrationController } from './position-calibration-controller'

export function registerPositionCalibrationIpc(
  ipc: AkariIpcMain,
  namespace: string,
  controller: ChampSelectPositionCalibrationController,
  mainContents: () => WebContents | undefined
) {
  const register = (name: string, count: number, action: (...args: unknown[]) => unknown) => {
    ipc.onCall(namespace, name, (event, ...args: unknown[]) => {
      const main = mainContents()
      if (
        !main ||
        event.sender !== main ||
        event.senderFrame !== main.mainFrame ||
        args.length !== count
      )
        throw new Error('Position calibration request unavailable')
      return action(...args)
    })
  }
  register('positionStatus', 0, () => controller.status())
  register('beginPosition', 0, () => controller.begin())
  register('positionPreview', 1, (id) => controller.preview(id))
  register('cancelPosition', 0, () => controller.cancel())
  register('savePosition', 1, (input) => controller.save(input))
}
