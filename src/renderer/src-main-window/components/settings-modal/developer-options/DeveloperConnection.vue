<template>
  <div class="flex flex-col gap-4">
    <SettingsRow
      setting-id="app.lcu-connection.use-wmi"
      v-if="as.isWindows"
      :label="t('settings.app.lcConnection.useWmi.label')"
      :label-description="t('settings.app.lcConnection.useWmi.description')"
      :label-width="400"
    >
      <NSwitch
        size="small"
        :value="lcus.settings.useWmi"
        @update:value="(val: boolean) => lcu.setUseWmi(val)"
      />
    </SettingsRow>
    <SettingsRow
      setting-id="app.lcu-connection.rebuild-wmi"
      v-if="as.isWindows"
      :label="t('settings.app.lcConnection.rebuildWmi.label')"
      :label-description="t('settings.app.lcConnection.rebuildWmi.description')"
      :label-width="400"
    >
      <NButton size="small" @click="confirmRebuildWmi" type="warning">
        {{ t('settings.app.lcConnection.rebuildWmi.rebuildButton') }}
      </NButton>
    </SettingsRow>
    <SettingsRow
      setting-id="app.misc.log-level"
      :label="t('settings.app.misc.logLevel.label')"
      :label-description="t('settings.app.misc.logLevel.description')"
      :label-width="400"
    >
      <NSelect
        class="w-40!"
        size="small"
        :value="ls.logLevel"
        @update:value="(val) => lg.setLogLevel(val)"
        :options="logLevels"
      />
    </SettingsRow>
  </div>
</template>
<script setup lang="ts">
import SettingsRow from '@main-window/settings-navigation/NavigableSettingsRow.vue'
import { useInstance } from '@renderer-shared/shards'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import { LeagueClientUxRenderer } from '@renderer-shared/shards/league-client-ux'
import { useLeagueClientUxStore } from '@renderer-shared/shards/league-client-ux/store'
import { LoggerRenderer } from '@renderer-shared/shards/logger'
import { useLoggerStore } from '@renderer-shared/shards/logger/store'
import { useTranslation } from 'i18next-vue'
import { NButton, NSelect, NSwitch, useDialog } from 'naive-ui'
const { t } = useTranslation()
const as = useAppCommonStore()
const lcus = useLeagueClientUxStore()
const ls = useLoggerStore()
const lcu = useInstance(LeagueClientUxRenderer)
const lg = useInstance(LoggerRenderer)
const dialog = useDialog()
const logLevels = [
  { label: 'Info', value: 'info' },
  { label: 'Warn', value: 'warn' },
  { label: 'Error', value: 'error' },
  { label: 'Debug', value: 'debug' }
]
function confirmRebuildWmi() {
  dialog.warning({
    title: t('settings.app.lcConnection.rebuildWmi.label'),
    content: t('veyraSettings.wmiConfirmation'),
    positiveText: t('veyraSettings.confirm'),
    negativeText: t('veyraSettings.cancel'),
    onPositiveClick: () => lcu.rebuildWmi()
  })
}
</script>
