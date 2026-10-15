import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { useOngoingGameStore } from '@renderer-shared/shards/ongoing-game/store'
import { renderToString } from '@vue/server-renderer'
import { createInstance } from 'i18next'
import I18NextVue from 'i18next-vue'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { createSSRApp } from 'vue'

import ChampSelectPositionNotice from './ChampSelectPositionNotice.vue'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const loadYaml = createRequire(import.meta.url)('js-yaml').load as (text: string) => object
const resources = loadYaml(
  readFileSync(
    new URL('../../../../shared/i18n/zh-CN/renderer/settings.yaml', import.meta.url),
    'utf8'
  )
)

async function render(
  configure?: (
    client: ReturnType<typeof useLeagueClientStore>,
    ongoing: ReturnType<typeof useOngoingGameStore>
  ) => void
) {
  const pinia = createPinia()
  const client = useLeagueClientStore(pinia)
  const ongoing = useOngoingGameStore(pinia)
  client.connectionState = 'connected'
  client.gameflow.phase = 'ChampSelect'
  configure?.(client, ongoing)
  const i18next = createInstance()
  await i18next.init({
    lng: 'zh-CN',
    defaultNS: 'renderer',
    resources: { 'zh-CN': { renderer: resources } },
    interpolation: { escapeValue: false }
  })
  const app = createSSRApp(ChampSelectPositionNotice)
  app.use(pinia)
  app.use(I18NextVue, { i18next })
  return renderToString(app)
}

describe('champion selection position notice', () => {
  it.each(['disconnected', 'Lobby', 'ChampSelect', 'InProgress'])(
    'offers first-use preparation before or after selection: %s',
    async (phase) => {
      const html = await render((client) => {
        client.connectionState = phase === 'disconnected' ? 'disconnected' : 'connected'
        client.gameflow.phase = phase as any
      })
      expect(html).toContain('首次使用 · 准备定位')
      expect(html).not.toContain('设置候选位置')
    }
  )
  it.each(['disabled', 'configured'])('hides missing-position notice when %s', async (state) => {
    const html = await render((_client, ongoing) => {
      if (state === 'disabled') ongoing.settings.enabled = false
      else
        ongoing.settings.champSelectOverlay = {
          ...ongoing.settings.champSelectOverlay,
          candidateFirstCenterX: 200,
          teammateFirstCenterY: 70
        }
    })
    expect(html).not.toContain('首次使用 · 准备定位')
  })
})
