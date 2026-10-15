<template>
  <component :is="embedded ? 'div' : NScrollbar" :class="{ 'h-full': !embedded }">
    <div class="flex flex-col gap-6">
      <SettingsSection
        setting-id="ongoing-game.common"
        :title="t('settings.ongoingGame.titleCommon')"
      >
        <SettingsRow
          setting-id="ongoing-game.enabled"
          :label="t('settings.ongoingGame.enabled.label')"
          :label-description="t('settings.ongoingGame.enabled.description')"
          :label-width="400"
        >
          <NSwitch
            size="small"
            :value="ogs.settings.enabled"
            @update:value="(val) => og.setEnabled(val)"
          />
        </SettingsRow>

        <SettingsRow
          setting-id="ongoing-game.auto-route"
          :label="t('settings.ongoingGame.autoRouteWhenGameStarts.label')"
          :label-description="t('settings.ongoingGame.autoRouteWhenGameStarts.description')"
          :label-width="400"
        >
          <NSwitch
            size="small"
            :value="ogs.settings.autoRouteWhenGameStarts"
            @update:value="(val) => og.setAutoRouteWhenGameStarts(val)"
          />
        </SettingsRow>

        <SettingsRow
          setting-id="ongoing-game.queue-filter"
          :label="t('settings.ongoingGame.matchHistoryTagPreference.label')"
          :label-description="t('settings.ongoingGame.matchHistoryTagPreference.description')"
          :label-width="400"
          :disabled="as.settings.preferredLolSource !== 'sgp'"
        >
          <NRadioGroup
            :value="ogs.settings.matchHistoryTagPreference"
            @update:value="(val) => og.setMatchHistoryTagPreference(val)"
            :disabled="as.settings.preferredLolSource !== 'sgp'"
          >
            <div class="flex flex-wrap justify-end gap-x-3 gap-y-1">
              <NRadio value="all">
                {{ t('settings.ongoingGame.matchHistoryTagPreference.options.all') }}</NRadio
              >
              <NRadio value="current">{{
                t('settings.ongoingGame.matchHistoryTagPreference.options.current')
              }}</NRadio>
            </div>
          </NRadioGroup>
        </SettingsRow>

        <SettingsRow
          setting-id="ongoing-game.query-in-lobby"
          :label="t('settings.ongoingGame.queryInLobbyPhase.label')"
          :label-description="t('settings.ongoingGame.queryInLobbyPhase.description')"
          :label-width="400"
        >
          <NSwitch
            size="small"
            :value="ogs.settings.queryInLobbyPhase"
            @update:value="(val) => og.setQueryInLobbyPhase(val)"
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        setting-id="ongoing-game.champ-select-overlay"
        :title="t('settings.ongoingGame.champSelectOverlay.title')"
      >
        <NText depth="3" class="text-xs">
          {{ t('settings.ongoingGame.champSelectOverlay.description') }}
        </NText>
        <NText depth="3" class="text-xs">
          {{ t('settings.ongoingGame.champSelectOverlay.dataDescription') }}
        </NText>
        <NText depth="3" class="text-xs">
          {{ t('veyraSettings.positionDescription') }}
        </NText>
        <SettingsRow
          setting-id="ongoing-game.champ-select-overlay.opacity"
          :label="t('settings.ongoingGame.champSelectOverlay.opacity.label')"
          :label-description="t('settings.ongoingGame.champSelectOverlay.opacity.description')"
          :label-width="400"
        >
          <div class="flex w-50 items-center gap-2">
            <NSlider
              class="flex-1"
              :min="30"
              :max="90"
              :step="5"
              :value="ogs.settings.champSelectOverlay.backgroundOpacity"
              @update:value="(value) => updateOverlay('backgroundOpacity', value as number)"
            />
            <span class="w-10 text-right"
              >{{ ogs.settings.champSelectOverlay.backgroundOpacity }}%</span
            >
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        setting-id="ongoing-game.player-card"
        :title="t('settings.ongoingGame.titlePlayerCard')"
      >
        <SettingsRow
          setting-id="ongoing-game.player-card.champion-usage"
          :label-width="400"
          :label="t('settings.ongoingGame.showChampionUsage.label')"
          :label-description="t('settings.ongoingGame.showChampionUsage.description')"
        >
          <NRadioGroup
            :value="ogs.settings.showChampionUsage"
            @update:value="(val) => og.setShowChampionUsage(val)"
          >
            <div class="flex flex-wrap justify-end gap-x-3 gap-y-1">
              <NRadio value="none">
                {{ t('settings.ongoingGame.showChampionUsage.options.none') }}</NRadio
              >
              <NRadio value="recent">{{
                t('settings.ongoingGame.showChampionUsage.options.recent')
              }}</NRadio>
              <NRadio value="mastery">{{
                t('settings.ongoingGame.showChampionUsage.options.mastery')
              }}</NRadio>
            </div>
          </NRadioGroup>
        </SettingsRow>

        <SettingsRow
          setting-id="ongoing-game.player-card.match-border"
          :label-width="400"
          :label="t('settings.ongoingGame.showMatchHistoryItemBorder.label')"
          :label-description="t('settings.ongoingGame.showMatchHistoryItemBorder.description')"
        >
          <NSwitch
            size="small"
            :value="ogs.settings.showMatchHistoryItemBorder"
            @update:value="(val) => og.setShowMatchHistoryItemBorder(val)"
          />
        </SettingsRow>

        <SettingsRow
          setting-id="ongoing-game.player-card.jungle-pathing"
          :label-width="400"
          :label="t('settings.ongoingGame.showJunglePathing.label')"
          :label-description="t('settings.ongoingGame.showJunglePathing.description')"
        >
          <NSwitch
            size="small"
            :value="ogs.settings.showJunglePathing"
            @update:value="(val) => og.setShowJunglePathing(val)"
          />
        </SettingsRow>

        <SettingsRow
          setting-id="ongoing-game.player-card.tags"
          :label-width="400"
          :label="t('settings.ongoingGame.playerCardTags.label')"
          align="start"
          :label-description="t('settings.ongoingGame.playerCardTags.description')"
          control-full-line
        >
          <div class="grid w-full grid-cols-3 gap-y-1">
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showPremadeTeamTag"
              @update:checked="
                (val) =>
                  og.setPlayerCardTags({ ...ogs.settings.playerCardTags, showPremadeTeamTag: val })
              "
            >
              {{ t('settings.ongoingGame.playerCardTags.tags.showPremadeTeamTag.label') }}
            </NCheckbox>
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showWinningStreakTag"
              @update:checked="
                (val) =>
                  og.setPlayerCardTags({
                    ...ogs.settings.playerCardTags,
                    showWinningStreakTag: val
                  })
              "
            >
              {{ t('settings.ongoingGame.playerCardTags.tags.showWinningStreakTag.label') }}
            </NCheckbox>
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showLosingStreakTag"
              @update:checked="
                (val) =>
                  og.setPlayerCardTags({ ...ogs.settings.playerCardTags, showLosingStreakTag: val })
              "
            >
              {{ t('settings.ongoingGame.playerCardTags.tags.showLosingStreakTag.label') }}
            </NCheckbox>
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showSoloKillsTag"
              @update:checked="
                (val) =>
                  og.setPlayerCardTags({ ...ogs.settings.playerCardTags, showSoloKillsTag: val })
              "
            >
              {{ t('settings.ongoingGame.playerCardTags.tags.showSoloKillsTag.label') }}
            </NCheckbox>
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showEasyGankTag"
              @update:checked="
                (val) =>
                  og.setPlayerCardTags({ ...ogs.settings.playerCardTags, showEasyGankTag: val })
              "
            >
              {{ t('settings.ongoingGame.playerCardTags.tags.showEasyGankTag.label') }}
            </NCheckbox>
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showAverageTeamDamageTag"
              @update:checked="
                (val) =>
                  og.setPlayerCardTags({
                    ...ogs.settings.playerCardTags,
                    showAverageTeamDamageTag: val
                  })
              "
            >
              {{ t('settings.ongoingGame.playerCardTags.tags.showAverageTeamDamageTag.label') }}
            </NCheckbox>
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showAverageTeamDamageTakenTag"
              @update:checked="
                (val) =>
                  og.setPlayerCardTags({
                    ...ogs.settings.playerCardTags,
                    showAverageTeamDamageTakenTag: val
                  })
              "
            >
              {{
                t('settings.ongoingGame.playerCardTags.tags.showAverageTeamDamageTakenTag.label')
              }}
            </NCheckbox>
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showSuspiciousFlashPositionTag"
              @update:checked="
                (val) =>
                  og.setPlayerCardTags({
                    ...ogs.settings.playerCardTags,
                    showSuspiciousFlashPositionTag: val
                  })
              "
            >
              {{
                t('settings.ongoingGame.playerCardTags.tags.showSuspiciousFlashPositionTag.label')
              }}
            </NCheckbox>
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showAverageTeamGoldTag"
              @update:checked="
                (val) =>
                  og.setPlayerCardTags({
                    ...ogs.settings.playerCardTags,
                    showAverageTeamGoldTag: val
                  })
              "
            >
              {{ t('settings.ongoingGame.playerCardTags.tags.showAverageTeamGoldTag.label') }}
            </NCheckbox>
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showAverageCsPerMinuteTag"
              @update:checked="
                (val) =>
                  og.setPlayerCardTags({
                    ...ogs.settings.playerCardTags,
                    showAverageCsPerMinuteTag: val
                  })
              "
            >
              {{ t('settings.ongoingGame.playerCardTags.tags.showAverageCsPerMinuteTag.label') }}
            </NCheckbox>
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showAverageDamageGoldEfficiencyTag"
              @update:checked="
                (val) =>
                  og.setPlayerCardTags({
                    ...ogs.settings.playerCardTags,
                    showAverageDamageGoldEfficiencyTag: val
                  })
              "
            >
              {{
                t(
                  'settings.ongoingGame.playerCardTags.tags.showAverageDamageGoldEfficiencyTag.label'
                )
              }}
            </NCheckbox>
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showGreatPerformanceTag"
              @update:checked="
                (val) =>
                  og.setPlayerCardTags({
                    ...ogs.settings.playerCardTags,
                    showGreatPerformanceTag: val
                  })
              "
            >
              {{ t('settings.ongoingGame.playerCardTags.tags.showGreatPerformanceTag.label') }}
            </NCheckbox>
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showMetTag"
              @update:checked="
                (val) => og.setPlayerCardTags({ ...ogs.settings.playerCardTags, showMetTag: val })
              "
            >
              {{ t('settings.ongoingGame.playerCardTags.tags.showMetTag.label') }}
            </NCheckbox>
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showTaggedTag"
              @update:checked="
                (val) =>
                  og.setPlayerCardTags({ ...ogs.settings.playerCardTags, showTaggedTag: val })
              "
            >
              {{ t('settings.ongoingGame.playerCardTags.tags.showTaggedTag.label') }}
            </NCheckbox>
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showSelfTag"
              @update:checked="
                (val) => og.setPlayerCardTags({ ...ogs.settings.playerCardTags, showSelfTag: val })
              "
            >
              {{ t('settings.ongoingGame.playerCardTags.tags.showSelfTag.label') }}
            </NCheckbox>
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showWinRateTeamTag"
              @update:checked="
                (val) =>
                  og.setPlayerCardTags({ ...ogs.settings.playerCardTags, showWinRateTeamTag: val })
              "
            >
              {{ t('settings.ongoingGame.playerCardTags.tags.showWinRateTeamTag.label') }}
            </NCheckbox>
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showPrivacyTag"
              @update:checked="
                (val) =>
                  og.setPlayerCardTags({ ...ogs.settings.playerCardTags, showPrivacyTag: val })
              "
            >
              {{ t('settings.ongoingGame.playerCardTags.tags.showPrivacyTag.label') }}
            </NCheckbox>
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showAverageEnemyMissingPingsTag"
              @update:checked="
                (val) =>
                  og.setPlayerCardTags({
                    ...ogs.settings.playerCardTags,
                    showAverageEnemyMissingPingsTag: val
                  })
              "
            >
              {{
                t('settings.ongoingGame.playerCardTags.tags.showAverageEnemyMissingPingsTag.label')
              }}
            </NCheckbox>
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showAverageVisionScoreTag"
              @update:checked="
                (val) =>
                  og.setPlayerCardTags({
                    ...ogs.settings.playerCardTags,
                    showAverageVisionScoreTag: val
                  })
              "
            >
              {{ t('settings.ongoingGame.playerCardTags.tags.showAverageVisionScoreTag.label') }}
            </NCheckbox>
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showAkariScoreTag"
              @update:checked="
                (val) =>
                  og.setPlayerCardTags({ ...ogs.settings.playerCardTags, showAkariScoreTag: val })
              "
            >
              {{ t('settings.ongoingGame.playerCardTags.tags.showAkariScoreTag.label') }}
            </NCheckbox>
            <NCheckbox
              :checked="ogs.settings.playerCardTags.showAverageKillDamageEfficiencyTag"
              @update:checked="
                (val) =>
                  og.setPlayerCardTags({
                    ...ogs.settings.playerCardTags,
                    showAverageKillDamageEfficiencyTag: val
                  })
              "
            >
              {{
                t(
                  'settings.ongoingGame.playerCardTags.tags.showAverageKillDamageEfficiencyTag.label'
                )
              }}
            </NCheckbox>
          </div>
        </SettingsRow>
      </SettingsSection>
    </div>
  </component>
</template>

<script setup lang="ts">
import SettingsRow from '@main-window/settings-navigation/NavigableSettingsRow.vue'
import SettingsSection from '@main-window/settings-navigation/NavigableSettingsSection.vue'
import { useInstance } from '@renderer-shared/shards'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import { OngoingGameRenderer } from '@renderer-shared/shards/ongoing-game'
import { useOngoingGameStore } from '@renderer-shared/shards/ongoing-game/store'
import type { ChampSelectOverlaySettings } from '@shared/champ-select-overlay'
import { useTranslation } from 'i18next-vue'
import { NCheckbox, NRadio, NRadioGroup, NScrollbar, NSlider, NSwitch, NText } from 'naive-ui'

defineProps<{ embedded?: boolean }>()
const { t } = useTranslation()

const as = useAppCommonStore()
const ogs = useOngoingGameStore()
const og = useInstance(OngoingGameRenderer)

function updateOverlay<K extends keyof ChampSelectOverlaySettings>(
  key: K,
  value: ChampSelectOverlaySettings[K]
) {
  return og.setChampSelectOverlay({ ...ogs.settings.champSelectOverlay, [key]: value })
}
</script>
