import { AKARI_PROXY_REQUEST_ID_HEADER } from '@shared/akari-protocol/proxy-request-cancellation'
import { describe, expect, it, vi } from 'vitest'

import type { AkariProtocolDomainHandler } from '../akari-protocol/context'
import { AkariApiProtocolController } from './protocol-controller'

vi.mock('../akari-protocol', () => ({
  AkariProtocolMain: {
    convertWebStreamToNodeStream: vi.fn(),
    shouldNotHaveBody: (status: number) => status === 204 || status === 304
  }
}))

describe('Akari API protocol controller', () => {
  it('proxies both service domains through their bootstrap HTTP clients', async () => {
    const handlers = new Map<string, AkariProtocolDomainHandler>()
    const protocol = {
      registerDomain: vi.fn((domain: string, handler: AkariProtocolDomainHandler) => {
        handlers.set(domain, handler)
      }),
      unregisterDomain: vi.fn()
    }
    const apiRequest = vi.fn().mockResolvedValue({
      data: JSON.stringify({ ok: true }),
      headers: { 'content-type': 'application/json' },
      status: 200,
      statusText: 'OK'
    })
    const bootstrap = {
      apiHttp: { request: apiRequest },
      staticHttp: {
        request: vi.fn().mockResolvedValue({
          data: 'asset-bytes',
          headers: { 'content-type': 'application/octet-stream' },
          status: 200,
          statusText: 'OK'
        })
      }
    }
    const controller = new AkariApiProtocolController(
      protocol as never,
      { warn: vi.fn() } as never,
      bootstrap as never
    )

    controller.register()

    expect([...handlers.keys()]).toEqual(['akari-api', 'akari-static'])

    const signal = new AbortController().signal
    const response = await handlers.get('akari-api')!(
      'config/v1/sgp/league-servers',
      new Request('akari://akari-api/config/v1/sgp/league-servers', {
        headers: {
          [AKARI_PROXY_REQUEST_ID_HEADER]: 'request-id',
          'x-test': 'test'
        }
      }),
      { signal }
    )

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'x-test': 'test' },
        method: 'GET',
        signal,
        url: 'config/v1/sgp/league-servers',
        validateStatus: expect.any(Function)
      })
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })

    const asset = await handlers.get('akari-static')!(
      'game-data/champion.png',
      new Request('akari://akari-static/game-data/champion.png'),
      { signal }
    )
    expect(await asset.text()).toBe('asset-bytes')
    expect(bootstrap.staticHttp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'game-data/champion.png',
        signal
      })
    )

    controller.unregister()

    expect(protocol.unregisterDomain).toHaveBeenNthCalledWith(1, 'akari-api')
    expect(protocol.unregisterDomain).toHaveBeenNthCalledWith(2, 'akari-static')
  })

  it('rejects product-service proxy requests without contacting upstream', async () => {
    const handlers = new Map<string, AkariProtocolDomainHandler>()
    const request = vi.fn()
    const controller = new AkariApiProtocolController(
      {
        registerDomain: (domain: string, handler: AkariProtocolDomainHandler) =>
          handlers.set(domain, handler)
      } as never,
      { warn: vi.fn() } as never,
      { apiHttp: { request }, staticHttp: { request } } as never
    )
    controller.register()
    for (const uri of [
      'notice/v1/latest?lang=zh-CN',
      '/website/v1/contact-channels',
      'releases/v1/latest',
      'statistics/v1/records'
    ]) {
      const response = await handlers.get('akari-api')!(
        uri,
        new Request(`akari://akari-api/${uri}`, { method: 'GET' }),
        { signal: new AbortController().signal }
      )
      expect(response.status).toBe(403)
    }
    expect(request).not.toHaveBeenCalled()
  })
})
