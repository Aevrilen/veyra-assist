<template>
  <button
    type="button"
    class="match-ledger-row box-border grid min-h-13 w-full cursor-pointer items-center gap-x-2.5 rounded-lg border-0 py-1.5 pr-2.5 pl-0 text-left text-black/90 outline-offset-2 transition-colors [contain-intrinsic-size:auto_52px] [content-visibility:auto] focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-white/90"
    :class="[
      LEDGER_GRID_COLUMNS_CLASS,
      selected
        ? 'bg-black/8 ring-1 ring-black/10 ring-inset dark:bg-white/10 dark:ring-white/15'
        : 'bg-transparent hover:bg-black/5 dark:hover:bg-white/5'
    ]"
    :data-ledger-key="entry.key"
    :tabindex="focusable ? 0 : -1"
    :aria-pressed="selected"
    @click="emit('select', entry)"
  >
    <span class="w-1 self-stretch rounded-sm" :class="stripeClass" aria-hidden="true"></span>

    <ChampionIcon
      v-if="participant"
      :champion-id="participant.championId"
      class="size-9 rounded-lg"
    />
    <span v-else class="size-9"></span>

    <span class="flex min-w-0 flex-col">
      <span class="truncate text-sm font-bold">{{ championName }}</span>
      <span class="truncate text-xs text-black/60 dark:text-white/60">
        <span :class="resultTextClass">{{ resultName }}</span
        ><template v-for="part of metaParts" :key="part"> · {{ part }}</template>
      </span>
      <span class="truncate text-xs text-black/60 @min-[620px]:hidden dark:text-white/60">
        {{ queueName }} · {{ durationText
        }}<template v-if="participant">
          ·
          {{ t('playerTabs.matchHistory.ledger.killParticipationValue', { value: kp }) }}</template
        >
      </span>
    </span>

    <span class="hidden truncate text-xs text-black/70 @min-[620px]:block dark:text-white/70">
      {{ queueName }}
    </span>

    <span class="flex flex-col items-end tabular-nums">
      <template v-if="participant">
        <span class="text-sm font-bold">
          {{ participant.kills }}/{{ participant.deaths }}/{{ participant.assists }}
        </span>
        <span class="text-xs text-black/60 dark:text-white/60">{{ kdaText }}</span>
      </template>
    </span>

    <span class="hidden text-right text-xs tabular-nums @min-[620px]:block">
      <span class="sr-only"
        >{{ t('playerTabs.matchHistory.ledger.columns.killParticipation') }}
      </span>
      {{ participant ? `${kp}%` : '—' }}
    </span>
    <span class="hidden text-right text-xs tabular-nums @min-[620px]:block">
      <span class="sr-only">{{ t('playerTabs.matchHistory.ledger.columns.damageShare') }} </span>
      {{ damageShare !== null ? `${damageShare}%` : '—' }}
    </span>
    <span class="hidden text-right text-xs tabular-nums @min-[620px]:block">
      <span class="sr-only">{{ t('playerTabs.matchHistory.ledger.columns.duration') }} </span>
      {{ durationText }}
    </span>

    <span
      class="inline-flex h-5.5 min-w-6 items-center justify-center justify-self-end rounded-md px-0.5 text-[11px]"
      :class="replayGlyphClass"
      :title="replayLabel"
    >
      <NIcon v-if="replayState?.state === 'watch'" aria-hidden="true"><Replay20Filled /></NIcon>
      <NIcon v-else-if="replayState?.state === 'download'" aria-hidden="true">
        <Replay20Regular />
      </NIcon>
      <span v-else-if="replayState?.state === 'downloading'" aria-hidden="true">
        {{ replayState.downloadProgress }}%
      </span>
      <span v-else-if="replayState?.state === 'checking'" aria-hidden="true">…</span>
      <span v-else-if="replayState?.state === 'incompatible'" aria-hidden="true">⊘</span>
      <span v-else aria-hidden="true">·</span>
      <span class="sr-only">{{ replayLabel }}</span>
    </span>
  </button>
</template>

<script setup lang="ts">
import { getReplayStateTitle } from '@renderer-shared/components/match-card/utils/tabs'
import { useGameResultName, usePosition } from '@renderer-shared/components/match-card/utils/text'
import { formatSeconds } from '@renderer-shared/components/match-card/utils/time'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import { useAkariResourceProvider } from '@renderer-shared/providers/akari-resource'
import type { ReplayDownloadProgress } from '@shared/types/league-client/replays'
import { Replay20Filled, Replay20Regular } from '@vicons/fluent'
import dayjs from 'dayjs'
import { useTranslation } from 'i18next-vue'
import { NIcon } from 'naive-ui'
import { computed } from 'vue'

import { LEDGER_GRID_COLUMNS_CLASS, type LedgerEntry } from './ledger-entries'

const {
  entry,
  selected = false,
  focusable = false,
  replayState = null,
  isCrossRegion = false
} = defineProps<{
  entry: LedgerEntry
  selected?: boolean
  focusable?: boolean
  replayState?: ReplayDownloadProgress | null
  isCrossRegion?: boolean
}>()

const emit = defineEmits<{
  select: [entry: LedgerEntry]
}>()

const { t } = useTranslation()
const resources = useAkariResourceProvider()
const gameResultName = useGameResultName()
const position = usePosition()

const participant = computed(() => entry.participant)

const queueName = computed(() => resources.queues.name(entry.basicInfo.queueId))

const championName = computed(() => {
  return participant.value
    ? resources.champions.name(participant.value.championId)
    : queueName.value
})

const resultName = computed(() => {
  if (!entry.team) return ''

  return gameResultName(
    entry.team.subteamPlacement,
    entry.team.winResult,
    entry.team.isSurrender,
    resources.runtime.locale
  )
})

const metaParts = computed(() => {
  const parts: string[] = []
  const value = participant.value?.position

  if (value && !['invalid', 'none'].includes(value.toLowerCase())) {
    parts.push(position(value))
  }

  parts.push(dayjs(entry.basicInfo.gameCreation).format('HH:mm'))

  return parts
})

const durationText = computed(() => formatSeconds(entry.basicInfo.gameDuration))

const kp = computed(() => ((participant.value?.killParticipation ?? 0) * 100).toFixed(0))

const damageShare = computed(() => {
  if (!participant.value || !entry.team) return null

  return (
    (participant.value.totalDamageDealtToChampions /
      (entry.team.totalDamageDealtToChampions || 1)) *
    100
  ).toFixed(0)
})

const kdaText = computed(() => {
  const p = participant.value
  if (!p) return ''

  if (p.deaths === 0 && (p.kills > 0 || p.assists > 0)) {
    return t('matchCard.overview.perfect')
  }

  return t('playerTabs.matchHistory.ledger.kdaValue', { value: p.kda.toFixed(1) })
})

const stripeClass = computed(() => {
  switch (entry.resultStyle) {
    case 'win':
      return 'bg-blue-600/80 dark:bg-blue-300/80'
    case 'loss':
      return 'bg-red-600/80 dark:bg-red-300/80'
    default:
      return 'bg-black/30 dark:bg-white/30'
  }
})

const resultTextClass = computed(() => {
  switch (entry.resultStyle) {
    case 'win':
      return 'text-blue-600 dark:text-blue-300'
    case 'loss':
      return 'text-red-700 dark:text-red-300'
    default:
      return 'text-black/70 dark:text-white/70'
  }
})

const replayLabel = computed(() => {
  if (!replayState) {
    return isCrossRegion
      ? t('playerTabs.matchHistory.ledger.replayCrossRegion')
      : t('playerTabs.matchHistory.ledger.replayUnknown')
  }

  return getReplayStateTitle(t, replayState)
})

const replayGlyphClass = computed(() => {
  switch (replayState?.state) {
    case 'watch':
      return 'bg-blue-600/15 text-blue-700 dark:bg-blue-300/15 dark:text-blue-300'
    case 'download':
    case 'downloading':
      return 'bg-black/8 text-black/80 dark:bg-white/10 dark:text-white/80'
    default:
      return 'text-black/40 dark:text-white/40'
  }
})
</script>

<style scoped>
.match-ledger-row {
  font-family: inherit;
}
</style>
