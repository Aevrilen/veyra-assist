import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick, reactive, ssrContextKey } from 'vue'

import { useMainWindowUiStore } from '@main-window/shards/main-window-ui/store'

import ReleaseNotesButton from './ReleaseNotesButton.vue'
import { BUNDLED_RELEASE_NOTES } from './release-notes'

const mocks = vi.hoisted(() => ({ markRead: vi.fn(), error: vi.fn() }))
const appCommon = reactive({ version: '1.5.2-beta.3' })
vi.mock('@renderer-shared/shards', () => ({
  useInstance: () => ({ markReleaseNotesRead: mocks.markRead })
}))
vi.mock('@renderer-shared/shards/app-common/store', () => ({ useAppCommonStore: () => appCommon }))
vi.mock('@main-window/shards/main-window-ui', () => ({ MainWindowUiRenderer: class {} }))
vi.mock('i18next-vue', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('naive-ui', () => ({
  NButton: (props: object, { slots }: any) => h('button', props, slots.default?.()),
  NModal: (props: any, { slots }: any) => (props.show ? h('dialog', slots.default?.()) : null),
  NTag: (props: object, { slots }: any) => h('tag', props, slots.default?.()),
  NText: (props: object, { slots }: any) => h('span', props, slots.default?.()),
  NScrollbar: (props: object, { slots }: any) => h('scroll', props, slots.default?.()),
  NList: (props: object, { slots }: any) => h('list', props, slots.default?.()),
  NListItem: (props: object, { slots }: any) => h('item', props, slots.default?.()),
  useMessage: () => ({ error: mocks.error })
}))

type Host = {
  type: string
  text: string
  children: Host[]
  parent: Host | null
  props: Record<string, any>
}
const node = (type: string, text = ''): Host => ({
  type,
  text,
  children: [],
  parent: null,
  props: {}
})
const renderer = createRenderer<Host, Host>({
  createElement: node,
  createText: (text) => node('text', text),
  createComment: () => node('comment'),
  setText: (target, text) => {
    target.text = text
  },
  setElementText: (target, text) => {
    target.text = text
    target.children = []
  },
  patchProp: (target, key, _previous, value) => {
    target.props[key] = value
  },
  insert: (child, parent, anchor) => {
    if (child.parent) child.parent.children = child.parent.children.filter((x) => x !== child)
    child.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    if (index < 0) parent.children.push(child)
    else parent.children.splice(index, 0, child)
  },
  remove: (child) => {
    if (child.parent) child.parent.children = child.parent.children.filter((x) => x !== child)
  },
  parentNode: (child) => child.parent,
  nextSibling: (child) => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null
})
const find = (root: Host, type: string): Host[] => [
  ...(root.type === type ? [root] : []),
  ...root.children.flatMap((child) => find(child, type))
]
const text = (root: Host): string => root.text + root.children.map(text).join('')
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
  await nextTick()
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  appCommon.version = '1.5.2-beta.3'
  mocks.markRead.mockImplementation(async (version: string) => {
    useMainWindowUiStore().frontendSettings.lastReadReleaseNotesVersion = version
  })
})

describe('bundled release notes entry', () => {
  it('opens only on click, clears the unread badge, and leaves the entry available', async () => {
    const root = node('root')
    renderer
      .createApp(ReleaseNotesButton)
      .provide(ssrContextKey, { modules: new Set() })
      .mount(root)
    expect(find(root, 'dialog')).toHaveLength(0)
    expect(find(root, 'tag').map(text)).toEqual(['new'])
    expect(mocks.markRead).not.toHaveBeenCalled()
    find(root, 'button')[0].props.onClick()
    await settle()
    expect(find(root, 'dialog')).toHaveLength(1)
    expect(text(root)).toContain('v1.5.2-beta.3')
    expect(mocks.markRead).toHaveBeenCalledWith('1.5.2-beta.3')
    expect(find(root, 'tag').map(text)).not.toContain('new')
    expect(find(root, 'button')).toHaveLength(1)
    renderer.render(null, root)

    renderer
      .createApp(ReleaseNotesButton)
      .provide(ssrContextKey, { modules: new Set() })
      .mount(root)
    expect(find(root, 'dialog')).toHaveLength(0)
    expect(find(root, 'tag')).toHaveLength(0)
    appCommon.version = '1.5.2-beta.4'
    await settle()
    expect(find(root, 'tag').map(text)).toEqual(['new'])
    renderer.render(null, root)
  })

  it('still displays offline notes and retains the badge if persisting read state fails', async () => {
    mocks.markRead.mockRejectedValueOnce(new Error('disk-full'))
    const root = node('root')
    renderer
      .createApp(ReleaseNotesButton)
      .provide(ssrContextKey, { modules: new Set() })
      .mount(root)
    find(root, 'button')[0].props.onClick()
    await settle()
    expect(find(root, 'dialog')).toHaveLength(1)
    expect(find(root, 'tag').map(text)).toContain('new')
    expect(mocks.error).toHaveBeenCalledWith('saveFailed')
    renderer.render(null, root)
  })

  it.each(['en', 'zh-CN'])(
    'has offline text for every bundled item and category in %s',
    (locale) => {
      const load = createRequire(import.meta.url)('js-yaml').load
      const resource = load(
        readFileSync(
          new URL(`../../../../shared/i18n/${locale}/renderer/shell.yaml`, import.meta.url),
          'utf8'
        )
      ).releaseNotes
      for (const release of BUNDLED_RELEASE_NOTES) {
        for (const group of release.groups) {
          expect(resource.groups[group.kind]).toBeTruthy()
          for (const item of group.items) expect(resource.items[item]).toBeTruthy()
        }
      }
    }
  )
})
