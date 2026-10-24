<template>
  <div>
    <!-- hero -->
    <div
      class="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-0.5 px-4 pt-4 pb-2.5"
    >
      <ChampionIcon
        v-if="participant"
        :champion-id="participant.championId"
        class="row-span-2 box-border size-13 rounded-xl border-2 border-solid"
        :class="championBorderClass"
      />
      <div v-else class="row-span-2 size-13"></div>

      <div class="min-w-0">
        <div class="text-xs font-bold tracking-wider" :class="resultTextClass">
          {{ resultName }}
        </div>
        <div
          :id="titleId"
          role="heading"
          aria-level="2"
          class="truncate text-xl font-bold text-black dark:text-white"
        >
          {{ championName }}
          <span v-if="positionName" class="text-xs font-normal text-black/60 dark:text-white/60">
            {{ positionName }}
          </span>
        </div>
      </div>

      <div v-if="participant" class="flex flex-col items-end whitespace-nowrap">
        <span class="text-xl font-bold text-black tabular-nums dark:text-white">
          {{ participant.kills }}/{{ participant.deaths }}/{{ participant.assists }}
        </span>
        <span class="text-xs text-black/60 dark:text-white/60">
          {{
            t('playerTabs.matchHistory.ledger.killParticipationValue', { value: killParticipation })
          }}
          ·
          {{ t('playerTabs.matchHistory.ledger.damageShareValue', { value: damageShare }) }}
        </span>
      </div>

      <div class="col-start-2 col-end-4 truncate text-xs text-black/60 dark:text-white/60">
        {{ resources.queues.name(basicInfo.queueId) }} · {{ gameCreationText }} ·
        {{ formatSeconds(basicInfo.gameDuration) }}
      </div>
    </div>

    <!-- actions -->
    <div
      class="flex flex-wrap items-center gap-2 px-4 pb-3.5 text-xs text-black/60 dark:text-white/60"
    >
      <NButton
        v-if="replayState"
        size="small"
        secondary
        :disabled="!canActOnReplay"
        :loading="replayState.state === 'downloading'"
        @click="handleReplay"
      >
        <template #icon>
          <NIcon v-if="replayState.state === 'watch'"><Replay20Filled /></NIcon>
          <NIcon v-else><Replay20Regular /></NIcon>
        </template>
        {{ replayTitle }}
      </NButton>
      <span v-else>{{ replayUnavailableReason }}</span>

      <NButton v-if="canDryRunOngoingGame" size="small" secondary @click="dryRunOngoingGame">
        <template #icon>
          <NIcon><Games24Filled /></NIcon>
        </template>
        {{ t('matchCard.dryRun.tooltip') }}
      </NButton>
    </div>

    <!-- sticky detail tabs, kept directly beneath the sticky inspector header -->
    <div
      role="group"
      :aria-label="t('playerTabs.matchHistory.inspector.detailViews')"
      class="sticky top-12 z-2 flex flex-wrap gap-1 border-r-0 border-l-0 border-solid border-black/10 bg-neutral-100 px-4 py-2 dark:border-white/10 dark:bg-neutral-900"
    >
      <NButton
        v-for="tab of tabs"
        :key="tab.value"
        size="tiny"
        :secondary="detailTab === tab.value"
        :quaternary="detailTab !== tab.value"
        :aria-pressed="detailTab === tab.value"
        :data-inspector-tab="tab.value"
        @click="setDetailTab(tab.value)"
      >
        {{ tab.label }}
        <NIcon
          v-if="MATCH_INSPECTOR_READING_TABS.has(tab.value) && !isOverlay"
          class="ml-1"
          :size="12"
          aria-hidden="true"
        >
          <FullScreenMaximize20Regular />
        </NIcon>
      </NButton>
    </div>

    <!-- tab content -->
    <section class="relative isolate px-4 py-3" :aria-label="currentTabLabel">
      <div v-if="detailsFailed" role="alert" class="mb-3 flex items-center gap-3 text-sm">
        <span>{{ t('playerTabs.matchHistory.inspector.detailsFailed') }}</span>
        <NButton size="small" @click="loadDetails(basicInfo.gameId)">
          {{ t('playerTabs.matchHistory.inspector.retryDetails') }}
        </NButton>
      </div>
      <div class="overflow-x-auto">
        <MatchInspectorRoster v-if="detailTab === 'summary' && !wideContent" />
        <!-- after a details failure only summary-backed tabs mount and the KeepAlive cache is
             dropped, so detail-loading tabs cannot re-request on their own -->
        <template v-else-if="detailsFailed">
          <MatchCardSummaryTab v-if="detailTab === 'summary'" />
          <MatchCardDetailsTab v-else-if="detailTab === 'details'" />
          <MatchCardRunesTab v-else-if="detailTab === 'runes'" />
        </template>
        <KeepAlive v-else>
          <MatchCardSummaryTab v-if="detailTab === 'summary'" />
          <MatchCardDetailsTab v-else-if="detailTab === 'details'" />
          <MatchCardRunesTab v-else-if="detailTab === 'runes'" />
          <MatchCardEventsTab v-else-if="detailTab === 'events'" />
          <MatchCardTimelineTab v-else-if="detailTab === 'timeline'" />
          <MatchCardBuildsTab v-else-if="detailTab === 'builds'" />
        </KeepAlive>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useMatchCard } from '@renderer-shared/components/match-card/context'
import MatchCardBuildsTab from '@renderer-shared/components/match-card/tabs/MatchCardBuildsTab.vue'
import MatchCardDetailsTab from '@renderer-shared/components/match-card/tabs/MatchCardDetailsTab.vue'
import MatchCardEventsTab from '@renderer-shared/components/match-card/tabs/MatchCardEventsTab.vue'
import MatchCardRunesTab from '@renderer-shared/components/match-card/tabs/MatchCardRunesTab.vue'
import MatchCardSummaryTab from '@renderer-shared/components/match-card/tabs/MatchCardSummaryTab.vue'
import MatchCardTimelineTab from '@renderer-shared/components/match-card/tabs/timeline/MatchCardTimelineTab.vue'
import {
  useMatchCardTabs,
  useReplayButtonTitle
} from '@renderer-shared/components/match-card/utils/tabs'
import { useGameResultName, usePosition } from '@renderer-shared/components/match-card/utils/text'
import { useWinResultStyleType } from '@renderer-shared/components/match-card/utils/theme'
import { formatSeconds } from '@renderer-shared/components/match-card/utils/time'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import { useAkariResourceProvider } from '@renderer-shared/providers/akari-resource'
import {
  FullScreenMaximize20Regular,
  Games24Filled,
  Replay20Filled,
  Replay20Regular
} from '@vicons/fluent'
import dayjs from 'dayjs'
import { useTranslation } from 'i18next-vue'
import { NButton, NIcon } from 'naive-ui'
import { computed, watchEffect } from 'vue'

import { usePlayerTab } from '../../context'
import MatchInspectorRoster from './MatchInspectorRoster.vue'
import { MATCH_INSPECTOR_READING_TABS, useMatchInspector } from './selection'

const { titleId, wideContent, detailsFailed } = defineProps<{
  titleId: string
  wideContent: boolean
  detailsFailed: boolean
}>()

const { t } = useTranslation()
const resources = useAkariResourceProvider()
const gameResultName = useGameResultName()
const position = usePosition()

const {
  basicInfo,
  participant,
  team,
  replayState,
  canDryRunOngoingGame,
  loadReplay,
  watchReplay,
  dryRunOngoingGame,
  loadDetails
} = useMatchCard()
const { isCrossRegion } = usePlayerTab()
const { detailTab, isOverlay, setDetailTab } = useMatchInspector()

const tabs = useMatchCardTabs(detailTab)
const replayTitle = useReplayButtonTitle()
const winStyleType = useWinResultStyleType()

watchEffect(() => {
  if (!tabs.value.some((tab) => tab.value === detailTab.value)) {
    setDetailTab('summary')
  }
})

const currentTabLabel = computed(() => {
  return tabs.value.find((tab) => tab.value === detailTab.value)?.label
})

const championName = computed(() => {
  return participant.value
    ? resources.champions.name(participant.value.championId)
    : resources.queues.name(basicInfo.value.queueId)
})

const positionName = computed(() => {
  const value = participant.value?.position
  if (!value || ['invalid', 'none'].includes(value.toLowerCase())) {
    return ''
  }

  return position(value)
})

const resultName = computed(() => {
  if (!team.value) return ''

  return gameResultName(
    team.value.subteamPlacement,
    team.value.winResult,
    team.value.isSurrender,
    resources.runtime.locale
  )
})

const resultTextClass = computed(() => {
  switch (winStyleType.value) {
    case 'win':
      return 'text-blue-600 dark:text-blue-300'
    case 'loss':
      return 'text-red-700 dark:text-red-300'
    default:
      return 'text-black/70 dark:text-white/70'
  }
})

const championBorderClass = computed(() => {
  switch (winStyleType.value) {
    case 'win':
      return 'border-blue-600/80 dark:border-blue-300/80'
    case 'loss':
      return 'border-red-600/80 dark:border-red-300/80'
    default:
      return 'border-black/80 dark:border-white/80'
  }
})

const killParticipation = computed(() => {
  return ((participant.value?.killParticipation ?? 0) * 100).toFixed(0)
})

const damageShare = computed(() => {
  if (!participant.value || !team.value) return '0'

  return (
    (participant.value.totalDamageDealtToChampions /
      (team.value.totalDamageDealtToChampions || 1)) *
    100
  ).toFixed(0)
})

const gameCreationText = computed(() => {
  return dayjs(basicInfo.value.gameCreation)
    .locale(resources.runtime.locale.toLowerCase())
    .format('YYYY-MM-DD HH:mm')
})

// unknown replay metadata never enables an action
const canActOnReplay = computed(() => {
  const state = replayState.value?.state
  return state === 'download' || state === 'watch'
})

const replayUnavailableReason = computed(() => {
  return isCrossRegion.value
    ? t('playerTabs.matchHistory.ledger.replayCrossRegion')
    : t('playerTabs.matchHistory.ledger.replayUnknown')
})

const handleReplay = () => {
  const state = replayState.value?.state

  if (state === 'watch') {
    watchReplay(basicInfo.value.gameId)
  } else if (state === 'download') {
    loadReplay(basicInfo.value.gameId)
  }
}
</script>
