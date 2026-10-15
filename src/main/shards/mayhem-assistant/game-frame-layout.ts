import type { Rect } from '@shared/mayhem-assistant/model'

export interface PhysicalGameDisplay {
  id: string
  bounds: Rect
  scaleFactor: number
}

export interface GameFrameMapping {
  displayId: string
  displayBounds: Rect
  clientBounds: Rect
  scaleFactor: number
}

function contains(outer: Rect, inner: Rect) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

// Native client bounds and these display bounds must both be physical screen pixels.
// The caller converts Electron display.bounds through dipToScreenRect, including its origin.
export function resolveGameFrameMapping(client: Rect, displays: PhysicalGameDisplay[]) {
  if (
    !Object.values(client).every(Number.isInteger) ||
    ![1920, 2560].includes(client.width) ||
    client.height !== (client.width / 16) * 9
  )
    return { mapping: null, reason: 'client-size-unsupported' } as const
  const matches = displays.filter((display) => contains(display.bounds, client))
  if (matches.length !== 1) return { mapping: null, reason: 'client-display-not-unique' } as const
  const display = matches[0]
  return {
    mapping: {
      displayId: display.id,
      displayBounds: display.bounds,
      clientBounds: client,
      scaleFactor: display.scaleFactor
    } satisfies GameFrameMapping,
    reason: null
  } as const
}

export function gameClientCrop(
  mapping: GameFrameMapping,
  image: { width: number; height: number }
) {
  const display = mapping.displayBounds
  if (image.width !== display.width || image.height !== display.height) return null
  const client = mapping.clientBounds
  return {
    x: client.x - display.x,
    y: client.y - display.y,
    width: client.width,
    height: client.height
  }
}

// Only normalize a freshly validated pose. This is not positive evidence or a held frame.
export function normalizeCardGeometry(previous: Rect[] | null, current: Rect[], tolerance = 2) {
  return previous?.length === 3 &&
    current.length === 3 &&
    previous.every((rect, index) =>
      (['x', 'y', 'width', 'height'] as const).every(
        (key) => Math.abs(rect[key] - current[index][key]) <= tolerance
      )
    )
    ? previous
    : current
}
