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
  <div
    v-if="isChampSelect && group === 'candidates' && feedback"
    class="grab-feedback"
    role="status"
  >
    {{ feedback }}
  </div>
</template>

<script setup lang="ts">
import { ChampSelectOverlay } from '@renderer-shared/components/champ-select-overlay'
import { useInstance } from '@renderer-shared/shards'
import { ChampionDataRenderer } from '@renderer-shared/shards/champion-data'
import { useChampionDataStore } from '@renderer-shared/shards/champion-data/store'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { useOngoingGameStore } from '@renderer-shared/shards/ongoing-game/store'
import { LoggerRenderer } from '@renderer-shared/shards/logger'
import { AkariIpcRenderer } from '@renderer-shared/shards/ipc'
import { SetupInAppScope } from '@renderer-shared/shards/setup-in-app-scope/setup-in-app-scope-component'
import { supportsChampionDataFeature } from '@shared/data-adapter/champion-data'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useTranslation } from 'i18next-vue'
import {
  CANDIDATE_GRAB_NAMESPACE,
  type CandidateGrabFeedback
} from '@shared/champ-select-overlay/candidate-grab'

import { resolveChampSelectChampionDataMode, useChampSelectChampionRates } from './champion-rates'

const { group } = defineProps<{
  group: 'candidates' | 'teammates'
}>()

const leagueClient = useLeagueClientStore()
const ongoingGame = useOngoingGameStore()
const championData = useInstance(ChampionDataRenderer)
const championDataStore = useChampionDataStore()
const logger = useInstance(LoggerRenderer).createLogger('champ-select-overlay-window')
const ipc = useInstance(AkariIpcRenderer)
const { t } = useTranslation(undefined, {
  keyPrefix: 'ongoingGame.champSelectOverlay.candidateGrab'
})
const feedback = ref('')
let feedbackTimer: ReturnType<typeof setTimeout> | undefined
let disposeFeedback: (() => void) | undefined
function clearFeedback() {
  clearTimeout(feedbackTimer)
  feedback.value = ''
}
onMounted(() => {
  if (group !== 'candidates') return
  disposeFeedback = ipc.onEvent(
    CANDIDATE_GRAB_NAMESPACE,
    'candidate-grab-feedback',
    (update: CandidateGrabFeedback) => {
      if (update.identity.sessionId !== leagueClient.champSelect.session?.id) return
      clearFeedback()
      const state = update.result.state
      feedback.value = t(
        state === 'confirmed'
          ? 'selected'
          : state === 'unconfirmed'
            ? 'unconfirmed'
            : state === 'failed'
              ? 'failed'
              : 'unavailable'
      )
      feedbackTimer = setTimeout(clearFeedback, 1800)
    }
  )
})
watch(() => [leagueClient.gameflow.phase, leagueClient.champSelect.session?.id], clearFeedback)
onUnmounted(() => {
  clearFeedback()
  disposeFeedback?.()
})
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

<style scoped>
.grab-feedback {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f2f3f5;
  background: #181b21;
  font:
    13px 'Microsoft YaHei',
    system-ui,
    sans-serif;
  pointer-events: none;
}
</style>
