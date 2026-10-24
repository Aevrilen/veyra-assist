import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createRenderer, defineComponent, h, nextTick, ref } from 'vue'

import MatchInspector from './MatchInspector.vue'
import type { MatchInspectorContext } from './selection'
import { provideMatchInspector } from './selection'

const f = vi.hoisted(() => ({
  player: null as any,
  history: null as any,
  rendered: null as any,
  emitGameEvent: null as any,
  info: vi.fn()
}))
vi.mock('../../context', () => ({ usePlayerTab: () => f.player }))
vi.mock('../../data/match-history', () => ({ useMatchHistory: () => f.history }))
vi.mock('i18next-vue', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('naive-ui', async () => {
  const { h } = await import('vue')
  return {
    NButton: {
      setup:
        (_: unknown, { slots, attrs }: any) =>
        () =>
          h('button', attrs, slots.default?.())
    },
    NIcon: {
      setup:
        (_: unknown, { slots }: any) =>
        () =>
          h('span', slots.default?.())
    },
    useMessage: () => ({ info: f.info })
  }
})
vi.mock('./MatchInspectorGame.vue', async () => {
  const { h } = await import('vue')
  return {
    default: {
      props: ['summary', 'details', 'detailsFailed'],
      setup: (props: any, { emit }: any) => {
        f.emitGameEvent = emit
        return () => {
          f.rendered = {
            gameId: props.summary.gameId,
            details: props.details,
            detailsFailed: props.detailsFailed
          }
          return h('section')
        }
      }
    }
  }
})

type Node = { type: string; children: Node[]; parent: Node | null; [key: string]: any }
const node = (type: string): Node => ({ type, children: [], parent: null, scrollTo: () => {} })
const renderer = createRenderer<Node, Node>({
  createElement: node,
  createText: node,
  createComment: node,
  setText: (n, text) => {
    n.text = text
  },
  setElementText: (n, text) => {
    n.text = text
  },
  parentNode: (n) => n.parent,
  nextSibling: (n) => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
  patchProp: (n, key, _previous, value) => {
    n[key] = value
  },
  insert: (child, parent, anchor) => {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    if (index < 0) parent.children.push(child)
    else parent.children.splice(index, 0, child)
  },
  remove: (child) => {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = null
  }
})
const apps: ReturnType<typeof renderer.createApp>[] = []
const game = (gameId: number) => ({ source: 'sgp' as const, gameId, data: {} as any })
function mount() {
  let selection!: MatchInspectorContext
  const app = renderer.createApp(
    defineComponent({
      setup() {
        selection = provideMatchInspector({ rootEl: ref(null), isOverlay: false })
        return () => h(MatchInspector, { presentation: 'docked' })
      }
    })
  )
  apps.push(app)
  const root = node('root')
  app.mount(root)
  return { selection, root }
}
beforeEach(() => {
  f.rendered = null
  f.info.mockClear()
  f.player = {
    id: ref('tab-a'),
    puuid: ref('player-a'),
    sgpServerId: ref('server-a'),
    preferredSource: ref('sgp'),
    isCurrentTab: ref(true),
    navigateToSummonerByPuuid: vi.fn()
  }
  const page = ref({
    games: [game(1), game(2)],
    details: {} as Record<number, any>,
    detailsLoading: {},
    detailsErrors: {},
    replayMetadata: {},
    queryParams: { startIndex: 0, count: 20 },
    isLoadedByCollectMode: false
  })
  f.history = {
    page,
    filteredGames: computed(() => page.value.games),
    loadDetails: vi.fn(),
    downloadReplay: vi.fn(),
    launchRelay: vi.fn()
  }
})
afterEach(() => {
  for (const app of apps.splice(0)) app.unmount()
})

describe('production inspector selection lifecycle', () => {
  it('keeps B selected and rendered when A details finish late', async () => {
    const { selection } = mount()
    selection.select(game(1))
    await nextTick()
    selection.select(game(2))
    await nextTick()
    f.history.page.value.details[1] = { source: 'sgp', gameId: 1, data: { marker: 'A' } }
    await nextTick()
    expect(selection.selection.value?.gameId).toBe(2)
    expect(f.rendered).toEqual({ gameId: 2, details: null, detailsFailed: false })
    f.history.page.value.details[2] = { source: 'sgp', gameId: 2, data: { marker: 'B' } }
    await nextTick()
    expect(f.rendered.details.data.marker).toBe('B')
  })
  it('stays closed when cached details arrive after close', async () => {
    const { selection, root } = mount()
    selection.select(game(1))
    await nextTick()
    selection.close()
    await nextTick()
    f.history.page.value.details[1] = { source: 'sgp', gameId: 1, data: {} }
    await nextTick()
    expect(selection.selection.value).toBeNull()
    expect(root.children.some((n) => n.type === 'aside')).toBe(false)
  })
  it.each(['page', 'source', 'filter'] as const)(
    'closes an obsolete selection after a %s change',
    async (kind) => {
      const { selection } = mount()
      selection.select(game(1))
      await nextTick()
      if (kind === 'page') f.history.page.value.queryParams.startIndex = 20
      if (kind === 'source') f.player.preferredSource.value = 'lcu'
      if (kind === 'filter') f.history.page.value.games = [game(2)]
      await nextTick()
      expect(selection.selection.value).toBeNull()
    }
  )
  it('keeps the failed match mounted and routes an explicit details retry to its owner', async () => {
    const { selection, root } = mount()
    selection.select(game(1))
    await nextTick()
    f.history.page.value.detailsErrors[1] = 'load-failed'
    await nextTick()
    expect(selection.selection.value?.gameId).toBe(1)
    expect(root.children.some((n) => n.type === 'aside')).toBe(true)
    expect(f.rendered).toEqual({ gameId: 1, details: null, detailsFailed: true })
    expect(f.history.loadDetails).not.toHaveBeenCalled()
    f.emitGameEvent('loadDetails', 1)
    expect(f.history.loadDetails).toHaveBeenCalledWith(1)
  })
})
