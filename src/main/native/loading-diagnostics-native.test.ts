import { performance } from 'node:perf_hooks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NATIVE_SUPPORT,
  getGameClientWindowSnapshot,
  getPidsByName,
  initializeNativeRuntime,
  isProcessForeground
} from './index'
import { prepareLoadingDiagnostics } from './loading-diagnostics'

const tools = vi.hoisted(() => ({
  getPidsByName: vi.fn(),
  isProcessForeground: vi.fn(),
  getGameClientWindowSnapshot: vi.fn()
}))
vi.mock('./magic', () => ({ magic: {} }))
vi.mock('./addons-win32', () => ({
  initializeWin32Addons: () => ({ addons: { tools, input: {} }, isElevated: false })
}))
describe.skipIf(process.platform !== 'win32')('Windows facade loading-diagnostic coverage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
    initializeNativeRuntime()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })
  it('allows read-only foreground detection without elevation while retaining input restrictions', () => {
    expect(NATIVE_SUPPORT.isProcessForeground).toMatchObject({
      available: true,
      requiresElevation: false
    })
    expect(NATIVE_SUPPORT.nativeInput.available).toBe(false)
    expect(NATIVE_SUPPORT.adjustLeagueClientWindowSize.available).toBe(false)
    tools.isProcessForeground.mockReturnValue(true)
    expect(isProcessForeground(42)).toBe(true)
    tools.isProcessForeground.mockReturnValue(false)
    expect(isProcessForeground(42)).toBe(false)
  })
  it('measures existing facade calls without altering their arguments, return values or raw errors', async () => {
    let phaseListener!: (phase: unknown) => void
    const write = vi.fn().mockResolvedValue(undefined)
    const recorder = prepareLoadingDiagnostics({
      getPhase: () => 'Lobby',
      getGameId: () => null,
      onPhase: (listener) => {
        phaseListener = listener
        return () => {}
      },
      onSessionChange: () => () => {},
      onExit: () => () => {},
      write
    })
    phaseListener('GameStart')
    tools.getPidsByName.mockImplementation(() => {
      vi.setSystemTime(7)
      return [42]
    })
    tools.isProcessForeground.mockImplementation(() => {
      vi.setSystemTime(12)
      return true
    })
    const window = {
      ownerProcessId: 42,
      windowHandle: '123',
      bounds: { x: 0, y: 0, width: 2560, height: 1440 },
      isVisible: true,
      isMinimized: false,
      isForeground: true
    }
    tools.getGameClientWindowSnapshot.mockImplementation(() => {
      vi.setSystemTime(17)
      return window
    })
    expect(await getPidsByName('PRIVATE_PROCESS_NAME', 'game-client')).toEqual([42])
    expect(isProcessForeground(42, 'game-client')).toBe(true)
    expect(getGameClientWindowSnapshot(42, 'game-client')).toBe(window)
    expect(tools.getPidsByName).toHaveBeenCalledWith('PRIVATE_PROCESS_NAME')
    expect(tools.getGameClientWindowSnapshot).toHaveBeenCalledWith(42)
    const error = new Error('PRIVATE_NATIVE_ERROR')
    tools.isProcessForeground.mockImplementation(() => {
      throw error
    })
    expect(() => isProcessForeground(42, 'other')).toThrow(error)
    const report = await recorder.cancel()
    expect(report.native.map((total) => total.api)).toEqual([
      'getPidsByName',
      'isProcessForeground',
      'getGameClientWindowSnapshot',
      'isProcessForeground'
    ])
    expect(report.native[0].totalMs).toBe(7)
    expect(JSON.stringify(report)).not.toContain('PRIVATE_')
    expect(write).toHaveBeenCalledTimes(1)
  })
})
