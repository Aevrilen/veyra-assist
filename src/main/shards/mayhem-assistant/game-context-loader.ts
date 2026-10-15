import type { GameClientHttpApiAxiosHelper } from '@shared/http-api-axios-helper/game-client'
import type { EquipmentGameContext } from '@shared/mayhem-assistant/model'
import type { GameStats, PlayerList } from '@shared/types/game-client'

import type { AkariLogger } from '../logger-factory'

export interface InventoryIdentity {
  key: string
  gameName: string
  tagLine: string
  championNames: string[]
}

type LiveApi = Pick<GameClientHttpApiAxiosHelper, 'getLiveClientDataPlayerList' | 'getGameStats'>

// These endpoints have no gameId. The caller must also retain the matching LCU session token.
export function readVerifiedInventory(
  players: PlayerList[],
  stats: GameStats,
  identity: InventoryIdentity
) {
  if (
    !identity.gameName ||
    !identity.tagLine ||
    !identity.championNames.length ||
    !Array.isArray(players) ||
    stats?.gameMode !== 'KIWI' ||
    !Number.isFinite(stats.gameTime) ||
    stats.gameTime < 0
  )
    return null
  const own = players.filter(
    (player) =>
      player.riotIdGameName === identity.gameName && player.riotIdTagLine === identity.tagLine
  )
  if (
    own.length !== 1 ||
    !identity.championNames.includes(own[0].championName) ||
    !Array.isArray(own[0].items)
  )
    return null
  const ids: number[] = []
  for (const item of own[0].items) {
    if (
      !Number.isSafeInteger(item.itemID) ||
      item.itemID <= 0 ||
      !Number.isSafeInteger(item.count) ||
      item.count <= 0 ||
      !Number.isSafeInteger(item.slot) ||
      item.slot < 0 ||
      item.slot > 6
    )
      return null
    ids.push(item.itemID)
  }
  return [...new Set(ids)]
}

export class MayhemGameContextLoader {
  private _key = ''
  private _request: AbortController | null = null
  private _lastAttempt = -Infinity
  private _inventory: EquipmentGameContext['inventory'] = null
  private _disposed = false
  private _lastError: string | null = null
  constructor(
    private readonly _api: LiveApi,
    private readonly _logger: Pick<AkariLogger, 'warn'>,
    private readonly _now = Date.now
  ) {}

  reset(key = '') {
    this._key = key
    this._request?.abort()
    this._request = null
    this._lastAttempt = -Infinity
    this._inventory = null
    this._lastError = null
  }
  inventory(key: string) {
    if (
      this._disposed ||
      key !== this._key ||
      !this._inventory ||
      this._now() - this._inventory.observedAt > 5000
    )
      return null
    return { ids: [...this._inventory.ids], observedAt: this._inventory.observedAt }
  }
  async refresh(identity: InventoryIdentity) {
    if (this._disposed) return
    if (identity.key !== this._key) this.reset(identity.key)
    if (this._request || this._now() - this._lastAttempt < 2000) return
    this._lastAttempt = this._now()
    if (!identity.gameName || !identity.tagLine || !identity.championNames.length) {
      this._inventory = null
      return
    }
    const request = new AbortController()
    this._request = request
    const timeout = setTimeout(() => request.abort(), 1500)
    let abort!: () => void
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(new Error('Live inventory cancelled'))
      request.signal.addEventListener('abort', abort, { once: true })
    })
    const current = () =>
      !this._disposed &&
      this._key === identity.key &&
      this._request === request &&
      !request.signal.aborted
    try {
      const [players, stats] = await Promise.race([
        Promise.all([
          this._api.getLiveClientDataPlayerList({ signal: request.signal }),
          this._api.getGameStats({ signal: request.signal })
        ]),
        cancelled
      ])
      if (current()) {
        const ids = readVerifiedInventory(players.data, stats.data, identity)
        if (ids === null)
          throw new Error('Local inventory response does not match this player, champion or mode')
        this._inventory = { ids, observedAt: this._now() }
        this._lastError = null
      }
    } catch (cause) {
      if (this._key === identity.key && this._request === request) {
        this._inventory = null
        const message = request.signal.aborted
          ? 'Local inventory request timed out'
          : cause instanceof Error
            ? cause.message
            : String(cause)
        if (message !== this._lastError) this._logger.warn('Mayhem inventory unavailable', message)
        this._lastError = message
      }
    } finally {
      clearTimeout(timeout)
      request.signal.removeEventListener('abort', abort)
      if (this._request === request) this._request = null
    }
  }
  dispose() {
    this._disposed = true
    this.reset()
  }
}
