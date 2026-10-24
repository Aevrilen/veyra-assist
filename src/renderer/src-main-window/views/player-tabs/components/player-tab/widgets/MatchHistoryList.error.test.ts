import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, createSSRApp, defineComponent, nextTick, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'

import {
  type MatchHistoryContext,
  MatchHistoryContextKey,
  provideMatchHistory
} from '../data/match-history'
import type { InitParamsContext } from '../init-params'
import MatchHistoryList from './MatchHistoryList.vue'
import type { MatchHistoryFilterState } from './match-history-filters/filter-state'

const f = vi.hoisted(() => ({
  summary: vi.fn(),
  details: vi.fn(),
  notification: vi.fn(),
  notificationVisible: false,
  retry: undefined as undefined | (() => Promise<void>),
  player: {} as Record<string, unknown>,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('@renderer-shared/composables/useComponentName', () => ({
  useComponentName: () => 'PlayerTab'
}))
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
vi.mock('@renderer-shared/shards/league-client/store', () => ({
  useLeagueClientStore: () => ({ gameflow: { phase: 'None' } })
}))
vi.mock('@renderer-shared/shards/ongoing-game/store', () => ({ useOngoingGameStore: () => ({}) }))
vi.mock('@renderer-shared/providers/akari-resource', () => ({
  useAkariResourceProvider: () => ({ runtime: { locale: 'en-US' } })
}))
vi.mock('@shared/data-adapter/analysis/player', () => ({ analyzeGames: () => null }))
vi.mock('@shared/data-adapter/analysis/relationship', () => ({ analyzeRelationship: () => ({}) }))
vi.mock('./match-history-filters/filter-state', () => ({ toPredicate: () => () => true }))
vi.mock('../data/match-history-filters', () => ({
  useMatchHistoryFilters: () => ({ rootHasCombinator: false, clearPredicate: vi.fn() })
}))
vi.mock('../context', () => ({ usePlayerTab: () => f.player }))
vi.mock('./match-inspector', async () => {
  const { ref } = await import('vue')
  return { useMatchInspector: () => ({ selection: ref(null), isOverlay: ref(false) }) }
})
vi.mock('./match-ledger/ledger-entries', () => ({
  LEDGER_GRID_COLUMNS_CLASS: '',
  toLedgerEntry: (summary: { gameId: number }) => ({ key: String(summary.gameId), summary }),
  groupLedgerEntriesByDay: (entries: unknown[]) =>
    entries.length ? [{ dayKey: 'fixture', gameCreation: 0, wins: 0, losses: 0, entries }] : []
}))
vi.mock('./match-ledger/MatchLedgerRow.vue', async () => {
  const { h } = await import('vue')
  return {
    default: (props: { entry: { summary: { gameId: number } } }) =>
      h('div', `match-${props.entry.summary.gameId}`)
  }
})
vi.mock('./match-history-pagination/CollectModeDescription.vue', () => ({ default: () => null }))
vi.mock('i18next-vue', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          'playerTabs.profile.failedToLoadMatchHistoryTitle': '加载战绩失败',
          'playerTabs.profile.retryMatchHistory': '重试加载',
          'playerTabs.profile.matchHistoryNotLoaded': '战绩尚未加载',
          'playerTabs.profile.noMatchHistory': '暂无战绩'
        }) as Record<string, string>
      )[key] ?? key
  })
}))
vi.mock('naive-ui', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    useNotification: () => ({ error: f.notification }),
    useMessage: () => ({ error: vi.fn(), success: vi.fn() }),
    NSpin: () => null,
    NButton: defineComponent({
      setup(_, { attrs, slots }) {
        f.retry = attrs.onClick as (() => Promise<void>) | undefined
        return () => h('button', slots.default?.())
      }
    })
  }
})

const unmounts: Array<() => void> = []
const settle = async () => {
  for (let i = 0; i < 16; i++) await nextTick()
}
const deferred = () => {
  let resolve!: (value: { data: unknown }) => void
  let reject!: (value: Error) => void
  const promise = new Promise<{ data: unknown }>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const summary = (id: number) => ({ data: { games: [{ json: { gameId: id } }] } })

function mountHistory(sgpApiStatus = { canUse: true, isReady: true }, isCrossRegion = false) {
  type Host = { children: Host[]; parent?: Host; text?: string }
  const renderer = createRenderer<Host, Host>({
    insert(node, parent) {
      node.parent = parent
      parent.children.push(node)
    },
    remove(node) {
      if (node.parent) node.parent.children = node.parent.children.filter((n) => n !== node)
    },
    createElement: () => ({ children: [] }),
    createText: (text) => ({ children: [], text }),
    createComment: () => ({ children: [] }),
    setText(node, text) {
      node.text = text
    },
    setElementText(node, text) {
      node.text = text
    },
    parentNode: (node) => node.parent ?? null,
    nextSibling: () => null,
    patchProp: () => {}
  })
  const puuid = ref('player-a')
  const server = ref('server-a')
  f.player = { puuid, isCrossRegion: ref(isCrossRegion), events: { on: vi.fn(), off: vi.fn() } }
  let context!: MatchHistoryContext
  const app = renderer.createApp(
    defineComponent({
      setup() {
        context = provideMatchHistory(
          {
            puuid,
            sgpServerId: server,
            preferredSource: 'sgp',
            isCrossRegion,
            sgpApiStatus,
            filterState: {} as MatchHistoryFilterState,
            syncCollectFilterState: vi.fn()
          },
          {
            consumeMatchHistoryInitParams: () => null,
            onMatchHistoryInitParamsUpdate: vi.fn()
          } as unknown as InitParamsContext
        )
        return () => null
      }
    })
  )
  app.mount({ children: [] })
  unmounts.push(() => app.unmount())
  return { context, puuid, server }
}

async function renderList(context: MatchHistoryContext) {
  f.retry = undefined
  const app = createSSRApp(MatchHistoryList)
  app.provide(MatchHistoryContextKey, context)
  return renderToString(app)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  f.notificationVisible = false
  f.notification.mockImplementation(() => {
    f.notificationVisible = true
    setTimeout(() => {
      f.notificationVisible = false
    }, 4000)
  })
  f.details.mockResolvedValue({ data: {} })
  f.summary.mockResolvedValue(summary(1))
})
afterEach(() => {
  for (const unmount of unmounts.splice(0)) unmount()
  vi.useRealTimers()
})

describe('production match history failure -> list state -> retry', () => {
  it.each([
    ['token waiting', { canUse: true, isReady: false }],
    ['cross-region unavailable', { canUse: false, isReady: false }]
  ] as const)('does not call an unrequested %s history empty', async (_, sgpApiStatus) => {
    const { context } = mountHistory(sgpApiStatus, true)
    await settle()
    expect(f.summary).not.toHaveBeenCalled()
    expect(f.notification).not.toHaveBeenCalled()
    const html = await renderList(context)
    expect(html).not.toContain('暂无战绩')
    expect(html).toContain('战绩尚未加载')
  })

  it.each([500, 503])(
    'keeps first-load HTTP %s visible after its notification expires and retries from the list',
    async (status) => {
      f.summary.mockRejectedValueOnce(
        Object.assign(new Error('PRIVATE_UPSTREAM_BODY'), { response: { status } })
      )
      const { context } = mountHistory()
      await settle()
      await vi.advanceTimersByTimeAsync(4500)
      expect(f.notificationVisible).toBe(false)
      const failed = await renderList(context)
      expect(failed).toContain('加载战绩失败')
      expect(failed).toContain('重试加载')
      expect(failed).not.toContain('暂无战绩')
      expect(failed).not.toContain('PRIVATE_UPSTREAM_BODY')
      expect(f.retry).toBeTypeOf('function')
      await f.retry!()
      await settle()
      const recovered = await renderList(context)
      expect(recovered).toContain('match-1')
      expect(recovered).not.toContain('加载战绩失败')
      expect(f.summary).toHaveBeenCalledTimes(2)
    }
  )

  it('renders empty only after a successful empty response', async () => {
    f.summary.mockResolvedValueOnce({ data: { games: [] } })
    const { context } = mountHistory()
    await settle()
    const html = await renderList(context)
    expect(html).toContain('暂无战绩')
    expect(html).not.toContain('加载战绩失败')
  })

  it('retains the old page after a failed next page and retries the failed pagination', async () => {
    const { context } = mountHistory()
    await settle()
    f.summary.mockRejectedValueOnce(new Error('page failed'))
    await context.loadMatchHistory({ startIndex: 20, count: 20 })
    const failed = await renderList(context)
    expect(failed).toContain('match-1')
    expect(failed).toContain('加载战绩失败')
    f.summary.mockResolvedValueOnce(summary(2))
    await f.retry!()
    await settle()
    expect(f.summary.mock.calls.at(-1)?.[1]).toMatchObject({ startIndex: 20, count: 20 })
    const recovered = await renderList(context)
    expect(recovered).toContain('match-2')
    expect(recovered).not.toContain('加载战绩失败')
  })

  it('keeps a failed collection distinct from a successful empty collection and retries its operation', async () => {
    const { context } = mountHistory()
    await settle()
    f.summary.mockRejectedValueOnce(new Error('collection failed'))
    await context.collectMatchHistory({
      countPerIteration: 30,
      maxIteration: 2,
      expectedCount: 40,
      filterState: {} as MatchHistoryFilterState,
      queryParams: { tag: 'fixture-queue' }
    })
    const failed = await renderList(context)
    expect(failed).toContain('加载战绩失败')
    expect(failed).not.toContain('暂无战绩')
    f.summary.mockResolvedValueOnce({ data: { games: [] } })
    await f.retry!()
    await settle()
    expect(f.summary.mock.calls.at(-1)?.[1]).toMatchObject({
      startIndex: 0,
      count: 30,
      tag: 'fixture-queue'
    })
    const recovered = await renderList(context)
    expect(recovered).toContain('暂无战绩')
    expect(recovered).not.toContain('加载战绩失败')
  })

  it('clears the old identity error and retry while the next identity is loading', async () => {
    f.summary.mockRejectedValueOnce(new Error('player-a failed'))
    const { context, puuid } = mountHistory()
    await settle()
    expect(await renderList(context)).toContain('加载战绩失败')
    const current = deferred()
    f.summary.mockReturnValueOnce(current.promise)
    puuid.value = 'player-b'
    await settle()
    const pending = await renderList(context)
    expect(pending).not.toContain('加载战绩失败')
    expect(pending).not.toContain('暂无战绩')
    expect(f.retry).toBeUndefined()
    current.resolve(summary(2))
    await settle()
    expect(await renderList(context)).toContain('match-2')
  })

  it('does not publish an obsolete failure or retry target after the identity changes', async () => {
    const old = deferred(),
      current = deferred()
    f.summary.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const { context, puuid } = mountHistory()
    puuid.value = 'player-b'
    await settle()
    old.reject(new Error('obsolete player-a failure'))
    await settle()
    expect(f.log.error).not.toHaveBeenCalled()
    current.resolve(summary(2))
    await settle()
    const html = await renderList(context)
    expect(html).toContain('match-2')
    expect(html).not.toContain('加载战绩失败')
    expect(f.retry).toBeUndefined()
  })
})
