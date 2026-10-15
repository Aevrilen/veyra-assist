import type { Calibration, Rect } from '@shared/mayhem-assistant/model'

// Only the middle-card tooltip witnessed in the 2560x1440 recording is supported.
// All three title ROIs overlap it. Other calibrated layouts use the ordinary path.
const TITLE_RECTS: Rect[] = [619, 1109, 1599].map((x) => ({
  x,
  y: 574,
  width: 357,
  height: 42
}))
const CARD_RECTS: Rect[] = [583, 1073, 1563].map((x) => ({
  x,
  y: 256,
  width: 429,
  height: 704
}))
const MARKER_RECTS: Rect[] = [588, 1963].map((x) => ({
  x,
  y: 818,
  width: 24,
  height: 24
}))
const GOLD_STRIPS: Rect[] = [
  { x: 816, y: 560, width: 935, height: 1 },
  { x: 814, y: 562, width: 1, height: 90 },
  { x: 1752, y: 562, width: 1, height: 90 },
  { x: 827, y: 666, width: 914, height: 1 }
]
const DARK_HEADER: Rect = { x: 950, y: 567, width: 780, height: 8 }

function sameRects(actual: Rect[], expected: Rect[]) {
  return (
    actual.length === expected.length &&
    actual.every(
      (rect, i) =>
        rect.x === expected[i].x &&
        rect.y === expected[i].y &&
        rect.width === expected[i].width &&
        rect.height === expected[i].height
    )
  )
}
function fraction(pixels: Uint8Array, matches: (r: number, g: number, b: number) => boolean) {
  let count = 0
  for (let i = 0; i < pixels.length; i += 4)
    if (pixels[i + 3] === 255 && matches(pixels[i + 2], pixels[i + 1], pixels[i])) count++
  return count / (pixels.length / 4)
}

// The caller must separately require positive card markers, no shop, and a fresh capture.
export function hasRecordedMiddleTooltip(
  calibration: Calibration,
  bitmap: (rect: Rect) => Uint8Array
) {
  if (
    !sameRects(calibration.titleRects, TITLE_RECTS) ||
    !sameRects(calibration.cardRects, CARD_RECTS) ||
    !sameRects(
      calibration.cards.map((marker) => marker.rect),
      MARKER_RECTS
    )
  )
    return false
  return (
    GOLD_STRIPS.every(
      (rect) =>
        fraction(
          bitmap(rect),
          (r, g, b) => r > g + 8 && g > b + 28 && r >= 80 && r <= 180 && g >= 65 && g <= 165
        ) >= 0.99
    ) && fraction(bitmap(DARK_HEADER), (r, g, b) => Math.max(r, g, b) <= 35) >= 0.995
  )
}

// The same witnessed banner, expressed relative to a freshly located card group.
// A small registration search handles pixel-phase jitter; every original color/opacity threshold
// still has to pass. This never uses a bound card name as evidence for an occluded scene.
export function hasAutomaticTitleTooltip(
  layout: Pick<Calibration, 'cardRects' | 'titleRects'>,
  bitmap: (rect: Rect) => Uint8Array
) {
  if (layout.cardRects.length !== 3 || layout.titleRects.length !== 3) return false
  const first = layout.cardRects[0]
  const scale = first.height / 704
  if (
    ![1, 0.75].includes(scale) ||
    !layout.cardRects.every(
      (rect, index) =>
        rect.width === Math.round(429 * scale) &&
        rect.height === first.height &&
        rect.y === first.y &&
        rect.x === first.x + Math.round(index * 490 * scale)
    )
  )
    return false
  if (
    !layout.titleRects.every(
      (rect, index) =>
        rect.x === layout.cardRects[index].x + Math.round(36 * scale) &&
        rect.y === first.y + Math.round(318 * scale) &&
        rect.width === Math.round(357 * scale) &&
        rect.height === Math.round(42 * scale)
    )
  )
    return false
  const translated = (rect: Rect, dx: number, dy: number): Rect => ({
    x: first.x - Math.round(583 * scale) + Math.round(rect.x * scale) + dx,
    y: first.y - Math.round(256 * scale) + Math.round(rect.y * scale) + dy,
    width: Math.max(1, Math.round(rect.width * scale)),
    height: Math.max(1, Math.round(rect.height * scale))
  })
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      if (
        GOLD_STRIPS.every(
          (rect) =>
            fraction(
              bitmap(translated(rect, dx, dy)),
              (r, g, b) => r > g + 8 && g > b + 28 && r >= 80 && r <= 180 && g >= 65 && g <= 165
            ) >= 0.99
        ) &&
        fraction(bitmap(translated(DARK_HEADER, dx, dy)), (r, g, b) => Math.max(r, g, b) <= 35) >=
          0.995
      )
        return true
    }
  return false
}
