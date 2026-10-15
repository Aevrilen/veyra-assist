import { afterEach, describe, expect, it, vi } from 'vitest'

import { getLeagueClientWindowSnapshot } from './index'

vi.mock('./magic', () => ({ magic: vi.fn() }))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('League client window snapshot platform boundary', () => {
  it('returns unavailable off Windows without loading a native addon', () => {
    vi.stubGlobal('process', { ...process, platform: 'linux' })

    expect(getLeagueClientWindowSnapshot(42)).toBeNull()
  })
})
