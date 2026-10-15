<template>
  <div class="flex flex-col gap-6">
    <GameLauncher configure-only status="" />
    <SavedSettings embedded />
    <SettingsSection :title="t('veyraSettings.feedback')">
      <SettingsRow
        setting-id="debug.files.logs"
        :label="t('veyraSettings.logs')"
        :label-description="t('veyraSettings.logsDescription')"
        :label-width="400"
      >
        <NButton size="small" secondary @click="logger.openLogsDir()">{{
          t('settings.debug.files.logs.button')
        }}</NButton>
      </SettingsRow>
      <SettingsRow
        :label="t('veyraSettings.feedback')"
        :label-description="t('veyraSettings.feedbackUnavailable')"
        :label-width="400"
      >
        <NButton size="small" disabled>{{ t('veyraSettings.unavailable') }}</NButton>
      </SettingsRow>
    </SettingsSection>
    <Client embedded />
    <SettingsSection :title="t('veyraSettings.removal')">
      <SettingsRow
        setting-id="app.misc.uninstall"
        :label="t('settings.app.misc.uninstallApp.label')"
        :label-description="t('veyraSettings.removalUnavailable')"
        :label-width="400"
      >
        <NButton size="small" disabled>{{ t('veyraSettings.unavailable') }}</NButton>
      </SettingsRow>
    </SettingsSection>
  </div>
</template>
<script setup lang="ts">
import GameLauncher from '@main-window/components/game-launcher/GameLauncher.vue'
import SettingsRow from '@main-window/settings-navigation/NavigableSettingsRow.vue'
import SettingsSection from '@main-window/settings-navigation/NavigableSettingsSection.vue'
import Client from '@main-window/views/toolkit/client/Client.vue'
import { useInstance } from '@renderer-shared/shards'
import { LoggerRenderer } from '@renderer-shared/shards/logger'
import { useTranslation } from 'i18next-vue'
import { NButton } from 'naive-ui'
import SavedSettings from './storage-settings/SavedSettings.vue'
const { t } = useTranslation()
const logger = useInstance(LoggerRenderer)
</script>
