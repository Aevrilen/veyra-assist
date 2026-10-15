import { describe, expect, it, vi } from 'vitest'

import { registerPositionCalibrationIpc } from './position-calibration-ipc'

describe('position preview IPC ownership', () => {
  it('permits only the main window main frame with the declared argument count', async () => {
    const calls = new Map<string, (...args: any[]) => any>()
    const main = { mainFrame: {} }
    const controller = {
      status: vi.fn(() => 'status'),
      begin: vi.fn(),
      beginAutomatic: vi.fn(),
      exportSample: vi.fn(() => true),
      preview: vi.fn(() => 'LOCAL_IMAGE'),
      cancel: vi.fn(),
      save: vi.fn()
    }
    registerPositionCalibrationIpc(
      { onCall: (_ns: string, name: string, fn: any) => calls.set(name, fn) } as any,
      'selection',
      controller as any,
      () => main as any
    )
    const event = { sender: main, senderFrame: main.mainFrame }
    expect(calls.get('positionStatus')!(event)).toBe('status')
    expect(calls.get('positionPreview')!(event, 'request')).toBe('LOCAL_IMAGE')
    expect(controller.preview).toHaveBeenCalledExactlyOnceWith('request')
    calls.get('beginAutomaticPosition')!(event)
    expect(controller.beginAutomatic).toHaveBeenCalledTimes(1)
    expect(calls.get('exportPositionSample')!(event, 'request')).toBe(true)
    for (const name of calls.keys()) {
      expect(() => calls.get(name)!({ sender: {}, senderFrame: {} })).toThrow()
      expect(() => calls.get(name)!({ ...event, senderFrame: {} })).toThrow()
    }
    expect(() => calls.get('beginPosition')!(event, 'extra')).toThrow()
    expect(() => calls.get('savePosition')!(event)).toThrow()
    expect(() => calls.get('beginAutomaticPosition')!(event, true)).toThrow()
    expect(() => calls.get('exportPositionSample')!(event)).toThrow()
    expect(controller.save).not.toHaveBeenCalled()
  })
})
