import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { useOngoingGameStore } from '@renderer-shared/shards/ongoing-game/store'
import { createDefaultChampSelectOverlaySettings } from '@shared/champ-select-overlay'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'

import App from './App.vue'

const runtime = vi.hoisted(() => ({
  settings: [] as ReturnType<typeof createDefaultChampSelectOverlaySettings>[]
}))
vi.mock('@renderer-shared/shards/setup-in-app-scope/setup-in-app-scope-component', () => ({
  SetupInAppScope: () => null
}))
vi.mock('@renderer-shared/shards/champion-data', () => ({ ChampionDataRenderer: class {} }))
vi.mock('@renderer-shared/shards/logger', () => ({ LoggerRenderer: class {} }))
vi.mock('@renderer-shared/shards', () => ({
  useInstance: () => ({ loadOverview: vi.fn(), createLogger: () => ({ warn: vi.fn() }) })
}))
vi.mock('@renderer-shared/components/champ-select-overlay', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    ChampSelectOverlay: defineComponent({
      props: ['settings'],
      setup(props) {
        runtime.settings.push({ ...props.settings })
        return () => h('div')
      }
    })
  }
})
beforeEach(() => {
  runtime.settings.length = 0
})

async function render(configure: (store: ReturnType<typeof useOngoingGameStore>) => void) {
  const pinia = createPinia()
  const app = createSSRApp({
    setup() {
      useLeagueClientStore().gameflow.phase = 'ChampSelect'
      const ongoingGame = useOngoingGameStore()
      ongoingGame.settings.enabled = true
      ongoingGame.queryStage = {
        phase: 'champ-select',
        gameInfo: { queueId: 450, queueType: 'RANKED_SOLO_5x5', gameMode: 'ARAM', gameId: 1 }
      }
      configure(useOngoingGameStore())
      return () => h(App, { group: 'teammates' })
    }
  }).use(pinia)
  await renderToString(app)
  return runtime.settings.at(-1)!
}

describe('renderer automatic geometry state binding', () => {
  it('passes automatic candidate and teammate spacing to the rendered overlay', async () => {
    const settings = await render((store) => {
      store.automaticChampSelectOverlay = {
        ...createDefaultChampSelectOverlaySettings(),
        candidateStep: 80,
        teammateStep: 110,
        candidateFirstCenterX: 500,
        teammateFirstCenterY: 100
      }
    })
    expect(settings).toMatchObject({
      candidateStep: 80,
      teammateStep: 110,
      candidateFirstCenterX: 500,
      teammateFirstCenterY: 100
    })
  })

  it('keeps partial manual geometry and manual opacity authoritative', async () => {
    const settings = await render((store) => {
      store.settings.champSelectOverlay.teammateFirstCenterY = 123
      store.settings.champSelectOverlay.backgroundOpacity = 30
      store.automaticChampSelectOverlay = {
        ...createDefaultChampSelectOverlaySettings(),
        candidateStep: 80,
        teammateStep: 110
      }
    })
    expect(settings.teammateFirstCenterY).toBe(123)
    expect(settings.candidateStep).toBe(58.5)
    expect(settings.backgroundOpacity).toBe(30)
  })

  it('uses manual spacing defaults after runtime geometry is cleared', async () => {
    const settings = await render((store) => {
      store.automaticChampSelectOverlay = null
    })
    expect(settings).toEqual(createDefaultChampSelectOverlaySettings())
  })
})
