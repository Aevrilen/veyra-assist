import type { GameStats, PlayerList } from '@shared/types/game-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MayhemGameContextLoader, readVerifiedInventory } from './game-context-loader'

const identity = {
  key: 'player:1:122',
  gameName: 'Player',
  tagLine: 'TAG',
  championNames: ['Darius', '德莱厄斯']
}
const stats = { gameMode: 'KIWI', gameTime: 120 } as GameStats
const player = (ids = [3153]) =>
  ({
    riotIdGameName: 'Player',
    riotIdTagLine: 'TAG',
    championName: 'Darius',
    isDead: false,
    respawnTimer: 0,
    items: ids.map((itemID, slot) => ({ itemID, slot, count: 1 }))
  }) as PlayerList
const loaders: MayhemGameContextLoader[] = []
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
})
afterEach(() => {
  loaders.splice(0).forEach((loader) => loader.dispose())
  vi.useRealTimers()
})
function create() {
  const players = vi.fn().mockResolvedValue({ data: [player()] }),
    gameStats = vi.fn().mockResolvedValue({ data: stats })
  const loader = new MayhemGameContextLoader(
    {
      getLiveClientDataPlayerList: players,
      getGameStats: gameStats
    },
    { warn: vi.fn() }
  )
  loaders.push(loader)
  return { loader, players, gameStats }
}
describe('verified local inventory', () => {
  it('distinguishes a verified empty inventory from unknown and deduplicates real item IDs', () => {
    expect(readVerifiedInventory([player([])], stats, identity)).toEqual([])
    expect(readVerifiedInventory([player([3153, 3153])], stats, identity)).toEqual([3153])
    expect(readVerifiedInventory([player()], stats, { ...identity, tagLine: '' })).toBeNull()
    expect(readVerifiedInventory([player(), player()], stats, identity)).toBeNull()
    expect(
      readVerifiedInventory([{ ...player(), championName: 'Ahri' }], stats, identity)
    ).toBeNull()
    expect(readVerifiedInventory([player()], { ...stats, gameMode: 'ARAM' }, identity)).toBeNull()
    expect(readVerifiedInventory([player([0])], stats, identity)).toBeNull()
  })
  it('throttles, expires, copies and clears inventory after a failed refresh', async () => {
    const { loader, players } = create()
    await loader.refresh(identity)
    const received = loader.inventory(identity.key)!
    received.ids.push(9)
    expect(loader.inventory(identity.key)?.ids).toEqual([3153])
    await loader.refresh(identity)
    expect(players).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5001)
    expect(loader.inventory(identity.key)).toBeNull()
    players.mockRejectedValueOnce(new Error('local endpoint disconnected'))
    await loader.refresh(identity)
    expect(loader.inventory(identity.key)).toBeNull()
  })
  it('aborts a hanging local endpoint and does not accept a late response', async () => {
    const { loader, players } = create()
    let resolve!: (value: any) => void
    players.mockReturnValue(
      new Promise((done) => {
        resolve = done
      })
    )
    const pending = loader.refresh(identity)
    await vi.advanceTimersByTimeAsync(1500)
    await pending
    expect(players.mock.calls[0][0].signal.aborted).toBe(true)
    resolve({ data: [player()] })
    await Promise.resolve()
    expect(loader.inventory(identity.key)).toBeNull()
  })
  it('rejects old-game responses on reset and owns cancellation through disposal', async () => {
    const { loader, players } = create()
    let resolve!: (value: any) => void
    players.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      })
    )
    const previous = loader.refresh(identity)
    loader.reset('player:2:122')
    expect(players.mock.calls[0][0].signal.aborted).toBe(true)
    resolve({ data: [player()] })
    await previous
    expect(loader.inventory(identity.key)).toBeNull()
    await loader.refresh({ ...identity, key: 'player:2:122' })
    expect(loader.inventory('player:2:122')?.ids).toEqual([3153])
    loader.dispose()
    expect(loader.inventory('player:2:122')).toBeNull()
    await loader.refresh(identity)
    expect(players).toHaveBeenCalledTimes(2)
  })
  it('makes no local request without a complete Riot ID and hero identity', async () => {
    const { loader, players, gameStats } = create()
    await loader.refresh({ ...identity, gameName: '' })
    expect(players).not.toHaveBeenCalled()
    expect(gameStats).not.toHaveBeenCalled()
    expect(loader.inventory(identity.key)).toBeNull()
  })
})
