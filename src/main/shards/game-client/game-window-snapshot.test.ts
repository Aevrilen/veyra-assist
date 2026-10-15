import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GameClientForegroundError } from './context'
import { GameClientMain } from './index'

const native = vi.hoisted(() => ({
  supports: vi.fn(),
  pids: vi.fn(),
  snapshot: vi.fn(),
  running: vi.fn(),
  foreground: vi.fn(),
  foregroundSupport: { available: true }
}))
vi.mock('@main/native/magic', () => ({ magic: {} }))
// The adapter methods do not instantiate the application's other shards or bundled assets.
vi.mock('@shared/akari-shard', () => ({ Shard: () => (target: unknown) => target }))
vi.mock('../client-installation', () => ({ ClientInstallationMain: class {} }))
vi.mock('../ipc', () => ({ AkariIpcMain: class {} }))
vi.mock('../keyboard-shortcuts', () => ({ KeyboardShortcutsMain: class {} }))
vi.mock('../league-client', () => ({ LeagueClientMain: class {} }))
vi.mock('../logger-factory', () => ({ LoggerFactoryMain: class {} }))
vi.mock('../mobx-utils', () => ({ MobxUtilsMain: class {} }))
vi.mock('../setting-factory', () => ({ SettingFactoryMain: class {} }))
vi.mock('./ipc-handlers', () => ({ GameClientIpcHandlers: class {} }))
vi.mock('./settings-file-controller', () => ({ GameClientSettingsFileController: class {} }))
vi.mock('./shortcut-controller', () => ({ GameClientShortcutController: class {} }))
vi.mock('@main/native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@main/native')>()),
  NATIVE_SUPPORT: { isProcessForeground: native.foregroundSupport },
  isProcessRunning: native.running,
  isProcessForeground: native.foreground,
  supportsGameClientWindowSnapshot: native.supports,
  getPidsByName: native.pids,
  getGameClientWindowSnapshot: native.snapshot
}))
const snapshot = (pid: number, foreground = false) => ({
  ownerProcessId: pid,
  windowHandle: String(pid),
  bounds: { x: 0, y: 0, width: 2560, height: 1440 },
  isVisible: true,
  isMinimized: false,
  isForeground: foreground
})

describe('GameClient native snapshot adapter', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    native.supports.mockReturnValue(true)
    native.pids.mockResolvedValue([42])
    native.snapshot.mockImplementation((pid: number) => snapshot(pid, true))
    native.foregroundSupport.available = true
    native.running.mockReturnValue(true)
    native.foreground.mockReturnValue(true)
  })
  const client = () =>
    Object.assign(Object.create(GameClientMain.prototype), {
      _gameClientCachedRunningPids: []
    }) as GameClientMain
  it('uses the cached game PID but reads foreground again after a normal focus change', async () => {
    const subject = client()
    expect(await subject.isGameClientForegroundCached()).toBe(true)
    expect(await subject.isGameClientForegroundCached()).toBe(true)
    expect(native.pids).toHaveBeenCalledOnce()
    native.foreground.mockReturnValue(false)
    expect(await subject.isGameClientForegroundCached()).toBe(false)
    expect(native.pids).toHaveBeenCalledTimes(2)
    expect(native.foreground).toHaveBeenCalledWith(42, 'game-client')
  })
  it('discovers the next foreground game while the previous game process is still alive', async () => {
    const subject = client()
    expect(await subject.isGameClientForegroundCached()).toBe(true)
    // Game one has left its window, but its process has not exited yet.
    native.pids.mockResolvedValue([42, 43])
    native.foreground.mockImplementation((pid: number) => pid === 43)
    native.snapshot.mockImplementation((pid: number) => snapshot(pid, pid === 43))
    expect(await subject.isGameClientForegroundCached()).toBe(true)
    expect(await subject.getGameClientWindowSnapshot()).toEqual(snapshot(43, true))
    native.foreground.mockReturnValue(false)
    native.snapshot.mockImplementation((pid: number) => snapshot(pid, false))
    expect(await subject.isGameClientForegroundCached()).toBe(false)
    expect(await subject.getGameClientWindowSnapshot()).toBeNull()
    native.foreground.mockImplementation((pid: number) => pid === 43)
    expect(await subject.isGameClientForegroundCached()).toBe(true)
  })
  it('rediscovers a game after all cached processes exit and after an empty lobby poll', async () => {
    const subject = client()
    expect(await subject.isGameClientForegroundCached()).toBe(true)
    native.running.mockReturnValue(false)
    native.pids.mockResolvedValue([])
    expect(await subject.isGameClientForegroundCached()).toBe(false)
    native.pids.mockResolvedValue([43])
    native.running.mockReturnValue(true)
    native.foreground.mockImplementation((pid: number) => pid === 43)
    expect(await subject.isGameClientForegroundCached()).toBe(true)
  })
  it('keeps a failed rediscovery visible and retries it on the next poll', async () => {
    const subject = client()
    expect(await subject.isGameClientForegroundCached()).toBe(true)
    native.foreground.mockReturnValue(false)
    native.pids.mockRejectedValueOnce(new Error('enumeration failed'))
    await expect(subject.isGameClientForegroundCached()).rejects.toMatchObject({
      reason: 'foreground-query-failed'
    })
    native.pids.mockResolvedValue([43])
    native.foreground.mockImplementation((pid: number) => pid === 43)
    expect(await subject.isGameClientForegroundCached()).toBe(true)
  })
  it('reports an unavailable capability instead of treating it as a background game', async () => {
    native.foregroundSupport.available = false
    await expect(client().isGameClientForegroundCached()).rejects.toMatchObject({
      reason: 'foreground-capability-unavailable'
    })
    expect(native.pids).not.toHaveBeenCalled()
    expect(native.foreground).not.toHaveBeenCalled()
  })
  it('preserves a failed native query as a failure, never a foreground boolean', async () => {
    const cause = new Error('query failed')
    native.foreground.mockImplementation(() => {
      throw cause
    })
    await expect(client().isGameClientForegroundCached()).rejects.toEqual(
      new GameClientForegroundError('foreground-query-failed', { cause })
    )
  })
  it('uses the real adapter method and passes only game-process PIDs to the native reader', async () => {
    expect(await client().getGameClientWindowSnapshot()).toEqual(snapshot(42, true))
    expect(native.pids).toHaveBeenCalledWith(GameClientMain.GAME_CLIENT_PROCESS_NAME, 'game-client')
    expect(native.snapshot).toHaveBeenCalledWith(42, 'game-client')
  })
  it('does not query PIDs or windows when the loaded binary lacks the capability', async () => {
    native.supports.mockReturnValue(false)
    expect(await client().getGameClientWindowSnapshot()).toBeNull()
    expect(native.pids).not.toHaveBeenCalled()
    expect(native.snapshot).not.toHaveBeenCalled()
  })
  it('rejects an owner PID different from the exact requested PID, even if both are game PIDs', async () => {
    native.pids.mockResolvedValue([42, 43])
    native.snapshot.mockImplementation((pid: number) => (pid === 42 ? snapshot(43, true) : null))
    expect(await client().getGameClientWindowSnapshot()).toBeNull()
  })
  it('prefers one foreground game window and refuses ambiguous background candidates', async () => {
    native.pids.mockResolvedValue([42, 43])
    native.snapshot.mockImplementation((pid: number) => snapshot(pid, pid === 43))
    expect(await client().getGameClientWindowSnapshot()).toEqual(snapshot(43, true))
    native.snapshot.mockImplementation((pid: number) => snapshot(pid, false))
    expect(await client().getGameClientWindowSnapshot()).toBeNull()
  })
  it('returns a sole non-foreground snapshot for explicit minimized/visibility diagnostics', async () => {
    native.snapshot.mockReturnValue({ ...snapshot(42), isMinimized: true, isVisible: false })
    expect(await client().getGameClientWindowSnapshot()).toMatchObject({
      isMinimized: true,
      isVisible: false
    })
  })
})
