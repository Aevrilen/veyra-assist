import 'reflect-metadata'

import { expect, it, vi } from 'vitest'

import { moveSetting } from '../config-migrate/migrations/context'
import type { SettingSchema } from '../setting-factory'
import { SetterSettingService } from '../setting-factory/setter-setting-service'
import { AutoGameflowMain } from './index'
import type { AutoGameflowSettings } from './state'

vi.mock('@shared/akari-shard', () => ({ Shard: () => (target: unknown) => target }))
vi.mock('../ipc', () => ({ AkariIpcMain: class {} }))
vi.mock('../league-client', () => ({ LeagueClientMain: class {} }))
vi.mock('../logger-factory', () => ({ AkariLogger: class {}, LoggerFactoryMain: class {} }))
vi.mock('../mobx-utils', () => ({ MobxUtilsMain: class {} }))
vi.mock('../setting-factory', () => ({ SettingFactoryMain: class {} }))
vi.mock('@main/i18n', () => ({ i18next: { t: (key: string) => key } }))

function fixture(values: Record<string, unknown> = {}) {
  const logger = { info: vi.fn(), warn: vi.fn() }
  const storage = {
    _getFromStorage: vi.fn(async (_namespace: string, key: string, fallback?: unknown) =>
      Object.hasOwn(values, key) ? values[key] : fallback
    ),
    _saveToStorage: vi.fn(),
    _removeFromStorage: vi.fn()
  }
  let service!: SetterSettingService<AutoGameflowSettings>
  const register = vi.fn(
    (
      namespace: string,
      schema: SettingSchema<AutoGameflowSettings>,
      settings: AutoGameflowSettings
    ) => {
      service = new SetterSettingService(
        storage as never,
        namespace,
        schema,
        settings,
        logger as never
      )
      return service
    }
  )
  const main = new AutoGameflowMain(
    { create: () => logger } as never,
    { register } as never,
    { data: {} } as never,
    {} as never,
    {} as never
  )
  return { main, service, storage, register }
}

it.each([
  ['new profile', {}, true],
  ['missing accept key in existing profile', { autoAcceptDelaySeconds: 2 }, true],
  ['explicit false', { autoAcceptEnabled: false }, false],
  ['explicit true', { autoAcceptEnabled: true }, true]
] as const)(
  'restores auto-accept for %s without overwriting stored choices',
  async (_label, values, expected) => {
    const { main, service, storage } = fixture({ ...values })
    await service.applyToState()
    expect(main.settings.autoAcceptEnabled).toBe(expected)
    expect(main.settings.autoMatchmakingEnabled).toBe(false)
    expect(main.settings.autoMatchmakingDelaySeconds).toBe(5)
    expect(main.settings.autoAcceptDelaySeconds).toBe('autoAcceptDelaySeconds' in values ? 2 : 0)
    expect(storage._saveToStorage).not.toHaveBeenCalled()
    expect(storage._removeFromStorage).not.toHaveBeenCalled()
  }
)

it('preserves existing accept and matchmaking delays independently', async () => {
  const { main, service } = fixture({
    autoAcceptEnabled: false,
    autoAcceptDelaySeconds: 3,
    autoMatchmakingEnabled: true,
    autoMatchmakingDelaySeconds: 17
  })
  await service.applyToState()
  expect(main.settings).toMatchObject({
    autoAcceptEnabled: false,
    autoAcceptDelaySeconds: 3,
    autoMatchmakingEnabled: true,
    autoMatchmakingDelaySeconds: 17
  })
})

it('preserves false while moving the legacy setting key before restoration', async () => {
  const save = vi.fn()
  const remove = vi.fn()
  await moveSetting(
    {
      findOneBy: vi
        .fn()
        .mockResolvedValue({ key: 'auto-gameflow/autoAcceptEnabled', value: false }),
      save,
      remove
    } as never,
    'auto-gameflow/autoAcceptEnabled',
    'auto-gameflow-main/autoAcceptEnabled'
  )
  const migrated = save.mock.calls[0][0]
  expect(migrated).toMatchObject({ key: 'auto-gameflow-main/autoAcceptEnabled', value: false })
  const { main, service } = fixture({ autoAcceptEnabled: migrated.value })
  await service.applyToState()
  expect(main.settings.autoAcceptEnabled).toBe(false)
  expect(remove).toHaveBeenCalledOnce()
})
