import 'reflect-metadata'

import type { FindOperator } from 'typeorm'
import { describe, expect, it, vi } from 'vitest'

import { Setting } from '../../storage/entities/Settings'
import type { MigrationContext } from './context'
import {
  BACKGROUND_MATERIAL_SETTING_KEY,
  LEGACY_AUX_SHOW_SKIN_SELECTOR_KEY,
  MIGRATION_FROM_151,
  OPGG_SHOW_SKIN_SELECTOR_KEY,
  migrateFrom151
} from './from-1-5-1'

describe('from 1.5.1 migration', () => {
  it('moves the skin selector preference to the unified champion data window', async () => {
    const manager = {
      findOneBy: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(Setting.create(LEGACY_AUX_SHOW_SKIN_SELECTOR_KEY, true)),
      save: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn()
    }
    const logger = { info: vi.fn() }

    await migrateFrom151({ manager, logger } as unknown as Parameters<typeof migrateFrom151>[0])

    expect(manager.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ key: OPGG_SHOW_SKIN_SELECTOR_KEY, value: true })
    )
    expect(manager.save).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ key: MIGRATION_FROM_151, value: MIGRATION_FROM_151 })
    )
    expect(manager.remove).not.toHaveBeenCalled()
  })

  it('migrates the persisted Mica background material to the unified system value', async () => {
    const manager = {
      findOneBy: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(Setting.create(OPGG_SHOW_SKIN_SELECTOR_KEY, false))
        .mockResolvedValueOnce(Setting.create(BACKGROUND_MATERIAL_SETTING_KEY, 'mica')),
      save: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn()
    }
    const logger = { info: vi.fn() }

    await migrateFrom151({ manager, logger } as unknown as Parameters<typeof migrateFrom151>[0])

    expect(manager.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        key: BACKGROUND_MATERIAL_SETTING_KEY,
        value: 'system'
      })
    )
    expect(manager.save).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ key: MIGRATION_FROM_151, value: MIGRATION_FROM_151 })
    )
    expect(manager.remove).not.toHaveBeenCalled()
  })
})

const LEGACY_KEY = 'app-common-main/httpProxy'
const NETWORK_KEY = 'network-main/httpProxy'

function setup(initial: Setting[] = []) {
  const settings = new Map(initial.map((setting) => [setting.key, setting]))
  const context = {
    manager: {
      findOneBy: async (_: unknown, { key }: { key: string | FindOperator<string> }) =>
        settings.get(typeof key === 'string' ? key : key.value),
      save: async (setting: Setting) => settings.set(setting.key, setting),
      remove: async (setting: Setting) => settings.delete(setting.key)
    },
    logger: { info: () => {} }
  }
  return { settings, context: context as unknown as MigrationContext }
}

describe('network proxy settings migration', () => {
  it.each([
    ['auto', 'system'],
    ['force', 'fixed-servers'],
    ['disable', 'direct']
  ])('migrates %s to %s and preserves host and port', async (strategy, migratedStrategy) => {
    const proxy = { strategy, host: 'localhost', port: 1080 }
    const { settings, context } = setup([Setting.create(LEGACY_KEY, proxy)])

    await migrateFrom151(context)

    expect(settings.get(NETWORK_KEY)?.value).toEqual({ ...proxy, strategy: migratedStrategy })
    expect(settings.has(LEGACY_KEY)).toBe(false)
    expect(settings.has(MIGRATION_FROM_151)).toBe(true)
  })

  it('keeps an existing network setting and removes the obsolete key', async () => {
    const current = { strategy: 'system', host: 'localhost', port: 7897 }
    const { settings, context } = setup([
      Setting.create(LEGACY_KEY, { strategy: 'force', host: 'localhost', port: 1080 }),
      Setting.create(NETWORK_KEY, current)
    ])

    await migrateFrom151(context)

    expect(settings.get(NETWORK_KEY)?.value).toEqual(current)
    expect(settings.has(LEGACY_KEY)).toBe(false)
  })
})
