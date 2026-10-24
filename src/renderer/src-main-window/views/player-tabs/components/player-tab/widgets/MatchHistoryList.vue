<template>
  <div class="@container" @keydown="handleLedgerKeydown" @focusin="handleLedgerFocusIn">
    <div
      v-if="hasLoadError"
      role="alert"
      class="mb-2 flex items-center justify-between gap-2 rounded bg-black/5 px-3 py-2 text-sm text-orange-600 dark:bg-white/5 dark:text-orange-300"
    >
      <span>{{ t('playerTabs.profile.failedToLoadMatchHistoryTitle') }}</span>
      <NButton size="small" :loading="isLoading" :disabled="isLoading" @click="retryMatchHistory">
        {{ t('playerTabs.profile.retryMatchHistory') }}
      </NButton>
    </div>
    <div
      v-if="isLoading && (!page || entries.length === 0)"
      class="flex h-50 items-center justify-center rounded bg-black/5 dark:bg-white/5"
    >
      <div class="flex items-center gap-2">
        <NSpin :size="16" />
        <span class="text-sm text-black/80 dark:text-white/60">{{
          t('playerTabs.profile.loading')
        }}</span>
      </div>
    </div>

    <template v-else-if="page">
      <!-- scope line -->
      <div
        class="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-black/60 dark:text-white/60"
      >
        <span v-if="page.isLoadedByCollectMode" class="min-w-0">
          <CollectModeDescription
            :scanned-count="page.collectModeStats?.scannedGamesCount ?? page.games.length"
            :collected-games-count="page.games.length"
          />
        </span>
        <template v-else>
          <span>{{ t('playerTabs.matchHistory.ledger.pageScope', { page: currentPage }) }}</span>
          <span aria-hidden="true">·</span>
          <span>{{
            t('playerTabs.matchHistory.ledger.loadedMatches', { count: page.games.length })
          }}</span>
          <template v-if="rootHasCombinator">
            <span aria-hidden="true">·</span>
            <span>{{
              t('playerTabs.matchHistory.ledger.matchingMatches', { count: entries.length })
            }}</span>
          </template>
        </template>
        <span v-if="entries.length" class="ml-auto hidden @min-[620px]:inline">
          {{ t('playerTabs.matchHistory.ledger.keyboardHint') }}
        </span>
      </div>

      <div
        v-if="entries.length === 0 && !hasLoadError"
        class="flex h-50 flex-col items-center justify-center gap-2 rounded bg-black/5 dark:bg-white/5"
      >
        <span class="text-sm text-black/80 dark:text-white/60">{{
          rootHasCombinator
            ? t('playerTabs.profile.noFilteredMatchHistory')
            : t('playerTabs.profile.noMatchHistory')
        }}</span>

        <NButton
          v-if="rootHasCombinator && !page.isLoadedByCollectMode"
          size="small"
          tertiary
          @click="clearPredicate"
        >
          {{ t('playerTabs.profile.clearFilters') }}
        </NButton>
      </div>

      <template v-else-if="entries.length">
        <!-- column header -->
        <div
          aria-hidden="true"
          class="hidden items-center gap-x-2.5 pt-2 pr-2.5 pb-1 text-[11px] text-black/50 @min-[620px]:grid dark:text-white/50"
          :class="LEDGER_GRID_COLUMNS_CLASS"
        >
          <span></span>
          <span></span>
          <span>{{ t('playerTabs.matchHistory.ledger.columns.champion') }}</span>
          <span>{{ t('playerTabs.matchHistory.ledger.columns.queue') }}</span>
          <span class="text-right">{{ t('playerTabs.matchHistory.ledger.columns.kda') }}</span>
          <span class="text-right">{{
            t('playerTabs.matchHistory.ledger.columns.killParticipation')
          }}</span>
          <span class="text-right">{{
            t('playerTabs.matchHistory.ledger.columns.damageShare')
          }}</span>
          <span class="text-right">{{ t('playerTabs.matchHistory.ledger.columns.duration') }}</span>
          <span class="text-right">{{ t('playerTabs.matchHistory.ledger.columns.replay') }}</span>
        </div>

        <div role="list" class="flex flex-col">
          <div v-for="day of days" :key="day.dayKey" role="listitem">
            <div
              role="heading"
              aria-level="3"
              class="mt-2 mb-1 flex justify-between border-t-0 border-r-0 border-b border-l-0 border-solid border-black/10 px-1 pt-2 pb-1.5 text-xs font-medium text-black/60 dark:border-white/10 dark:text-white/60"
            >
              <span>{{ dayLabel(day) }}</span>
              <span>
                {{ t('playerTabs.matchHistory.ledger.dayWins', { count: day.wins }) }} ·
                {{ t('playerTabs.matchHistory.ledger.dayLosses', { count: day.losses }) }}
              </span>
            </div>

            <div role="list" class="flex flex-col gap-0.5">
              <div v-for="entry of day.entries" :key="entry.key" role="listitem">
                <MatchLedgerRow
                  :entry="entry"
                  :selected="entry.key === selectedKey"
                  :focusable="entry.key === tabbableKey"
                  :replay-state="page.replayMetadata[entry.summary.gameId]"
                  :is-cross-region="isCrossRegion"
                  @select="handleSelect"
                />
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>

    <div
      v-else-if="!page && !hasLoadError"
      class="flex h-50 flex-col items-center justify-center gap-2 rounded bg-black/5 dark:bg-white/5"
    >
      <span class="text-sm text-black/80 dark:text-white/60">{{
        t('playerTabs.profile.matchHistoryNotLoaded')
      }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MatchPreviewPayload } from '@renderer-shared/components/match-preview'
import { useAkariResourceProvider } from '@renderer-shared/providers/akari-resource'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { useOngoingGameStore } from '@renderer-shared/shards/ongoing-game/store'
import dayjs from 'dayjs'
import { useTranslation } from 'i18next-vue'
import { NButton, NSpin } from 'naive-ui'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { usePlayerTabsStore } from '@main-window/shards/player-tabs/store'

import { usePlayerTab } from '../context'
import { useMatchHistory } from '../data/match-history'
import { useMatchHistoryFilters } from '../data/match-history-filters'
import CollectModeDescription from './match-history-pagination/CollectModeDescription.vue'
import { useMatchInspector } from './match-inspector'
import MatchLedgerRow from './match-ledger/MatchLedgerRow.vue'
import {
  LEDGER_GRID_COLUMNS_CLASS,
  type LedgerDay,
  type LedgerEntry,
  groupLedgerEntriesByDay,
  toLedgerEntry
} from './match-ledger/ledger-entries'

const lcs = useLeagueClientStore()
const pts = usePlayerTabsStore()
const ogs = useOngoingGameStore()
const resources = useAkariResourceProvider()

const { t } = useTranslation()

const { puuid, events, isCrossRegion, previewGame } = usePlayerTab()
const { page, isLoading, hasLoadError, filteredGames, loadMatchHistory, retryMatchHistory } =
  useMatchHistory()
const { rootHasCombinator, clearPredicate } = useMatchHistoryFilters()
const inspector = useMatchInspector()

const entries = computed(() => filteredGames.value.map((g) => toLedgerEntry(g, puuid.value)))
const days = computed(() => groupLedgerEntriesByDay(entries.value))

const currentPage = computed(() => {
  if (!page.value) return 1

  const { startIndex = 0, count = pts.frontendSettings.loadCount } = page.value.queryParams
  return Math.floor(startIndex / count) + 1
})

const dayLabel = (day: LedgerDay) => {
  const date = dayjs(day.gameCreation).locale(resources.runtime.locale.toLowerCase())
  const daysAgo = dayjs().startOf('day').diff(date.startOf('day'), 'day')
  const text = date.format('YYYY-MM-DD ddd')

  if (daysAgo === 0) return `${t('playerTabs.matchHistory.ledger.today')} · ${text}`
  if (daysAgo === 1) return `${t('playerTabs.matchHistory.ledger.yesterday')} · ${text}`

  return text
}

const selectedKey = computed(() => inspector.selection.value?.key ?? null)

// roving tabindex: one row is reachable by Tab, arrows move within the ledger
const lastFocusedKey = ref<string | null>(null)
const tabbableKey = computed(() => {
  const keys = new Set(entries.value.map((e) => e.key))

  if (selectedKey.value && keys.has(selectedKey.value)) return selectedKey.value
  if (lastFocusedKey.value && keys.has(lastFocusedKey.value)) return lastFocusedKey.value

  return entries.value[0]?.key ?? null
})

const handleSelect = (entry: LedgerEntry) => {
  inspector.select(entry.summary, { moveFocus: true })
}

const handleLedgerFocusIn = (event: FocusEvent) => {
  const row = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-ledger-key]')

  if (row?.dataset.ledgerKey) {
    lastFocusedKey.value = row.dataset.ledgerKey
  }
}

const LEDGER_NAVIGATION_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End'])

const handleLedgerKeydown = (event: KeyboardEvent) => {
  if (!LEDGER_NAVIGATION_KEYS.has(event.key)) {
    return
  }

  const row = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-ledger-key]')

  if (!row) {
    return
  }

  event.preventDefault()

  const list = entries.value
  const index = list.findIndex((e) => e.key === row.dataset.ledgerKey)
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? list.length - 1
        : index + (event.key === 'ArrowDown' ? 1 : -1)
  const next = list[nextIndex]

  if (!next) {
    return
  }

  // docked inspector follows the keyboard; a covering inspector only opens on Enter / click
  if (!inspector.isOverlay.value) {
    inspector.select(next.summary)
  }

  inspector.focusLedgerRow(next.key)
}

const isEndOfGame = computed(
  () => lcs.gameflow.phase === 'EndOfGame' || lcs.gameflow.phase === 'PreEndOfGame'
)

watch(
  () => isEndOfGame.value,
  (is) => {
    if (pts.frontendSettings.refreshTabsAfterGameEnds && is) {
      if (!ogs.teams) {
        return
      }

      const allPlayerPuuids = Object.values(ogs.teams).flat()

      if (allPlayerPuuids.includes(puuid.value)) {
        if (!page.value || (page.value.queryParams.startIndex || 0) === 0) {
          loadMatchHistory({
            startIndex: 0,
            count: pts.frontendSettings.loadCount
          })
        }
      }
    }
  }
)

const handleFocusGame = (payload: MatchPreviewPayload) => {
  const { summary } = payload
  const extractedGameId = typeof summary === 'number' ? summary : summary.gameId
  const entry = entries.value.find((e) => e.summary.gameId === extractedGameId)

  if (entry) {
    inspector.select(entry.summary, { moveFocus: true })

    void nextTick(() => {
      document
        .querySelector<HTMLElement>(`[data-ledger-key="${entry.key}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  } else {
    const localSummary =
      typeof summary === 'number'
        ? page.value?.games.find((game) => game.gameId === summary)
        : summary

    previewGame({
      ...payload,
      summary: localSummary ?? summary,
      details:
        payload.details ?? (localSummary ? page.value?.details[localSummary.gameId] : undefined)
    })
  }
}

onMounted(() => {
  events.on('focusGame', handleFocusGame)
})

onUnmounted(() => {
  events.off('focusGame', handleFocusGame)
})
</script>
