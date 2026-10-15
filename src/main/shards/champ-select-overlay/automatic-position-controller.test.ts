import { createDefaultChampSelectOverlaySettings } from '@shared/champ-select-overlay'
import { observable, runInAction } from 'mobx'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AutomaticPositionController } from './automatic-position-controller'

const capture = vi.hoisted(() => ({
  prepare: vi.fn(),
  capture: vi.fn(),
  stop: vi.fn(),
  invalidate: vi.fn()
}))
vi.mock('./automatic-position-capture-executor', () => ({
  AutomaticPositionCapture: class {
    prepare = capture.prepare
    capture = capture.capture
    stop = capture.stop
    invalidate = capture.invalidate
  }
}))
vi.mock('electron', () => ({ nativeImage: {}, screen: {} }))

const controllers: AutomaticPositionController[] = []
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  capture.prepare.mockResolvedValue(false)
})
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose())
  vi.useRealTimers()
})

function fixture(platform: NodeJS.Platform = 'win32') {
  const rect = { x: 100, y: 100, width: 1280, height: 720 }
  const leagueClient = {
    state: observable({ isConnected: true, connectionState: 'connected', auth: { pid: 42 } }),
    data: {
      gameflow: observable({ phase: 'Lobby' }),
      champSelect: observable({
        session: {
          id: 'current-selection',
          gameId: 1,
          benchEnabled: true,
          benchChampions: [{ championId: 1 }],
          myTeam: [{ cellId: 0 }]
        }
      })
    }
  }
  const ongoingGame = {
    settings: observable({
      enabled: true,
      champSelectOverlay: createDefaultChampSelectOverlaySettings()
    }),
    setAutomaticChampSelectOverlay: vi.fn(),
    readAutomaticChampSelectOverlayCache: vi.fn(async () => null),
    saveAutomaticChampSelectOverlayCache: vi.fn(async () => {})
  }
  const readWindow = vi.fn(() => ({
    bounds: rect,
    windowHandle: '123',
    ownerProcessId: 42,
    isVisible: true,
    isMinimized: false,
    isForeground: true
  }))
  const context = {
    platform,
    leagueClient,
    ongoingGame,
    readWindow,
    manualEditing: vi.fn(() => false),
    diagnostic: vi.fn(),
    toDip: (bounds: typeof rect) => ({ ...bounds }),
    getDisplay: () => ({ id: 1, scaleFactor: 1, bounds: rect, workArea: rect })
  }
  const controller = new AutomaticPositionController(context as any)
  controllers.push(controller)
  return { controller, context, leagueClient, ongoingGame, readWindow }
}

describe('automatic positioning lifecycle coordination', () => {
  it('arms on selection entry without a manual command and waits for a stable target', async () => {
    const f = fixture()
    f.controller.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.readWindow).not.toHaveBeenCalled()
    expect(capture.prepare).not.toHaveBeenCalled()
    runInAction(() => {
      f.leagueClient.data.gameflow.phase = 'ChampSelect'
    })
    await vi.advanceTimersByTimeAsync(499)
    expect(capture.prepare).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(251)
    expect(capture.prepare).toHaveBeenCalledOnce()
    expect(capture.prepare.mock.calls[0][0].context).toMatchObject({
      pid: 42,
      windowHandle: '123',
      phase: 'ChampSelect'
    })
    expect(capture.capture).not.toHaveBeenCalled()
  })

  it('keeps manual geometry and active manual editing ahead of automatic preparation', async () => {
    const f = fixture()
    runInAction(() => {
      f.leagueClient.data.gameflow.phase = 'ChampSelect'
      f.ongoingGame.settings.champSelectOverlay.teammateFirstCenterY = 123
    })
    f.controller.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(capture.prepare).not.toHaveBeenCalled()
    runInAction(() => {
      f.ongoingGame.settings.champSelectOverlay.teammateFirstCenterY = null
    })
    f.context.manualEditing.mockReturnValue(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(capture.prepare).not.toHaveBeenCalled()
    expect(f.ongoingGame.settings.champSelectOverlay.teammateFirstCenterY).toBeNull()
  })

  it('revokes an active selection immediately on phase turnover and stops further work on dispose', async () => {
    const f = fixture()
    f.controller.start()
    runInAction(() => {
      f.leagueClient.data.gameflow.phase = 'ChampSelect'
    })
    await vi.advanceTimersByTimeAsync(750)
    const attempts = capture.prepare.mock.calls.length
    runInAction(() => {
      f.leagueClient.data.gameflow.phase = 'InProgress'
    })
    expect(f.ongoingGame.setAutomaticChampSelectOverlay).toHaveBeenLastCalledWith(null)
    f.controller.dispose()
    f.controller.dispose()
    f.controller.start()
    runInAction(() => {
      f.leagueClient.data.gameflow.phase = 'ChampSelect'
    })
    await vi.advanceTimersByTimeAsync(10000)
    expect(capture.prepare).toHaveBeenCalledTimes(attempts)
    expect(capture.stop).toHaveBeenCalledOnce()
  })

  it('does not query native windows or schedule capture on unsupported platforms', async () => {
    const f = fixture('linux')
    runInAction(() => {
      f.leagueClient.data.gameflow.phase = 'ChampSelect'
    })
    f.controller.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.readWindow).not.toHaveBeenCalled()
    expect(capture.prepare).not.toHaveBeenCalled()
  })
})
