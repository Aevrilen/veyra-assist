import type { ClientLaunchConfiguration } from '@shared/shards/client-installation'
import { defineStore } from 'pinia'
import { shallowReactive } from 'vue'

export type MainWindowBackgroundImageMode = 'profile-skin' | 'custom-image' | 'none'

export const useMainWindowUiStore = defineStore('shard:main-window-ui-renderer', () => {
  const frontendSettings = shallowReactive({
    clientLaunchConfiguration: null as ClientLaunchConfiguration | null,
    backgroundImageMode: 'none' as MainWindowBackgroundImageMode,
    customBackgroundFilePath: '',
    customBackgroundRevision: 0,
    customBackgroundOverlayStrength: 0.8,
    sidebarCollapsed: true,
    lastReadReleaseNotesVersion: '',
    showTestPage: false
  })

  return {
    frontendSettings
  }
})
