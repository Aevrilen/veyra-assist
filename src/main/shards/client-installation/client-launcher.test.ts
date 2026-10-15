import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ClientInstallationLauncher } from './client-launcher'
import type { ClientInstallationMainContext } from './context'
import { ClientInstallationIpcHandlers } from './ipc-handlers'
import { ClientInstallationState } from './state'

const childProcess = vi.hoisted(() => ({ spawn: vi.fn(), execFile: vi.fn() }))
vi.mock('node:child_process', () => ({ default: childProcess }))

const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!
let root = ''
let children: (EventEmitter & { unref: ReturnType<typeof vi.fn> })[] = []
let holdSpawn = false
let spawnFailure: Error | null = null
const logger = { info: vi.fn(), warn: vi.fn() }
const paths = { tcls: '', wegame: '', wegameApp: '', riot: '' }
const createLauncher = () => {
  const state = new ClientInstallationState()
  state.setTclsExecutablePath(paths.tcls)
  state.setWeGameLauncherExecutablePath(paths.wegame)
  state.setWeGameExecutablePath(paths.wegameApp)
  state.setOfficialRiotClientExecutablePath(paths.riot)
  const context = {
    namespace: 'client-installation-main',
    state,
    logger
  } as unknown as ClientInstallationMainContext
  return { state, context, launcher: new ClientInstallationLauncher(context) }
}

beforeEach(() => {
  vi.clearAllMocks()
  children = []
  holdSpawn = false
  spawnFailure = null
  childProcess.spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() })
    children.push(child)
    if (!holdSpawn) queueMicrotask(() => child.emit(spawnFailure ? 'error' : 'spawn', spawnFailure))
    return child
  })
  childProcess.execFile.mockImplementation(
    (_file: string, _args: string[], callback: (...args: unknown[]) => void) =>
      callback(null, '', '')
  )
})
afterEach(() => {
  Object.defineProperty(process, 'platform', platformDescriptor)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe.runIf(process.platform === 'win32')('configured Windows client launch', () => {
  beforeAll(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'veyra-launch-'))
    const game = path.join(root, '游戏 中文 & spaces')
    await fs.promises.mkdir(path.join(game, 'Launcher'), { recursive: true })
    await fs.promises.mkdir(path.join(game, 'WeGameLauncher'), { recursive: true })
    paths.tcls = path.join(game, 'Launcher', 'Client.exe')
    paths.wegame = path.join(game, 'WeGameLauncher', 'launcher.exe')
    paths.wegameApp = path.join(game, 'WeGame.exe')
    paths.riot = path.join(game, 'RiotClientServices.exe')
    await Promise.all(
      Object.values(paths).map((file) => fs.promises.writeFile(file, 'fixture file; never execute'))
    )
  })
  afterAll(async () => {
    if (
      !path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) ||
      !path.basename(root).startsWith('veyra-launch-')
    ) {
      throw new Error('Temporary cleanup target is outside its verified scope')
    }
    await fs.promises.rm(root, { recursive: true, force: true })
  })

  it.each([
    ['tcls', 'tcls'],
    ['wegame', 'wegame'],
    ['wegame', 'wegameApp'],
    ['riot', 'riot']
  ] as const)(
    'launches known %s path directly, including Chinese, spaces and ampersand',
    async (client, pathKey) => {
      const { launcher } = createLauncher()
      const configuration = { client, executablePath: paths[pathKey] }
      expect(await launcher.validateLaunchConfiguration(configuration)).toBe('valid')
      expect(childProcess.spawn).not.toHaveBeenCalled()
      expect(await launcher.launchConfiguredClient(configuration)).toBe('started')
      expect(childProcess.spawn).toHaveBeenCalledWith(
        paths[pathKey],
        client === 'riot' ? ['--launch-product=league_of_legends', '--launch-patchline=live'] : [],
        { detached: true, stdio: 'ignore', shell: false }
      )
      expect(children[0].unref).toHaveBeenCalledOnce()
    }
  )

  it('rejects malformed, script, relative, UNC, mismatched and disappeared paths without spawning', async () => {
    const { launcher } = createLauncher()
    for (const configuration of [
      null,
      { client: 'other', executablePath: paths.tcls },
      { client: 'tcls', executablePath: paths.tcls, args: ['untrusted'] },
      { client: 'tcls', executablePath: '' },
      { client: 'tcls', executablePath: paths.tcls + '\0' },
      { client: 'tcls', executablePath: 'Launcher/Client.exe' },
      { client: 'riot', executablePath: '\\\\server\\share\\RiotClientServices.exe' },
      { client: 'riot', executablePath: path.join(root, 'RiotClientServices.cmd') },
      { client: 'tcls', executablePath: paths.riot },
      { client: 'riot', executablePath: path.join(root, 'missing', 'RiotClientServices.exe') }
    ])
      expect(await launcher.launchConfiguredClient(configuration)).toBe('invalid-path')
    expect(childProcess.spawn).not.toHaveBeenCalled()
  })

  it('waits for spawn confirmation and suppresses in-flight and rapid duplicate requests', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-14T00:00:00Z'))
    holdSpawn = true
    const { launcher } = createLauncher()
    const configuration = { client: 'tcls', executablePath: paths.tcls }
    const first = launcher.launchConfiguredClient(configuration)
    expect(await launcher.launchConfiguredClient(configuration)).toBe('already-starting')
    await vi.waitFor(() => expect(childProcess.spawn).toHaveBeenCalledOnce())
    let resolved = false
    void first.then(() => {
      resolved = true
    })
    await Promise.resolve()
    expect(resolved).toBe(false)
    children[0].emit('spawn')
    expect(await first).toBe('started')
    expect(await launcher.launchConfiguredClient(configuration)).toBe('already-starting')
    vi.setSystemTime(new Date('2026-10-14T00:00:02Z'))
    holdSpawn = false
    expect(await launcher.launchConfiguredClient(configuration)).toBe('started')
    expect(childProcess.spawn).toHaveBeenCalledTimes(2)
  })

  it('surfaces spawn failure and permits retry without changing detected paths', async () => {
    const { launcher, state } = createLauncher()
    spawnFailure = new Error('fixture spawn failure')
    await expect(
      launcher.launchConfiguredClient({ client: 'tcls', executablePath: paths.tcls })
    ).rejects.toThrow('fixture spawn failure')
    expect(children[0].unref).not.toHaveBeenCalled()
    expect(state.tclsExecutablePath).toBe(paths.tcls)
    spawnFailure = null
    expect(
      await launcher.launchConfiguredClient({ client: 'tcls', executablePath: paths.tcls })
    ).toBe('started')
  })

  it('preserves all four original IPC launch names, defaults and fixed Riot arguments', async () => {
    const { context, launcher } = createLauncher()
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    context.ipc = {
      onCall: (_namespace: string, name: string, handler: (...args: unknown[]) => unknown) =>
        handlers.set(name, handler)
    } as unknown as ClientInstallationMainContext['ipc']
    new ClientInstallationIpcHandlers(context, launcher).register()
    const cases = [
      ['launchTencentTcls', paths.tcls],
      ['launchWeGameLeagueOfLegends', paths.wegame],
      ['launchWeGame', paths.wegameApp],
      ['launchDefaultRiotClient', paths.riot]
    ]
    for (const [name, file] of cases) {
      await handlers.get(name)!(undefined, 'ignored arbitrary override')
      expect(childProcess.spawn).toHaveBeenLastCalledWith(
        file,
        name === 'launchDefaultRiotClient'
          ? ['--launch-product=league_of_legends', '--launch-patchline=live']
          : [],
        { detached: true, stdio: 'ignore', shell: false }
      )
    }
    expect(childProcess.spawn).toHaveBeenCalledTimes(4)
    expect(statePaths(context.state)).toEqual(Object.values(paths))
  })
})

const statePaths = (state: ClientInstallationState) => [
  state.tclsExecutablePath,
  state.weGameLauncherExecutablePath,
  state.weGameExecutablePath,
  state.officialRiotClientExecutablePath
]

describe('platform boundaries', () => {
  it('uses case-insensitive app recognition consistently for macOS validation and launch', async () => {
    Object.defineProperty(process, 'platform', { ...platformDescriptor, value: 'darwin' })
    vi.spyOn(fs.promises, 'stat').mockResolvedValue({
      isDirectory: () => true,
      isFile: () => false
    } as fs.Stats)
    vi.spyOn(fs.promises, 'access').mockResolvedValue(undefined)
    const { launcher } = createLauncher()
    const configuration = { client: 'riot', executablePath: '/Applications/Riot Client.APP' }
    expect(await launcher.validateLaunchConfiguration(configuration)).toBe('valid')
    expect(await launcher.launchConfiguredClient(configuration)).toBe('started')
    expect(childProcess.execFile).toHaveBeenCalledWith(
      'open',
      [
        '-a',
        configuration.executablePath,
        '--args',
        '--launch-product=league_of_legends',
        '--launch-patchline=live'
      ],
      expect.any(Function)
    )
    expect(childProcess.spawn).not.toHaveBeenCalled()
  })
  it('does not launch unsupported client/platform combinations', async () => {
    Object.defineProperty(process, 'platform', { ...platformDescriptor, value: 'linux' })
    const { launcher } = createLauncher()
    expect(
      await launcher.launchConfiguredClient({
        client: 'riot',
        executablePath: '/opt/RiotClientServices.exe'
      })
    ).toBe('unsupported-platform')
    expect(childProcess.spawn).not.toHaveBeenCalled()
    expect(childProcess.execFile).not.toHaveBeenCalled()
  })
})
