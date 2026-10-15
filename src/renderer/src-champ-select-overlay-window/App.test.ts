import { useChampionDataStore } from '@renderer-shared/shards/champion-data/store'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { useOngoingGameStore } from '@renderer-shared/shards/ongoing-game/store'
import type { ChampionDataQuery } from '@shared/data-adapter/champion-data'
import type { ChampSelectSession } from '@shared/types/league-client/champ-select'
import type { GameflowPhase } from '@shared/types/league-client/gameflow'
import { createInstance } from 'i18next'
import I18nextVue from 'i18next-vue'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'

import App from './App.vue'

const runtime = vi.hoisted(() => ({
  loadOverview: vi.fn(async (_query: ChampionDataQuery, _options?: { signal?: AbortSignal }) => ({
    status: 'unavailable'
  }))
}))

vi.mock('@renderer-shared/shards/setup-in-app-scope/setup-in-app-scope-component', () => ({
  SetupInAppScope: () => null
}))
vi.mock('@renderer-shared/shards/champion-data', () => ({ ChampionDataRenderer: class {} }))
vi.mock('@renderer-shared/shards/logger', () => ({ LoggerRenderer: class {} }))
vi.mock('@renderer-shared/shards', () => ({
  useInstance: () => ({
    loadOverview: runtime.loadOverview,
    createLogger: () => ({ warn: vi.fn() })
  })
}))

async function render(
  phase: GameflowPhase | null,
  hasQueryStage = true,
  options: { qq101Enabled?: boolean; queueId?: number; gameMode?: string } = {}
) {
  const i18next = createInstance()
  await i18next.init({ lng: 'en', resources: {} })
  const pinia = createPinia()
  const app = createSSRApp({
    setup() {
      const leagueClient = useLeagueClientStore()
      const ongoingGame = useOngoingGameStore()
      const championData = useChampionDataStore()
      championData.settings.preferredSource = 'opgg'
      championData.availability = {
        preferredSource: 'opgg',
        sources: { opgg: { enabled: true }, qq101: { enabled: options.qq101Enabled ?? true } }
      }
      leagueClient.gameflow.phase = phase
      leagueClient.champSelect.session = {
        id: 'current-session',
        benchEnabled: false,
        benchChampions: [],
        myTeam: [
          {
            cellId: 3,
            puuid: 'current-player',
            gameName: 'Current player',
            championId: 103,
            championPickIntent: 0
          }
        ]
      } as unknown as ChampSelectSession
      leagueClient.gameData.champions = {
        103: { id: 103, name: 'Ahri', alias: 'Ahri', squarePortraitPath: '', roles: [] }
      }
      ongoingGame.queryStage = hasQueryStage
        ? {
            phase: 'champ-select',
            gameInfo: {
              queueId: options.queueId ?? 420,
              queueType: 'RANKED_SOLO_5x5',
              gameMode: options.gameMode ?? 'CLASSIC',
              gameId: 1
            }
          }
        : { phase: 'unavailable', gameInfo: null }
      return () => h(App, { group: 'teammates' })
    }
  })
    .use(pinia)
    .use(I18nextVue, { i18next })
  const html = await renderToString(app)
  expect(useChampionDataStore(pinia).settings.preferredSource).toBe('opgg')
  return html
}

beforeEach(() => runtime.loadOverview.mockClear())

describe('champion select QQ101 source', () => {
  test('requests QQ101 Mayhem rates independently of the global OP.GG preference', async () => {
    await render('ChampSelect', true, { queueId: 2400, gameMode: 'KIWI' })
    expect(runtime.loadOverview).toHaveBeenCalledTimes(1)
    expect(runtime.loadOverview).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'qq101', mode: 'aram_mayhem' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  test.each([
    { qq101Enabled: false, queueId: 2400, gameMode: 'KIWI' },
    { qq101Enabled: true, queueId: 450, gameMode: 'ARAM' }
  ])('keeps missing rates without provider or mode fallback for %j', async (options) => {
    const html = await render('ChampSelect', true, options)
    expect(runtime.loadOverview).not.toHaveBeenCalled()
    expect(html).toContain('Ahri')
    expect(html).toContain('—')
  })
})

describe('champion select window phase gating', () => {
  test('shows data only while both the client and ongoing query are in champion select', async () => {
    expect(await render('ChampSelect')).toContain('Ahri')
    expect(await render('ChampSelect', false)).not.toContain('role="region"')
  })
  test.each(['GameStart', 'InProgress', 'Lobby', null] as const)(
    'hides cached selection results when the client phase is %s',
    async (phase) => {
      const html = await render(phase)
      expect(html).not.toContain('role="region"')
      expect(html).not.toContain('Ahri')
    }
  )
})
