import { expect, it } from 'vitest'

import { sanitizeAutomaticPositionRecord } from './automatic-position-diagnostic'

const valid = {
  stage: 'controller',
  reason: 'trial-started',
  metrics: { width: 1920 },
  attemptId: '11111111-1111-4111-8111-111111111111',
  firstAt: 100,
  lastAt: 100,
  repeatCount: 1
}
it('fails closed for hostile getters, objects, nonfinite and invalid correlation metadata', () => {
  for (const patch of [
    {
      attemptId: {
        toString() {
          throw new Error('private exception')
        }
      }
    },
    {
      get attemptId() {
        throw new Error('private exception')
      }
    },
    { attemptId: 'account-identity' },
    { firstAt: Infinity },
    { lastAt: 99 },
    { repeatCount: 0 },
    { repeatCount: 1.5 },
    {
      get metrics() {
        throw new Error('private exception')
      }
    }
  ]) {
    const input = Object.create(null, {
      ...Object.getOwnPropertyDescriptors(valid),
      ...Object.getOwnPropertyDescriptors(patch)
    })
    expect(() => sanitizeAutomaticPositionRecord(input)).not.toThrow()
    expect(sanitizeAutomaticPositionRecord(input)).toBeNull()
  }
})
it('retains only approved finite scalar metrics and random attempt correlations', () => {
  expect(
    sanitizeAutomaticPositionRecord({
      ...valid,
      sessionKey: 'PRIVATE',
      image: 'PRIVATE',
      metrics: {
        width: 1920,
        scaleFactor: 1.25,
        frameGapMs: 52,
        confidenceHigh: true,
        height: Infinity,
        username: 'PRIVATE',
        windowId: 33,
        image: 'PRIVATE'
      }
    })
  ).toEqual({
    ...valid,
    metrics: {
      width: 1920,
      scaleFactor: 1.25,
      frameGapMs: 52,
      confidenceHigh: true
    }
  })
})
