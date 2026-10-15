import type { ChampSelectChampionRates } from '@renderer-shared/components/champ-select-overlay/types'
import type { ChampionDataRenderer } from '@renderer-shared/shards/champion-data'
import type {
  ChampionDataMode,
  ChampionDataOverview,
  ChampionDataQuery
} from '@shared/data-adapter/champion-data'
import { shallowRef, watch } from 'vue'

export function resolveChampSelectChampionDataMode(gameInfo: {
  queueId: number
  gameMode: string
}): ChampionDataMode | null {
  const { queueId, gameMode } = gameInfo
  if (queueId === 420 && gameMode === 'CLASSIC') return 'ranked'
  if (queueId === 450 && gameMode === 'ARAM') return 'aram'
  if (queueId === 2400 && gameMode === 'KIWI') return 'aram_mayhem'
  if (queueId === 1700 && gameMode === 'CHERRY') return 'arena'
  if (queueId === 1300 && gameMode === 'NEXUSBLITZ') return 'nexus_blitz'
  if ((queueId === 900 || queueId === 1900) && (gameMode === 'URF' || gameMode === 'ARURF'))
    return 'urf'
  // These sources do not establish matching normal/flex/custom-queue datasets.
  return null
}

export function getChampSelectOverallRates(overview: ChampionDataOverview) {
  const rates: Record<number, ChampSelectChampionRates> = {}
  const seen = new Set<number>()
  for (const item of overview.sections.champions) {
    if (item.position !== 'all' && item.position !== 'none') continue
    // Ambiguous duplicates do not establish one overall result for this champion.
    if (seen.has(item.championId)) {
      delete rates[item.championId]
      continue
    }
    seen.add(item.championId)
    rates[item.championId] = {
      winRate: item.performance.winRate,
      pickRate: item.performance.pickRate
    }
  }
  return rates
}

export function useChampSelectChampionRates(
  getRequest: () => { sessionId: string; query: ChampionDataQuery } | null,
  loader: Pick<ChampionDataRenderer, 'loadOverview'>,
  logger: { warn: (...args: unknown[]) => unknown }
) {
  const rates = shallowRef<Record<number, ChampSelectChampionRates>>({})
  watch(
    () => {
      const request = getRequest()
      return request
        ? JSON.stringify([request.sessionId, request.query.source, request.query.mode])
        : null
    },
    async (_key, _oldKey, onCleanup) => {
      rates.value = {}
      const request = getRequest()
      if (!request) return
      const controller = new AbortController()
      onCleanup(() => controller.abort())
      try {
        const result = await loader.loadOverview(request.query, { signal: controller.signal })
        if (controller.signal.aborted || result.status !== 'success') return
        if (
          result.data.metadata.mode !== request.query.mode ||
          result.data.metadata.source !== request.query.source
        ) {
          logger.warn('Champion-select overview does not match the requested mode/source')
          return
        }
        rates.value = getChampSelectOverallRates(result.data)
      } catch (error) {
        if (!controller.signal.aborted)
          logger.warn('Champion-select overview failed to load', error)
      }
    },
    { immediate: true, flush: 'sync' }
  )
  return rates
}
