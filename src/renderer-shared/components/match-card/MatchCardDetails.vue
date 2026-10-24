<template>
  <!-- expanded details -->
  <div
    class="transition-width @container relative mt-1 box-border w-full overflow-hidden rounded border border-solid bg-neutral-100/95 p-2 dark:bg-neutral-900/95"
    :class="cardBorderClass"
  >
    <!-- header -->
    <div class="mb-2 flex items-center gap-1">
      <TabSwitch
        class="flex-1"
        v-model:selected-tab="selectedTab"
        :tabs="tabs"
        :win-result="team?.winResult"
      />

      <!-- btns (download replay) -->
      <div class="flex gap-1">
        <NTooltip v-if="replayState">
          <template #trigger>
            <NButton
              :theme-overrides="{
                heightMedium: '32px',
                paddingMedium: '0 8px'
              }"
              secondary
              :disabled="
                !replayState ||
                (replayState.state !== 'download' &&
                  replayState.state !== 'watch' &&
                  replayState.state !== 'downloading')
              "
              :loading="replayState?.state === 'downloading'"
              @click="
                replayState?.state === 'watch'
                  ? watchReplay(basicInfo.gameId)
                  : loadReplay(basicInfo.gameId)
              "
            >
              <template #icon>
                <NIcon v-if="replayState?.state === 'watch'"><Replay20Filled /></NIcon>
                <NIcon v-else><Replay20Regular /></NIcon>
              </template>
            </NButton>
          </template>
          {{ replayButtonTitle }}
        </NTooltip>

        <NTooltip v-if="canDryRunOngoingGame">
          <template #trigger>
            <NButton
              :theme-overrides="{
                heightMedium: '32px',
                paddingMedium: '0 8px'
              }"
              secondary
              @click="dryRunOngoingGame"
            >
              <template #icon>
                <NIcon><Games24Filled /></NIcon>
              </template>
            </NButton>
          </template>
          {{ t('matchCard.dryRun.tooltip') }}
        </NTooltip>
      </div>
    </div>

    <!-- tab content -->
    <KeepAlive>
      <MatchCardSummaryTab v-if="selectedTab === 'summary'" />
      <MatchCardDetailsTab v-else-if="selectedTab === 'details'" />
      <MatchCardRunesTab v-else-if="selectedTab === 'runes'" />
      <MatchCardEventsTab v-else-if="selectedTab === 'events'" />
      <MatchCardTimelineTab v-else-if="selectedTab === 'timeline'" />
      <MatchCardBuildsTab v-else-if="selectedTab === 'builds'" />
    </KeepAlive>
  </div>
</template>

<script lang="ts" setup>
import { Games24Filled, Replay20Filled, Replay20Regular } from '@vicons/fluent'
import { useTranslation } from 'i18next-vue'
import { NButton, NIcon } from 'naive-ui'
import { NTooltip } from 'naive-ui'
import { computed, ref } from 'vue'

import { useMatchCard } from './context'
import MatchCardBuildsTab from './tabs/MatchCardBuildsTab.vue'
import MatchCardDetailsTab from './tabs/MatchCardDetailsTab.vue'
import MatchCardEventsTab from './tabs/MatchCardEventsTab.vue'
import MatchCardRunesTab from './tabs/MatchCardRunesTab.vue'
import MatchCardSummaryTab from './tabs/MatchCardSummaryTab.vue'
import MatchCardTimelineTab from './tabs/timeline/MatchCardTimelineTab.vue'
import { useMatchCardTabs, useReplayButtonTitle } from './utils/tabs'
import { useCardBorderClass } from './utils/theme'
import TabSwitch from './widgets/TabSwitch.vue'

const {
  basicInfo,
  teams,
  participants,
  puuid,
  replayState,
  canDryRunOngoingGame,
  loadReplay,
  watchReplay,
  dryRunOngoingGame
} = useMatchCard()
const { t } = useTranslation()

const selfStats = computed(() => {
  return participants.value.find((s) => s.puuid === puuid.value)
})

const team = computed(() => {
  if (!selfStats.value) return null

  return teams.value.teamStatMap[selfStats.value.teamIdentifier]
})

const selectedTab = ref('summary')
const tabs = useMatchCardTabs(selectedTab)

const replayButtonTitle = useReplayButtonTitle()

const cardBorderClass = useCardBorderClass()
</script>

<style scoped>
@import './match-card.css';
</style>
