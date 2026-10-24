import { AutoGameflowRenderer } from '@renderer-shared/shards/auto-gameflow'
import { useAutoGameflowStore } from '@renderer-shared/shards/auto-gameflow/store'
import { SettingUtilsRenderer } from '@renderer-shared/shards/setting-utils'
import { WindowManagerRenderer } from '@renderer-shared/shards/window-manager'
import { useOngoingGameWindowStore } from '@renderer-shared/shards/window-manager/store'
import { AkariOngoingGameWindow } from '@renderer-shared/shards/window-manager/windows'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick, ssrContextKey } from 'vue'

import StartupQuickSettings from './StartupQuickSettings.vue'

const mocks = vi.hoisted(() => ({ instances: new Map(), error: vi.fn() }))
vi.mock('@renderer-shared/shards', () => ({
  useInstance: (type: unknown) => mocks.instances.get(type)
}))
vi.mock('@renderer-shared/shards/ipc', () => ({ AkariIpcRenderer: class {} }))
vi.mock('@renderer-shared/shards/pinia-mobx-utils', () => ({ PiniaMobxUtilsRenderer: class {} }))
vi.mock('@renderer-shared/shards/window-manager', () => ({ WindowManagerRenderer: class {} }))
vi.mock('i18next-vue', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('naive-ui', () => ({
  NCard: (props: object, { slots }: any) => h('card', props, slots.default?.()),
  NText: (props: object, { slots }: any) => h('span', props, slots.default?.()),
  NSwitch: (props: object) => h('switch', props),
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
  mocks.instances.clear()
})

async function backend(saved = new Map<string, boolean>()) {
  const targets = new Map<string, Record<string, unknown>>()
  const call = vi.fn(
    async (
      _ipcNamespace: string,
      operation: string,
      namespace: string,
      key: string,
      value: boolean
    ) => {
      if (operation === 'set') {
        saved.set(`${namespace}/${key}`, value)
        const target = targets.get(namespace)
        if (target) target[key] = value
      }
    }
  )
  const ipc = { call }
  const settingUtils = new SettingUtilsRenderer(ipc as any)
  const sync = async (namespace: string, property: string, target: Record<string, unknown>) => {
    if (property !== 'settings') return
    targets.set(namespace, target)
    for (const [path, value] of saved) {
      if (path.startsWith(namespace + '/')) target[path.slice(namespace.length + 1)] = value
    }
  }
  const gameflow = new AutoGameflowRenderer(ipc as any, { sync } as any, settingUtils)
  const ongoing = new AkariOngoingGameWindow({ ipc, setting: settingUtils, pm: { sync } } as any)
  await gameflow.onInit()
  await ongoing.onInit()
  mocks.instances.set(AutoGameflowRenderer, gameflow)
  mocks.instances.set(WindowManagerRenderer, { ongoingGameWindow: ongoing })
  return { saved, call, gameflow, ongoing }
}
const values = (root: Host) => find(root, 'switch').map((item) => item.props.value)

describe('Home quick settings use the original saved settings', () => {
  it('keeps defaults, shares changes with the original page methods, and restores after renderer restart', async () => {
    const subject = await backend()
    const root = node('root')
    renderer
      .createApp(StartupQuickSettings)
      .provide(ssrContextKey, { modules: new Set() })
      .mount(root)
    expect(values(root)).toEqual([true, true, false])
    expect(subject.call).not.toHaveBeenCalled()
    await find(root, 'switch')[0].props['onUpdate:value'](false)
    await find(root, 'switch')[1].props['onUpdate:value'](false)
    await find(root, 'switch')[2].props['onUpdate:value'](true)
    await settle()
    expect(values(root)).toEqual([false, false, true])
    expect(useOngoingGameWindowStore().settings.enabled).toBe(false)
    expect(useAutoGameflowStore().settings.autoMatchmakingEnabled).toBe(true)
    expect([...subject.saved]).toEqual([
      ['window-manager-main/ongoing-game-window/enabled', false],
      ['auto-gameflow-main/autoAcceptEnabled', false],
      ['auto-gameflow-main/autoMatchmakingEnabled', true]
    ])
    // These are the same methods used by the original settings pages.
    await subject.ongoing.setEnabled(true)
    await subject.gameflow.setAutoAcceptEnabled(true)
    await subject.gameflow.setAutoMatchmakingEnabled(false)
    await settle()
    expect(values(root)).toEqual([true, true, false])
    await subject.gameflow.setAutoMatchmakingEnabled(true)
    renderer.render(null, root)
    setActivePinia(createPinia())
    await backend(subject.saved)
    renderer
      .createApp(StartupQuickSettings)
      .provide(ssrContextKey, { modules: new Set() })
      .mount(root)
    expect(values(root)).toEqual([true, true, true])
    renderer.render(null, root)
    expect(
      subject.call.mock.calls.every(
        (args) => args[0] === 'setting-factory-main' && args[1] === 'set'
      )
    ).toBe(true)
  })

  it('retains the authoritative switch value and reports a failed save', async () => {
    const subject = await backend()
    subject.call.mockRejectedValueOnce(new Error('save-failed'))
    const root = node('root')
    renderer
      .createApp(StartupQuickSettings)
      .provide(ssrContextKey, { modules: new Set() })
      .mount(root)
    await find(root, 'switch')[2].props['onUpdate:value'](true)
    await settle()
    expect(values(root)[2]).toBe(false)
    expect(subject.saved.size).toBe(0)
    expect(mocks.error).toHaveBeenCalledWith('saveFailed')
    expect(find(root, 'switch')[2].props.loading).toBe(false)
    renderer.render(null, root)
  })
})
