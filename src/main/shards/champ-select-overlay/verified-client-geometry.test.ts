import assert from 'node:assert/strict'
import { test } from 'vitest'

import { GEOMETRY_PROBE, isVerifiedBorderlessClient } from './verified-client-geometry-executor'

const rect = { x: -1280, y: 0, width: 1280, height: 720 }
const sample = () => ({
  ownerProcessId: 42,
  windowHandle: '12345',
  client: { ...rect },
  window: { ...rect },
  extended: { ...rect },
  isForeground: true,
  isVisible: true,
  isMinimized: false
})
test('exact physical borderless contract', () =>
  assert.equal(isVerifiedBorderlessClient(sample(), '12345', 42, rect), true))
test('decorated/scaled/shadowed/client translated source rejected', () => {
  for (const field of ['client', 'window', 'extended'] as const) {
    const g = sample()
    g[field].y += 1
    assert.equal(isVerifiedBorderlessClient(g, '12345', 42, rect), false)
  }
})
test('owner/HWND/focus mismatch rejected', () => {
  for (const patch of [
    { ownerProcessId: 43 },
    { windowHandle: '999' },
    { isForeground: false },
    { isVisible: false },
    { isMinimized: true }
  ])
    assert.equal(isVerifiedBorderlessClient({ ...sample(), ...patch }, '12345', 42, rect), false)
})
test('probe does not contain input, screenshot or state-changing window APIs', () =>
  assert.doesNotMatch(
    GEOMETRY_PROBE,
    /SetForegroundWindow|SetWindowPos|SendInput|PrintWindow|BitBlt|CopyFromScreen/
  ))
