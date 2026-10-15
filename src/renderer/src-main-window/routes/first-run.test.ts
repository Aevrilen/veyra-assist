import { describe, expect, it, vi } from 'vitest'

import { router } from './index'

vi.mock('vue-router', async (original) => {
  const actual = await original<typeof import('vue-router')>()
  return { ...actual, createWebHashHistory: actual.createMemoryHistory }
})
vi.mock('@main-window/components/settings-modal/SettingsModal.vue', () => ({ default: {} }))
vi.mock('@main-window/views/automation/Automation.vue', () => ({ default: {} }))
vi.mock('@main-window/views/ongoing-game/OngoingGame.vue', () => ({ default: {} }))
vi.mock('@main-window/views/player-tabs/PlayerTabs.vue', () => ({ default: {} }))
vi.mock('@main-window/views/test/Test.vue', () => ({ default: {} }))
vi.mock('@main-window/views/toolkit/Toolkit.vue', () => ({ default: {} }))

describe('retired first-positioning entry', () => {
  it('takes an old first-run link back to the normal home screen', async () => {
    await router.push('/first-run')
    expect(router.currentRoute.value.name).toBe('player-tabs')
    expect(router.currentRoute.value.fullPath).toBe('/player-tabs')
  })
})
