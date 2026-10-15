<template>
  <TabbedPage
    :icon="ToolFilled"
    :title="t('navigation.sidebar.menu.toolkit')"
    :tabs="tabs"
    :tab-aliases="aliases"
    route-name="toolkit"
    default-tab="social"
  />
</template>

<script setup lang="ts">
import { ToolFilled } from '@vicons/antd'
import { Chat, UserMultiple } from '@vicons/carbon'
import { Gift24Regular } from '@vicons/fluent'
import { useTranslation } from 'i18next-vue'
import { computed } from 'vue'
import TabbedPage, { type TabConfig } from '@main-window/components/TabbedPage.vue'
import InGameSend from './in-game-send/InGameSend.vue'
import RewardsAndLobby from './groups/RewardsAndLobby.vue'
import SocialTools from './groups/SocialTools.vue'

const { t } = useTranslation()
const aliases = {
  misc: 'social',
  'friend-tools': 'social',
  lobby: 'rewards',
  'claim-tools': 'rewards',
  'in-process': 'rewards',
  ...(import.meta.env.DEV ? { 'loot-tools': 'rewards' } : {})
}
const tabs = computed<TabConfig[]>(() => [
  {
    key: 'social',
    name: t('navigation.workspace.toolkitGroups.social'),
    icon: UserMultiple,
    component: SocialTools
  },
  {
    key: 'rewards',
    name: t('navigation.workspace.toolkitGroups.rewards'),
    icon: Gift24Regular,
    component: RewardsAndLobby
  },
  { key: 'in-game-send', name: t('toolkit.home.in-game-send'), icon: Chat, component: InGameSend }
])
</script>
