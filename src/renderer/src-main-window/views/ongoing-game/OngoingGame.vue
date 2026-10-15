<template>
  <div class="h-full">
    <ConnectedMatchPreviewer
      v-model:show="showPreviewModal"
      :game-id="previewingGame.gameId"
      :source="previewingGame.source"
      :puuid="previewingGame.puuid"
      :summary="previewingGame.summary"
      :details="previewingGame.details"
      :hide-privacy="as.settings.streamerMode"
      can-dry-run-ongoing-game
      @navigate-to-summoner-by-puuid="navigateToTabByPuuid"
      @dry-run-ongoing-game="handleDryRunOngoingGame"
    />
    <OngoingGameProvider :value="ongoingGame">
      <GameLauncher
        v-if="ongoingGame.queryStage.phase === 'unavailable' && !ongoingGame.draft"
        :status="launchStatus"
      />
      <OngoingGamePanel
        v-else
        :content-width="contentWidth"
        :content-height="contentHeight"
        @navigate-to-summoner-by-puuid="navigateToTabByPuuid"
        @preview-game="handlePreviewGame"
      />
    </OngoingGameProvider>
  </div>
</template>

<script lang="ts" setup>
import ConnectedMatchPreviewer from '@renderer-shared/components/match-preview/ConnectedMatchPreviewer.vue'
import OngoingGamePanel from '@renderer-shared/components/ongoing-game-panel/OngoingGamePanel.vue'
import {
  createAkariOngoingGameProvider,
  OngoingGameProvider
} from '@renderer-shared/providers/ongoing-game'
import {
  type MatchPreviewPayload,
  type MatchPreviewState,
  toMatchPreviewState
} from '@renderer-shared/components/match-preview'
import { useInstance } from '@renderer-shared/shards'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import { OngoingGameRenderer } from '@renderer-shared/shards/ongoing-game'
import { DraftOptions } from '@shared/shards/ongoing-game'
import { computed, ref, shallowRef } from 'vue'
import { useTranslation } from 'i18next-vue'
import GameLauncher from '@main-window/components/game-launcher/GameLauncher.vue'

import { useMainWindowAppContext } from '@main-window/context'
import { PlayerTabsRenderer } from '@main-window/shards/player-tabs'

const { contentWidth, contentHeight } = useMainWindowAppContext()

const pt = useInstance(PlayerTabsRenderer)
const og = useInstance(OngoingGameRenderer)
const ongoingGame = createAkariOngoingGameProvider()
const { t } = useTranslation()
const launchStatus = computed(() =>
  t(
    !ongoingGame.settings.enabled
      ? 'ongoingGame.panel.disabled'
      : !ongoingGame.isConnected
        ? 'ongoingGame.panel.disconnected'
        : ongoingGame.isSpectating
          ? 'ongoingGame.panel.waitingForSpectate'
          : 'ongoingGame.panel.noOngoingGame'
  )
)

const as = useAppCommonStore()

const { navigateToTabByPuuid } = pt.useNavigateToTab()

const showPreviewModal = ref(false)
const previewingGame = shallowRef<MatchPreviewState>({
  gameId: 0,
  source: 'sgp'
})

const handlePreviewGame = (payload: MatchPreviewPayload) => {
  previewingGame.value = toMatchPreviewState(payload, as.settings.preferredLolSource)
  showPreviewModal.value = true
}

const handleDryRunOngoingGame = async (draft: DraftOptions) => {
  await og.setDraft(draft)
  showPreviewModal.value = false
}
</script>
