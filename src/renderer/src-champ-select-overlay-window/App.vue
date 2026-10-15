<template>
  <SetupInAppScope />
  <ChampSelectOverlay
    v-if="isChampSelect"
    :data="ongoingGame"
    :session="leagueClient.champSelect.session"
    :group="group"
    :champions="leagueClient.gameData.champions"
    :champion-rates="championRates"
    :settings="ongoingGame.settings.champSelectOverlay"
  />
</template>

<script setup lang="ts">
import { ChampSelectOverlay } from '@renderer-shared/components/champ-select-overlay'
import { useInstance } from '@renderer-shared/shards'
import { ChampionDataRenderer } from '@renderer-shared/shards/champion-data'
import { useChampionDataStore } from '@renderer-shared/shards/champion-data/store'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { useOngoingGameStore } from '@renderer-shared/shards/ongoing-game/store'
import { LoggerRenderer } from '@renderer-shared/shards/logger'
import { SetupInAppScope } from '@renderer-shared/shards/setup-in-app-scope/setup-in-app-scope-component'
import { supportsChampionDataFeature } from '@shared/data-adapter/champion-data'
import { computed } from 'vue'

import { resolveChampSelectChampionDataMode, useChampSelectChampionRates } from './champion-rates'

const { group } = defineProps<{
  group: 'candidates' | 'teammates'
}>()

const leagueClient = useLeagueClientStore()
const ongoingGame = useOngoingGameStore()
const championData = useInstance(ChampionDataRenderer)
const championDataStore = useChampionDataStore()
const logger = useInstance(LoggerRenderer).createLogger('champ-select-overlay-window')
const isChampSelect = computed(
  () =>
    leagueClient.gameflow.phase === 'ChampSelect' &&
    ongoingGame.queryStage.phase === 'champ-select' &&
    ongoingGame.settings.enabled
)

const championRates = useChampSelectChampionRates(
  () => {
    const session = leagueClient.champSelect.session
    if (!isChampSelect.value || !session || ongoingGame.queryStage.phase !== 'champ-select')
      return null
    const mode = resolveChampSelectChampionDataMode(ongoingGame.queryStage.gameInfo)
    const source = 'qq101'
    if (
      !mode ||
      !championDataStore.availability.sources[source].enabled ||
      !supportsChampionDataFeature(source, mode, 'champion-overview')
    )
      return null
    return {
      sessionId: session.id,
      query: { source, mode, position: 'all', tier: 'all', region: 'global' }
    }
  },
  championData,
  logger
)
</script>
