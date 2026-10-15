import { createDefaultChampSelectOverlaySettings } from '@shared/champ-select-overlay'
import type { CandidateGrabButtonState } from '@shared/champ-select-overlay/candidate-grab'
import type { ChampSelectSession } from '@shared/types/league-client/champ-select'
import { BrowserWindow, screen } from 'electron'
import { observable, observableRef, runInAction } from 'mobx'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CandidateButtonWindowController } from './candidate-button-window-controller'
import { CandidateGrabController } from './candidate-grab-controller'

const runtime = vi.hoisted(() => ({
  windows: [] as any[],
  snapshot: {
    isVisible: true,
    isMinimized: false,
    isForeground: true,
    windowHandle: 'offline-client',
    ownerProcessId: 43,
    bounds: { x: 640, y: 300, width: 1280, height: 720 }
  },
  workArea: { x: 0, y: 0, width: 2560, height: 1400 }
}))
vi.mock('@main/native', () => ({ getLeagueClientWindowSnapshot: () => runtime.snapshot }))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  const screen = Object.assign(new EventEmitter(), {
    screenToDipRect: vi.fn((_window, bounds) => bounds),
    getDisplayMatching: vi.fn(() => ({ workArea: runtime.workArea }))
  })
  return {
    screen,
    BrowserWindow: vi.fn(function (options) {
      const window = new EventEmitter() as any
      window.bounds = { x: options.x, y: options.y, width: options.width, height: options.height }
      window.visible = false
      window.destroyed = false
      window.isDestroyed = () => window.destroyed
      window.isVisible = () => window.visible
      window.isFocusable = () => options.focusable !== false
      window.getBounds = () => ({ ...window.bounds })
      window.setBounds = vi.fn((bounds) => {
        window.bounds = { ...bounds }
        window.emit('move')
        window.emit('resize')
      })
      window.showInactive = vi.fn(() => {
        window.visible = true
        window.emit('show')
      })
      window.hide = vi.fn(() => {
        if (window.visible) {
          window.visible = false
          window.emit('hide')
        }
      })
      window.destroy = vi.fn(() => {
        window.hide()
        window.destroyed = true
        window.emit('closed')
      })
      window.loadFile = vi.fn(async () => {})
      window.loadURL = vi.fn(async () => {})
      window.setAlwaysOnTop = vi.fn()
      window.setContentProtection = vi.fn()
      window.setIgnoreMouseEvents = vi.fn()
      window.setShape = vi.fn()
      const webContents = Object.assign(new EventEmitter(), {
        mainFrame: {},
        zoomFactor: 1,
        loading: false,
        isDestroyed: () => window.destroyed,
        isLoadingMainFrame() {
          return this.loading
        },
        getZoomFactor() {
          return this.zoomFactor
        },
        setZoomFactor(value) {
          this.zoomFactor = value
        },
        setWindowOpenHandler: vi.fn()
      })
      window.webContents = webContents
      runtime.windows.push(window)
      return window
    })
  }
})

function fixture(platform: NodeJS.Platform = 'win32') {
  const session = {
    id: 'offline-bench',
    localPlayerCellId: 1,
    benchEnabled: true,
    allowSubsetChampionPicks: true,
    isSpectating: false,
    timer: { phase: 'FINALIZATION' },
    benchChampions: [22, 33, 51, 22, 44].map((championId) => ({ championId, isPriority: false })),
    myTeam: [{ cellId: 1, championId: 0 }],
    actions: [
      [
        {
          id: 7,
          type: 'pick',
          actorCellId: 1,
          completed: false,
          isInProgress: true,
          championId: 51
        }
      ]
    ]
  } as ChampSelectSession
  const server = { session: structuredClone(session), currentChampion: 51 }
  const leagueClient = {
    state: observable({ isConnected: true, auth: { pid: 42 } }, { auth: observableRef }),
    data: {
      gameflow: observable({ phase: 'ChampSelect' }),
      champSelect: observable(
        { session, currentChampion: 51, currentPickableChampionIdArray: [22, 33, 44, 51] },
        { session: observableRef, currentPickableChampionIdArray: observableRef }
      ),
      lobbyTeamBuilder: { champSelect: observable({ subsetChampionList: [22, 33, 44] }) }
    },
    api: {
      champSelect: {
        getSession: vi.fn(async () => ({ data: structuredClone(server.session) })),
        getCurrentChamp: vi.fn(async () => ({ data: server.currentChampion })),
        getPickableChampIds: vi.fn(async () => ({ data: [22, 33, 44, 51] })),
        benchSwap: vi.fn(async (id) => {
          server.currentChampion = id
        }),
        pickOrBan: vi.fn()
      },
      lobbyTeamBuilder: {
        getChampSelectSubsetChampionList: vi.fn(async () => ({ data: [22, 33, 44] }))
      }
    }
  }
  const ongoingGame = {
    getChampSelectOverlaySettings() {
      return this.settings.champSelectOverlay
    },
    settings: observable({
      enabled: true,
      champSelectOverlay: {
        ...createDefaultChampSelectOverlaySettings(),
        candidateFirstCenterX: 300
      }
    })
  }
  const bandWindow = {
    visible: true,
    bounds: { x: 913, y: 229, width: 288, height: 67 },
    isDestroyed: () => false,
    isVisible() {
      return this.visible
    },
    getBounds() {
      return this.bounds
    }
  }
  const states = new Map<any, CandidateGrabButtonState>()
  const context = {
    platform,
    leagueClient,
    ongoingGame,
    protocol: { registerPartition: vi.fn(), unregisterPartition: vi.fn() },
    windowManager: {
      settings: observable({ contentProtection: false }),
      auxWindow: { setBenchCandidateButtonsVisible: vi.fn() }
    },
    logger: { warn: vi.fn() },
    getCandidateBandWindow: () => bandWindow,
    sendState: (sender, state) => states.set(sender, state)
  }
  let buttons!: CandidateButtonWindowController
  const grab = new CandidateGrabController({
    ...context,
    readClientWindow: () => runtime.snapshot,
    onViewChanged: (sender, view, identity) => {
      states.set(sender, { identity, busy: view.busy })
      buttons.onGrantStateChanged(sender, identity)
    }
  } as any)
  buttons = new CandidateButtonWindowController({ ...context, candidateGrab: grab } as any)
  grab.start()
  buttons.start()
  const ready = (window) => {
    window.webContents.emit('did-finish-load')
    expect(
      buttons.rendererReady({
        sender: window.webContents,
        senderFrame: window.webContents.mainFrame
      } as any)
    ).toBe(true)
  }
  const click = (window, identity = states.get(window.webContents)?.identity) =>
    grab.grabCandidate(
      { sender: window.webContents, senderFrame: window.webContents.mainFrame } as any,
      identity
    )
  return { context, buttons, grab, leagueClient, server, bandWindow, states, ready, click }
}

describe('main-owned bench buttons and visibility leases', () => {
  let f: ReturnType<typeof fixture>
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    runtime.windows.length = 0
    runtime.snapshot.isForeground = true
    runtime.snapshot.bounds = { x: 640, y: 300, width: 1280, height: 720 }
    runtime.workArea.y = 0
  })
  afterEach(() => {
    f?.buttons.dispose()
    f?.grab.dispose()
    vi.useRealTimers()
  })

  it('waits for mounted current frames, then grants only tiny visible bench inputs in native slots', async () => {
    f = fixture()
    expect(runtime.windows).toHaveLength(3)
    expect(runtime.windows.map((window) => window.bounds)).toEqual([
      { x: 924, y: 205, width: 32, height: 22 },
      { x: 983, y: 205, width: 32, height: 22 },
      { x: 1158, y: 205, width: 32, height: 22 }
    ])
    expect(runtime.windows.every((window) => !window.visible)).toBe(true)
    expect(
      f.context.windowManager.auxWindow.setBenchCandidateButtonsVisible
    ).toHaveBeenLastCalledWith(false)
    const window = runtime.windows[0]
    window.webContents.emit('did-finish-load')
    expect(window.visible).toBe(false)
    expect(f.buttons.rendererReady({ sender: window.webContents, senderFrame: {} } as any)).toBe(
      false
    )
    f.ready(window)
    expect(window.visible).toBe(true)
    expect(window.setIgnoreMouseEvents).not.toHaveBeenCalled()
    expect(
      f.context.windowManager.auxWindow.setBenchCandidateButtonsVisible
    ).toHaveBeenLastCalledWith(true)
    expect(await f.click(window)).toEqual({ state: 'confirmed', operation: 'swap', championId: 22 })
    expect(f.leagueClient.api.champSelect.pickOrBan).not.toHaveBeenCalled()
    for (const [options] of vi.mocked(BrowserWindow).mock.calls)
      expect(options).toMatchObject({
        focusable: false,
        skipTaskbar: true,
        show: false,
        width: 32,
        height: 22
      })
  })

  it('reuses ready windows through unchanged session updates and polling without hide or reload', () => {
    f = fixture()
    runtime.windows.forEach(f.ready)
    const windows = [...runtime.windows]
    windows.forEach((window) => {
      window.hide.mockClear()
      window.showInactive.mockClear()
    })
    for (let index = 0; index < 20; index++) {
      runInAction(() => {
        f.leagueClient.data.champSelect.session = structuredClone(f.server.session)
      })
      vi.advanceTimersByTime(100)
    }
    expect(runtime.windows).toEqual(windows)
    for (const window of windows) {
      expect(window.hide).not.toHaveBeenCalled()
      expect(window.showInactive).not.toHaveBeenCalled()
      expect(window.destroy).not.toHaveBeenCalled()
      expect(window.loadFile).toHaveBeenCalledTimes(1)
    }
  })

  it('never suppresses Mini for configured, loading, disabled or space-limited buttons', () => {
    f = fixture()
    runInAction(() => (f.leagueClient.data.champSelect.currentPickableChampionIdArray = []))
    runtime.windows.forEach(f.ready)
    expect(runtime.windows.every((window) => window.visible)).toBe(true)
    expect([...f.states.values()].every((state) => state.identity === null)).toBe(true)
    expect(
      f.context.windowManager.auxWindow.setBenchCandidateButtonsVisible
    ).toHaveBeenLastCalledWith(false)
    runtime.workArea.y = 215
    vi.advanceTimersByTime(100)
    expect(runtime.windows.every((window) => window.destroyed || !window.visible)).toBe(true)
    expect(
      f.context.windowManager.auxWindow.setBenchCandidateButtonsVisible
    ).toHaveBeenLastCalledWith(false)
  })

  it('revokes hidden controls immediately, and old identities remain stale after re-show', async () => {
    f = fixture()
    const window = runtime.windows[0]
    f.ready(window)
    const old = f.states.get(window.webContents)!.identity!
    window.hide()
    expect(
      f.context.windowManager.auxWindow.setBenchCandidateButtonsVisible
    ).toHaveBeenLastCalledWith(false)
    expect(await f.click(window, old)).toEqual({ state: 'stale' })
    vi.advanceTimersByTime(100)
    expect(window.visible).toBe(true)
    expect(await f.click(window, old)).toEqual({ state: 'stale' })
  })

  it('invalidates before reload, DPI/display changes and before following moved client bounds', async () => {
    f = fixture()
    const window = runtime.windows[0]
    f.ready(window)
    const old = f.states.get(window.webContents)!.identity!
    window.webContents.emit('did-start-loading')
    expect(window.visible).toBe(false)
    window.webContents.mainFrame = {}
    f.ready(window)
    expect(await f.click(window, old)).toEqual({ state: 'stale' })
    const preDisplay = f.states.get(window.webContents)!.identity!
    screen.emit('display-metrics-changed', {}, {}, ['scaleFactor'])
    expect(window.visible).toBe(false)
    expect(await f.click(window, preDisplay)).toEqual({ state: 'stale' })
    runtime.snapshot.bounds.x += 100
    vi.advanceTimersByTime(100)
    expect(window.visible).toBe(false)
    f.bandWindow.bounds.x += 100
    vi.advanceTimersByTime(100)
    expect(window.visible).toBe(true)
    expect(window.bounds.x).toBe(1024)
    expect(await f.click(window, preDisplay)).toEqual({ state: 'stale' })
  })

  it('hides when foreground or data-band visibility is lost, preserving automatic fallback', () => {
    f = fixture()
    runtime.windows.forEach(f.ready)
    runtime.snapshot.isForeground = false
    vi.advanceTimersByTime(100)
    expect(runtime.windows.every((window) => !window.visible)).toBe(true)
    expect(
      f.context.windowManager.auxWindow.setBenchCandidateButtonsVisible
    ).toHaveBeenLastCalledWith(false)
    runtime.snapshot.isForeground = true
    f.bandWindow.visible = false
    vi.advanceTimersByTime(100)
    expect(runtime.windows.every((window) => !window.visible)).toBe(true)
  })

  it('updates identities when the native bench order changes instead of granting personal slots', async () => {
    f = fixture()
    runtime.windows.forEach(f.ready)
    const old = f.states.get(runtime.windows[0].webContents)!.identity!
    runInAction(
      () =>
        (f.leagueClient.data.champSelect.session = {
          ...f.server.session,
          benchChampions: [...f.server.session.benchChampions].reverse()
        })
    )
    expect(await f.click(runtime.windows[0], old)).toEqual({ state: 'stale' })
    expect(f.states.get(runtime.windows[0].webContents)?.identity?.championId).toBe(44)
    expect(f.leagueClient.api.champSelect.benchSwap).not.toHaveBeenCalled()
  })

  it('avoids Windows-only input windows on unsupported platforms', () => {
    f = fixture('linux')
    expect(BrowserWindow).not.toHaveBeenCalled()
    expect(f.context.protocol.registerPartition).not.toHaveBeenCalled()
  })
})
