import { describe, expect, it } from 'vitest'

import { gameClientCrop, normalizeCardGeometry, resolveGameFrameMapping } from './game-frame-layout'

describe('physical game-frame geometry', () => {
  it('crops a 1080 client inside a 2K physical display without scaling the image', () => {
    const client = { x: 320, y: 180, width: 1920, height: 1080 }
    const result = resolveGameFrameMapping(client, [
      { id: 'game', bounds: { x: 0, y: 0, width: 2560, height: 1440 }, scaleFactor: 1.25 }
    ])
    expect(result.mapping?.scaleFactor).toBe(1.25)
    expect(gameClientCrop(result.mapping!, { width: 2560, height: 1440 })).toEqual(client)
    expect(gameClientCrop(result.mapping!, { width: 2048, height: 1152 })).toBeNull()
  })
  it('preserves physical negative origins and rejects ambiguous or cross-display clients', () => {
    const client = { x: -2560, y: 0, width: 2560, height: 1440 }
    const display = { id: 'left', bounds: client, scaleFactor: 1.5 }
    const result = resolveGameFrameMapping(client, [display])
    expect(gameClientCrop(result.mapping!, { width: 2560, height: 1440 })).toEqual({
      x: 0,
      y: 0,
      width: 2560,
      height: 1440
    })
    expect(resolveGameFrameMapping(client, [display, display]).reason).toBe(
      'client-display-not-unique'
    )
    expect(resolveGameFrameMapping({ ...client, x: -2000 }, [display]).mapping).toBeNull()
  })
  it('refuses unsupported clients and an upscaled 1080 display thumbnail', () => {
    expect(
      resolveGameFrameMapping({ x: 0, y: 0, width: 2559, height: 1439 }, []).mapping
    ).toBeNull()
    const bounds = { x: 0, y: 0, width: 1920, height: 1080 }
    const result = resolveGameFrameMapping(bounds, [{ id: '1', bounds, scaleFactor: 1 }])
    expect(gameClientCrop(result.mapping!, { width: 2560, height: 1440 })).toBeNull()
  })
  it('keeps an already revalidated layout stable through two-pixel jitter, but changes real moves', () => {
    const previous = [583, 1073, 1563].map((x) => ({ x, y: 255, width: 429, height: 704 }))
    const jitter = previous.map((rect) => ({ ...rect, x: rect.x + 1, y: rect.y + 2 }))
    expect(normalizeCardGeometry(previous, jitter)).toBe(previous)
    const moved = previous.map((rect) => ({ ...rect, x: rect.x + 20 }))
    expect(normalizeCardGeometry(previous, moved)).toBe(moved)
  })
})
