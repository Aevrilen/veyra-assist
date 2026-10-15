import { createDefaultChampSelectOverlaySettings } from '@shared/champ-select-overlay'
import { BrowserWindow, screen } from 'electron'
import { observable, runInAction } from 'mobx'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LeagueClientData } from '../league-client/lc-state'
import { GameflowState } from '../league-client/lc-state/gameflow'
import { ChampSelectOverlayWindowController } from './window-controller'

const runtime = vi.hoisted(() => ({
  windows: [] as any[],
  snapshot: null as null | {
    bounds: Electron.Rectangle
    isVisible: boolean
    isForeground: boolean
    isMinimized: boolean
  },
  workArea: { x: 0, y: 0, width: 2560, height: 1400 },
  convert: vi.fn((bounds: Electron.Rectangle) => bounds),
  read: vi.fn()
}))
vi.mock('@main/native', () => ({
  getLeagueClientWindowSnapshot: (pid: number) => {
    runtime.read(pid)
    return runtime.snapshot
  }
}))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    BrowserWindow: vi.fn(function (options: Electron.BrowserWindowConstructorOptions) {
      const window = new EventEmitter() as any
      window.group = options.title?.endsWith('candidates') ? 'candidates' : 'teammates'
      window.bounds = { x: options.x, y: options.y, width: options.width, height: options.height }
      window.visible = false
      window.destroyed = false
      window.isVisible = () => window.visible
      window.isFocusable = () => options.focusable !== false
      window.isFocused = () => false
      window.isDestroyed = () => window.destroyed
      window.getBounds = () => ({ ...window.bounds })
      window.setBounds = vi.fn((bounds) => (window.bounds = bounds))
      window.showInactive = vi.fn(() => (window.visible = true))
      window.hide = vi.fn(() => (window.visible = false))
      window.destroy = vi.fn(() => {
        window.destroyed = true
        window.visible = false
        window.emit('closed')
      })
      window.loadURL = vi.fn(async () => {})
      window.loadFile = vi.fn(async () => {})
      window.setContentProtection = vi.fn()
      window.setIgnoreMouseEvents = vi.fn()
      window.setAlwaysOnTop = vi.fn()
      window.webContents = new EventEmitter()
      window.webContents.setWindowOpenHandler = vi.fn()
      runtime.windows.push(window)
      return window
    }),
    screen: {
      screenToDipRect: vi.fn((_window, bounds) => runtime.convert(bounds)),
      getDisplayMatching: vi.fn(() => ({ workArea: runtime.workArea }))
    }
  }
})
function createContext(platform: NodeJS.Platform = 'win32') {
  return {
    platform,
    leagueClient: {
      state: observable({ isConnected: true, auth: { pid: 42 } as { pid: number } | null }),
      data: {
        gameflow: observable({ phase: 'Lobby' as string | null }),
        champSelect: observable({
          session: {
            benchEnabled: true,
            benchChampions: Array.from({ length: 7 }, (_, i) => ({
              championId: i + 1,
              isPriority: false
            })),
            myTeam: Array.from({ length: 5 }, (_, cellId) => ({ cellId }))
          }
        })
      }
    },
    ongoingGame: {
      getChampSelectOverlaySettings() {
        return this.settings.champSelectOverlay
      },
      settings: observable({
        enabled: true,
        champSelectOverlay: {
          ...createDefaultChampSelectOverlaySettings(),
          candidateFirstCenterX: 300,
          teammateFirstCenterY: 200
        }
      })
    },
    windowManager: { settings: observable({ contentProtection: false }) },
    protocol: { registerPartition: vi.fn(), unregisterPartition: vi.fn() },
    logger: { warn: vi.fn() }
  }
}
function createController(context = createContext()) {
  const controller = new ChampSelectOverlayWindowController(
    context as unknown as ConstructorParameters<typeof ChampSelectOverlayWindowController>[0]
  )
  controller.start()
  return { controller, context }
}
function enterChampSelect(context: ReturnType<typeof createContext>) {
  runInAction(() => (context.leagueClient.data.gameflow.phase = 'ChampSelect'))
  runtime.windows.forEach((window) => window.webContents.emit('did-finish-load'))
  return {
    candidates: runtime.windows.find((window) => window.group === 'candidates'),
    teammates: runtime.windows.find((window) => window.group === 'teammates')
  }
}
describe('champion select group window lifecycle', () => {
  let controller: ChampSelectOverlayWindowController
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    runtime.windows.length = 0
    runtime.snapshot = {
      bounds: { x: 640, y: 300, width: 1280, height: 720 },
      isVisible: true,
      isForeground: true,
      isMinimized: false
    }
    runtime.workArea = { x: 0, y: 0, width: 2560, height: 1400 }
    runtime.convert.mockImplementation((bounds) => bounds)
    runtime.read.mockReset()
  })
  afterEach(() => {
    controller?.dispose()
    vi.useRealTimers()
  })
  it('creates each group only in champion select, shows inactive and keeps mouse input transparent', () => {
    const started = createController()
    controller = started.controller
    vi.advanceTimersByTime(500)
    expect(BrowserWindow).not.toHaveBeenCalled()
    expect(runtime.read).not.toHaveBeenCalled()
    runInAction(() => (started.context.leagueClient.data.gameflow.phase = 'ChampSelect'))
    expect(runtime.windows).toHaveLength(2)
    for (const window of runtime.windows) {
      expect(window.visible).toBe(false)
      window.webContents.emit('did-finish-load')
      expect(window.visible).toBe(true)
      expect(window.showInactive).toHaveBeenCalled()
      expect(window.setIgnoreMouseEvents).toHaveBeenCalledWith(true)
      expect(window.loadFile).toHaveBeenCalledWith(expect.any(String), {
        query: { group: window.group }
      })
    }
    expect(runtime.read).toHaveBeenCalledWith(42)
    for (const [options] of vi.mocked(BrowserWindow).mock.calls)
      expect(options).toMatchObject({
        focusable: false,
        show: false,
        skipTaskbar: true,
        transparent: true,
        hasShadow: false
      })
  })

  it('creates immediately from the real GameflowState during a brief champion selection', () => {
    const context = createContext()
    const gameflow = new GameflowState()
    gameflow.setPhase('Lobby')
    context.leagueClient.data.gameflow = gameflow
    const started = createController(context)
    controller = started.controller

    gameflow.setPhase('ChampSelect')
    expect(BrowserWindow).toHaveBeenCalledTimes(2)
    const window = runtime.windows[0]
    window.webContents.emit('did-finish-load')
    expect(window.visible).toBe(true)

    vi.advanceTimersByTime(10_000)
    expect(window.visible).toBe(true)
    gameflow.setPhase('GameStart')
    expect(window.visible).toBe(false)
  })

  it('does not observe a session-only phase update until the standalone phase changes', () => {
    const context = createContext()
    const gameflow = new GameflowState()
    gameflow.setPhase('Lobby')
    context.leagueClient.data.gameflow = gameflow
    const started = createController(context)
    controller = started.controller

    gameflow.setSession({ phase: 'ChampSelect' } as NonNullable<GameflowState['session']>)
    vi.advanceTimersByTime(10_000)
    expect(gameflow.session?.phase).toBe('ChampSelect')
    expect(BrowserWindow).not.toHaveBeenCalled()
    expect(runtime.read).not.toHaveBeenCalled()

    gameflow.setPhase('ChampSelect')
    expect(BrowserWindow).toHaveBeenCalledTimes(2)
  })

  it('keeps following when a delayed initial HTTP phase arrives after a newer phase event', async () => {
    const listeners = new Map<string, (event: { data: string }) => void>()
    let resolvePhase!: (response: { data: string }) => void
    const phaseResponse = new Promise<{ data: string }>((resolve) => (resolvePhase = resolve))
    const data = new LeagueClientData({
      namespace: 'league-client-main',
      mobxUtils: { propSync: vi.fn() },
      leagueClient: {
        api: { gameflow: { getPhase: vi.fn(() => phaseResponse) } },
        events: {
          on: (endpoint: string, handler: (event: { data: string }) => void) =>
            listeners.set(endpoint, handler)
        }
      }
    } as unknown as ConstructorParameters<typeof LeagueClientData>[0])
    const sync = data as unknown as {
      _syncLcuGameflow(): void
      _stateInitializer: { tasks: Map<string, { fn(): Promise<void> }> }
    }
    sync._syncLcuGameflow()
    const context = createContext()
    context.leagueClient.data.gameflow = data.gameflow
    const started = createController(context)
    controller = started.controller
    const initialLoad = sync._stateInitializer.tasks.get('gameflow-phase')!.fn()

    listeners.get('/lol-gameflow/v1/gameflow-phase')!({ data: 'ChampSelect' })
    const window = runtime.windows[0]
    window.webContents.emit('did-finish-load')
    expect(window.visible).toBe(true)

    resolvePhase({ data: 'Lobby' })
    await initialLoad
    const reads = runtime.read.mock.calls.length
    vi.advanceTimersByTime(10_000)
    expect(data.gameflow.phase).toBe('ChampSelect')
    expect(window.visible).toBe(true)
    expect(runtime.read.mock.calls.length).toBeGreaterThan(reads)
  })

  it('hides both groups immediately on exit and ignores a late renderer-ready callback', () => {
    const started = createController()
    controller = started.controller
    enterChampSelect(started.context)
    const reads = runtime.read.mock.calls.length
    runInAction(() => (started.context.leagueClient.data.gameflow.phase = 'GameStart'))
    for (const window of runtime.windows) {
      expect(window.visible).toBe(false)
      window.webContents.emit('did-finish-load')
    }
    vi.advanceTimersByTime(1000)
    expect(runtime.windows.every((window) => !window.visible)).toBe(true)
    expect(runtime.read).toHaveBeenCalledTimes(reads)
  })
  it('pauses only the group without desktop space or a configured origin, preserving the other group', () => {
    const started = createController()
    controller = started.controller
    const windows = enterChampSelect(started.context)
    runtime.snapshot!.bounds.y = 70
    vi.advanceTimersByTime(100)
    expect(windows.candidates.visible).toBe(false)
    expect(windows.teammates.visible).toBe(true)
    runtime.snapshot!.bounds = { x: 79, y: 300, width: 1280, height: 720 }
    vi.advanceTimersByTime(100)
    expect(windows.candidates.visible).toBe(true)
    expect(windows.teammates.visible).toBe(false)
    runInAction(
      () =>
        (started.context.ongoingGame.settings.champSelectOverlay.candidateFirstCenterX =
          null as any)
    )
    vi.advanceTimersByTime(100)
    expect(windows.candidates.visible).toBe(false)
    expect(runtime.windows).toHaveLength(2)
  })
  it('hides on blur, minimization and missing native window, then follows the recovered client bounds', () => {
    const started = createController()
    controller = started.controller
    const windows = enterChampSelect(started.context)
    for (const field of ['isForeground', 'isMinimized'] as const) {
      runtime.snapshot![field] = field === 'isMinimized'
      vi.advanceTimersByTime(100)
      expect(runtime.windows.every((window) => !window.visible)).toBe(true)
      runtime.snapshot![field] = field !== 'isMinimized'
    }
    runtime.snapshot = null
    vi.advanceTimersByTime(100)
    expect(runtime.windows.every((window) => !window.visible)).toBe(true)
    runtime.snapshot = {
      bounds: { x: -1600, y: 250, width: 1280, height: 720 },
      isForeground: true,
      isMinimized: false,
      isVisible: true
    }
    runtime.workArea = { x: -1920, y: 87, width: 1920, height: 1040 }
    vi.advanceTimersByTime(100)
    expect(windows.candidates.bounds).toEqual({ x: -1327, y: 179, width: 405, height: 67 })
    expect(windows.teammates.bounds).toEqual({ x: -1728, y: 416, width: 120, height: 388 })
    expect(runtime.windows.every((window) => window.visible)).toBe(true)
  })
  it('converts the target physical client rectangle to DIPs before choosing its work area', () => {
    const started = createController()
    controller = started.controller
    runtime.convert.mockReturnValue({ x: 320, y: 150, width: 640, height: 360 })
    runInAction(
      () => (started.context.ongoingGame.settings.champSelectOverlay.candidateFirstCenterX = 200)
    )
    const windows = enterChampSelect(started.context)
    expect(screen.screenToDipRect).toHaveBeenCalledWith(null, runtime.snapshot!.bounds)
    expect(screen.getDisplayMatching).toHaveBeenCalledWith({
      x: 320,
      y: 150,
      width: 640,
      height: 360
    })
    expect(windows.candidates.bounds).toEqual({ x: 493, y: 79, width: 405, height: 67 })
    expect(windows.teammates).toBeUndefined()
  })
  it('recovers one failed renderer after cooldown without discarding the healthy group', () => {
    const started = createController()
    controller = started.controller
    const windows = enterChampSelect(started.context)
    windows.candidates.webContents.emit('did-fail-load', {}, -2, 'failed', '', true)
    expect(windows.candidates.destroyed).toBe(true)
    expect(windows.teammates.visible).toBe(true)
    windows.candidates.webContents.emit('did-finish-load')
    vi.advanceTimersByTime(1900)
    expect(runtime.windows).toHaveLength(2)
    vi.advanceTimersByTime(100)
    const replacement = runtime.windows[2]
    replacement.webContents.emit('did-finish-load')
    expect(replacement.group).toBe('candidates')
    expect(replacement.visible).toBe(true)
    expect(started.context.logger.warn).toHaveBeenCalledTimes(1)
    controller.dispose()
    replacement.webContents.emit('did-finish-load')
    vi.advanceTimersByTime(1000)
    expect(replacement.destroyed).toBe(true)
    expect(runtime.windows).toHaveLength(3)
    expect(started.context.protocol.unregisterPartition).toHaveBeenCalledTimes(1)
  })
  it('hides both groups on failed native reads and recovers when the next read succeeds', () => {
    const started = createController()
    controller = started.controller
    enterChampSelect(started.context)
    runtime.read.mockImplementation(() => {
      throw new Error('native read failed')
    })
    vi.advanceTimersByTime(200)
    expect(runtime.windows.every((window) => !window.visible)).toBe(true)
    expect(started.context.logger.warn).toHaveBeenCalledTimes(1)
    runtime.read.mockReset()
    vi.advanceTimersByTime(100)
    expect(runtime.windows.every((window) => window.visible)).toBe(true)
  })
  it('preserves protection sync and hides immediately on disconnection or disabled analysis', () => {
    const started = createController()
    controller = started.controller
    enterChampSelect(started.context)
    runInAction(() => (started.context.windowManager.settings.contentProtection = true))
    runtime.windows.forEach((window) =>
      expect(window.setContentProtection).toHaveBeenLastCalledWith(true)
    )
    runInAction(() => (started.context.leagueClient.state.isConnected = false))
    expect(runtime.windows.every((window) => !window.visible)).toBe(true)
    runInAction(() => (started.context.leagueClient.state.isConnected = true))
    expect(runtime.windows.every((window) => window.visible)).toBe(true)
    runInAction(() => (started.context.ongoingGame.settings.enabled = false))
    expect(runtime.windows.every((window) => !window.visible)).toBe(true)
  })
  it('does not run Windows-native tracking on unsupported platforms', () => {
    const started = createController(createContext('linux'))
    controller = started.controller
    enterChampSelect(started.context)
    vi.advanceTimersByTime(1000)
    expect(runtime.read).not.toHaveBeenCalled()
    expect(BrowserWindow).not.toHaveBeenCalled()
    expect(started.context.protocol.registerPartition).not.toHaveBeenCalled()
  })
})
