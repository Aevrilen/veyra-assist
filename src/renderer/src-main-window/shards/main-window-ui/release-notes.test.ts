import { SettingUtilsRenderer } from '@renderer-shared/shards/setting-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MainWindowUiRenderer } from './index'
import { syncMainWindowUiSettings } from './settings-sync'
import { useMainWindowUiStore } from './store'

vi.mock('@renderer-shared/shards/ipc', () => ({ AkariIpcRenderer: class {} }))
vi.mock('@renderer-shared/shards/league-client', () => ({ LeagueClientRenderer: class {} }))
vi.mock('@renderer-shared/shards/logger', () => ({ LoggerRenderer: class {} }))
vi.mock('@renderer-shared/shards/setup-in-app-scope', () => ({ SetupInAppScopeRenderer: class {} }))
vi.mock('@renderer-shared/shards/window-manager', () => ({ WindowManagerRenderer: class {} }))
vi.mock('./auto-route-watcher', () => ({ watchAutoRouteWhenGameStarts: vi.fn() }))
vi.mock('./background-controller', () => ({ MainWindowBackgroundController: class {} }))

beforeEach(() => setActivePinia(createPinia()))

function persistedSettings(saved = new Map<string, unknown>()) {
  const call = vi.fn(
    async (_namespace: string, method: string, namespace: string, key: string, value?: unknown) => {
      const storageKey = `${namespace}/${key}`
      if (method === 'set') saved.set(storageKey, value)
      return saved.get(storageKey)
    }
  )
  const settingUtils = new SettingUtilsRenderer({ call } as any)
  const context = { settingUtils } as Parameters<typeof syncMainWindowUiSettings>[0]
  const renderer = Object.create(MainWindowUiRenderer.prototype) as MainWindowUiRenderer
  Object.assign(renderer, { _context: context })
  return { settingUtils, context, renderer, saved, call }
}

describe('release notes read state in the persistent user profile', () => {
  it('restores the viewed version in a fresh renderer through the existing settings IPC', async () => {
    const first = persistedSettings()
    await syncMainWindowUiSettings(first.context)
    expect(useMainWindowUiStore().frontendSettings.lastReadReleaseNotesVersion).toBe('')
    await first.renderer.markReleaseNotesRead('1.5.2-beta.3')
    expect(first.call).toHaveBeenCalledWith(
      'setting-factory-main',
      'set',
      'main-window-ui-renderer',
      'lastReadReleaseNotesVersion',
      '1.5.2-beta.3'
    )
    first.settingUtils.onDispose()

    setActivePinia(createPinia())
    const restarted = persistedSettings(first.saved)
    await syncMainWindowUiSettings(restarted.context)
    expect(useMainWindowUiStore().frontendSettings.lastReadReleaseNotesVersion).toBe('1.5.2-beta.3')
    restarted.settingUtils.onDispose()
  })

  it('keeps the version unread when saving to the profile fails', async () => {
    const subject = persistedSettings()
    subject.call.mockRejectedValueOnce(new Error('profile-write-failed'))
    await expect(subject.renderer.markReleaseNotesRead('1.5.2-beta.3')).rejects.toThrow(
      'profile-write-failed'
    )
    expect(useMainWindowUiStore().frontendSettings.lastReadReleaseNotesVersion).toBe('')
    subject.settingUtils.onDispose()
  })

  it('treats malformed existing read metadata as unread without changing it on disk', async () => {
    const key = 'main-window-ui-renderer/lastReadReleaseNotesVersion'
    const subject = persistedSettings(new Map([[key, { unexpected: true }]]))
    await syncMainWindowUiSettings(subject.context)
    expect(useMainWindowUiStore().frontendSettings.lastReadReleaseNotesVersion).toBe('')
    expect(subject.saved.get(key)).toEqual({ unexpected: true })
    subject.settingUtils.onDispose()
  })
})
