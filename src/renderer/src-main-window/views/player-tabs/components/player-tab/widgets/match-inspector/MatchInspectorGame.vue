<template>
  <MatchInspectorBody
    :title-id="titleId"
    :wide-content="wideContent"
    :details-failed="detailsFailed"
  />
</template>

<script setup lang="ts">
import { provideMatchCard } from '@renderer-shared/components/match-card/context'
import type { MatchCardEmits } from '@renderer-shared/components/match-card/types'
import type { LcuOrSgpGameDetails, LcuOrSgpGameSummary } from '@shared/data-adapter/wrapper'
import type { ReplayDownloadProgress } from '@shared/types/league-client/replays'

import MatchInspectorBody from './MatchInspectorBody.vue'

const {
  summary,
  details = null,
  puuid,
  hidePrivacy = false,
  loadingDetails = false,
  detailsFailed = false,
  replayState = null,
  canDryRunOngoingGame = false,
  titleId,
  wideContent = false
} = defineProps<{
  summary: LcuOrSgpGameSummary
  details?: LcuOrSgpGameDetails | null
  puuid?: string
  hidePrivacy?: boolean
  loadingDetails?: boolean
  detailsFailed?: boolean
  replayState?: ReplayDownloadProgress | null
  canDryRunOngoingGame?: boolean
  titleId: string
  wideContent?: boolean
}>()

const emit = defineEmits<MatchCardEmits>()

// the same production match card context used by MatchCard, so the real detail tabs mount unchanged
provideMatchCard({
  isExpanded: true,
  summary: () => summary,
  puuid: () => puuid,
  details: () => details,
  hidePrivacy: () => hidePrivacy,
  loadingDetails: () => loadingDetails,
  replayState: () => replayState,
  canDryRunOngoingGame: () => canDryRunOngoingGame,

  navigateToSummonerByPuuid: (targetPuuid: string, setCurrent?: boolean) => {
    emit('navigateToSummonerByPuuid', targetPuuid, setCurrent)
  },
  loadReplay: (gameId: number) => {
    emit('downloadReplay', gameId)
  },
  watchReplay: (gameId: number) => {
    emit('watchReplay', gameId)
  },
  loadDetails: (gameId: number) => {
    emit('loadDetails', gameId)
  },
  dryRunOngoingGame: (draft) => {
    emit('dryRunOngoingGame', draft)
  }
})
</script>
