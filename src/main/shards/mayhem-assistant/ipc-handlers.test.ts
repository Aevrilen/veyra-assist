import { afterEach, describe, expect, it, vi } from 'vitest'

import { MayhemIpcHandlers } from './ipc-handlers'

describe('equipment restore sender permissions', () => {
  it('allows only Setup and the dedicated restore window, preserving the session key', () => {
    type Handler = (event: { sender: { id: number } }, key: string) => unknown
    const handlers = new Map<string, Handler>()
    const restore = vi.fn().mockReturnValue(true)
    const ipc = {
      onCall: (_namespace: string, name: string, fn: Handler) => handlers.set(name, fn)
    }
    const controller = {
      windows: {
        ownsSetup: (id: number) => id === 1,
        ownsRestore: (id: number) => id === 4,
        owns: () => true
      },
      restore
    }
    new MayhemIpcHandlers(ipc as never, controller as never, () => false, vi.fn()).register()
    const call = handlers.get('restore')!
    expect(call({ sender: { id: 1 } }, 'game:1')).toBe(true)
    expect(call({ sender: { id: 4 } }, 'game:1')).toBe(true)
    for (const id of [2, 3, 5, 999])
      expect(() => call({ sender: { id } }, 'game:1')).toThrow('Overlay window permission denied')
    expect(restore.mock.calls).toEqual([['game:1'], ['game:1']])
  })
})

describe('main-window calibration entry', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform)
    vi.restoreAllMocks()
  })

  function fixture() {
    type Handler = (event: { sender: { id: number } }, ...args: unknown[]) => unknown
    const handlers = new Map<string, Handler>()
    const setupInfo = vi.fn().mockReturnValue({
      calibration: null,
      preferences: { path: 'private/preferences.json' },
      recognition: ['private screenshot data']
    })
    const openSetup = vi.fn()
    const calibrate = vi.fn().mockReturnValue(true)
    const fallbackSelectionStatus = vi.fn().mockReturnValue({ state: 'waiting' })
    const beginFallbackSelection = vi.fn().mockReturnValue({ requestId: 'request-a' })
    const cancelFallbackSelection = vi.fn().mockReturnValue(true)
    const saveFallbackSelection = vi.fn().mockResolvedValue(true)
    const controller = {
      setupInfo,
      calibrate,
      fallbackSelectionStatus,
      beginFallbackSelection,
      cancelFallbackSelection,
      saveFallbackSelection,
      windows: {
        openSetup,
        ownsSetup: (id: number) => id === 1,
        ownsRestore: (id: number) => id === 4,
        owns: (id: number) => [1, 2, 3, 4].includes(id)
      }
    }
    const ipc = {
      onCall: (_namespace: string, name: string, fn: Handler) => handlers.set(name, fn)
    }
    new MayhemIpcHandlers(ipc as never, controller as never, (id) => id === 10, vi.fn()).register()
    return {
      setupInfo,
      openSetup,
      calibrate,
      fallbackSelectionStatus,
      beginFallbackSelection,
      cancelFallbackSelection,
      saveFallbackSelection,
      call: (name: string, sender: number, ...args: unknown[]) =>
        handlers.get(name)!({ sender: { id: sender } }, ...args)
    }
  }

  it('queries only boolean status for the main window and opens only on its explicit call', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    const subject = fixture()
    expect(subject.call('setupStatus', 10)).toEqual({ supported: true, calibrated: false })
    expect(subject.openSetup).not.toHaveBeenCalled()
    subject.setupInfo.mockReturnValue({ calibration: { privatePixels: [1, 2, 3] } })
    expect(subject.call('setupStatus', 10)).toEqual({ supported: true, calibrated: true })
    expect(subject.openSetup).not.toHaveBeenCalled()
    expect(subject.call('openSetup', 10)).toBeUndefined()
    expect(subject.openSetup).toHaveBeenCalledOnce()
  })

  it('rejects every non-main sender and unexpected arguments without side effects', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    const subject = fixture()
    for (const name of ['setupStatus', 'openSetup']) {
      for (const id of [1, 2, 3, 4, 999])
        expect(() => subject.call(name, id)).toThrow('Main window permission denied')
      expect(() => subject.call(name, 10, {})).toThrow('does not accept arguments')
    }
    expect(subject.setupInfo).not.toHaveBeenCalled()
    expect(subject.openSetup).not.toHaveBeenCalled()
  })

  it.each(['darwin', 'linux'])('reports unsupported and refuses opening on %s', (platform) => {
    Object.defineProperty(process, 'platform', { value: platform })
    const subject = fixture()
    expect(subject.call('setupStatus', 10)).toEqual({ supported: false, calibrated: false })
    expect(() => subject.call('openSetup', 10)).toThrow('Windows only')
    expect(subject.setupInfo).not.toHaveBeenCalled()
    expect(subject.openSetup).not.toHaveBeenCalled()
  })

  it('keeps setupInfo and calibrate restricted to the existing setup window', () => {
    const subject = fixture()
    const input = { originalImages: true }
    for (const id of [10, 2, 3, 4, 999]) {
      expect(() => subject.call('setupInfo', id)).toThrow('Overlay window permission denied')
      expect(() => subject.call('calibrate', id, input)).toThrow('Overlay window permission denied')
    }
    expect(subject.call('setupInfo', 1)).toHaveProperty('calibration', null)
    expect(subject.call('calibrate', 1, input)).toBe(true)
    expect(subject.calibrate).toHaveBeenCalledExactlyOnceWith(input)
  })

  it('propagates status and open failures without claiming a saved calibration', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    const subject = fixture()
    subject.setupInfo.mockImplementation(() => {
      throw new Error('status failed')
    })
    expect(() => subject.call('setupStatus', 10)).toThrow('status failed')
    subject.openSetup.mockImplementation(() => {
      throw new Error('open failed')
    })
    expect(() => subject.call('openSetup', 10)).toThrow('open failed')
  })
  it('allows fallback preview control only from Setup with the exact argument count and propagates failed saves', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    const subject = fixture()
    const input = { requestId: 'request-a', rect: { x: 1, y: 2, width: 3, height: 4 } }
    const calls = [
      ['fallbackSelectionStatus', []],
      ['beginFallbackSelection', ['cards']],
      ['cancelFallbackSelection', ['request-a']],
      ['saveFallbackSelection', [input]]
    ] as const
    for (const [name, args] of calls) {
      for (const sender of [10, 2, 3, 4, 999])
        expect(() => subject.call(name, sender, ...args)).toThrow(
          'Overlay window permission denied'
        )
      expect(() => subject.call(name, 1, ...args, {})).toThrow('参数无效')
    }
    expect(subject.saveFallbackSelection).not.toHaveBeenCalled()
    expect(subject.call('beginFallbackSelection', 1, 'cards')).toEqual({ requestId: 'request-a' })
    expect(subject.beginFallbackSelection).toHaveBeenCalledExactlyOnceWith('cards')
    expect(await subject.call('saveFallbackSelection', 1, input)).toBe(true)
    subject.saveFallbackSelection.mockRejectedValueOnce(new Error('保存失败'))
    await expect(subject.call('saveFallbackSelection', 1, input)).rejects.toThrow('保存失败')
    Object.defineProperty(process, 'platform', { value: 'linux' })
    expect(() => subject.call('fallbackSelectionStatus', 1)).toThrow('仅支持 Windows')
    expect(subject.fallbackSelectionStatus).not.toHaveBeenCalled()
  })
})
