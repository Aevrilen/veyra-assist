<template>
  <div
    ref="titlebar"
    class="app-titlebar"
    :class="[
      { 'should-show-bottom-border': shouldShowBottomBorder },
      'pl-2',
      { 'mac-titlebar': as.isMacOS }
    ]"
  >
    <div class="shard-area">
      <Transition name="fade">
        <KeepAlive>
          <PlayerTabsTitle v-if="$route.name === 'player-tabs'" />
          <OngoingGameTitle
            v-else-if="$route.name === 'ongoing-game'"
            :compact="isCompactTitlebar"
          />
          <div v-else class="workspace-section-label">
            {{
              t(
                $route.name === 'settings'
                  ? route.params.section === 'appearance'
                    ? 'navigation.workspace.customAppearance'
                    : 'navigation.workspace.settings'
                  : `navigation.sidebar.menu.${String($route.name)}`
              )
            }}
          </div>
        </KeepAlive>
      </Transition>
    </div>

    <div class="divider" :class="{ invisible: !shouldShowDivider }" />
    <div class="titlebar-actions">
      <SearchButton :compact="isCompactTitlebar" />
      <AutomationStatus :compact="isCompactTitlebar" />
      <BackgroundTasks :compact="isCompactTitlebar" />
      <CommonButtons />
    </div>

    <div class="w-1" v-if="as.isMacOS"></div>

    <!-- no duplicate traffic buttons on macOS xD -->
    <template v-if="!as.isMacOS">
      <div class="divider" />
      <TrafficButtons />
    </template>
  </div>
</template>

<script setup lang="ts">
import { useInstance } from '@renderer-shared/shards'
import { WindowManagerRenderer } from '@renderer-shared/shards/window-manager'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { useOngoingGameStore } from '@renderer-shared/shards/ongoing-game/store'
import { useElementSize } from '@vueuse/core'
import { useTranslation } from 'i18next-vue'
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import { useRoute } from 'vue-router'

import { usePlayerTabsStore } from '@main-window/shards/player-tabs/store'

import { AutomationStatus } from './automation-status'
import { BackgroundTasks } from './background-tasks'
import CommonButtons from './CommonButtons.vue'
import { SearchButton } from '../search-pane'
import OngoingGameTitle from './OngoingGameTitle.vue'
import PlayerTabsTitle from './player-tabs-title'
import TrafficButtons from './TrafficButtons.vue'

const route = useRoute()
const { t } = useTranslation()

const TITLEBAR_COMPACT_MAX_WIDTH = 920
const titlebar = useTemplateRef('titlebar')
const { width: titlebarWidth } = useElementSize(titlebar, undefined, { box: 'border-box' })
const isCompactTitlebar = computed(
  () => titlebarWidth.value > 0 && titlebarWidth.value <= TITLEBAR_COMPACT_MAX_WIDTH
)

const lcs = useLeagueClientStore()
const ogs = useOngoingGameStore()
const pts = usePlayerTabsStore()
const as = useAppCommonStore()
const wm = useInstance(WindowManagerRenderer)
watch(
  () => as.isMacOS,
  (isMacOS) => {
    if (isMacOS) void nextTick(() => wm.mainWindow.setTrafficLightPosition(8, 12))
  },
  { immediate: true, flush: 'post' }
)

const shouldShowDivider = computed(() => {
  switch (route.name) {
    case 'player-tabs':
      return lcs.isConnected && pts.tabs.length

    case 'ongoing-game':
      const isCsSpectateWait =
        lcs.champSelect.session &&
        lcs.champSelect.session.isSpectating &&
        Object.values(ogs.teams).flat().length === 0

      return ogs.queryStage.phase !== 'unavailable' && !isCsSpectateWait
    default:
      return false
  }
})

const shouldShowBottomBorder = computed(() => {
  switch (route.name) {
    case 'player-tabs':
      return lcs.isConnected && pts.tabs.length
    case 'ongoing-game':
      return ogs.queryStage.phase !== 'unavailable'
    default:
      return false
  }
})
</script>

<style scoped>
.app-titlebar.mac-titlebar {
  padding-left: 80px;
}
.app-titlebar {
  display: flex;
  position: relative;
  height: var(--la-titlebar-height);
  align-items: center;
  -webkit-app-region: drag;
  z-index: 1000000;
  flex-shrink: 0;
  background-color: var(--la-workspace-panel);
  border-bottom: 1px solid var(--la-workspace-border);

  &.should-show-bottom-border {
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);

    [data-theme='dark'] & {
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
  }
}

.shard-area {
  height: 100%;
  width: 0;
  flex: 1;
  min-width: 0;
}

.workspace-section-label {
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 16px;
  color: var(--la-workspace-muted);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
}

.titlebar-actions {
  height: 100%;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 6px;
  padding: 0 8px;
  -webkit-app-region: no-drag;
}

.app-name {
  padding: 0 4px;
  font-family: 'Comfortaa', sans-serif;
  font-weight: bold;
  margin-left: 8px;
}

[data-theme='dark'] {
  .app-name {
    color: rgba(255, 255, 255, 0.8);
  }
}

[data-theme='light'] {
  .app-name {
    color: rgba(0, 0, 0, 0.8);
  }
}

.divider {
  width: 1px;
  height: 40%;
  box-sizing: border-box;
  margin: 0 8px;
  background-color: rgba(255, 255, 255, 0.15);

  &.invisible {
    visibility: hidden;
  }
}

[data-theme='dark'] {
  .divider {
    background-color: rgba(255, 255, 255, 0.15);
  }
}

[data-theme='light'] {
  .divider {
    background-color: rgba(0, 0, 0, 0.15);
  }
}

[data-theme-id]:not([data-theme-id='light']):not([data-theme-id='dark']) {
  .app-name {
    color: color-mix(in oklch, var(--la-color-text-themed) 84%, transparent);
  }

  .app-titlebar {
    &.should-show-bottom-border {
      border-bottom-color: rgb(var(--la-card-border-rgb) / 0.22);
    }
  }

  .divider {
    background-color: rgb(var(--la-card-border-rgb) / 0.3);
  }
}
</style>
