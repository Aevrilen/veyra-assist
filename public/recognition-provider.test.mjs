import assert from 'node:assert/strict'
import test from 'node:test'

import { createMockRecognitionProvider } from './recognition-provider.mjs'

test('mock results are explicit, isolated from consumers, and cleared on reset', () => {
  const provider = createMockRecognitionProvider()
  assert.equal(provider.getSnapshot().status, 'unavailable')
  provider.showExample()
  const result = provider.getSnapshot()
  assert.equal(result.kind, 'mock')
  assert.equal(result.liveRecognition, false)
  assert.equal(result.status, 'ready')
  assert.equal(result.cards[0].title, 'Example A')
  result.cards[0].title = 'Changed by a consumer'
  assert.equal(provider.getSnapshot().cards[0].title, 'Example A')
  provider.reset()
  assert.deepEqual(provider.getSnapshot().cards, [null, null, null])
  assert.equal(provider.getSnapshot().status, 'unavailable')
})
