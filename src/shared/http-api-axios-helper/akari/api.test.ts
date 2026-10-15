import type { AxiosInstance } from 'axios'
import { describe, expect, it, vi } from 'vitest'

import { AkariApiHttpApiAxiosHelper } from './api'

function createHttpMock() {
  const get = vi.fn().mockResolvedValue({ data: {} })
  const post = vi.fn().mockResolvedValue({ data: {} })
  const http = {
    defaults: { baseURL: undefined },
    get,
    post
  } as unknown as AxiosInstance

  return { get, http, post }
}

describe('Akari API HTTP helper', () => {
  it('blocks upstream releases and telemetry before HTTP dispatch', async () => {
    const { get, http, post } = createHttpMock()
    const api = new AkariApiHttpApiAxiosHelper(http)

    await expect(api.getLatestRelease('en')).rejects.toThrow('disabled in Veyra Assist')
    await expect(api.postStatisticsRecord('1.5.2-beta')).rejects.toThrow('disabled in Veyra Assist')
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it('keeps game configuration requests and their cancellation signal after blocking product APIs', async () => {
    const { get, http } = createHttpMock()
    const api = new AkariApiHttpApiAxiosHelper(http)

    await expect(api.getLatestRelease()).rejects.toThrow('disabled')
    const signal = new AbortController().signal
    for (const resource of [
      'sgp/league-servers',
      'sgp/supported-queues',
      'auto-select/groups',
      'app/feature-gates'
    ] as const) {
      await api.getConfig(resource, { signal })
      expect(get).toHaveBeenCalledWith(`/config/v1/${resource}`, { signal })
    }
  })
})
