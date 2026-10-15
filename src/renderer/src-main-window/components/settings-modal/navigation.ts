export const SETTINGS_MODAL_NAVIGATION_STEP_KEY = 'settings-modal'
export const APP_SETTINGS_NAVIGATION_STEP_KEY = 'settings-modal.basic.app'
export const MISC_SETTINGS_NAVIGATION_STEP_KEY = 'settings-modal.misc'

export type SettingsTabName =
  'basic' | 'player-tabs' | 'ongoing-game' | 'multi-window' | 'storage' | 'misc' | 'debug' | 'about'
export const SETTINGS_GROUPS = ['data', 'window', 'maintenance'] as const
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number] | 'appearance'
export type SettingsNavigationPayload = SettingsTabName | { tab: SettingsTabName; targetId: string }
export type AppSettingsNavigationPayload = 'windows-only' | 'forced-http-proxy' | 'background'
export type MiscSettingsNavigationPayload = 'streamer-mode-enabled'

export function getSettingsGroup(tab: SettingsTabName, targetId = ''): SettingsGroup {
  if (targetId.startsWith('toolkit.client')) return 'maintenance'
  if (tab === 'basic') {
    if (targetId === 'app.basic.theme' || targetId.startsWith('app.main-window-ui'))
      return 'appearance'
    if (targetId.startsWith('app.self-update')) return 'maintenance'
    if (
      targetId === 'app.basic.close-action' ||
      targetId === 'app.misc.disable-hardware-acceleration'
    )
      return 'window'
    if (
      targetId.startsWith('app.lcu-connection') ||
      targetId === 'app.misc' ||
      targetId === 'app.misc.log-level' ||
      targetId === 'app.misc.uninstall'
    )
      return 'maintenance'
    return 'data'
  }
  if (tab === 'storage' && targetId.startsWith('storage.saved-settings')) return 'maintenance'
  if (tab === 'player-tabs' || tab === 'storage') return 'data'
  if (tab === 'debug' || tab === 'about') return 'maintenance'
  return 'window'
}

export function isSettingsGroup(value: unknown): value is SettingsGroup {
  return value === 'appearance' || SETTINGS_GROUPS.some((group) => group === value)
}
