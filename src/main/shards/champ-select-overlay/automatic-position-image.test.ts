import type { AutomaticPositionContext } from '@shared/champ-select-overlay/automatic-position'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  observeAutomaticPositionImage,
  observeOfflineAutomaticPositionImage
} from './automatic-position-image'
import type { CapturedPosition } from './position-calibration-controller'

const mocks = vi.hoisted(() => ({ display: vi.fn(), decode: vi.fn() }))
vi.mock('electron', () => ({
  screen: { getDisplayMatching: mocks.display },
  nativeImage: { createFromDataURL: mocks.decode }
}))
function setup() {
  const rect = { x: 100, y: 100, width: 1280, height: 720 }
  const context: AutomaticPositionContext = {
    sessionKey: 'PRIVATE_SESSION',
    pid: 42,
    windowHandle: 'PRIVATE_WINDOW',
    displayId: 'PRIVATE_DISPLAY',
    physicalClient: rect,
    dipClient: rect,
    counts: { candidates: 3, teammates: 5 },
    foreground: true,
    phase: 'ChampSelect'
  }
  const capture: CapturedPosition = {
    imageUrl: 'PRIVATE_IMAGE',
    width: 1280,
    height: 720,
    client: rect,
    workArea: rect,
    capture: {
      startedAt: 100,
      finishedAt: 200,
      physicalClient: rect,
      physicalDisplay: rect,
      displayId: 'PRIVATE_DISPLAY',
      scaleFactor: 1,
      geometryCheck: 'bracketed'
    }
  }
  const image = {
    isEmpty: vi.fn(() => false),
    getSize: vi.fn(() => ({ width: 1280, height: 720 })),
    toBitmap: vi.fn(() => Buffer.alloc(1280 * 720 * 4))
  }
  mocks.display.mockReturnValue({ id: 'PRIVATE_DISPLAY', scaleFactor: 1 })
  mocks.decode.mockReturnValue(image)
  const diagnostic = vi.fn()
  return { context, capture, image, diagnostic }
}
beforeEach(() => vi.clearAllMocks())
describe('image boundary reason codes', () => {
  it.each([
    'missing-capture-evidence',
    'display-changed',
    'scale-changed',
    'empty-image',
    'image-size-mismatch',
    'bitmap-length-mismatch'
  ] as const)('reports %s without image or identity data', (reason) => {
    const f = setup()
    if (reason === 'missing-capture-evidence') f.capture.capture = undefined
    if (reason === 'display-changed')
      mocks.display.mockReturnValue({
        id: 'OTHER_PRIVATE_DISPLAY',
        scaleFactor: 1
      })
    if (reason === 'scale-changed')
      mocks.display.mockReturnValue({
        id: 'PRIVATE_DISPLAY',
        scaleFactor: 1.25
      })
    if (reason === 'empty-image') f.image.isEmpty.mockReturnValue(true)
    if (reason === 'image-size-mismatch')
      f.image.getSize.mockReturnValue({ width: 1600, height: 900 })
    if (reason === 'bitmap-length-mismatch') f.image.toBitmap.mockReturnValue(Buffer.alloc(1))
    expect(observeAutomaticPositionImage(f.capture, f.context, 1, f.diagnostic)).toBeNull()
    expect(f.diagnostic).toHaveBeenCalledWith(expect.objectContaining({ stage: 'image', reason }))
    expect(JSON.stringify(f.diagnostic.mock.calls)).not.toContain('PRIVATE')
  })
  it('passes converted pixels to the exact provider and reports blank chrome rejection', () => {
    const f = setup()
    expect(observeAutomaticPositionImage(f.capture, f.context, 1, f.diagnostic)).toBeNull()
    expect(f.diagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'provider',
        reason: 'bench-slot-edges',
        metrics: expect.objectContaining({ benchSlot: 0, benchEdges: 0 })
      })
    )
  })
})

describe('sealed pair offline image analysis', () => {
  it('does not require any current display or open client once a frame is sealed', () => {
    const f = setup()
    mocks.display.mockImplementation(() => {
      throw Error('client closed')
    })
    expect(() =>
      observeOfflineAutomaticPositionImage(f.capture, f.context, 1, f.diagnostic)
    ).not.toThrow()
    expect(mocks.display).not.toHaveBeenCalled()
    expect(f.diagnostic).toHaveBeenCalledWith(expect.objectContaining({ stage: 'provider' }))
  })
})
