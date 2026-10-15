import { renderToString } from '@vue/server-renderer'
import { createInstance } from 'i18next'
import I18NextVue from 'i18next-vue'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
import { createRenderer, createSSRApp } from 'vue'

import {
  type FirstRunEnvironmentObservation,
  projectFirstRunEnvironmentStatus
} from '../../../../main/shards/mayhem-assistant/first-run-environment-controller'
import FirstRunEnvironmentPanel from './FirstRunEnvironmentPanel.vue'
import { useFirstRunEnvironmentStatus } from './first-run-environment-controller'

const loadYaml = createRequire(import.meta.url)('js-yaml').load as (text: string) => object
const resources = loadYaml(
  readFileSync(
    new URL('../../../../shared/i18n/zh-CN/renderer/first-run-environment.yaml', import.meta.url),
    'utf8'
  )
)

function observation(): FirstRunEnvironmentObservation {
  return {
    platform: 'win32',
    arch: 'x64',
    elevated: false,
    nativeInitialized: true,
    databaseInitialized: true,
    ocr: { started: false, ready: false, failed: false },
    clientConnected: false,
    gameActive: false,
    gameObservation: null,
    legacyCalibrationPresent: false
  }
}

async function render(
  status: ReturnType<typeof projectFirstRunEnvironmentStatus> | null,
  hasLoadError = false
) {
  const i18next = createInstance()
  await i18next.init({
    lng: 'zh-CN',
    ns: ['renderer'],
    defaultNS: 'renderer',
    resources: { 'zh-CN': { renderer: resources } },
    interpolation: { escapeValue: false }
  })
  const app = createSSRApp(FirstRunEnvironmentPanel, { status, hasLoadError })
  app.use(I18NextVue, { i18next })
  return renderToString(app)
}

describe('first-run panel', () => {
  it('renders waiting states and does not convert old calibration into readiness', async () => {
    const html = await render(
      projectFirstRunEnvironmentStatus({ ...observation(), legacyCalibrationPresent: true })
    )
    expect(html).toContain('待检测')
    expect(html).toContain('待游戏运行')
    expect(html).toContain('当前定位状态仍需确认')
    expect(html).not.toContain('自动就绪')
  })

  it('directs the user to the connected guide without an unavailable sample button', async () => {
    const status = projectFirstRunEnvironmentStatus({
      ...observation(),
      calibration: {
        route: 'guided-sample-needed',
        phase: 'idle',
        verified: false,
        method: null,
        reasonCode: 'guided-sample-needed',
        supportedClientSizes: null
      }
    })
    const html = await render(status)
    const buttons = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(
      ([button]) => button
    )
    const sampleButton = buttons.find((button) => button.includes('确认画面位置'))
    expect(sampleButton).toBeUndefined()
    expect(html).toContain('请打开定位引导')
  })

  it('shows a generic failed-read message without a successful state', async () => {
    const html = await render(null, true)
    expect(html).toContain('暂时无法读取状态')
    expect(html).not.toContain('自动就绪')
  })
})

function mountReader(readStatus: Parameters<typeof useFirstRunEnvironmentStatus>[0]) {
  type Node = { parent?: Node; children: Node[]; text?: string }
  const renderer = createRenderer<Node, Node>({
    insert(child, parent) {
      child.parent = parent
      parent.children.push(child)
    },
    remove(child) {
      if (child.parent)
        child.parent.children = child.parent.children.filter((item) => item !== child)
    },
    createElement: () => ({ children: [] }),
    createText: (text) => ({ children: [], text }),
    createComment: (text) => ({ children: [], text }),
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
  let subject!: ReturnType<typeof useFirstRunEnvironmentStatus>
  const app = renderer.createApp({
    setup() {
      subject = useFirstRunEnvironmentStatus(readStatus)
      return () => null
    }
  })
  app.mount({ children: [] })
  return { subject, unmount: () => app.unmount() }
}

describe('first-run panel reader', () => {
  it('shares an in-flight read and clears old success after a failed refresh', async () => {
    const status = projectFirstRunEnvironmentStatus(observation())
    let resolve!: (value: typeof status) => void
    const read = vi.fn(
      () =>
        new Promise<typeof status>((done) => {
          resolve = done
        })
    )
    const { subject, unmount } = mountReader(read)
    const pending = subject.refresh()
    expect(subject.refresh()).toBe(pending)
    await Promise.resolve()
    expect(read).toHaveBeenCalledOnce()
    resolve(status)
    await pending
    expect(subject.status.value).toEqual(status)
    read.mockRejectedValueOnce(new Error('PRIVATE_PATH_OR_TOKEN_SENTINEL'))
    await subject.refresh()
    expect(subject.status.value).toBeNull()
    expect(subject.hasLoadError.value).toBe(true)
    unmount()
  })

  it('ignores a result arriving after the component is disposed', async () => {
    const status = projectFirstRunEnvironmentStatus(observation())
    let resolve!: (value: typeof status) => void
    const read = vi.fn(
      () =>
        new Promise<typeof status>((done) => {
          resolve = done
        })
    )
    const { subject, unmount } = mountReader(read)
    const pending = subject.refresh()
    await Promise.resolve()
    unmount()
    resolve(status)
    await pending
    expect(subject.status.value).toBeNull()
    await subject.refresh()
    expect(read).toHaveBeenCalledOnce()
  })
})
