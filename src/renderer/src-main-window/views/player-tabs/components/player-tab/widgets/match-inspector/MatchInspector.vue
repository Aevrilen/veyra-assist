<template>
  <aside
    v-if="selection && selectedSummary"
    class="box-border flex min-w-0 flex-col bg-neutral-100 dark:bg-neutral-900"
    :class="asideClass"
    :aria-labelledby="titleId"
  >
    <div ref="scrollEl" class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
      <!-- sticky inspector header -->
      <div
        class="sticky top-0 z-3 box-border flex h-12 items-center gap-1.5 border-t-0 border-r-0 border-b border-l-0 border-solid border-black/10 bg-neutral-100 px-3 dark:border-white/10 dark:bg-neutral-900"
      >
        <NButton
          size="small"
          secondary
          data-inspector-focus="back"
          @click="close({ restoreFocus: true })"
        >
          <template #icon>
            <NIcon>
              <ArrowLeft20Regular v-if="isOverlay" />
              <Dismiss20Regular v-else />
            </NIcon>
          </template>
          {{
            isOverlay
              ? t('playerTabs.matchHistory.inspector.backToList')
              : t('playerTabs.matchHistory.inspector.close')
          }}
        </NButton>

        <NButton
          size="small"
          quaternary
          circle
          :disabled="selectedIndex <= 0"
          :aria-label="t('playerTabs.matchHistory.inspector.previous')"
          :title="t('playerTabs.matchHistory.inspector.previous')"
          @click="step(-1)"
        >
          <template #icon>
            <NIcon><ChevronUp20Regular /></NIcon>
          </template>
        </NButton>
        <NButton
          size="small"
          quaternary
          circle
          :disabled="selectedIndex >= filteredGames.length - 1"
          :aria-label="t('playerTabs.matchHistory.inspector.next')"
          :title="t('playerTabs.matchHistory.inspector.next')"
          @click="step(1)"
        >
          <template #icon>
            <NIcon><ChevronDown20Regular /></NIcon>
          </template>
        </NButton>

        <span class="text-xs text-black/60 tabular-nums dark:text-white/60">
          {{
            t('playerTabs.matchHistory.inspector.position', {
              current: selectedIndex + 1,
              total: filteredGames.length
            })
          }}
        </span>

        <div class="flex-1"></div>

        <NButton v-if="!isOverlay" size="small" tertiary @click="toggleReading">
          <template #icon>
            <NIcon>
              <FullScreenMinimize24Regular v-if="isReading" />
              <FullScreenMaximize20Regular v-else />
            </NIcon>
          </template>
          {{
            isReading
              ? t('playerTabs.matchHistory.inspector.collapse')
              : t('playerTabs.matchHistory.inspector.expand')
          }}
        </NButton>
      </div>

      <MatchInspectorGame
        :key="selection.key"
        :summary="selectedSummary"
        :details="selectedDetails"
        :puuid="puuid"
        :hide-privacy="hidePrivacy"
        :loading-details="isLoadingDetails"
        :details-failed="!!selectedError"
        :replay-state="replayState"
        :can-dry-run-ongoing-game="canDryRunOngoingGame"
        :title-id="titleId"
        :wide-content="isReading && !isOverlay"
        @navigate-to-summoner-by-puuid="handleNavigateToSummonerByPuuid"
        @load-details="(gameId) => loadDetails(gameId)"
        @download-replay="(gameId) => downloadReplay(gameId)"
        @watch-replay="(gameId) => launchRelay(gameId)"
        @dry-run-ongoing-game="(draft) => emit('dryRunOngoingGame', draft)"
      />
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { DraftOptions } from '@shared/shards/ongoing-game'
import {
  ArrowLeft20Regular,
  ChevronDown20Regular,
  ChevronUp20Regular,
  Dismiss20Regular,
  FullScreenMaximize20Regular,
  FullScreenMinimize24Regular
} from '@vicons/fluent'
import { useTranslation } from 'i18next-vue'
import { NButton, NIcon, useMessage } from 'naive-ui'
import { computed, useTemplateRef, watch } from 'vue'

import { usePlayerTab } from '../../context'
import { useMatchHistory } from '../../data/match-history'
import MatchInspectorGame from './MatchInspectorGame.vue'
import { toMatchGameKey, useMatchInspector } from './selection'

const {
  presentation,
  wide = false,
  hidePrivacy = false,
  canDryRunOngoingGame = false
} = defineProps<{
  presentation: 'docked' | 'cover'
  wide?: boolean
  hidePrivacy?: boolean
  canDryRunOngoingGame?: boolean
}>()

const emit = defineEmits<{
  dryRunOngoingGame: [draft: DraftOptions]
}>()

const { t } = useTranslation()
const message = useMessage()

const { id, puuid, sgpServerId, preferredSource, isCurrentTab, navigateToSummonerByPuuid } =
  usePlayerTab()
const { page, filteredGames, loadDetails, downloadReplay, launchRelay } = useMatchHistory()
const { selection, isReading, isOverlay, select, close, toggleReading } = useMatchInspector()

const scrollEl = useTemplateRef('scrollEl')

const titleId = computed(() => `match-inspector-title-${id.value}`)

const filteredGameKeys = computed(() => new Set(filteredGames.value.map(toMatchGameKey)))

const selectedIndex = computed(() => {
  const key = selection.value?.key
  if (!key) return -1

  return filteredGames.value.findIndex((game) => toMatchGameKey(game) === key)
})

const selectedSummary = computed(() => {
  return selectedIndex.value === -1 ? null : filteredGames.value[selectedIndex.value]
})

// details are cached per numeric gameId on the page; only accept the entry that belongs to the
// selected source + gameId so a late response for another source or match cannot be shown
const selectedDetails = computed(() => {
  const summary = selectedSummary.value
  if (!summary) return null

  const details = page.value?.details[summary.gameId]
  return details && details.source === summary.source && details.gameId === summary.gameId
    ? details
    : null
})

const isLoadingDetails = computed(() => {
  const summary = selectedSummary.value
  return !!summary && !!page.value?.detailsLoading[summary.gameId]
})

const selectedError = computed(() => {
  const summary = selectedSummary.value
  return summary ? page.value?.detailsErrors[summary.gameId] : undefined
})

const replayState = computed(() => {
  const summary = selectedSummary.value
  return summary ? (page.value?.replayMetadata[summary.gameId] ?? null) : null
})

// player, server, pagination, page size, queue tag or collection changes make any selection obsolete
const pageSignature = computed(() => {
  const queryParams = page.value?.queryParams
  return [
    puuid.value,
    sgpServerId.value,
    preferredSource.value,
    page.value?.isLoadedByCollectMode ?? '',
    queryParams?.startIndex ?? 0,
    queryParams?.count ?? '',
    queryParams?.tag ?? ''
  ].join('|')
})

watch(
  [() => selection.value?.key, filteredGameKeys, pageSignature],
  ([key, keys, signature], [, , previousSignature]) => {
    if (!key) {
      return
    }

    if (signature !== previousSignature) {
      close()
      return
    }

    if (!keys.has(key)) {
      close()

      if (isCurrentTab.value) {
        message.info(t('playerTabs.matchHistory.inspector.selectionClosed'))
      }
    }
  }
)

watch(
  () => selection.value?.key,
  () => {
    scrollEl.value?.scrollTo({ top: 0 })
  }
)

const asideClass = computed(() => {
  if (presentation === 'cover') {
    return 'absolute inset-0 z-20'
  }

  return [
    'relative h-full shrink-0 border-t-0 border-r-0 border-b-0 border-l border-solid border-black/10 dark:border-white/10',
    wide ? 'w-120' : 'w-110'
  ]
})

const step = (delta: number) => {
  const next = filteredGames.value[selectedIndex.value + delta]

  if (next) {
    select(next)
  }
}

const handleNavigateToSummonerByPuuid = (targetPuuid: string, setCurrent?: boolean) => {
  navigateToSummonerByPuuid(targetPuuid, setCurrent ?? true)
}
</script>
