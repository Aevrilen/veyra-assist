<template>
  <div
    v-if="data.queryStage.phase === 'champ-select' && session"
    class="champ-select-overlay"
    :style="overlayStyle"
    role="region"
    :aria-label="t(group)"
  >
    <div
      v-if="
        group === 'candidates' &&
        session.benchEnabled &&
        session.benchChampions.length &&
        settings.candidateStep >= 54
      "
      class="candidate-band surface"
      role="list"
      :aria-label="t('candidates')"
    >
      <div
        v-for="(candidate, index) in session.benchChampions"
        :key="index"
        class="candidate-stat"
        :style="{ left: `${index * settings.candidateStep}px` }"
        role="listitem"
        :aria-label="t('candidateSlot', { count: index + 1 })"
      >
        <template v-if="candidate.championId > 0">
          <div class="candidate-metric">
            <span class="label">{{ t('winRate') }}</span>
            <span class="number">{{ percent(championRates[candidate.championId]?.winRate) }}</span>
          </div>
          <div class="candidate-metric">
            <span class="label">{{ t('pickRate') }}</span>
            <span class="number">{{ percent(championRates[candidate.championId]?.pickRate) }}</span>
          </div>
        </template>
      </div>
    </div>

    <div v-else-if="group === 'teammates'" class="teammates" role="list">
      <div
        v-for="(player, index) in players"
        :key="player.cellId"
        class="teammate surface"
        :style="{ top: `${index * settings.teammateStep}px` }"
        role="listitem"
      >
        <div class="player-name number">{{ player.name ? masked(player.name) : '—' }}</div>
        <div
          class="team-metric"
          :aria-label="
            player.analysis
              ? t('personalRecentDetails', {
                  count: player.analysis.count,
                  rate: percent(player.analysis.summary.winRate, 0)
                })
              : t('personalRecent')
          "
        >
          <span class="label wide-label">
            {{
              player.analysis
                ? t('personalRecentSamples', { count: player.analysis.count })
                : t('personalRecent')
            }}
          </span>
          <span class="label compact-label">{{ t('personal') }}</span>
          <span class="number personal-rate">{{
            percent(player.analysis?.summary.winRate, 0)
          }}</span>
        </div>
        <div class="champion-name label" :aria-label="t('currentChampion')">
          <span class="wide-label">{{ t('current') }} · </span
          >{{ champions[player.championId]?.name || '—' }}
        </div>
        <div
          class="team-metric"
          :aria-label="
            t('championOverallDetails', {
              rate: percent(championRates[player.championId]?.winRate)
            })
          "
        >
          <span class="label wide-label">{{ t('championOverall') }}</span>
          <span class="label compact-label">{{ t('champion') }}</span>
          <span class="number precise-rate">{{
            percent(championRates[player.championId]?.winRate)
          }}</span>
          <span class="number rounded-rate">{{
            percent(championRates[player.championId]?.winRate, 0)
          }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useStreamerModeMaskedText } from '@renderer-shared/composables/useStreamerModeMaskedText'
import {
  getChampSelectCandidateWidth,
  getChampSelectTeammateHeight,
  type ChampSelectOverlayGroup,
  type ChampSelectOverlaySettings
} from '@shared/champ-select-overlay'
import { useTranslation } from 'i18next-vue'
import { computed } from 'vue'

import type {
  ChampSelectChampionRates,
  ChampSelectOverlayChampions,
  ChampSelectOverlayData,
  ChampSelectOverlaySession
} from './types'

const { data, session, group, champions, championRates, settings } = defineProps<{
  data: ChampSelectOverlayData
  session: ChampSelectOverlaySession | null
  group: ChampSelectOverlayGroup
  champions: ChampSelectOverlayChampions
  championRates: Record<number, ChampSelectChampionRates>
  settings: ChampSelectOverlaySettings
}>()

const { t } = useTranslation(undefined, { keyPrefix: 'ongoingGame.champSelectOverlay' })
const { masked } = useStreamerModeMaskedText()

const overlayStyle = computed(() => ({
  '--overlay-background': `rgba(24, 27, 33, ${settings.backgroundOpacity / 100})`,
  '--candidate-width': `${getChampSelectCandidateWidth(settings)}px`,
  '--teammate-height': `${getChampSelectTeammateHeight(settings)}px`,
  '--teammate-line-height': getChampSelectTeammateHeight(settings) < 68 ? '14px' : '15px'
}))

const players = computed(() =>
  (session?.myTeam || []).map((row) => {
    // Join by the existing main-side identity resolution, never by sorted player results.
    const puuid = data.champSelectPlayerPuuids[row.cellId]
    const summoner = data.summoner[puuid]
    const analysis = data.analysis?.players[puuid]
    return {
      cellId: row.cellId,
      name: summoner?.gameName || summoner?.displayName || row.gameName,
      championId: row.championId || row.championPickIntent,
      analysis: analysis && analysis.count > 0 ? analysis : null
    }
  })
)

function percent(value: number | null | undefined, digits = 1) {
  return value == null ? '—' : `${(value * 100).toFixed(digits)}%`
}
</script>

<style scoped>
.champ-select-overlay {
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #f2f3f5;
  font-family: 'Microsoft YaHei', system-ui, sans-serif;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  opacity: 1;
  user-select: none;
  pointer-events: none;
}

.surface {
  box-sizing: border-box;
  border: 1px solid rgba(242, 243, 245, 0.1);
  border-radius: 4px;
  background: var(--overlay-background);
}

.label {
  color: #b9c0ca;
  font-weight: 400;
}

.number {
  color: #f2f3f5;
  font-weight: 500;
}

.candidate-band {
  position: relative;
  width: 100%;
  height: 67px;
  border: 0;
  font-size: 13px;
}

.candidate-band::before {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  border: 1px solid rgba(242, 243, 245, 0.1);
  border-radius: inherit;
  content: '';
}

.candidate-stat {
  position: absolute;
  top: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: var(--candidate-width);
  height: 100%;
  gap: 2px;
  white-space: nowrap;
}

.candidate-metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 14px;
}

.candidate-metric .label {
  font-size: 12px;
}
.candidate-metric .number {
  font-size: 14px;
  line-height: 16px;
}

.teammates {
  position: relative;
  container: teammates / inline-size;
  width: 100%;
  height: 100%;
}

.teammate {
  position: absolute;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100%;
  height: var(--teammate-height);
  padding: 1px 3px;
  font-size: 13px;
  line-height: var(--teammate-line-height);
}

.player-name,
.champion-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.team-metric {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 2px;
  white-space: nowrap;
}

.team-metric .label,
.champion-name {
  font-size: 12px;
}

.team-metric .label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.team-metric .number {
  flex-shrink: 0;
}

.compact-label,
.rounded-rate {
  display: none;
}

@container teammates (max-width: 88px) {
  .precise-rate {
    display: none;
  }
  .rounded-rate {
    display: inline;
  }
}

@container teammates (max-width: 104px) {
  .wide-label {
    display: none;
  }

  .compact-label {
    display: inline;
  }
}
</style>
