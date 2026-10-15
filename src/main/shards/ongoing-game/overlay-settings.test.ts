import { createDefaultChampSelectOverlaySettings } from '@shared/champ-select-overlay'
import { observable, reaction } from 'mobx'
import { describe, expect, it, vi } from 'vitest'

import { SetterSettingService } from '../setting-factory/setter-setting-service'
import { champSelectOverlaySettingsSchema } from './setting-schemas'

describe('ongoing-game overlay settings persistence', () => {
  it('persists and restores the configured origins, spacing and opacity through the existing setter service', async () => {
    const storage = new Map<string, unknown>()
    const pending = new Map<string, () => Promise<void>>()
    const factory = {
      _delayed: {
        add: (key: string, save: () => Promise<void>) => pending.set(key, save),
        remove: (key: string) => pending.delete(key)
      },
      _getFromStorage: async (namespace: string, key: string) => storage.get(`${namespace}/${key}`),
      _saveToStorage: async (namespace: string, key: string, value: unknown) => {
        storage.set(`${namespace}/${key}`, structuredClone(value))
      },
      _removeFromStorage: async (namespace: string, key: string) => {
        storage.delete(`${namespace}/${key}`)
      }
    }
    const logger = { warn: vi.fn() }
    const defaults = createDefaultChampSelectOverlaySettings()
    const schema = {
      champSelectOverlay: { default: defaults, schema: champSelectOverlaySettingsSchema }
    }
    const current = observable({ champSelectOverlay: defaults })
    const service = new SetterSettingService(
      factory as any,
      'ongoing-game-main',
      schema,
      current,
      logger as any
    )
    await service.applyToState()
    const changed = vi.fn()
    const dispose = reaction(() => current.champSelectOverlay.backgroundOpacity, changed)
    const configured = {
      ...defaults,
      backgroundOpacity: 30,
      candidateFirstCenterX: 300,
      teammateFirstCenterY: 200,
      candidateStep: 60,
      teammateStep: 84,
      calibratedClientSize: { width: 1280, height: 720 }
    }
    await service.set('champSelectOverlay', configured)
    expect(current.champSelectOverlay).toEqual(configured)
    expect(changed).toHaveBeenCalledTimes(1)
    await pending.get('ongoing-game-main/champSelectOverlay')!()
    const restored = { champSelectOverlay: createDefaultChampSelectOverlaySettings() }
    const next = new SetterSettingService(
      factory as any,
      'ongoing-game-main',
      schema,
      restored,
      logger as any
    )
    await next.applyToState()
    expect(restored.champSelectOverlay).toEqual(configured)
    dispose()
  })
  it('accepts the opacity endpoints and minimum readable spacing, rejecting values outside the persisted range', () => {
    const defaults = createDefaultChampSelectOverlaySettings()
    for (const backgroundOpacity of [30, 90])
      expect(
        champSelectOverlaySettingsSchema.safeParse({ ...defaults, backgroundOpacity }).success
      ).toBe(true)
    expect(
      champSelectOverlaySettingsSchema.safeParse({ ...defaults, teammateStep: 64 }).success
    ).toBe(true)
    expect(
      champSelectOverlaySettingsSchema.safeParse({ ...defaults, backgroundOpacity: 29 }).success
    ).toBe(false)
    expect(
      champSelectOverlaySettingsSchema.safeParse({ ...defaults, backgroundOpacity: 91 }).success
    ).toBe(false)
    expect(
      champSelectOverlaySettingsSchema.safeParse({ ...defaults, candidateFirstCenterX: -1 }).success
    ).toBe(false)
  })
})
