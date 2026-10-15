import type {
  ChampionDataLoadResult,
  ChampionDataOverview,
  ChampionDataPosition,
  ChampionPerformance
} from '@shared/data-adapter/champion-data'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'

import {
  getChampSelectOverallRates,
  resolveChampSelectChampionDataMode,
  useChampSelectChampionRates
} from './champion-rates'

const emptyPerformance: ChampionPerformance = {
  games: null,
  wins: null,
  winRate: null,
  pickRate: null,
  banRate: null,
  kda: null,
  rank: null,
  rankChange: null,
  strengthTier: null,
  averagePlacement: null,
  firstPlaceRate: null
}
function overview(winRate: number | null = 0.528): ChampionDataOverview {
  return {
    metadata: { source: 'opgg', mode: 'aram', patch: '26.20', dataDate: null, updatedAt: null },
    sections: {
      champions: [
        {
          championId: 103,
          position: 'none',
          counterChampionIds: [],
          performance: { ...emptyPerformance, winRate, pickRate: 0.032 }
        }
      ]
    }
  }
}
function success(data = overview()): ChampionDataLoadResult<ChampionDataOverview> {
  return {
    status: 'success',
    data,
    preferredSource: 'opgg',
    effectiveSource: 'opgg',
    fallbackReason: null,
    attempts: []
  }
}
function deferred() {
  let resolve!: (result: ChampionDataLoadResult<ChampionDataOverview>) => void
  const promise = new Promise<ChampionDataLoadResult<ChampionDataOverview>>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('champion select overall rates', () => {
  it('uses matching queue/mode pairs and leaves flex, normal, custom and conflicting queues unavailable', () => {
    expect(resolveChampSelectChampionDataMode({ queueId: 450, gameMode: 'ARAM' })).toBe('aram')
    expect(resolveChampSelectChampionDataMode({ queueId: 2400, gameMode: 'KIWI' })).toBe(
      'aram_mayhem'
    )
    expect(resolveChampSelectChampionDataMode({ queueId: 420, gameMode: 'CLASSIC' })).toBe('ranked')
    for (const queueId of [0, 430, 440])
      expect(resolveChampSelectChampionDataMode({ queueId, gameMode: 'CLASSIC' })).toBeNull()
    expect(resolveChampSelectChampionDataMode({ queueId: 450, gameMode: 'KIWI' })).toBeNull()
  })
  it('accepts nullable genuine overall items, never synthesizing overall rates from positions', () => {
    const data = overview(0)
    for (const position of ['top', 'middle'] as ChampionDataPosition[])
      data.sections.champions.push({
        championId: 64,
        position,
        counterChampionIds: [],
        performance: { ...emptyPerformance, winRate: 0.6, pickRate: 0.2 }
      })
    data.sections.champions.push({
      championId: 86,
      position: 'all',
      counterChampionIds: [],
      performance: emptyPerformance
    })
    expect(getChampSelectOverallRates(data)).toEqual({
      103: { winRate: 0, pickRate: 0.032 },
      86: { winRate: null, pickRate: null }
    })
    data.sections.champions.push({ ...data.sections.champions[0], position: 'all' })
    expect(getChampSelectOverallRates(data)[103]).toBeUndefined()
  })
  it('loads once per session/source/mode and discards cancelled or late results', async () => {
    const request = shallowRef<
      Parameters<typeof useChampSelectChampionRates>[0] extends () => infer T ? T : never
    >({ sessionId: 'one', query: { source: 'opgg', mode: 'aram', position: 'all' } })
    const first = deferred()
    const loader = {
      loadOverview: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockResolvedValueOnce(success(overview(0.51)))
    }
    const logger = { warn: vi.fn() }
    const scope = effectScope()
    const rates = scope.run(() => useChampSelectChampionRates(() => request.value, loader, logger))!
    request.value = { ...request.value! }
    expect(loader.loadOverview).toHaveBeenCalledTimes(1)
    const firstSignal = loader.loadOverview.mock.calls[0][1].signal as AbortSignal
    request.value = { sessionId: 'two', query: { source: 'opgg', mode: 'aram', position: 'all' } }
    expect(firstSignal.aborted).toBe(true)
    await Promise.resolve()
    expect(rates.value[103].winRate).toBe(0.51)
    first.resolve(success())
    await Promise.resolve()
    expect(rates.value[103].winRate).toBe(0.51)
    request.value = null
    expect(rates.value).toEqual({})
    expect(loader.loadOverview.mock.calls[1][1].signal.aborted).toBe(true)
    expect(logger.warn).not.toHaveBeenCalled()
    scope.stop()
  })
  it('shows no stale rates after failure or a mismatched mode and recovers in the next session', async () => {
    const request = shallowRef({
      sessionId: 'one',
      query: { source: 'opgg' as const, mode: 'aram' as const }
    })
    const wrongMode = overview()
    wrongMode.metadata.mode = 'ranked'
    const loader = {
      loadOverview: vi
        .fn()
        .mockRejectedValueOnce(new Error('load failed'))
        .mockResolvedValueOnce(success(wrongMode))
        .mockResolvedValueOnce(success())
    }
    const logger = { warn: vi.fn() }
    const scope = effectScope()
    const rates = scope.run(() => useChampSelectChampionRates(() => request.value, loader, logger))!
    await Promise.resolve()
    expect(rates.value).toEqual({})
    expect(logger.warn).toHaveBeenCalledTimes(1)
    request.value = { ...request.value, sessionId: 'two' }
    await Promise.resolve()
    expect(rates.value).toEqual({})
    expect(logger.warn).toHaveBeenCalledTimes(2)
    request.value = { ...request.value, sessionId: 'three' }
    await Promise.resolve()
    expect(rates.value[103]).toEqual({ winRate: 0.528, pickRate: 0.032 })
    scope.stop()
  })
})
