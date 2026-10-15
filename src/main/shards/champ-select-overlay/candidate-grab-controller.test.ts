import type {
  CandidateCardRole,
  CandidateGrabIdentity
} from '@shared/champ-select-overlay/candidate-grab'
import { CHAMP_SELECT_GRAB_INPUT_SHAPE } from '@shared/champ-select-overlay/candidate-grab'
import type { ChampSelectSession } from '@shared/types/league-client/champ-select'
import { observable, observableRef, runInAction } from 'mobx'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CandidateGrabController } from './candidate-grab-controller'
import { ChampSelectOverlayIpcHandlers } from './ipc-handlers'

class InputWindow extends EventEmitter {
  visible = true
  destroyed = false
  focusable = false
  bounds = { x: 5, y: 8, width: 32, height: 22 }
  webContents = Object.assign(new EventEmitter(), {
    mainFrame: {},
    loading: false,
    destroyed: false,
    isLoadingMainFrame() {
      return this.loading
    },
    isDestroyed() {
      return this.destroyed
    },
    getZoomFactor() {
      return 1
    }
  })
  getBounds() {
    return this.bounds
  }
  isVisible() {
    return this.visible
  }
  isDestroyed() {
    return this.destroyed
  }
  isFocusable() {
    return this.focusable
  }
}

function createFixture() {
  const session = {
    id: 'offline-session',
    localPlayerCellId: 1,
    benchEnabled: true,
    allowSubsetChampionPicks: true,
    isSpectating: false,
    timer: { phase: 'FINALIZATION' },
    benchChampions: [{ championId: 22 }, { championId: 33 }],
    myTeam: [
      { cellId: 1, championId: 51 },
      { cellId: 2, championId: 99 }
    ],
    actions: [
      [
        {
          id: 7,
          actorCellId: 1,
          type: 'pick',
          completed: true,
          isInProgress: false,
          championId: 51
        }
      ]
    ]
  } as ChampSelectSession
  const serverSession = structuredClone(session)
  const serverState = { currentChampion: 51 as number | null }
  const api = {
    champSelect: {
      getSession: vi.fn(async () => ({ data: structuredClone(serverSession) })),
      getPickableChampIds: vi.fn(async () => ({ data: [11, 22, 33, 51] })),
      getCurrentChamp: vi.fn(async () => ({ data: serverState.currentChampion })),
      pickOrBan: vi.fn(),
      benchSwap: vi.fn(async (championId: number) => {
        serverSession.myTeam[0].championId = championId
        serverState.currentChampion = championId
      })
    },
    lobbyTeamBuilder: { getChampSelectSubsetChampionList: vi.fn(async () => ({ data: [22, 11] })) }
  }
  const clientWindow = {
    isVisible: true,
    isForeground: true,
    isMinimized: false,
    windowHandle: 'offline-hwnd',
    ownerProcessId: 43,
    bounds: { x: 100, y: 200, width: 1280, height: 720 }
  }
  const leagueClient = {
    api,
    state: observable({ isConnected: true, auth: { pid: 42 } }, { auth: observableRef }),
    data: {
      gameflow: observable({ phase: 'ChampSelect' }),
      champSelect: observable(
        {
          session,
          currentChampion: 51 as number | null,
          currentPickableChampionIdArray: [11, 22, 33, 51]
        },
        { session: observableRef, currentPickableChampionIdArray: observableRef }
      ),
      lobbyTeamBuilder: {
        champSelect: observable(
          { subsetChampionList: [22, 11] },
          { subsetChampionList: observableRef }
        )
      }
    }
  }
  const context = {
    platform: 'win32',
    leagueClient,
    ongoingGame: {
      getChampSelectOverlaySettings() {
        return this.settings.champSelectOverlay
      },
      settings: observable({ enabled: true, champSelectOverlay: { candidateStep: 58.5 } })
    },
    logger: { warn: vi.fn() },
    readClientWindow: vi.fn(() => clientWindow),
    onViewChanged: vi.fn()
  }
  const controller = new CandidateGrabController(context as any)
  controller.start()
  const handlers = new Map<string, Function>()
  new ChampSelectOverlayIpcHandlers(
    {
      onCall: (_ns: string, name: string, handler: Function) => handlers.set(name, handler)
    } as any,
    'champ-select-overlay-main',
    controller
  ).register()
  const register = (
    championId: number,
    role: CandidateCardRole = 'bench',
    window = new InputWindow()
  ) => {
    const view = controller.refresh()
    const identity: CandidateGrabIdentity = {
      sessionId: view.sessionId!,
      revision: view.revision,
      championId
    }
    const revoke = controller.registerActionWindow(window as any, role, identity)
    const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame }
    return {
      window,
      identity,
      event,
      revoke,
      call: (...args: unknown[]) => handlers.get('grabCandidate')!(event, ...args)
    }
  }
  return {
    controller,
    context,
    api,
    clientWindow,
    leagueClient,
    session,
    serverSession,
    serverState,
    register
  }
}

describe('public bench input IPC to swap confirmation', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('uses only the public bench and confirms the existing benchSwap helper', async () => {
    const f = createFixture()
    expect(f.controller.refresh().candidates).toEqual([
      { role: 'bench', championId: 22, eligible: true },
      { role: 'bench', championId: 33, eligible: true }
    ])
    const input = f.register(22)
    expect(await input.call(input.identity)).toEqual({
      state: 'confirmed',
      operation: 'swap',
      championId: 22
    })
    expect(f.api.champSelect.benchSwap).toHaveBeenCalledWith(22)
    expect(f.api.champSelect.pickOrBan).not.toHaveBeenCalled()
    expect(f.api.champSelect.getSession).toHaveBeenCalledTimes(2)
    expect(f.api.lobbyTeamBuilder.getChampSelectSubsetChampionList).not.toHaveBeenCalled()
    f.controller.dispose()
  })

  it('rejects personal-choice cards even when the same champion exists in the public bench', async () => {
    const f = createFixture()
    for (const championId of [11, 22, 33]) {
      const personal = f.register(championId, 'personal-choice')
      expect(personal.revoke).toBeNull()
      expect(await personal.call(personal.identity)).toEqual({ state: 'stale' })
    }
    expect(f.register(11, 'bench').revoke).toBeNull()
    expect(f.api.champSelect.getSession).not.toHaveBeenCalled()
    const bench = f.register(22, 'bench')
    expect(await bench.call(bench.identity)).toEqual({
      state: 'confirmed',
      operation: 'swap',
      championId: 22
    })
    expect(f.api.champSelect.pickOrBan).not.toHaveBeenCalled()
    f.controller.dispose()
  })

  it('never converts an unfinished personal pick into a lock request', async () => {
    const f = createFixture()
    const next = structuredClone(f.session)
    next.timer.phase = 'BAN_PICK'
    next.myTeam[0].championId = 0
    next.actions[0][0].completed = false
    next.actions[0][0].isInProgress = true
    runInAction(() => {
      f.leagueClient.data.champSelect.session = next
      f.leagueClient.data.champSelect.currentChampion = null
    })
    expect(f.controller.refresh().candidates.every((c) => !c.eligible)).toBe(true)
    for (const role of ['personal-choice', 'bench'] as const) {
      const input = f.register(22, role)
      expect(input.revoke).toBeNull()
      expect(await input.call(input.identity)).toEqual({ state: 'stale' })
    }
    expect(f.api.champSelect.benchSwap).not.toHaveBeenCalled()
    expect(f.api.champSelect.pickOrBan).not.toHaveBeenCalled()
    f.controller.dispose()
  })

  it('revokes a reused window when its role changes to a personal-choice card with the same id', async () => {
    const f = createFixture()
    const bench = f.register(22, 'bench')
    expect(bench.revoke).not.toBeNull()
    expect(f.register(22, 'personal-choice', bench.window).revoke).toBeNull()
    expect(await bench.call(bench.identity)).toEqual({ state: 'stale' })
    expect(f.api.champSelect.benchSwap).not.toHaveBeenCalled()
    expect(f.api.champSelect.pickOrBan).not.toHaveBeenCalled()
    f.controller.dispose()
  })

  it('retains the original BAN_PICK bench eligibility rule without importing personal choices', async () => {
    const f = createFixture()
    const next = structuredClone(f.session)
    next.timer.phase = 'BAN_PICK'
    f.serverSession.timer.phase = 'BAN_PICK'
    runInAction(() => (f.leagueClient.data.champSelect.session = next))
    expect(f.controller.refresh().candidates).toEqual([
      { role: 'bench', championId: 22, eligible: true },
      { role: 'bench', championId: 33, eligible: false }
    ])
    expect(f.register(11).revoke).toBeNull()
    const input = f.register(22)
    expect(await input.call(input.identity)).toEqual({
      state: 'confirmed',
      operation: 'swap',
      championId: 22
    })
    expect(f.api.lobbyTeamBuilder.getChampSelectSubsetChampionList).toHaveBeenCalledOnce()
    expect(f.api.champSelect.pickOrBan).not.toHaveBeenCalled()
    f.controller.dispose()
  })

  it.each([
    { uri: '/arbitrary' },
    { method: 'POST' },
    { actionId: 99 },
    { completed: true },
    { role: 'bench' },
    { championId: 1.5 },
    { championId: -1 },
    { revision: -1 },
    { sessionId: '' }
  ])('rejects extra or malformed fields before API reads: %j', async (change) => {
    const f = createFixture()
    const input = f.register(22)
    expect(await input.call({ ...input.identity, ...change })).toEqual({ state: 'unavailable' })
    expect(f.api.champSelect.getSession).not.toHaveBeenCalled()
    f.controller.dispose()
  })

  it('rejects extra arguments, unknown senders, subframes and forged teammate ids', async () => {
    const f = createFixture()
    const input = f.register(22)
    expect(await input.call(input.identity, 'extra')).toEqual({ state: 'unavailable' })
    expect(await input.call({ ...input.identity, championId: 99 })).toEqual({ state: 'stale' })
    expect(
      await f.controller.grabCandidate(
        { sender: new InputWindow().webContents } as any,
        input.identity
      )
    ).toEqual({ state: 'stale' })
    expect(
      await f.controller.grabCandidate({ ...input.event, senderFrame: {} } as any, input.identity)
    ).toEqual({ state: 'stale' })
    expect(f.api.champSelect.getSession).not.toHaveBeenCalled()
    f.controller.dispose()
  })

  it('does not authorize statistics windows, focusable windows, personal-only or teammate ids', () => {
    const f = createFixture()
    const stats = new InputWindow()
    stats.bounds = { ...stats.bounds, width: 54, height: 67 }
    expect(f.register(22, 'bench', stats).revoke).toBeNull()
    const focusable = new InputWindow()
    focusable.focusable = true
    expect(f.register(22, 'bench', focusable).revoke).toBeNull()
    expect(f.register(11).revoke).toBeNull()
    expect(f.register(99).revoke).toBeNull()
    f.controller.dispose()
  })

  it.each(['PLANNING', 'GAME_STARTING', 'UNKNOWN'])('rejects phase %s', async (phase) => {
    const f = createFixture()
    const input = f.register(22)
    runInAction(
      () =>
        (f.leagueClient.data.champSelect.session = {
          ...f.session,
          timer: { ...f.session.timer, phase }
        })
    )
    expect(await input.call(input.identity)).toEqual({ state: 'stale' })
    expect(f.api.champSelect.benchSwap).not.toHaveBeenCalled()
    f.controller.dispose()
  })

  it.each(['spectating', 'ordinary-bp', 'subset-disabled'])(
    'rejects unavailable selection context %s',
    async (condition) => {
      const f = createFixture()
      const input = f.register(22)
      const next = structuredClone(f.session)
      if (condition === 'spectating') next.isSpectating = true
      if (condition === 'ordinary-bp') next.benchEnabled = false
      if (condition === 'subset-disabled') {
        next.timer.phase = 'BAN_PICK'
        next.allowSubsetChampionPicks = false
      }
      runInAction(() => (f.leagueClient.data.champSelect.session = next))
      expect(await input.call(input.identity)).toEqual({ state: 'stale' })
      expect(f.api.champSelect.benchSwap).not.toHaveBeenCalled()
      f.controller.dispose()
    }
  )

  it.each([
    'hide',
    'closed',
    'move',
    'resize',
    'did-start-loading',
    'render-process-gone',
    'destroyed',
    'zoom-changed'
  ])('revokes input capability on %s', async (eventName) => {
    const f = createFixture()
    const input = f.register(22)
    if (['hide', 'closed', 'move', 'resize'].includes(eventName)) input.window.emit(eventName)
    else input.window.webContents.emit(eventName)
    expect(await input.call(input.identity)).toEqual({ state: 'stale' })
    expect(f.api.champSelect.getSession).not.toHaveBeenCalled()
    f.controller.dispose()
  })

  it.each([
    'session',
    'revision',
    'candidate-reorder',
    'candidate-removed',
    'client-moved',
    'connection',
    'disabled'
  ])('invalidates old controls on %s', async (change) => {
    const f = createFixture()
    const input = f.register(22)
    if (change === 'session')
      runInAction(
        () => (f.leagueClient.data.champSelect.session = { ...f.session, id: 'next-session' })
      )
    if (change === 'revision') input.identity.revision -= 1
    if (change === 'candidate-reorder')
      runInAction(
        () =>
          (f.leagueClient.data.champSelect.session = {
            ...f.session,
            benchChampions: [...f.session.benchChampions].reverse()
          })
      )
    if (change === 'candidate-removed')
      runInAction(
        () =>
          (f.leagueClient.data.champSelect.session = {
            ...f.session,
            benchChampions: [{ championId: 33, isPriority: false }]
          })
      )
    if (change === 'client-moved') f.clientWindow.bounds.x += 8
    if (change === 'connection') runInAction(() => (f.leagueClient.state.auth = { pid: 42 }))
    if (change === 'disabled') runInAction(() => (f.context.ongoingGame.settings.enabled = false))
    expect(await input.call(input.identity)).toEqual({ state: 'stale' })
    expect(f.api.champSelect.benchSwap).not.toHaveBeenCalled()
    f.controller.dispose()
  })

  it('does not revive old controls when foreground focus returns', async () => {
    const f = createFixture()
    const input = f.register(22)
    f.clientWindow.isForeground = false
    vi.advanceTimersByTime(100)
    f.clientWindow.isForeground = true
    expect(await input.call(input.identity)).toEqual({ state: 'stale' })
    f.controller.dispose()
  })

  it.each(['focus', 'disconnect', 'candidate', 'own-selection'])(
    'revalidates %s after asynchronous API reads',
    async (change) => {
      const f = createFixture()
      const input = f.register(22)
      f.api.champSelect.getPickableChampIds.mockImplementationOnce(async () => {
        if (change === 'focus') f.clientWindow.isForeground = false
        if (change === 'disconnect') runInAction(() => (f.leagueClient.state.isConnected = false))
        return { data: change === 'candidate' ? [11, 33, 51] : [11, 22, 33, 51] }
      })
      if (change === 'own-selection')
        f.api.champSelect.getSession.mockImplementationOnce(async () => {
          const next = structuredClone(f.serverSession)
          next.myTeam[0].championId = 0
          return { data: next }
        })
      expect(await input.call(input.identity)).toEqual({ state: 'stale' })
      expect(f.api.champSelect.benchSwap).not.toHaveBeenCalled()
      expect(f.controller.refresh().busy).toBe(false)
      f.controller.dispose()
    }
  )

  it('allows one in-flight request with no queue and releases controls after failure', async () => {
    const f = createFixture()
    const first = f.register(22),
      second = f.register(33)
    let rejectRead!: (reason: Error) => void
    f.api.champSelect.getSession.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRead = reject
        })
    )
    const pending = first.call(first.identity)
    expect(f.controller.refresh().busy).toBe(true)
    expect(await second.call(second.identity)).toEqual({ state: 'busy' })
    rejectRead(new Error('private-url-and-account'))
    expect(await pending).toEqual({ state: 'failed' })
    expect(f.controller.refresh().busy).toBe(false)
    expect(f.context.onViewChanged.mock.calls.filter(([, view]) => view.busy)).toHaveLength(2)
    expect(await second.call(second.identity)).toEqual({
      state: 'confirmed',
      operation: 'swap',
      championId: 33
    })
    expect(f.context.logger.warn).toHaveBeenCalledWith(
      'Candidate selection could not be confirmed',
      expect.objectContaining({ accepted: false, error: 'Error' })
    )
    f.controller.dispose()
  })

  it.each(['not-selected', 'hover-only', 'teammate-only', 'new-session', 'readback-error'])(
    'does not report HTTP acceptance as success: %s',
    async (condition) => {
      const f = createFixture()
      const input = f.register(22)
      f.api.champSelect.benchSwap.mockImplementationOnce(async () => {
        if (condition === 'hover-only') f.serverSession.myTeam[0].championPickIntent = 22
        if (condition === 'teammate-only') f.serverSession.myTeam[1].championId = 22
        if (condition === 'new-session') f.serverSession.id = 'other-session'
        if (condition === 'readback-error')
          f.api.champSelect.getSession.mockRejectedValueOnce(new Error('private response'))
      })
      expect(await input.call(input.identity)).toEqual({ state: 'unconfirmed', championId: 22 })
      expect(f.controller.refresh().busy).toBe(false)
      f.controller.dispose()
    }
  )

  it('releases busy after mutation rejection and revokes controls at disposal', async () => {
    const f = createFixture()
    const input = f.register(22)
    f.api.champSelect.benchSwap.mockRejectedValueOnce(new Error('private mutation detail'))
    expect(await input.call(input.identity)).toEqual({ state: 'failed' })
    expect(f.controller.refresh().busy).toBe(false)
    f.controller.dispose()
    expect(await input.call(input.identity)).toEqual({ state: 'stale' })
    expect(f.api.champSelect.benchSwap).toHaveBeenCalledOnce()
    expect(f.api.champSelect.pickOrBan).not.toHaveBeenCalled()
  })

  it('revokes a renderer that cannot receive busy state and still releases the request', async () => {
    const f = createFixture()
    const input = f.register(22)
    f.context.onViewChanged.mockImplementation((_sender, view) => {
      if (view.busy) throw new Error('private renderer detail')
    })
    expect(await input.call(input.identity)).toEqual({ state: 'stale' })
    expect(f.api.champSelect.benchSwap).not.toHaveBeenCalled()
    expect(f.controller.refresh().busy).toBe(false)
    expect(f.context.logger.warn).toHaveBeenCalledWith(
      'Candidate input state could not be delivered'
    )
    f.controller.dispose()
  })

  it.each(['BAN_PICK', 'FINALIZATION'])(
    'swaps with an unfinished pick and delayed myTeam in %s',
    async (phase) => {
      const f = createFixture()
      const next = structuredClone(f.session)
      next.timer.phase = phase
      next.myTeam[0].championId = 0
      next.actions[0][0].completed = false
      next.actions[0][0].isInProgress = true
      Object.assign(f.serverSession, structuredClone(next))
      runInAction(() => (f.leagueClient.data.champSelect.session = next))
      f.api.champSelect.benchSwap.mockImplementationOnce(async (id) => {
        f.serverState.currentChampion = id
      })
      const input = f.register(22)
      expect(input.revoke).not.toBeNull()
      expect(await input.call(input.identity)).toEqual({
        state: 'confirmed',
        operation: 'swap',
        championId: 22
      })
      expect(f.serverSession.myTeam[0].championId).toBe(0)
      expect(f.api.champSelect.pickOrBan).not.toHaveBeenCalled()
      f.controller.dispose()
    }
  )

  it('allows FINALIZATION with no current champion and no local myTeam row', async () => {
    const f = createFixture()
    const next = structuredClone(f.session)
    next.myTeam = []
    next.actions[0][0].completed = false
    Object.assign(f.serverSession, structuredClone(next))
    f.serverState.currentChampion = null
    runInAction(() => {
      f.leagueClient.data.champSelect.session = next
      f.leagueClient.data.champSelect.currentChampion = null
    })
    f.api.champSelect.benchSwap.mockImplementationOnce(async (id) => {
      f.serverState.currentChampion = id
    })
    const input = f.register(22)
    expect(await input.call(input.identity)).toEqual({
      state: 'confirmed',
      operation: 'swap',
      championId: 22
    })
    expect(f.api.champSelect.pickOrBan).not.toHaveBeenCalled()
    f.controller.dispose()
  })

  it('keeps BAN_PICK without /current-champion read-only even when myTeam claims a champion', () => {
    const f = createFixture()
    runInAction(() => {
      f.leagueClient.data.champSelect.session = {
        ...f.session,
        timer: { ...f.session.timer, phase: 'BAN_PICK' }
      }
      f.leagueClient.data.champSelect.currentChampion = null
    })
    expect(f.register(22).revoke).toBeNull()
    expect(f.api.champSelect.pickOrBan).not.toHaveBeenCalled()
    expect(f.api.champSelect.benchSwap).not.toHaveBeenCalled()
    f.controller.dispose()
  })

  it('requires pickable in FINALIZATION while ignoring subset membership', async () => {
    const f = createFixture()
    runInAction(() => (f.leagueClient.data.lobbyTeamBuilder.champSelect.subsetChampionList = []))
    const input = f.register(33)
    f.api.champSelect.getPickableChampIds.mockResolvedValueOnce({ data: [11, 22, 51] })
    expect(await input.call(input.identity)).toEqual({ state: 'stale' })
    expect(f.api.champSelect.benchSwap).not.toHaveBeenCalled()
    expect(f.api.lobbyTeamBuilder.getChampSelectSubsetChampionList).not.toHaveBeenCalled()
    expect(await input.call(input.identity)).toEqual({
      state: 'confirmed',
      operation: 'swap',
      championId: 33
    })
    f.controller.dispose()
  })

  it('rejects a changed independent current champion during the fresh reads', async () => {
    const f = createFixture()
    const input = f.register(22)
    f.api.champSelect.getCurrentChamp.mockResolvedValueOnce({ data: 33 })
    expect(await input.call(input.identity)).toEqual({ state: 'stale' })
    expect(f.api.champSelect.benchSwap).not.toHaveBeenCalled()
    f.controller.dispose()
  })

  it('rejects old queued identities after a hide and fresh registration on the same frame', async () => {
    const f = createFixture()
    const old = f.register(22)
    old.window.emit('hide')
    const fresh = f.register(22, 'bench', old.window)
    expect(fresh.identity.revision).toBeGreaterThan(old.identity.revision)
    expect(await old.call(old.identity)).toEqual({ state: 'stale' })
    expect(await fresh.call(fresh.identity)).toEqual({
      state: 'confirmed',
      operation: 'swap',
      championId: 22
    })
    f.controller.dispose()
  })

  it('does not authorize a new frame with an old frame grant', async () => {
    const f = createFixture()
    const input = f.register(22)
    input.window.webContents.mainFrame = {}
    expect(
      await f.controller.grabCandidate(
        {
          sender: input.window.webContents,
          senderFrame: input.window.webContents.mainFrame
        } as any,
        input.identity
      )
    ).toEqual({ state: 'stale' })
    expect(f.api.champSelect.benchSwap).not.toHaveBeenCalled()
    f.controller.dispose()
  })

  it('requires a main-declared tight input shape when Windows enforces a larger outer height', async () => {
    const f = createFixture()
    const window = new InputWindow()
    window.bounds.height = 39
    const input = f.register(22, 'bench', window)
    expect(input.revoke).toBeNull()
    expect(
      f.controller.registerActionWindow(window as any, 'bench', input.identity, {
        ...CHAMP_SELECT_GRAB_INPUT_SHAPE,
        height: 39
      })
    ).toBeNull()
    expect(
      f.controller.registerActionWindow(
        window as any,
        'personal-choice',
        input.identity,
        CHAMP_SELECT_GRAB_INPUT_SHAPE
      )
    ).toBeNull()
    expect(
      f.controller.registerActionWindow(
        window as any,
        'bench',
        input.identity,
        CHAMP_SELECT_GRAB_INPUT_SHAPE
      )
    ).not.toBeNull()
    expect(await input.call(input.identity)).toEqual({
      state: 'confirmed',
      operation: 'swap',
      championId: 22
    })
    f.controller.dispose()
  })
})
