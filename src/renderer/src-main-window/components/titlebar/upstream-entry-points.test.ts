import { renderToString } from '@vue/server-renderer'
import { expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'

import StartupPane from '../../views/player-tabs/components/StartupPane.vue'
import SidebarFixed from '../sidebar/SidebarFixed.vue'
import CommonButtons from './CommonButtons.vue'

vi.mock('i18next-vue', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('naive-ui', async () => {
  const { defineComponent, h } = await import('vue')
  const container = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', [slots.trigger?.(), slots.default?.()])
  })
  return {
    NBadge: container,
    NIcon: container,
    NPopover: container,
    NProgress: container,
    NTooltip: container,
    NEllipsis: container,
    NScrollbar: container,
    NSpin: container,
    useMessage: () => ({ success: vi.fn(), error: vi.fn() }),
    useNotification: () => ({ success: vi.fn() })
  }
})
vi.mock('@renderer-shared/shards', () => ({
  useInstance: () => ({
    auxWindow: { showOrRestore: vi.fn() },
    useNavigateToTab: () => ({ navigateToTabByPuuid: vi.fn() })
  })
}))
vi.mock('@renderer-shared/shards/window-manager', () => ({ WindowManagerRenderer: class {} }))
vi.mock('@renderer-shared/shards/window-manager/store', () => ({
  useAuxWindowStore: () => ({ settings: { enabled: true } }),
  useMainWindowStore: () => ({ focus: 'focused' })
}))
vi.mock('@renderer-shared/shards/app-common/store', () => ({
  useAppCommonStore: () => ({ version: 'candidate' })
}))
vi.mock('@renderer-shared/shards/league-client', () => ({ LeagueClientRenderer: class {} }))
vi.mock('@renderer-shared/shards/league-client/store', () => ({
  useLeagueClientStore: () => ({
    summoner: { me: null },
    auth: null,
    connectingClient: null,
    isConnected: false,
    isInConnectionLoop: false
  })
}))
vi.mock('@renderer-shared/shards/league-client-ux/store', () => ({
  useLeagueClientUxStore: () => ({ launchedClients: [] })
}))
vi.mock('@renderer-shared/shards/sgp/store', () => ({ useSgpStore: () => ({}) }))
vi.mock('@renderer-shared/shards/respawn-timer/store', () => ({
  useRespawnTimerStore: () => ({ settings: { enabled: true }, info: { isDead: false } })
}))
// A retained upstream update state must not bring its entry points back.
vi.mock('@renderer-shared/shards/self-update/store', () => ({
  useSelfUpdateStore: () => ({
    releaseInfo: { isNew: true, isUpdateSupported: true, version: '99.0.0' },
    settings: { ignoreVersion: null }
  })
}))
vi.mock('@renderer-shared/composables/useStreamerModeMaskedText', () => ({
  useStreamerModeMaskedText: () => ({ masked: (value: string) => value })
}))
vi.mock('@main-window/shards/league-client-peek/store', () => ({
  useLeagueClientPeekStore: () => ({})
}))
vi.mock('@main-window/shards/player-tabs', () => ({ PlayerTabsRenderer: class {} }))
vi.mock('@main-window/context', () => ({
  useMainWindowAppContext: () => ({ openSettingsModal: vi.fn() })
}))
vi.mock('@main-window/components/game-launcher/useDetectedClientLaunchItems', async () => {
  const { ref } = await import('vue')
  return { useDetectedClientLaunchItems: () => ref([]) }
})
vi.mock('../sidebar/ClientConnection.vue', () => ({ default: { render: () => null } }))
vi.mock('../sidebar/respawn-timer-item', () => ({ RespawnTimerItem: { render: () => null } }))
vi.mock('@renderer-shared/components/HorizontalExpand.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h('div', slots.default?.())
    })
  }
})

it('renders titlebar, home and sidebar without upstream announcement, update or contact entries', async () => {
  const html = await renderToString(
    createSSRApp(
      defineComponent({
        setup: () => () => h('main', [h(CommonButtons), h(StartupPane), h(SidebarFixed)])
      })
    )
  )
  expect(html).toContain('titlebar.actions.auxWindow')
  expect(html).toContain('vcandidate')
  expect(html).toContain('navigation.sidebar.status.settings')
  expect(html).not.toMatch(
    /newVersionAvailable|titlebar.actions.(notice|github)|contact-channels|View Update/
  )
})
