import type { LcuOrSgpGameSummary } from '@shared/data-adapter/wrapper'
import {
  type InjectionKey,
  type MaybeRefOrGetter,
  type Ref,
  inject,
  nextTick,
  provide,
  ref,
  shallowRef,
  toRef
} from 'vue'

/** Detail tabs that switch the inspector into full-width reading */
export const MATCH_INSPECTOR_READING_TABS: ReadonlySet<string> = new Set(['details', 'timeline'])

/** Match identity within a page is source + gameId, never gameId alone */
export function toMatchGameKey(game: Pick<LcuOrSgpGameSummary, 'source' | 'gameId'>) {
  return `${game.source}:${game.gameId}`
}

export type MatchInspectorSelection = {
  key: string
  gameId: number
  source: 'lcu' | 'sgp'
}

export type MatchInspectorContext = {
  selection: Readonly<Ref<MatchInspectorSelection | null>>
  detailTab: Ref<string>
  isReading: Ref<boolean>
  isOverlay: Readonly<Ref<boolean>>
  select: (game: LcuOrSgpGameSummary, options?: { moveFocus?: boolean }) => void
  close: (options?: { restoreFocus?: boolean }) => void
  setDetailTab: (tab: string) => void
  toggleReading: () => void
  exitReading: () => void
  focusLedgerRow: (key: string) => void
}

const MatchInspectorContextKey: InjectionKey<MatchInspectorContext> = Symbol(
  'PlayerTabMatchInspectorContext'
)

/**
 * Visible inspector selection for one player tab.
 *
 * Selection is UI state only. Detail data stays owned by MatchHistoryContext; a late detail
 * response can fill the page cache but never changes which match is selected or reopens it.
 */
export function provideMatchInspector(props: {
  rootEl: Readonly<Ref<HTMLElement | null>>
  isOverlay: MaybeRefOrGetter<boolean>
}) {
  const isOverlay = toRef(props.isOverlay)
  const selection = shallowRef<MatchInspectorSelection | null>(null)
  const detailTab = ref('summary')
  const isReading = ref(false)

  const focusWithin = (selector: string) => {
    void nextTick(() => {
      props.rootEl.value?.querySelector<HTMLElement>(selector)?.focus()
    })
  }

  const focusLedgerRow = (key: string) => {
    focusWithin(`[data-ledger-key="${key}"]`)
  }

  const select: MatchInspectorContext['select'] = (game, options = {}) => {
    selection.value = {
      key: toMatchGameKey(game),
      gameId: game.gameId,
      source: game.source
    }

    if (options.moveFocus && isOverlay.value) {
      focusWithin('[data-inspector-focus="back"]')
    }
  }

  const close: MatchInspectorContext['close'] = (options = {}) => {
    const key = selection.value?.key
    selection.value = null
    isReading.value = false

    if (key && options.restoreFocus) {
      focusLedgerRow(key)
    }
  }

  const setDetailTab = (tab: string) => {
    detailTab.value = tab
    isReading.value = MATCH_INSPECTOR_READING_TABS.has(tab)
  }

  const exitReading = () => {
    isReading.value = false
    detailTab.value = 'summary'
    focusWithin('[data-inspector-tab="summary"]')
  }

  const toggleReading = () => {
    if (isReading.value) {
      exitReading()
    } else {
      isReading.value = true
    }
  }

  const context: MatchInspectorContext = {
    selection,
    detailTab,
    isReading,
    isOverlay,
    select,
    close,
    setDetailTab,
    toggleReading,
    exitReading,
    focusLedgerRow
  }

  provide(MatchInspectorContextKey, context)

  return context
}

export function useMatchInspector() {
  const context = inject(MatchInspectorContextKey)

  if (!context) {
    throw new Error('useMatchInspector must be used within a player tab component')
  }

  return context
}
