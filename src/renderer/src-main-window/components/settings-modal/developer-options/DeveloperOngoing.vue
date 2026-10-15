<template>
  <div class="flex flex-col gap-4">
    <template v-if="group === 'data'"
      ><SettingsRow
        setting-id="ongoing-game.match-history-load-count"
        :label="t('settings.ongoingGame.matchHistoryLoadCount.label')"
        :label-description="t('settings.ongoingGame.matchHistoryLoadCount.description')"
        :label-width="400"
      >
        <NInputNumber
          class="w-25!"
          size="small"
          :min="2"
          :max="200"
          :step="5"
          :value="ogs.settings.matchHistoryLoadCount"
          @update:value="(val) => og.setMatchHistoryLoadCount(val || 20)"
        />
      </SettingsRow>
      <SettingsRow
        setting-id="ongoing-game.concurrency"
        :label="t('settings.ongoingGame.concurrency.label')"
        :label-description="t('settings.ongoingGame.concurrency.description')"
        :label-width="400"
      >
        <NInputNumber
          class="w-25!"
          size="small"
          :min="1"
          :value="ogs.settings.concurrency"
          @update:value="(val) => og.setConcurrency(val ?? 2)"
        />
      </SettingsRow>
      <SettingsRow
        setting-id="ongoing-game.game-details-load-count"
        :label="t('settings.ongoingGame.gameDetailsLoadCount.label')"
        :label-description="
          t('settings.ongoingGame.gameDetailsLoadCount.description', {
            count: ogs.settings.gameDetailsLoadCount
          })
        "
        :label-width="400"
      >
        <NInputNumber
          class="w-25!"
          size="small"
          :min="0"
          :value="ogs.settings.gameDetailsLoadCount"
          @update:value="(val) => og.setGameDetailsLoadCount(val || 0)"
        />
      </SettingsRow>
      <SettingsRow
        setting-id="ongoing-game.premade-threshold"
        :label="t('settings.ongoingGame.premadeTeamInferMatchCountThreshold.label')"
        :label-description="
          t('settings.ongoingGame.premadeTeamInferMatchCountThreshold.description')
        "
        :label-width="400"
      >
        <NInputNumber
          class="w-25!"
          size="small"
          :min="2"
          :value="ogs.settings.premadeTeamInferMatchCountThreshold"
          @update:value="(val) => og.setPremadeTeamInferMatchCountThreshold(val || 5)"
        /> </SettingsRow></template
    ><template v-else
      ><SettingsRow
        setting-id="ongoing-game.champ-select-overlay.candidate-origin"
        :label="t('settings.ongoingGame.champSelectOverlay.candidateOrigin.label')"
        :label-description="
          t('settings.ongoingGame.champSelectOverlay.candidateOrigin.description')
        "
        :label-width="400"
      >
        <NInputNumber
          class="w-32!"
          size="small"
          :min="0"
          :max="4096"
          :value="ogs.settings.champSelectOverlay.candidateFirstCenterX"
          :placeholder="t('settings.ongoingGame.champSelectOverlay.unconfigured')"
          @update:value="(value) => updateOverlay('candidateFirstCenterX', value)"
        />
      </SettingsRow>
      <SettingsRow
        setting-id="ongoing-game.champ-select-overlay.candidate-step"
        :label="t('settings.ongoingGame.champSelectOverlay.candidateStep.label')"
        :label-description="t('settings.ongoingGame.champSelectOverlay.candidateStep.description')"
        :label-width="400"
      >
        <NInputNumber
          class="w-32!"
          size="small"
          :min="44"
          :max="160"
          :step="0.5"
          :value="ogs.settings.champSelectOverlay.candidateStep"
          @update:value="(value) => updateOverlay('candidateStep', value ?? 58.5)"
        />
      </SettingsRow>
      <SettingsRow
        setting-id="ongoing-game.champ-select-overlay.teammate-origin"
        :label="t('settings.ongoingGame.champSelectOverlay.teammateOrigin.label')"
        :label-description="t('settings.ongoingGame.champSelectOverlay.teammateOrigin.description')"
        :label-width="400"
      >
        <NInputNumber
          class="w-32!"
          size="small"
          :min="0"
          :max="4096"
          :value="ogs.settings.champSelectOverlay.teammateFirstCenterY"
          :placeholder="t('settings.ongoingGame.champSelectOverlay.unconfigured')"
          @update:value="(value) => updateOverlay('teammateFirstCenterY', value)"
        />
      </SettingsRow>
      <SettingsRow
        setting-id="ongoing-game.champ-select-overlay.teammate-step"
        :label="t('settings.ongoingGame.champSelectOverlay.teammateStep.label')"
        :label-description="t('settings.ongoingGame.champSelectOverlay.teammateStep.description')"
        :label-width="400"
      >
        <NInputNumber
          class="w-32!"
          size="small"
          :min="64"
          :max="200"
          :value="ogs.settings.champSelectOverlay.teammateStep"
          @update:value="(value) => updateOverlay('teammateStep', value ?? 80)"
        /> </SettingsRow
    ></template>
  </div>
</template>
<script setup lang="ts">
import SettingsRow from '@main-window/settings-navigation/NavigableSettingsRow.vue'
import { useInstance } from '@renderer-shared/shards'
import { OngoingGameRenderer } from '@renderer-shared/shards/ongoing-game'
import { useOngoingGameStore } from '@renderer-shared/shards/ongoing-game/store'
import type { ChampSelectOverlaySettings } from '@shared/champ-select-overlay'
import { useTranslation } from 'i18next-vue'
import { NInputNumber } from 'naive-ui'
defineProps<{ group: 'data' | 'position' }>()
const { t } = useTranslation()
const ogs = useOngoingGameStore()
const og = useInstance(OngoingGameRenderer)
function updateOverlay<K extends keyof ChampSelectOverlaySettings>(
  key: K,
  value: ChampSelectOverlaySettings[K]
) {
  return og.setChampSelectOverlay({ ...ogs.settings.champSelectOverlay, [key]: value })
}
</script>
