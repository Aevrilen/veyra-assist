<template>
  <section v-show="show" class="settings-workspace">
    <header class="settings-heading">
      <NIcon :component="Settings16Filled" />
      <h1>
        {{
          t(
            group === 'appearance'
              ? 'navigation.workspace.customAppearance'
              : 'navigation.workspace.settings'
          )
        }}
      </h1>
      <NButton size="small" quaternary class="developer-entry" @click="showDeveloper = true">{{
        t('veyraSettings.developer')
      }}</NButton>
    </header>
    <nav
      v-if="group !== 'appearance'"
      class="settings-groups"
      :aria-label="t('navigation.workspace.settings')"
    >
      <NButton
        v-for="item in SETTINGS_GROUPS"
        :key="item"
        quaternary
        :type="group === item ? 'primary' : 'default'"
        :aria-current="group === item ? 'page' : undefined"
        @click="selectGroup(item)"
      >
        {{ t(`navigation.workspace.settingsGroups.${item}`) }}
      </NButton>
    </nav>
    <div ref="scrollPane" class="settings-scroll">
      <div class="settings-stack">
        <AppSettings :section="group" embedded />
        <div v-if="group === 'data'" class="settings-stack">
          <DataLoadingSettings /><MatchHistorySettings embedded />
          <StorageSettings v-model:tab-name="storageTabName" embedded />
        </div>
        <div v-if="group === 'window'" class="settings-stack">
          <OngoingGameSettings embedded />
          <MultiWindowSettings embedded />
          <MiscSettings embedded />
        </div>
        <div v-if="group === 'maintenance'" class="settings-stack">
          <HelpRepair />
          <div ref="aboutSection" class="settings-version">Veyra Assist · {{ common.version }}</div>
        </div>
      </div>
    </div>
  </section>
  <DeveloperOptions v-model:show="showDeveloper" />
</template>

<script setup lang="ts">
import { useAkariNavigationStep } from '@renderer-shared/shards/akari-navigation'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import { Settings16Filled } from '@vicons/fluent'
import { useTranslation } from 'i18next-vue'
import { NButton, NIcon } from 'naive-ui'
import { nextTick, ref, useTemplateRef, watch } from 'vue'
import { NavigationFailureType, isNavigationFailure, useRoute, useRouter } from 'vue-router'

import HelpRepair from './HelpRepair.vue'
import DataLoadingSettings from './DataLoadingSettings.vue'
import DeveloperOptions from './developer-options/DeveloperOptions.vue'
import AppSettings from './AppSettings.vue'
import MatchHistorySettings from './MatchHistorySettings.vue'
import MiscSettings from './MiscSettings.vue'
import MultiWindowSettings from './MultiWindowSettings.vue'
import OngoingGameSettings from './OngoingGameSettings.vue'
import {
  SETTINGS_GROUPS,
  SETTINGS_MODAL_NAVIGATION_STEP_KEY,
  getSettingsGroup,
  isSettingsGroup,
  type SettingsGroup,
  type SettingsNavigationPayload,
  type SettingsTabName
} from './navigation'
import StorageSettings from './storage-settings/StorageSettings.vue'
import type { StorageSettingsTabName } from './storage-settings/navigation'

const { t } = useTranslation()
const common = useAppCommonStore()
const route = useRoute()
const router = useRouter()
const show = defineModel<boolean>('show', { default: false })
const tabName = defineModel<SettingsTabName>('tabName', { default: 'basic' })
const storageTabName = defineModel<StorageSettingsTabName>('storageTabName', {
  default: 'tagged-players'
})
const group = ref<SettingsGroup>('data')
const showDeveloper = ref(false)
const scrollPane = useTemplateRef('scrollPane')
const aboutSection = useTemplateRef('aboutSection')

watch(
  () => route.params.section,
  (section) => {
    if (route.name === 'settings') {
      group.value =
        section === 'notifications'
          ? 'maintenance'
          : isSettingsGroup(section)
            ? section
            : getSettingsGroup(tabName.value)
      if (section === 'notifications')
        void router.replace({ name: 'settings', params: { section: 'maintenance' } })
    }
  },
  { immediate: true }
)

const selectGroup = async (value: SettingsGroup) => {
  const failure = await router.replace({ name: 'settings', params: { section: value } })
  if (isNavigationFailure(failure, NavigationFailureType.aborted | NavigationFailureType.cancelled))
    return false
  group.value = value
  await nextTick()
  scrollPane.value?.scrollTo({ top: 0 })
  return true
}

useAkariNavigationStep<SettingsNavigationPayload>({
  key: SETTINGS_MODAL_NAVIGATION_STEP_KEY,
  activate: async (payload) => {
    showDeveloper.value = false
    const tab = typeof payload === 'string' ? payload : payload.tab
    const targetId = typeof payload === 'string' ? undefined : payload.targetId
    tabName.value = tab
    if (!(await selectGroup(getSettingsGroup(tab, targetId))))
      return { status: 'unavailable', reason: 'navigation-rejected' }
    if (tab === 'about') aboutSection.value?.scrollIntoView({ block: 'start' })
    return undefined
  }
})

const waitUntilEntered = async (_signal: AbortSignal) => {
  await nextTick()
}
defineExpose({ waitUntilEntered })
</script>

<style scoped>
.settings-workspace {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
.settings-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 24px 24px 16px;
  color: var(--la-color-text-primary);
}
.settings-heading .n-icon {
  font-size: 22px;
}
.developer-entry {
  margin-left: auto;
}
.settings-heading h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.3;
}
.settings-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 24px 12px;
  border-bottom: 1px solid var(--la-workspace-border);
}
.settings-scroll {
  overflow: auto;
  flex: 1;
  min-height: 0;
  padding: 24px;
}
.settings-stack {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 24px;
  max-width: 1100px;
  margin: 0 auto;
}
.settings-version {
  color: var(--la-workspace-muted);
  font-size: 12px;
}
</style>
