import type { PositionSelection } from '@shared/champ-select-overlay/position-calibration'
import { describe, expect, it, vi } from 'vitest'
import { isReactive, ref } from 'vue'

import { MainWindowUiRenderer } from './index'

// Exercise the real thin IPC method without initializing unrelated renderer shards.
vi.mock('@renderer-shared/shards/ipc', () => ({ AkariIpcRenderer: class {} }))
vi.mock('@renderer-shared/shards/league-client', () => ({ LeagueClientRenderer: class {} }))
vi.mock('@renderer-shared/shards/logger', () => ({ LoggerRenderer: class {} }))
vi.mock('@renderer-shared/shards/setting-utils', () => ({ SettingUtilsRenderer: class {} }))
vi.mock('@renderer-shared/shards/setup-in-app-scope', () => ({ SetupInAppScopeRenderer: class {} }))
vi.mock('@renderer-shared/shards/window-manager', () => ({ WindowManagerRenderer: class {} }))
vi.mock('./auto-route-watcher', () => ({ watchAutoRouteWhenGameStarts: vi.fn() }))
vi.mock('./background-controller', () => ({ MainWindowBackgroundController: class {} }))
vi.mock('./settings-sync', () => ({ syncMainWindowUiSettings: vi.fn() }))
vi.mock('./store', () => ({ useMainWindowUiStore: vi.fn() }))

const points = (): PositionSelection => ({
  candidateFirst: { x: 0.3, y: 0.05 },
  teammateFirst: { x: 0.07, y: 0.19 },
  candidateNext: null,
  teammateNext: null
})

describe('position save IPC payload', () => {
  it('sends cloneable plain points while retaining the reactive editing draft', async () => {
    const selection = ref(points())
    const original = selection.value
    const call = vi.fn(async (_namespace, _method, payload) => structuredClone(payload))
    const renderer = Object.create(MainWindowUiRenderer.prototype)
    renderer._ipc = { call }

    expect(isReactive(selection.value)).toBe(true)
    const result = await renderer.saveChampSelectPosition('retained-preview', selection.value)

    expect(result).toEqual({ requestId: 'retained-preview', selection: points() })
    expect(call).toHaveBeenCalledWith('champ-select-overlay-main', 'savePosition', result)
    expect(isReactive(call.mock.calls[0][2].selection)).toBe(false)
    expect(selection.value).toBe(original)
    expect(selection.value).toEqual(points())
  })

  it('preserves the same editable points when the validated save rejects', async () => {
    const selection = ref(points())
    selection.value.candidateNext = { x: 0.36, y: 0.05 }
    const before = JSON.stringify(selection.value)
    const call = vi.fn(async (_namespace, _method, payload) => {
      structuredClone(payload)
      throw new Error('save-failed')
    })
    const renderer = Object.create(MainWindowUiRenderer.prototype)
    renderer._ipc = { call }

    await expect(
      renderer.saveChampSelectPosition('retained-preview', selection.value)
    ).rejects.toThrow('save-failed')
    expect(JSON.stringify(selection.value)).toBe(before)
    expect(isReactive(selection.value)).toBe(true)
  })
})
