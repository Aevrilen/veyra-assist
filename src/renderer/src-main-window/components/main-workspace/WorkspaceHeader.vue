<template>
  <header class="workspace-header">
    <div class="workspace-brand">
      <NIcon><VeyraLogo /></NIcon><span>{{ t('appName', { ns: 'common' }) }}</span>
    </div>
    <nav class="workspace-navigation" :aria-label="t('navigation.sidebar.label')">
      <NButton
        v-for="item in primaryItems"
        :key="item.name"
        quaternary
        size="small"
        :class="{ active: route.name === item.name }"
        :aria-current="route.name === item.name ? 'page' : undefined"
        @click="navigate(item.name)"
      >
        <NBadge
          :show="item.name === 'ongoing-game' && matchInProgress && route.name !== item.name"
          dot
        >
          {{ t(item.label) }}
        </NBadge>
      </NButton>
    </nav>
    <div class="workspace-header-actions">
      <NDropdown trigger="click" :options="themeOptions" @select="selectTheme">
        <NButton size="small" quaternary :aria-label="t('navigation.workspace.appearance')">
          {{ t('navigation.workspace.appearance')
          }}<span class="selected-theme">{{ currentThemeLabel }}</span>
        </NButton>
      </NDropdown>
      <NButton
        size="small"
        quaternary
        :aria-label="t('navigation.workspace.customAppearance')"
        @click="context.openAppearanceSettings()"
      >
        <template #icon
          ><NIcon><Settings16Filled /></NIcon></template
        >{{ t('navigation.workspace.customAppearance') }}
      </NButton>
      <NButton size="small" quaternary @click="context.openSearch('summoner')">{{
        t('navigation.workspace.playerSearch')
      }}</NButton>
    </div>
  </header>
</template>

<script setup lang="ts">
import VeyraLogo from '@renderer-shared/assets/icon/VeyraLogo.vue'
import { useInstance } from '@renderer-shared/shards'
import { AppCommonRenderer } from '@renderer-shared/shards/app-common'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import { useOngoingGameStore } from '@renderer-shared/shards/ongoing-game/store'
import { WORKSPACE_THEME_IDS, isAppThemeSetting } from '@shared/types/app-theme'
import { Settings16Filled } from '@vicons/fluent'
import { useTranslation } from 'i18next-vue'
import { NBadge, NButton, NDropdown, NIcon } from 'naive-ui'
import { computed, watch } from 'vue'
import { isNavigationFailure, useRoute, useRouter } from 'vue-router'
import { useMainWindowAppContext } from '@main-window/context'

const emit = defineEmits<{ navigate: [] }>()
const { t } = useTranslation()
const context = useMainWindowAppContext()
const route = useRoute()
const router = useRouter()
const app = useInstance(AppCommonRenderer)
const common = useAppCommonStore()
const ongoingGame = useOngoingGameStore()
const primaryItems = [
  { name: 'ongoing-game', label: 'navigation.workspace.match' },
  { name: 'player-tabs', label: 'navigation.workspace.history' },
  { name: 'automation', label: 'navigation.sidebar.menu.automation' },
  { name: 'toolkit', label: 'navigation.sidebar.menu.toolkit' }
] as const
const rememberedPaths = new Map<string, string>()
watch(
  () => route.fullPath,
  () => {
    if (primaryItems.some((item) => item.name === route.name))
      rememberedPaths.set(String(route.name), route.fullPath)
  },
  { immediate: true }
)
const matchInProgress = computed(
  () => ongoingGame.queryStage.phase !== 'unavailable' && ongoingGame.queryStage.phase !== 'lobby'
)
const themeOptions = computed(() =>
  WORKSPACE_THEME_IDS.map((id) => ({
    key: id,
    label: t(`titlebar.actions.themeSelector.presets.${id}`, { defaultValue: id })
  }))
)
const currentThemeLabel = computed(() =>
  t(`titlebar.actions.themeSelector.presets.${common.themeId}`, { defaultValue: common.themeId })
)
const selectTheme = (key: string | number) => {
  if (isAppThemeSetting(key)) void app.setTheme(key)
}
const navigate = async (name: string) => {
  if (route.name === name) {
    emit('navigate')
    return
  }
  const failure = await router.push(rememberedPaths.get(name) ?? { name })
  if (!isNavigationFailure(failure)) emit('navigate')
}
</script>

<style scoped>
.workspace-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  min-height: 60px;
  padding: 8px 24px;
  flex-shrink: 0;
  background: var(--la-workspace-panel);
  border-bottom: 1px solid var(--la-workspace-border);
  -webkit-app-region: drag;
}
.workspace-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 120px;
  font-size: 18px;
  font-weight: 600;
}
.workspace-brand .n-icon {
  font-size: 26px;
  color: var(--la-color-link);
}
.workspace-navigation {
  display: flex;
  gap: 4px;
  margin-right: auto;
  -webkit-app-region: no-drag;
}
.workspace-navigation :deep(.n-button) {
  min-height: 34px;
  padding: 0 14px;
}
.workspace-navigation :deep(.n-button:not(.active):focus:not(:hover)) {
  color: inherit;
  background: transparent;
}
.workspace-navigation :deep(.n-button:focus-visible) {
  outline: 2px solid var(--la-color-link);
  outline-offset: 2px;
}
.workspace-navigation .active {
  color: var(--la-color-link);
  background: var(--la-workspace-accent-soft);
  font-weight: 600;
}
.workspace-header-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  -webkit-app-region: no-drag;
}
.selected-theme {
  margin-left: 8px;
  color: var(--la-workspace-muted);
  font-size: 11px;
}
@media (max-width: 1000px) {
  .workspace-header {
    gap: 8px 12px;
    padding-inline: 16px;
  }
  .workspace-brand {
    min-width: 80px;
  }
  .workspace-navigation :deep(.n-button) {
    padding-inline: 10px;
  }
}
@media (max-width: 760px) {
  .workspace-navigation {
    order: 2;
    width: 100%;
    justify-content: space-between;
  }
  .workspace-header-actions {
    margin-left: auto;
  }
}
</style>
