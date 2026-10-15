import axios, { type InternalAxiosRequestConfig } from 'axios'
import { observable, reaction } from 'mobx'
import { afterEach, expect, it, vi } from 'vitest'

import { AkariApiMain } from './index'

vi.mock('electron', () => ({ app: { getVersion: () => '1.5.2-beta' } }))
vi.mock('@shared/akari-shard', () => ({ Shard: () => (target: unknown) => target }))
vi.mock('../akari-protocol', () => ({ AkariProtocolMain: class {} }))
vi.mock('../app-common', () => ({ AppCommonMain: class {} }))
vi.mock('../logger-factory', () => ({ LoggerFactoryMain: class {} }))
vi.mock('../mobx-utils', () => ({ MobxUtilsMain: class {} }))
vi.mock('../network', () => ({ NetworkMain: class {} }))
vi.mock('../setting-factory', () => ({ SettingFactoryMain: class {} }))

afterEach(() => vi.useRealTimers())

it('keeps startup, periodic refresh and network recovery confined to game configuration', async () => {
  vi.useFakeTimers()
  let online = false
  const requests: string[] = []
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
    requests.push(config.url!)
    if (!online) throw new Error('synthetic network unavailable')
    return { status: 200, statusText: 'OK', headers: {}, config, data: {} }
  })
  const settings = observable({ locale: 'zh-CN' })
  const service = {
    jsonConfigFileExists: vi.fn().mockResolvedValue(false),
    writeToJsonConfigFile: vi.fn(),
    deleteJsonConfigFile: vi.fn()
  }
  const protocol = { registerDomain: vi.fn(), unregisterDomain: vi.fn() }
  const subject = new AkariApiMain(
    { create: () => ({ info: vi.fn(), warn: vi.fn() }) } as never,
    { register: () => service } as never,
    protocol as never,
    { propSync: vi.fn(), reaction } as never,
    { settings } as never,
    { createAxiosClient: (config: object) => axios.create({ ...config, adapter }) } as never
  )
  const configRequests = () => requests.filter((url) => url.startsWith('/config/v1/'))
  try {
    await subject.onInit()
    await vi.advanceTimersByTimeAsync(0)
    expect(configRequests()).toHaveLength(4)
    settings.locale = 'en'
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(configRequests()).toHaveLength(4)
    online = true
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(configRequests()).toHaveLength(8)
    expect(
      requests.every(
        (url) => url.startsWith('/config/v1/') || url.includes('@leagueakari%2fbootstrap/latest')
      )
    ).toBe(true)
    expect(requests.some((url) => /\/(notice|website|releases|statistics)\//.test(url))).toBe(false)
  } finally {
    await subject.onDispose()
  }
  const count = requests.length
  await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000)
  expect(requests).toHaveLength(count)
})
