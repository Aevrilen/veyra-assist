import type { LeagueClientWindowSnapshot } from '@main/native'
import {
  CHAMP_SELECT_GRAB_BUTTON_HEIGHT,
  CHAMP_SELECT_GRAB_BUTTON_WIDTH,
  CHAMP_SELECT_GRAB_INPUT_SHAPE
} from '@shared/champ-select-overlay/candidate-grab'
import type {
  CandidateCardRole,
  CandidateGrabIdentity,
  CandidateGrabResult,
  CandidateGrabView
} from '@shared/champ-select-overlay/candidate-grab'
import type { ChampSelectSession } from '@shared/types/league-client/champ-select'
import { isAxiosError } from 'axios'
import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from 'electron'
import { reaction } from 'mobx'
import { z } from 'zod'

import type { LeagueClientMain } from '../league-client'
import type { AkariLogger } from '../logger-factory'
import type { OngoingGameMain } from '../ongoing-game'
import { sameCandidateWindowBounds } from './candidate-button-placement'
import { supportsChampSelectOverlay } from './platform'

const identitySchema = z
  .object({
    sessionId: z.string().min(1),
    revision: z.number().int().nonnegative().safe(),
    championId: z.number().int().positive().safe()
  })
  .strict()

interface CandidateGrabContext {
  platform: NodeJS.Platform
  leagueClient: LeagueClientMain
  ongoingGame: OngoingGameMain
  logger: AkariLogger
  readClientWindow: (pid: number) => LeagueClientWindowSnapshot | null
  onViewChanged: (
    sender: WebContents,
    view: CandidateGrabView,
    identity: CandidateGrabIdentity | null
  ) => void
  onResult?: (identity: CandidateGrabIdentity, result: CandidateGrabResult) => void
}

interface CandidateActionGrant {
  role: 'bench'
  window: BrowserWindow
  identity: CandidateGrabIdentity
  frame: WebContents['mainFrame']
  bounds: Electron.Rectangle
  revoke: () => void
}

export class CandidateGrabController {
  private readonly _grants = new Map<WebContents, CandidateActionGrant>()
  private _signature = ''
  private _connection: LeagueClientMain['state']['auth'] = null
  private _view: CandidateGrabView = { sessionId: null, revision: 0, candidates: [], busy: false }
  private _pending = false
  private _timer: NodeJS.Timeout | null = null
  private _disposeReaction: (() => void) | null = null
  private _started = false

  constructor(private readonly _context: CandidateGrabContext) {}

  start() {
    if (this._started || !supportsChampSelectOverlay(this._context.platform)) return
    this._started = true
    this._disposeReaction = reaction(
      () => {
        const { leagueClient, ongoingGame } = this._context
        return [
          leagueClient.state.isConnected,
          leagueClient.state.auth,
          leagueClient.data.gameflow.phase,
          leagueClient.data.champSelect.session,
          leagueClient.data.champSelect.currentChampion,
          leagueClient.data.champSelect.currentPickableChampionIdArray,
          leagueClient.data.lobbyTeamBuilder.champSelect.subsetChampionList,
          ongoingGame.settings.enabled,
          ongoingGame.settings.champSelectOverlay
        ]
      },
      () => this.refresh(),
      { fireImmediately: true }
    )
    this._timer = setInterval(() => {
      if (this._grants.size) this.refresh()
    }, 100)
  }

  private _candidates(
    session: ChampSelectSession,
    pickableIds: number[],
    subsetIds: number[],
    currentChampion: number | null
  ) {
    const benchIds = session.benchChampions.map((p) => p.championId)
    const swappable = this._canSwap(session, currentChampion)
    return [...new Set(benchIds)]
      .filter((id) => id > 0 && id !== currentChampion)
      .map((championId) => ({
        role: 'bench' as const,
        championId,
        eligible:
          swappable &&
          pickableIds.includes(championId) &&
          (session.timer.phase !== 'BAN_PICK' || subsetIds.includes(championId))
      }))
  }

  private _canSwap(session: ChampSelectSession, currentChampion: number | null) {
    if (!session.benchEnabled || session.isSpectating) return false
    // The original Mini uses the independent /current-champion endpoint for this branch.
    // BAN_PICK without a current champion would pickOrBan; personal picks stay read-only here.
    if (session.timer.phase === 'BAN_PICK' && !currentChampion) return false
    return (
      session.timer.phase === 'FINALIZATION' ||
      (session.timer.phase === 'BAN_PICK' && session.allowSubsetChampionPicks)
    )
  }

  private _selectionSignature(
    session: ChampSelectSession,
    pickableIds: number[],
    subsetIds: number[],
    currentChampion: number | null
  ) {
    return JSON.stringify([
      session.id,
      session.localPlayerCellId,
      session.timer.phase,
      session.benchEnabled,
      session.allowSubsetChampionPicks,
      session.isSpectating,
      currentChampion,
      session.myTeam.find((p) => p.cellId === session.localPlayerCellId)?.championId,
      session.actions
        .flat()
        .filter((a) => a.actorCellId === session.localPlayerCellId)
        .map((a) => [a.id, a.type, a.isInProgress, a.completed, a.championId]),
      pickableIds,
      session.timer.phase === 'BAN_PICK' ? subsetIds : [],
      this._candidates(session, pickableIds, subsetIds, currentChampion)
    ])
  }

  refresh(): CandidateGrabView {
    const { leagueClient, ongoingGame } = this._context
    let signature = ''
    let sessionId: string | null = null
    let candidates: CandidateGrabView['candidates'] = []
    const connection = leagueClient.state.auth
    const session = leagueClient.data.champSelect.session
    try {
      if (
        this._started &&
        leagueClient.state.isConnected &&
        connection &&
        ongoingGame.settings.enabled &&
        leagueClient.data.gameflow.phase === 'ChampSelect' &&
        session
      ) {
        const client = this._context.readClientWindow(connection.pid)
        if (client?.isVisible && !client.isMinimized && client.isForeground) {
          const pickableIds = leagueClient.data.champSelect.currentPickableChampionIdArray
          const subsetIds = leagueClient.data.lobbyTeamBuilder.champSelect.subsetChampionList
          const currentChampion = leagueClient.data.champSelect.currentChampion
          sessionId = session.id
          candidates = this._candidates(session, pickableIds, subsetIds, currentChampion)
          signature = JSON.stringify([
            connection.pid,
            client.windowHandle,
            client.ownerProcessId,
            client.bounds,
            ongoingGame.settings.champSelectOverlay,
            this._selectionSignature(session, pickableIds, subsetIds, currentChampion)
          ])
        }
      }
    } catch {
      this._context.logger.warn('Candidate action window context is unavailable')
    }
    if (signature !== this._signature || connection !== this._connection) {
      this._signature = signature
      this._connection = connection
      this._view = { sessionId, revision: this._view.revision + 1, candidates, busy: this._pending }
      for (const grant of [...this._grants.values()]) grant.revoke()
    }
    return this._view
  }

  /** Main-process-only capability registration, after the tight input window is ready and shown. */
  registerActionWindow(
    window: BrowserWindow,
    role: CandidateCardRole,
    identity: CandidateGrabIdentity,
    inputShape?: Electron.Rectangle
  ) {
    this.refresh()
    if (window.isDestroyed()) return null
    const sender = window.webContents
    this._grants.get(sender)?.revoke()
    if (role !== 'bench') return null
    const bounds = window.getBounds()
    const tightInput =
      bounds.width === CHAMP_SELECT_GRAB_BUTTON_WIDTH &&
      (bounds.height === CHAMP_SELECT_GRAB_BUTTON_HEIGHT ||
        (inputShape &&
          bounds.height >= CHAMP_SELECT_GRAB_BUTTON_HEIGHT &&
          sameCandidateWindowBounds(inputShape, CHAMP_SELECT_GRAB_INPUT_SHAPE)))
    if (
      window.isFocusable() ||
      !tightInput ||
      !window.isVisible() ||
      window.webContents.isDestroyed() ||
      window.webContents.isLoadingMainFrame() ||
      window.webContents.getZoomFactor() !== 1 ||
      identity.sessionId !== this._view.sessionId ||
      identity.revision !== this._view.revision ||
      !this._view.candidates.some((c) => c.championId === identity.championId && c.eligible)
    ) {
      return null
    }
    const lifecycleEvents: [NodeJS.EventEmitter, string[]][] = [
      [window, ['hide', 'closed', 'move', 'resize']],
      [sender, ['did-start-loading', 'render-process-gone', 'destroyed', 'zoom-changed']]
    ]
    const invalidate = () => this.invalidateActionWindows()
    const revoke = () => {
      if (this._grants.get(sender)?.revoke !== revoke) return
      this._grants.delete(sender)
      for (const [emitter, events] of lifecycleEvents)
        for (const event of events) emitter.removeListener(event, invalidate)
      if (!sender.isDestroyed()) {
        try {
          this._context.onViewChanged(sender, this._view, null)
        } catch {
          this._context.logger.warn('Candidate input revocation could not be delivered')
        }
      }
    }
    const grant: CandidateActionGrant = {
      window,
      role: 'bench',
      identity: { ...identity },
      frame: sender.mainFrame,
      bounds,
      revoke
    }
    this._grants.set(sender, grant)
    for (const [emitter, events] of lifecycleEvents)
      for (const event of events) emitter.on(event, invalidate)
    return this._notifyGrant(sender, grant) ? revoke : null
  }

  revokeActionWindow(window: BrowserWindow) {
    this._grants.get(window.webContents)?.revoke()
  }

  invalidateActionWindows() {
    this._view = { ...this._view, revision: this._view.revision + 1 }
    for (const grant of [...this._grants.values()]) grant.revoke()
  }

  isActionWindowRegistered(window: BrowserWindow, identity: CandidateGrabIdentity) {
    const grant = this._grants.get(window.webContents)
    return (
      grant?.window === window &&
      identity.revision === this._view.revision &&
      grant.identity.sessionId === identity.sessionId &&
      grant.identity.revision === identity.revision &&
      grant.identity.championId === identity.championId
    )
  }

  private _notifyGrant(sender: WebContents, grant: CandidateActionGrant) {
    try {
      if (sender.isDestroyed()) {
        grant.revoke()
        return false
      }
      this._context.onViewChanged(sender, this._view, grant.identity)
      return true
    } catch {
      grant.revoke()
      this._context.logger.warn('Candidate input state could not be delivered')
      return false
    }
  }

  private _authorized(event: IpcMainInvokeEvent, identity: CandidateGrabIdentity) {
    this.refresh()
    const grant = this._grants.get(event.sender)
    return (
      grant?.role === 'bench' &&
      !event.sender.isDestroyed() &&
      event.senderFrame === event.sender.mainFrame &&
      event.senderFrame === grant.frame &&
      !event.sender.isLoadingMainFrame() &&
      !grant.window.isDestroyed() &&
      grant.window.isVisible() &&
      !grant.window.isFocusable() &&
      event.sender.getZoomFactor() === 1 &&
      sameCandidateWindowBounds(grant.window.getBounds(), grant.bounds) &&
      identity.sessionId === this._view.sessionId &&
      identity.revision === this._view.revision &&
      identity.sessionId === grant.identity.sessionId &&
      identity.revision === grant.identity.revision &&
      identity.championId === grant.identity.championId
    )
  }

  private _setBusy(busy: boolean) {
    this._pending = busy
    this._view = { ...this._view, busy }
    for (const [sender, grant] of this._grants) this._notifyGrant(sender, grant)
  }

  async grabCandidate(event: IpcMainInvokeEvent, payload: unknown): Promise<CandidateGrabResult> {
    const parsed = identitySchema.safeParse(payload)
    if (!parsed.success) return { state: 'unavailable' }
    const identity = parsed.data
    if (!this._authorized(event, identity)) return { state: 'stale' }
    if (this._pending) return { state: 'busy' }
    this._setBusy(true)
    let accepted = false
    try {
      const { leagueClient } = this._context
      const api = leagueClient.api
      const connection = leagueClient.state.auth
      const [sessionResponse, pickableResponse, subsetIds, currentChampion] = await Promise.all([
        api.champSelect.getSession(),
        api.champSelect.getPickableChampIds(),
        leagueClient.data.champSelect.session?.timer.phase === 'BAN_PICK'
          ? api.lobbyTeamBuilder.getChampSelectSubsetChampionList().then((r) => r.data)
          : Promise.resolve([] as number[]),
        this._readCurrentChampion(api)
      ])
      if (
        !this._authorized(event, identity) ||
        connection !== leagueClient.state.auth ||
        api !== leagueClient.api
      ) {
        return this._result(identity, { state: 'stale' })
      }
      const session = sessionResponse.data
      const cached = leagueClient.data.champSelect.session!
      if (
        this._selectionSignature(session, pickableResponse.data, subsetIds, currentChampion) !==
        this._selectionSignature(
          cached,
          leagueClient.data.champSelect.currentPickableChampionIdArray,
          leagueClient.data.lobbyTeamBuilder.champSelect.subsetChampionList,
          leagueClient.data.champSelect.currentChampion
        )
      ) {
        return this._result(identity, { state: 'stale' })
      }
      if (
        !this._canSwap(session, currentChampion) ||
        !this._candidates(session, pickableResponse.data, subsetIds, currentChampion).some(
          (c) => c.championId === identity.championId && c.eligible
        )
      ) {
        return this._result(identity, { state: 'unavailable' })
      }
      await api.champSelect.benchSwap(identity.championId)
      accepted = true
      const [readback, selectedChampion] = await Promise.all([
        api.champSelect.getSession().then((response) => response.data),
        this._readCurrentChampion(api)
      ])
      if (
        connection === leagueClient.state.auth &&
        leagueClient.state.isConnected &&
        leagueClient.data.champSelect.session?.id === session.id &&
        readback.id === session.id &&
        readback.localPlayerCellId === session.localPlayerCellId &&
        selectedChampion === identity.championId
      ) {
        return this._result(identity, {
          state: 'confirmed',
          operation: 'swap',
          championId: identity.championId
        })
      }
      return this._result(identity, { state: 'unconfirmed', championId: identity.championId })
    } catch (error) {
      // Keep HTTP status/code locally, without serializing credential-bearing Axios configs.
      this._context.logger.warn('Candidate selection could not be confirmed', {
        accepted,
        sessionId: identity.sessionId,
        revision: identity.revision,
        championId: identity.championId,
        code: isAxiosError(error) ? error.code : undefined,
        status: isAxiosError(error) ? error.response?.status : undefined,
        error: error instanceof Error ? error.name : typeof error
      })
      return this._result(
        identity,
        accepted ? { state: 'unconfirmed', championId: identity.championId } : { state: 'failed' }
      )
    } finally {
      this._setBusy(false)
    }
  }

  private _result(identity: CandidateGrabIdentity, result: CandidateGrabResult) {
    this._context.onResult?.(identity, result)
    return result
  }

  private async _readCurrentChampion(api: LeagueClientMain['api']) {
    try {
      return (await api.champSelect.getCurrentChamp()).data
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) return null
      throw error
    }
  }

  dispose() {
    this._started = false
    this._disposeReaction?.()
    this._disposeReaction = null
    if (this._timer) clearInterval(this._timer)
    this._timer = null
    for (const grant of [...this._grants.values()]) grant.revoke()
    this.refresh()
  }
}
