<template>
  <div class="fixture-note">
    开发夹具 · 姓名与统计全部为演示；不是接口实测，也不是完整客户端定位。
  </div>
  <div class="story-desktop" :style="{ background: desktopBackground }">
    <div
      v-if="group === 'candidates' || group === 'both'"
      class="story-frame"
      :style="{ width: `${candidateWidth}px`, height: '67px' }"
    >
      <ChampSelectOverlay
        :data="data"
        :session="session"
        group="candidates"
        :champions="champions"
        :champion-rates="championRates"
        :settings="settings"
      />
    </div>
    <div
      v-if="group === 'teammates' || group === 'both'"
      class="story-frame"
      :style="{ width: `${teammateWidth}px`, height: `${teammateHeight}px` }"
    >
      <ChampSelectOverlay
        :data="data"
        :session="session"
        group="teammates"
        :champions="champions"
        :champion-rates="championRates"
        :settings="settings"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import {
  getChampSelectCandidateWidth,
  getChampSelectTeammateHeight,
  type ChampSelectOverlayGroup,
  type ChampSelectOverlaySettings
} from '@shared/champ-select-overlay'
import { computed, watchEffect } from 'vue'

import ChampSelectOverlay from './ChampSelectOverlay.vue'
import type {
  ChampSelectChampionRates,
  ChampSelectOverlayChampions,
  ChampSelectOverlayData,
  ChampSelectOverlaySession
} from './types'

const {
  data,
  session,
  group,
  champions,
  championRates,
  settings,
  teammateWidth,
  desktopBackground,
  maskNames
} = defineProps<{
  data: ChampSelectOverlayData
  session: ChampSelectOverlaySession
  group: ChampSelectOverlayGroup | 'both'
  champions: ChampSelectOverlayChampions
  championRates: Record<number, ChampSelectChampionRates>
  settings: ChampSelectOverlaySettings
  teammateWidth: number
  desktopBackground: string
  maskNames: boolean
}>()

const candidateWidth = computed(
  () =>
    getChampSelectCandidateWidth(settings) +
    settings.candidateStep * Math.max(0, session.benchChampions.length - 1)
)
const teammateHeight = computed(
  () =>
    getChampSelectTeammateHeight(settings) +
    settings.teammateStep * Math.max(0, session.myTeam.length - 1)
)
const appCommon = useAppCommonStore()
watchEffect(() => {
  appCommon.settings.streamerMode = maskNames
})
</script>

<style scoped>
.fixture-note {
  margin-bottom: 12px;
  color: var(--la-workspace-muted);
  font-size: 12px;
}
.story-desktop {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: max-content;
  max-width: 100%;
  gap: 16px;
  padding: 8px;
}
.story-frame {
  flex: none;
  max-width: 100%;
}
</style>
