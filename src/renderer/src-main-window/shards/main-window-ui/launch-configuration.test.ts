import type { ClientLaunchConfiguration } from '@shared/shards/client-installation'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { syncMainWindowUiSettings } from './settings-sync'
import { useMainWindowUiStore } from './store'

const configuration: ClientLaunchConfiguration = {
  client: 'riot',
  executablePath: 'C:\\游戏 中文\\RiotClientServices.exe'
}
beforeEach(() => setActivePinia(createPinia()))
describe('saved client launch configuration', () => {
  it.each([configuration, { client: 'unknown', executablePath: 'bad' }])(
    'restores only schema-valid configuration without changing existing settings keys',
    async (saved) => {
      const set = vi.fn()
      const savedPropVue = vi.fn()
      const context = {
        settingUtils: {
          get: vi.fn(async (_namespace: string, key: string) =>
            key === 'clientLaunchConfiguration'
              ? saved
              : key === 'backgroundImageMode'
                ? 'none'
                : undefined
          ),
          set,
          savedPropVue
        }
      }
      await syncMainWindowUiSettings(
        context as unknown as Parameters<typeof syncMainWindowUiSettings>[0]
      )
      expect(useMainWindowUiStore().frontendSettings.clientLaunchConfiguration).toEqual(
        saved === configuration ? configuration : null
      )
      expect(set).not.toHaveBeenCalled()
      expect(savedPropVue.mock.calls.map((call) => call[2])).toEqual([
        'backgroundImageMode',
        'customBackgroundFilePath',
        'customBackgroundRevision',
        'customBackgroundOverlayStrength',
        'sidebarCollapsed',
        'showTestPage'
      ])
      expect(savedPropVue.mock.calls.every((call) => call[0] === 'main-window-ui-renderer')).toBe(
        true
      )
    }
  )
})
