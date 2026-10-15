import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick } from 'vue'

import ChampSelectPositionPanel from './ChampSelectPositionPanel.vue'

const mocks = vi.hoisted(() => ({
  api: {
    getChampSelectPositionStatus: vi.fn(),
    getChampSelectPositionPreview: vi.fn(),
    beginChampSelectPosition: vi.fn(),
    beginAutomaticChampSelectPosition: vi.fn(),
    cancelChampSelectPosition: vi.fn(),
    saveChampSelectPosition: vi.fn(),
    exportChampSelectPositionSample: vi.fn()
  },
  ongoing: {
    settings: {
      champSelectOverlay: {
        backgroundOpacity: 65,
        candidateFirstCenterX: null,
        teammateFirstCenterY: null,
        candidateStep: 58.5,
        teammateStep: 80
      }
    }
  }
}))
vi.mock('@renderer-shared/shards', () => ({ useInstance: () => mocks.api }))
vi.mock('@renderer-shared/shards/akari-navigation', () => ({ useAkariNavigation: () => ({}) }))
vi.mock('@renderer-shared/shards/ongoing-game/store', () => ({
  useOngoingGameStore: () => mocks.ongoing
}))
vi.mock('@main-window/shards/main-window-ui', () => ({ MainWindowUiRenderer: class {} }))
vi.mock('@main-window/settings-navigation', () => ({ navigateToSetting: vi.fn() }))
vi.mock('i18next-vue', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('naive-ui', () => ({
  NAlert: (props: object, { slots }: any) => h('alert', props, slots.default?.()),
  NButton: (props: object, { slots }: any) => h('button', props, slots.default?.())
}))

// Real SFC handlers using the same small host approach as fallback-calibration interactions.
// This checks orchestration, not browser layout or native Electron dialogs.
type Host = {
  type: string
  text: string
  children: Host[]
  parent: Host | null
  props: Record<string, any>
  getBoundingClientRect: () => object
}
function node(type: string, text = ''): Host {
  return {
    type,
    text,
    children: [],
    parent: null,
    props: {},
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 1280, height: 720 })
  }
}
const renderer = createRenderer<Host, Host>({
  createElement: (tag) => node(tag),
  createText: (text) => node('text', text),
  createComment: (text) => node('comment', text),
  setText: (target, text) => {
    target.text = text
  },
  setElementText: (target, text) => {
    target.text = text
    target.children = []
  },
  patchProp: (target, key, _old, value) => {
    target.props[key] = value
  },
  insert: (child, parent, anchor) => {
    if (child.parent) child.parent.children = child.parent.children.filter((n) => n !== child)
    child.parent = parent
    const i = anchor ? parent.children.indexOf(anchor) : -1
    if (i < 0) parent.children.push(child)
    else parent.children.splice(i, 0, child)
  },
  remove: (child) => {
    if (child.parent) child.parent.children = child.parent.children.filter((n) => n !== child)
  },
  parentNode: (target) => target.parent,
  nextSibling: (target) =>
    target.parent?.children[target.parent.children.indexOf(target) + 1] ?? null
})
function find(root: Host, type: string): Host[] {
  return [...(root.type === type ? [root] : []), ...root.children.flatMap((c) => find(c, type))]
}
function text(root: Host): string {
  return root.text + root.children.map(text).join('')
}
function button(root: Host, label: string) {
  return find(root, 'button').find((n) => text(n) === label)!
}
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve()
  await nextTick()
}
function ready(reason = 'suggested') {
  return {
    state: 'ready',
    reason: 'ready',
    geometryMismatch: false,
    preview: {
      requestId: 'synthetic-request',
      width: 1280,
      height: 720,
      client: { x: 400, y: 200, width: 1280, height: 720 },
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      counts: { candidates: 3, teammates: 5 },
      automatic: {
        reason,
        selection:
          reason === 'suggested'
            ? {
                candidateFirst: { x: 376.5 / 1280, y: 35 / 720 },
                candidateNext: { x: 435 / 1280, y: 35 / 720 },
                teammateFirst: { x: 86 / 1280, y: 135 / 720 },
                teammateNext: { x: 86 / 1280, y: 215 / 720 }
              }
            : null
      }
    }
  }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.api.getChampSelectPositionPreview.mockResolvedValue('MEMORY_IMAGE')
})
afterEach(() => vi.useRealTimers())
describe('candidate position panel interactions', () => {
  it('does not display a pending old image after cancelling its preview', async () => {
    mocks.api.getChampSelectPositionStatus.mockResolvedValue(ready())
    let resolveImage!: (image: string) => void
    mocks.api.getChampSelectPositionPreview.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveImage = resolve
        })
    )
    const root = node('root')
    renderer.render(h(ChampSelectPositionPanel), root)
    await settle()
    mocks.api.getChampSelectPositionStatus.mockResolvedValue({
      state: 'idle',
      reason: 'idle',
      preview: null
    })
    button(root, 'cancel').props.onClick()
    await settle()
    resolveImage('LATE_IMAGE')
    await settle()
    expect(find(root, 'img')).toHaveLength(0)
    expect(mocks.api.saveChampSelectPosition).not.toHaveBeenCalled()
    renderer.render(null, root)
  })
  it.each(['retake', 'cancel'] as const)(
    'does not restore an old automatic preview when a status poll completes after %s',
    async (action) => {
      mocks.api.getChampSelectPositionStatus.mockResolvedValue(ready())
      const root = node('root')
      renderer.render(h(ChampSelectPositionPanel), root)
      await settle()
      let resolveOld!: (value: ReturnType<typeof ready>) => void
      mocks.api.getChampSelectPositionStatus
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveOld = resolve
            })
        )
        .mockResolvedValue({
          state: action === 'cancel' ? 'idle' : 'waiting',
          reason: 'waiting-selection',
          preview: null
        })
      await vi.advanceTimersByTimeAsync(1000)
      button(root, action).props.onClick()
      await settle()
      resolveOld({ ...ready(), preview: { ...ready().preview, requestId: 'late-old-request' } })
      await settle()
      expect(find(root, 'img')).toHaveLength(0)
      expect(mocks.api.getChampSelectPositionPreview).not.toHaveBeenCalledWith('late-old-request')
      expect(mocks.api.saveChampSelectPosition).not.toHaveBeenCalled()
      renderer.render(null, root)
    }
  )
  it('requires explicit preparation, permits corrections and does not overwrite them during status polling', async () => {
    mocks.api.getChampSelectPositionStatus.mockResolvedValue(ready())
    const root = node('root')
    renderer.render(h(ChampSelectPositionPanel), root)
    await settle()
    expect(mocks.api.beginAutomaticChampSelectPosition).not.toHaveBeenCalled()
    expect(mocks.api.saveChampSelectPosition).not.toHaveBeenCalled()
    const image = find(root, 'img')[0]
    image.props.onClick({ clientX: 390, clientY: 55 })
    await settle()
    await vi.advanceTimersByTimeAsync(1000)
    await settle()
    button(root, 'save').props.onClick()
    await settle()
    expect(mocks.api.saveChampSelectPosition).toHaveBeenCalledWith(
      'synthetic-request',
      expect.objectContaining({ candidateFirst: { x: 380 / 1280, y: 35 / 720 } })
    )
    renderer.render(null, root)
  })
  it('keeps uncertain previews manual and arms the trial only through its button', async () => {
    mocks.api.getChampSelectPositionStatus.mockResolvedValue(ready('uncertain'))
    const root = node('root')
    renderer.render(h(ChampSelectPositionPanel), root)
    await settle()
    expect(button(root, 'save').props.disabled).toBe(true)
    expect(text(root)).toContain('automatic.uncertain')
    button(root, 'autoPrepare').props.onClick()
    await settle()
    expect(mocks.api.beginAutomaticChampSelectPosition).toHaveBeenCalledTimes(1)
    expect(mocks.api.beginChampSelectPosition).not.toHaveBeenCalled()
    renderer.render(null, root)
  })
  it('exports the retained request after the countdown without saving configuration', async () => {
    mocks.api.getChampSelectPositionStatus.mockResolvedValue(ready())
    const root = node('root')
    renderer.render(h(ChampSelectPositionPanel), root)
    await settle()
    button(root, 'exportSample').props.onClick()
    await settle()
    expect(mocks.api.exportChampSelectPositionSample).toHaveBeenCalledExactlyOnceWith(
      'synthetic-request'
    )
    expect(mocks.api.saveChampSelectPosition).not.toHaveBeenCalled()
    renderer.render(null, root)
  })
})
