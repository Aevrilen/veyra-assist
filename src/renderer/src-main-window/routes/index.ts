import { createRouter, createWebHashHistory } from 'vue-router'

import SettingsModal from '@main-window/components/settings-modal/SettingsModal.vue'
import Automation from '@main-window/views/automation/Automation.vue'
import OngoingGame from '@main-window/views/ongoing-game/OngoingGame.vue'
import PlayerTabs from '@main-window/views/player-tabs/PlayerTabs.vue'
import Test from '@main-window/views/test/Test.vue'
import Toolkit from '@main-window/views/toolkit/Toolkit.vue'

// console.log(import.meta.env.BASE_URL)
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/first-run', redirect: { name: 'root' } },
    {
      path: '/',
      name: 'root',
      redirect: { name: 'player-tabs' }
    },
    {
      name: 'player-tabs',
      path: '/player-tabs/:sgpServerId?/:puuid?',
      component: PlayerTabs
    },
    {
      name: 'ongoing-game',
      path: '/ongoing-game',
      component: OngoingGame
    },
    {
      name: 'toolkit',
      path: '/toolkit/:section?',
      component: Toolkit
    },
    {
      name: 'automation',
      path: '/automation/:section?',
      component: Automation
    },
    {
      name: 'settings',
      path: '/settings/:section?',
      component: SettingsModal,
      props: { show: true }
    },
    {
      name: 'test',
      path: '/test/:section?',
      component: Test
    }
  ]
})

// Preserve existing toolkit URLs while presenting the new groups.
router.beforeEach((to) => {
  if (to.name !== 'toolkit') return
  const section = to.params.section
  if (section === 'client')
    return { name: 'settings', params: { section: 'maintenance' }, query: to.query, hash: to.hash }
  const aliases: Record<string, string> = {
    misc: 'social',
    'friend-tools': 'social',
    lobby: 'rewards',
    'claim-tools': 'rewards',
    'in-process': 'rewards',
    ...(import.meta.env.DEV ? { 'loot-tools': 'rewards' } : {})
  }
  if (typeof section === 'string' && aliases[section])
    return {
      name: 'toolkit',
      params: { section: aliases[section] },
      query: to.query,
      hash: to.hash
    }
  return undefined
})

export { router }
