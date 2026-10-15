import { createDefaultChampSelectOverlaySettings } from '@shared/champ-select-overlay'
import { describe, expect, it } from 'vitest'

import { resolveAutomaticPositionLease } from './automatic-position-lease'

describe('read-time automatic lease guard', () => {
  const automatic = {
    ...createDefaultChampSelectOverlaySettings(),
    candidateFirstCenterX: 400,
    teammateFirstCenterY: 100
  }
  it('applies only a current lease and preserves user opacity', () => {
    const manual = { ...createDefaultChampSelectOverlaySettings(), backgroundOpacity: 77 }
    expect(
      resolveAutomaticPositionLease(manual, { settings: automatic, isCurrent: () => true })
    ).toEqual({ ...automatic, backgroundOpacity: 77 })
  })
  it.each(['candidateFirstCenterX', 'teammateFirstCenterY'] as const)(
    'preserves partial manual %s',
    (key) => {
      const manual = { ...createDefaultChampSelectOverlaySettings(), [key]: 123 }
      expect(
        resolveAutomaticPositionLease(manual, { settings: automatic, isCurrent: () => true })
      ).toBe(manual)
    }
  )
  it('invalidates immediately between polling ticks', () => {
    const manual = createDefaultChampSelectOverlaySettings()
    let current = true
    const lease = { settings: automatic, isCurrent: () => current }
    expect(resolveAutomaticPositionLease(manual, lease).candidateFirstCenterX).toBe(400)
    current = false
    expect(resolveAutomaticPositionLease(manual, lease)).toBe(manual)
  })
  it('fails closed when live native validation throws', () => {
    const manual = createDefaultChampSelectOverlaySettings()
    expect(
      resolveAutomaticPositionLease(manual, {
        settings: automatic,
        isCurrent: () => {
          throw Error('closed')
        }
      })
    ).toBe(manual)
  })
  it('never mutates either manual or cached settings', () => {
    const manual = createDefaultChampSelectOverlaySettings()
    const lease = { settings: automatic, isCurrent: () => true }
    const result = resolveAutomaticPositionLease(manual, lease)
    result.candidateFirstCenterX = 999
    expect(manual.candidateFirstCenterX).toBeNull()
    expect(automatic.candidateFirstCenterX).toBe(400)
  })
})
