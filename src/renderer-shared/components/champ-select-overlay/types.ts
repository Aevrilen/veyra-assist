import type { AggregatedAnalysis } from '@shared/data-adapter/analysis/player'
import type { QueryStage } from '@shared/shards/ongoing-game'
import type { ChampSelectSession, ChampSelectTeam } from '@shared/types/league-client/champ-select'
import type { ChampionSimple } from '@shared/types/league-client/game-data'
import type { SummonerInfo } from '@shared/types/league-client/summoner'

// Narrow contracts over the existing stores, never demonstration values in the runtime window.
export interface ChampSelectOverlayData {
  queryStage: Pick<QueryStage, 'phase'>
  champSelectPlayerPuuids: Record<number, string>
  summoner: Record<string, Pick<SummonerInfo, 'gameName' | 'displayName'>>
  analysis: {
    players: Record<
      string,
      { count: number; summary: Pick<AggregatedAnalysis['summary'], 'winRate'> }
    >
  } | null
}

export interface ChampSelectOverlaySession {
  benchEnabled: ChampSelectSession['benchEnabled']
  benchChampions: readonly ChampSelectSession['benchChampions'][number][]
  myTeam: readonly Pick<
    ChampSelectTeam,
    'cellId' | 'puuid' | 'gameName' | 'championId' | 'championPickIntent'
  >[]
}

export interface ChampSelectChampionRates {
  winRate: number | null
  pickRate: number | null
}

export type ChampSelectOverlayChampions = Record<number, Pick<ChampionSimple, 'name'>>
