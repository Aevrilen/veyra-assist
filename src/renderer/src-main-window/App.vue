<template>
  <div class="app-frame">
    <SearchPane
      v-model:show="isShowingSearchPane"
      v-model:page="searchPanePage"
      @navigate-to-summoner="handleSummonerSearchNavigate"
      @navigate-to-setting="handleSettingsSearchNavigate"
    />
    <MainWindowCloseConfirmModal />
    <SetupInAppScope />
    <MainWindowBackground />
    <div class="workspace">
      <MainWindowTitlebar />
      <WorkspaceHeader />
      <ChampSelectPositionNotice />
      <div ref="contentEl" class="workspace-content">
        <RouterView v-slot="{ Component }">
          <Transition name="fade">
            <KeepAlive>
              <component :is="Component" />
            </KeepAlive>
          </Transition>
        </RouterView>
      </div>
      <WorkspaceFooter :settings-active="route.name === 'settings'" />
    </div>
    <div v-if="as.isRabiVersion" class="version-watermark">
      {{ t('appName', { ns: 'common' }) }} {{ as.version }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useInstance } from '@renderer-shared/shards'
import {
  useAkariNavigation,
  useAkariNavigationStep
} from '@renderer-shared/shards/akari-navigation'
import { AppCommonRenderer } from '@renderer-shared/shards/app-common'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { SetupInAppScope } from '@renderer-shared/shards/setup-in-app-scope/setup-in-app-scope-component'
import { useSgpStore } from '@renderer-shared/shards/sgp/store'
import { greeting } from '@renderer-shared/utils/greeting'
import { useElementSize } from '@vueuse/core'
import { useTranslation } from 'i18next-vue'
import { nextTick, ref, useTemplateRef } from 'vue'
import { NavigationFailureType, isNavigationFailure, useRoute, useRouter } from 'vue-router'

import { PlayerTabsRenderer } from '@main-window/shards/player-tabs'

import MainWindowCloseConfirmModal from './components/MainWindowCloseConfirmModal.vue'
import ChampSelectPositionNotice from './components/champ-select-position/ChampSelectPositionNotice.vue'
import { SETTINGS_MODAL_NAVIGATION_STEP_KEY } from './components/settings-modal/navigation'
import WorkspaceFooter from './components/main-workspace/WorkspaceFooter.vue'
import WorkspaceHeader from './components/main-workspace/WorkspaceHeader.vue'
import { SearchPane, type SearchPanePage } from './components/search-pane'
import MainWindowTitlebar from './components/titlebar/MainWindowTitlebar.vue'
import { provideMainWindowAppContext } from './context'
import {
  MAIN_WINDOW_NAVIGATION_STEP_KEY,
  type MainWindowNavigationPayload
} from './navigation-steps'
import { type SettingsNavigationTargetId, navigateToSetting } from './settings-navigation'
import MainWindowBackground from './shards/main-window-ui/MainWindowBackground.vue'

const navigation = useAkariNavigation()
const app = useInstance(AppCommonRenderer)
const as = useAppCommonStore()
const leagueClient = useLeagueClientStore()
const sgp = useSgpStore()
const playerTabs = useInstance(PlayerTabsRenderer)
const { navigateToTabByPuuidAndSgpServerId } = playerTabs.useNavigateToTab()
const { t } = useTranslation()
const router = useRouter()
const route = useRoute()

greeting(as.version)

const contentEl = useTemplateRef('contentEl')
const { width, height } = useElementSize(contentEl)
const isShowingSearchPane = ref(false)
const searchPanePage = ref<SearchPanePage>('settings')

useAkariNavigationStep<MainWindowNavigationPayload>({
  key: MAIN_WINDOW_NAVIGATION_STEP_KEY,
  activate: async (payload, { signal }) => {
    const destination =
      payload.surface === 'settings-modal'
        ? { name: 'settings' }
        : { name: payload.route.name, params: { section: payload.route.section } }
    const failure = await router.replace(destination)
    if (
      isNavigationFailure(failure, NavigationFailureType.aborted | NavigationFailureType.cancelled)
    ) {
      return { status: 'unavailable', reason: 'navigation-rejected' }
    }
    if (!signal.aborted) await nextTick()
    return undefined
  }
})

const handleSettingsSearchNavigate = (targetId: SettingsNavigationTargetId) => {
  isShowingSearchPane.value = false
  void navigateToSetting(navigation, targetId)
}

const handleSummonerSearchNavigate = (
  puuid: string,
  sgpServerId: string | null,
  setCurrent = true
) => {
  const targetSgpServerId = sgpServerId || sgp.availability.sgpServerId
  if (setCurrent) {
    isShowingSearchPane.value = false
    navigateToTabByPuuidAndSgpServerId(puuid, targetSgpServerId)
  } else {
    playerTabs.createTab(puuid, targetSgpServerId, { setCurrent: false })
  }
}

const openSearchPane = (page?: SearchPanePage) => {
  if (page) searchPanePage.value = page
  else if (!isShowingSearchPane.value)
    searchPanePage.value = leagueClient.isConnected ? 'summoner' : 'settings'
  isShowingSearchPane.value = true
}

const openSettings = (section = 'data') => {
  void router.push({ name: 'settings', params: { section } })
}

provideMainWindowAppContext({
  contentWidth: width,
  contentHeight: height,
  openSearch: openSearchPane,
  openSettingsModal: () => openSettings(),
  openAppearanceSettings: () => openSettings('appearance')
})

app.onApplicationMenuAboutClick(() => {
  void navigation.navigate([
    { key: MAIN_WINDOW_NAVIGATION_STEP_KEY, payload: { surface: 'settings-modal' } },
    { key: SETTINGS_MODAL_NAVIGATION_STEP_KEY, payload: 'about' }
  ])
})
app.onApplicationMenuSettingsClick(() => openSettings())
</script>

<style scoped>
.app-frame {
  position: relative;
  height: 100%;
  display: flex;
  min-width: var(--la-app-min-width);
  min-height: var(--la-app-min-height);
  isolation: isolate;
}
.workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  z-index: 5;
  overflow: hidden;
}
.workspace-content {
  position: relative;
  flex: 1;
  height: 0;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.version-watermark {
  position: absolute;
  bottom: 54px;
  right: 16px;
  z-index: 10;
  font-size: 12px;
  opacity: 0.4;
  pointer-events: none;
}
</style>
