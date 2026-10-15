import { createPinia, setActivePinia } from 'pinia'
import { expect, it } from 'vitest'

import { syncAutoGameflowState } from './state-sync'
import { useAutoGameflowStore } from './store'

it('defaults to accepting without matching, then honors the main-process explicit false', async () => {
  setActivePinia(createPinia())
  const store = useAutoGameflowStore()
  expect(store.settings).toMatchObject({
    autoAcceptEnabled: true,
    autoAcceptDelaySeconds: 0,
    autoMatchmakingEnabled: false,
    autoMatchmakingDelaySeconds: 5
  })
  await syncAutoGameflowState({
    piniaMobxUtils: {
      sync: async (namespace: string, property: string, target: object) => {
        expect(namespace).toBe('auto-gameflow-main')
        if (property === 'settings') Object.assign(target, { autoAcceptEnabled: false })
      }
    }
  } as never)
  expect(store.settings.autoAcceptEnabled).toBe(false)
  expect(store.settings.autoMatchmakingEnabled).toBe(false)
})
