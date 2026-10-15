import { type PositionPreview, positionPreviewCrop } from '../position-calibration'
import { type AutomaticPositionContext, automaticPositionContextKey } from './index'
import type { GrayClientFrame } from './legacy-layout-provider'

/** Offline screen pixels with caller-supplied native snapshots around the same capture. */
export function prepareAutomaticPositionFrame(input: {
  image: { width: number; height: number; pixels: Uint8Array }
  physicalDisplay: PositionPreview['client']
  before: AutomaticPositionContext
  after: AutomaticPositionContext
  sequence: number
  capturedAt: number
}): GrayClientFrame | null {
  const { image, before, after } = input
  if (
    !before.foreground ||
    !after.foreground ||
    before.phase !== 'ChampSelect' ||
    after.phase !== 'ChampSelect' ||
    automaticPositionContextKey(before) !== automaticPositionContextKey(after) ||
    !Number.isInteger(image.width) ||
    !Number.isInteger(image.height) ||
    image.width <= 0 ||
    image.height <= 0 ||
    image.pixels.length !== image.width * image.height
  )
    return null
  const crop = positionPreviewCrop(after.physicalClient, input.physicalDisplay, image)
  if (!crop || ![crop.x, crop.y, crop.width, crop.height].every(Number.isInteger)) return null
  const pixels = new Uint8Array(crop.width * crop.height)
  for (let y = 0; y < crop.height; y++) {
    const start = (crop.y + y) * image.width + crop.x
    pixels.set(image.pixels.subarray(start, start + crop.width), y * crop.width)
  }
  return {
    width: crop.width,
    height: crop.height,
    pixels,
    sequence: input.sequence,
    capturedAt: input.capturedAt,
    // Bind these pixels to a value snapshot. Later mutations of the caller's native state
    // must not relabel an old screenshot as belonging to a moved/resized/new window.
    context: {
      ...after,
      physicalClient: { ...after.physicalClient },
      dipClient: { ...after.dipClient },
      counts: { ...after.counts }
    }
  }
}
