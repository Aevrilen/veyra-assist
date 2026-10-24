import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

import type { InitParamsContext } from '../init-params'
import type { MatchHistoryFilterState } from '../widgets/match-history-filters/filter-state'
import { provideMatchHistory } from './match-history'
import type { MatchHistoryPage } from './match-history'

const f = vi.hoisted(() => ({
  details: vi.fn(),
  summary: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('@renderer-shared/composables/useComponentName', () => ({ useComponentName: () => 'test' }))
vi.mock('@renderer-shared/shards/league-client', () => ({
  LeagueClientRenderer: class LeagueClientRenderer {}
}))
vi.mock('@renderer-shared/shards/sgp', () => ({ SgpRenderer: class SgpRenderer {} }))
vi.mock('@renderer-shared/shards/logger', () => ({ LoggerRenderer: class LoggerRenderer {} }))
vi.mock('@renderer-shared/shards', () => ({
  useInstance: (type: { name: string }) =>
    type.name === 'LoggerRenderer'
      ? f.log
      : type.name === 'SgpRenderer'
        ? {
            api: {
              matchHistoryQuery: {
                getMatchHistorySummaryByPlayerPuuid: f.summary,
                getGameDetailsByGameId: f.details
              }
            }
          }
        : {
            api: {
              replays: { getConfiguration: async () => ({ data: { isReplaysEnabled: false } }) }
            },
            onLcuEventVue: vi.fn()
          }
}))
vi.mock('@main-window/shards/player-tabs/store', () => ({
  usePlayerTabsStore: () => ({ frontendSettings: { loadCount: 20 }, gameSummaryLruMap: new Map() })
}))
vi.mock('@shared/data-adapter/analysis/player', () => ({ analyzeGames: () => null }))
vi.mock('@shared/data-adapter/analysis/relationship', () => ({ analyzeRelationship: () => ({}) }))
vi.mock('../widgets/match-history-filters/filter-state', () => ({ toPredicate: () => () => true }))
vi.mock('i18next-vue', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('naive-ui', () => ({
  useNotification: () => ({ error: vi.fn() }),
  useMessage: () => ({ error: vi.fn(), success: vi.fn() })
}))

const scopes: ReturnType<typeof effectScope>[] = []
const deferred = () => {
  let resolve!: (value: { data: unknown }) => void
  let reject!: (error: Error) => void
  const promise = new Promise<{ data: unknown }>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const settle = async () => {
  for (let i = 0; i < 12; i++) await nextTick()
}

async function setup() {
  const scope = effectScope()
  scopes.push(scope)
  const puuid = ref('player-a')
  const server = ref('server-a')
  const context = scope.run(() =>
    provideMatchHistory(
      {
        puuid,
        sgpServerId: server,
        preferredSource: 'sgp',
        isCrossRegion: false,
        sgpApiStatus: { canUse: true, isReady: true },
        filterState: {} as MatchHistoryFilterState,
        syncCollectFilterState: vi.fn()
      },
      {
        consumeMatchHistoryInitParams: () => null,
        onMatchHistoryInitParamsUpdate: vi.fn()
      } as unknown as InitParamsContext
    )
  )!
  await settle()
  expect(context.page.value?.games[0].gameId).toBe(1)
  f.details.mockClear()
  context.page.value!.details = {}
  return { scope, context, puuid, server }
}

beforeEach(() => {
  vi.clearAllMocks()
  f.summary.mockResolvedValue({ data: { games: [{ json: { gameId: 1 } }] } })
  f.details.mockResolvedValue({ data: { marker: 'initial' } })
})
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
})

describe('production history detail request ownership', () => {
  it.each(['resolve', 'reject'] as const)(
    'a late %s cannot write details, errors or finally into a replacement page',
    async (outcome) => {
      const { context } = await setup()
      const request = deferred()
      f.details.mockReturnValueOnce(request.promise)
      const pending = context.loadDetails(1)
      const replacement = {
        ...context.page.value!,
        details: {},
        detailsLoading: { 1: true },
        detailsErrors: { 1: 'load-failed' }
      } as MatchHistoryPage
      context.page.value = replacement
      if (outcome === 'resolve') request.resolve({ data: { marker: 'obsolete' } })
      else request.reject(new Error('obsolete failure'))
      await pending
      expect(context.page.value!.details).toEqual({})
      expect(context.page.value!.detailsLoading[1]).toBe(true)
      expect(
        (context.page.value as MatchHistoryPage & { detailsErrors: Record<number, string> })
          .detailsErrors[1]
      ).toBe('load-failed')
    }
  )

  it('records a current failure for explicit retry and clears it only when that retry starts', async () => {
    const { context } = await setup()
    f.details.mockRejectedValueOnce(new Error('private backend message'))
    await context.loadDetails(1)
    const page = context.page.value as MatchHistoryPage & { detailsErrors: Record<number, string> }
    expect(page.detailsErrors[1]).toBe('load-failed')
    expect(page.detailsLoading[1]).toBe(false)
    const request = deferred()
    f.details.mockReturnValueOnce(request.promise)
    const retry = context.loadDetails(1)
    expect(page.detailsErrors[1]).toBeUndefined()
    expect(page.detailsLoading[1]).toBe(true)
    request.resolve({ data: { marker: 'retry' } })
    await retry
    expect(page.details[1].data).toEqual({ marker: 'retry' })
    expect(page.detailsLoading[1]).toBe(false)
  })

  it('does not accept detail data after the player changes while the old page is still present', async () => {
    const { context, puuid } = await setup()
    const request = deferred()
    f.details.mockReturnValueOnce(request.promise)
    const pending = context.loadDetails(1)
    f.summary.mockReturnValueOnce(new Promise(() => {}))
    puuid.value = 'player-b'
    request.resolve({ data: { marker: 'player-a' } })
    await pending
    expect(context.page.value?.details[1]).toBeUndefined()
  })

  it('ignores an in-flight detail result when its scope is disposed', async () => {
    const { context, scope } = await setup()
    const request = deferred()
    f.details.mockReturnValueOnce(request.promise)
    const pending = context.loadDetails(1)
    scope.stop()
    request.resolve({ data: { marker: 'disposed' } })
    await pending
    expect(context.page.value?.details[1]).toBeUndefined()
  })

  it.each(['resolve', 'reject'] as const)(
    'a background detail %s cannot change a replacement page',
    async (outcome) => {
      const request = deferred()
      f.details.mockReturnValueOnce(request.promise)
      const { context } = await setup()
      context.page.value = {
        ...context.page.value!,
        details: {},
        detailsLoading: { 1: true },
        detailsErrors: {}
      }
      if (outcome === 'resolve') request.resolve({ data: { marker: 'old background' } })
      else request.reject(new Error('old background failure'))
      await settle()
      expect(context.page.value!.details).toEqual({})
      expect(context.page.value!.detailsLoading[1]).toBe(true)
      expect(context.page.value!.detailsErrors).toEqual({})
    }
  )

  it.each(['page', 'collection'] as const)(
    'an obsolete %s result and finally cannot replace the next player or clear its loading state',
    async (mode) => {
      const { context, puuid } = await setup()
      const oldRequest = deferred(),
        nextRequest = deferred()
      f.summary.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(nextRequest.promise)
      const old =
        mode === 'page'
          ? context.loadMatchHistory({ startIndex: 20 })
          : context.collectMatchHistory({
              countPerIteration: 20,
              maxIteration: 3,
              expectedCount: 10,
              filterState: {} as MatchHistoryFilterState
            })
      puuid.value = 'player-b'
      await settle()
      expect(context.isLoading.value).toBe(true)
      oldRequest.resolve({ data: { games: [{ json: { gameId: 1 } }] } })
      await old
      expect(context.page.value).toBeNull()
      expect(context.isLoading.value).toBe(true)
      nextRequest.resolve({ data: { games: [{ json: { gameId: 2 } }] } })
      await settle()
      expect(context.page.value?.games[0].gameId).toBe(2)
      expect(context.isLoading.value).toBe(false)
    }
  )
})
