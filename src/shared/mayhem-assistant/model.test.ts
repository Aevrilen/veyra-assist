import { describe, expect, it } from 'vitest'

import { matchAugmentName, parseAugments, parseEquipment } from './data-adapter'
import { matchesMarkers, percentage, pixelDistance, ratio } from './model'
import { MayhemSessionController } from './session-controller'

describe('Mayhem data contracts', () => {
  it('keeps equipment field units, special IDs and missing rates intact', () => {
    const data = parseEquipment(
      {
        code: 0,
        data: {
          _fieldValues: {
            R999: JSON.stringify({
              dtstatdate: '20261010',
              itemone_json: JSON.stringify({
                a: { itemone: '123430', winrate: 6033, showrate: 6758 },
                b: { itemone: '3153', winrate: null, showrate: 6228 }
              }),
              itemshoes: '3006$0.5546$0.5734',
              itemcore_json: JSON.stringify({
                a: { itemcore: '123430&3153', showrate: 699, winrate: 6172 }
              }),
              itemout: '1018,1052$0.038$0.6207'
            })
          }
        }
      },
      157
    )
    expect(data.categories.items[0]).toEqual({ ids: [123430], pickRate: 0.6758, winRate: 0.6033 })
    expect(data.categories.items[1].winRate).toBeNull()
    expect(data.categories.shoes[0].pickRate).toBe(0.5546)
    expect(data.categories.core[0].ids).toEqual([123430, 3153])
    expect(data.categories.starting[0].pickRate).toBe(0.038)
  })
  it('rejects upstream errors and wrong hero augments without fabricating win rates', () => {
    expect(() => parseEquipment({ code: 1 }, 157)).toThrow()
    expect(() =>
      parseAugments({ champion: { id: 1 }, augments: { all: [] } }, 157, '16.20', '2026-10-11')
    ).toThrow()
    const result = parseAugments(
      {
        champion: { id: 157 },
        augments: { all: [{ id: 1048, tier: 'B', pickRate: 0.03, winRate: null }] }
      },
      157,
      '16.20',
      '2026-10-11'
    )
    expect(result.augments[0].winRate).toBeNull()
    expect(result.source).toBe('ARAMKit · 全阶段')
    expect(percentage(null)).toBe('--')
    expect(ratio(-1)).toBeNull()
    expect(ratio(10200, 10000)).toBeNull()
  })
  it('uses exact unique normalized names and never fuzzy guesses a candidate', () => {
    expect(matchAugmentName('珠光 护手！', [{ id: 1048, name: '珠光护手' }])).toBe(1048)
    expect(matchAugmentName('珠光护', [{ id: 1048, name: '珠光护手' }])).toBeNull()
    expect(
      matchAugmentName('珠光护手', [
        { id: 1, name: '珠光护手' },
        { id: 2, name: '珠光护手' }
      ])
    ).toBeNull()
  })
})
describe('Mayhem show/hide lifecycle', () => {
  const create = () => {
    const s = new MayhemSessionController()
    s.setSession('player:1', 157)
    return s
  }
  it('needs consecutive scene frames, hides on conflicts and expires late observations', () => {
    const s = create(),
      token = s.revision
    s.observe(token, true, false, 1000)
    expect(s.shopVisible).toBe(false)
    s.observe(token, true, false, 1500)
    expect(s.shopVisible).toBe(true)
    s.observe(token, true, true, 2000)
    expect(s.shopVisible).toBe(false)
    expect(s.cardsVisible).toBe(false)
    s.observe(token, true, false, 2500)
    s.observe(token, true, false, 3000)
    s.expire(4600)
    expect(s.shopVisible).toBe(false)
    expect(s.observe(token, true, false, 4700)).toBe(false)
  })
  it('preserves suppression through unknown state and reconnect, restores on new game', () => {
    const s = create()
    expect(s.suppress('player:0')).toBe(false)
    s.suppress('player:1')
    s.setSession(null, null)
    s.setSession('player:1', 157)
    s.observe(s.revision, true, false, 1000)
    s.observe(s.revision, true, false, 1500)
    expect(s.shopVisible).toBe(false)
    s.setSession('player:2', 157)
    s.observe(s.revision, true, false, 2000)
    s.observe(s.revision, true, false, 2500)
    expect(s.shopVisible).toBe(true)
    expect(s.suppressed).toBe(false)
  })
  it('restores only the current game and rechecks the shop before showing', () => {
    const s = create()
    s.suppress('player:1')
    expect(s.restore('player:0')).toBe(false)
    expect(s.restore('player:1')).toBe(true)
    expect(s.shopVisible).toBe(false)
    s.observe(s.revision, true, false, 1000)
    expect(s.shopVisible).toBe(false)
    s.observe(s.revision, true, false, 1500)
    expect(s.shopVisible).toBe(true)
  })
  it('clears only changed card stats and rejects results from a prior session', () => {
    const s = create(),
      token = s.revision
    s.observe(token, false, true, 1000)
    s.observe(token, false, true, 1500)
    s.updateTitles([[1], [2], [3]], (a, b) => a[0] !== b[0])
    const candidate = {
      id: 1048,
      rarity: 'prismatic' as const,
      tier: 'B' as const,
      winRate: 0.5,
      pickRate: 0.1
    }
    expect(s.setCandidates(token, [candidate, candidate, candidate])).toBe(true)
    s.updateTitles([[9], [2], [3]], (a, b) => a[0] !== b[0])
    expect(s.candidates).toEqual([null, candidate, candidate])
    s.setSession('player:2', 1)
    expect(s.setCandidates(token, [candidate, candidate, candidate])).toBe(false)
    expect(s.candidates).toEqual([null, null, null])
  })
})
describe('Calibrated scene recognition', () => {
  it('requires both markers and distinguishes closed and black samples', () => {
    const open = [100, 150, 200, 255],
      closed = [5, 5, 5, 255],
      rect = { x: 0, y: 0, width: 1, height: 1 }
    const markers = [
      { rect, open, closed },
      { rect, open, closed }
    ]
    expect(matchesMarkers(markers, [open, open])).toBe(true)
    expect(matchesMarkers(markers, [open, closed])).toBe(false)
    expect(
      matchesMarkers(markers, [
        [0, 0, 0, 255],
        [0, 0, 0, 255]
      ])
    ).toBe(false)
    expect(pixelDistance([0, 0, 0, 255], [0, 0, 0, 0])).toBe(0)
  })
  it('hides visible cards when their marker colors change away from the sole open sample', () => {
    // Synthetic BGRA colors demonstrate the gate; these are not measured game pixels.
    const pixels = (bgr: number[]) => Array.from({ length: 24 * 24 }, () => [...bgr, 255]).flat()
    const silver = pixels([180, 180, 180])
    const gold = pixels([60, 170, 210])
    const closed = pixels([10, 10, 10])
    const markers = [100, 200].map((x) => ({
      rect: { x, y: 100, width: 24, height: 24 },
      open: silver,
      closed
    }))
    const silverOpen = matchesMarkers(markers, [silver, silver])
    const goldOpen = matchesMarkers(markers, [gold, gold])

    expect(silverOpen).toBe(true)
    expect(pixelDistance(gold, silver)).toBeCloseTo(160 / (3 * 255))
    expect(pixelDistance(gold, closed)).toBeGreaterThan(pixelDistance(gold, silver) + 0.035)
    expect(goldOpen).toBe(false)
    expect(
      matchesMarkers(
        markers.map((marker) => ({ ...marker, open: gold })),
        [gold, gold]
      )
    ).toBe(true)
    const calibratedVariants = markers.map((marker) => ({ ...marker, openVariants: [gold] }))
    expect(matchesMarkers(calibratedVariants, [gold, gold])).toBe(true)
    expect(matchesMarkers(calibratedVariants, [closed, closed])).toBe(false)

    const session = new MayhemSessionController()
    session.setSession('player:1', 103)
    const token = session.revision
    session.observe(token, false, silverOpen, 1000)
    session.observe(token, false, silverOpen, 1500)
    const candidate = {
      id: 1073,
      rarity: 'silver' as const,
      tier: null,
      pickRate: null,
      winRate: null
    }
    expect(session.setCandidates(token, [candidate, candidate, candidate])).toBe(true)
    expect(session.cardsVisible).toBe(true)

    session.observe(token, false, goldOpen, 2000)
    expect(session.cardsVisible).toBe(true)
    session.observe(token, false, goldOpen, 2500)
    expect(session.cardsVisible).toBe(false)
    expect(session.candidates).toEqual([null, null, null])
  })
})
