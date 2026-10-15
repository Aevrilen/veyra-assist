<template>
  <SettingsSection :title="t('veyraSettings.dataLoading')">
    <SettingsRow
      setting-id="ongoing-game.data-loading-mode"
      :label="t('veyraSettings.dataLoading')"
      :label-description="t('veyraSettings.dataLoadingDescription')"
      :label-width="400"
    >
      <NSelect
        class="w-48!"
        size="small"
        :value="mode"
        :options="options"
        @update:value="(value: number) => ongoing.setConcurrency(value)"
      />
    </SettingsRow>
  </SettingsSection>
</template>
<script setup lang="ts">
import SettingsRow from '@main-window/settings-navigation/NavigableSettingsRow.vue'
import SettingsSection from '@main-window/settings-navigation/NavigableSettingsSection.vue'
import { useInstance } from '@renderer-shared/shards'
import { OngoingGameRenderer } from '@renderer-shared/shards/ongoing-game'
import { useOngoingGameStore } from '@renderer-shared/shards/ongoing-game/store'
import { useTranslation } from 'i18next-vue'
import { NSelect } from 'naive-ui'
import { computed } from 'vue'
const { t } = useTranslation()
const ongoing = useInstance(OngoingGameRenderer)
const store = useOngoingGameStore()
const mode = computed(() =>
  [1, 2, 4].includes(store.settings.concurrency) ? store.settings.concurrency : 'custom'
)
const options = computed(() => [
  { label: t('veyraSettings.loadingReduced'), value: 1 },
  { label: t('veyraSettings.loadingDefault'), value: 2 },
  { label: t('veyraSettings.loadingFast'), value: 4 },
  ...(mode.value === 'custom'
    ? [{ label: t('veyraSettings.loadingCustom'), value: 'custom', disabled: true }]
    : [])
])
</script>
