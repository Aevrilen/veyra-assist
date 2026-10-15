import {
  type Calibration,
  type Rect,
  type ShopAnchor,
  type ShopAnchorPatch,
  isShopAnchor,
  matchesMarkers
} from '@shared/mayhem-assistant/model'

export interface ShopBitmap extends Rect {
  pixels: Uint8Array
}
export interface ShopImage {
  bitmap: (rect?: Rect) => ShopBitmap
  pixels: (rect: Rect) => number[]
}
type Point = { x: number; y: number; b: number; g: number; r: number }
type Template = { rect: Rect; points: Point[] }
type Limits = { minX: number; maxX: number; minY: number; maxY: number }
export interface ShopLocation {
  rect: Rect | null
  mode: 'search' | 'track' | 'throttled'
  reason:
    | 'matched'
    | 'not-found'
    | 'ambiguous'
    | 'candidate-overflow'
    | 'cancelled'
    | 'invalid-anchors'
    | 'throttled'
}
const yieldWork = () => new Promise<void>((resolve) => setImmediate(resolve))

function template(patch: ShopAnchorPatch): Template {
  const points: Point[] = []
  for (let y = 0; y < patch.rect.height; y += 2)
    for (let x = 0; x < patch.rect.width; x += 2) {
      const i = (y * patch.rect.width + x) * 4
      points.push({ x, y, b: patch.pixels[i], g: patch.pixels[i + 1], r: patch.pixels[i + 2] })
    }
  return { rect: patch.rect, points }
}
function difference(image: ShopBitmap, points: Point[], x: number, y: number, limit: number) {
  let sum = 0
  const budget = limit * points.length * 3 * 255
  for (const p of points) {
    const i = ((y + p.y - image.y) * image.width + x + p.x - image.x) * 4
    sum +=
      Math.abs(image.pixels[i] - p.b) +
      Math.abs(image.pixels[i + 1] - p.g) +
      Math.abs(image.pixels[i + 2] - p.r)
    if (sum > budget) return Infinity
  }
  return sum / (points.length * 3 * 255)
}
function region(image: ShopBitmap, rect: Rect) {
  const pixels: number[] = []
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    const start = ((y - image.y) * image.width + rect.x - image.x) * 4
    for (let i = start; i < start + rect.width * 4; i++) pixels.push(image.pixels[i])
  }
  return pixels
}
export function createShopAnchor(image: ShopBitmap, shop: Rect): ShopAnchor {
  // These offsets describe the supported 2560x1440 shop chrome, relative to its right edge.
  const right = shop.x + shop.width
  const patch = (x: number, y: number, width: number, height: number): ShopAnchorPatch => {
    const rect = { x: right - x, y: shop.y + y, width, height }
    return { rect, pixels: region(image, rect) }
  }
  const anchor: ShopAnchor = {
    version: 1,
    close: patch(50, 14, 34, 34),
    title: patch(521, 26, 98, 30),
    border: patch(11, 8, 8, 130),
    divider: patch(552, 10, 8, 126)
  }
  if (!isShopAnchor(anchor, shop)) throw new Error('商店锚点无效，请框选完整商店边框')
  return anchor
}

// The cheap X probes only generate candidates. All four chrome patches and the
// caller's marker check must agree; two separate locations are rejected.
export async function scanShopAnchors(
  image: ShopBitmap,
  anchor: ShopAnchor,
  shop: Rect,
  accepts: (rect: Rect) => boolean,
  limits?: Limits,
  current = () => true,
  yieldScan = yieldWork
): Promise<{ rect: Rect | null; reason: ShopLocation['reason'] }> {
  const patches = [anchor.close, anchor.title, anchor.border, anchor.divider].map(template)
  const close = patches[0]
  const bright = close.points.filter((p) => Math.min(p.b, p.g, p.r) > 115)
  const dark = close.points.filter((p) => Math.max(p.b, p.g, p.r) < 60)
  if (bright.length < 4 || dark.length < 2) return { rect: null, reason: 'invalid-anchors' }
  const probes = [
    bright[0],
    bright[Math.floor(bright.length / 3)],
    bright[Math.floor((bright.length * 2) / 3)],
    bright[bright.length - 1],
    dark[0],
    dark[dark.length - 1]
  ]
  const full = {
    minX: -shop.x,
    maxX: 2560 - shop.x - shop.width,
    minY: -shop.y,
    maxY: 1440 - shop.y - shop.height
  }
  const bounds = limits
    ? {
        minX: Math.max(full.minX, limits.minX),
        maxX: Math.min(full.maxX, limits.maxX),
        minY: Math.max(full.minY, limits.minY),
        maxY: Math.min(full.maxY, limits.maxY)
      }
    : full
  let checks = 0
  let match: Rect | null = null
  // Scan every pixel phase. Even stride 2 can miss an odd-position sharp template.
  for (let dy = bounds.minY, row = 0; dy <= bounds.maxY; dy++, row++) {
    if (row % 8 === 0) {
      if (!current()) return { rect: null, reason: 'cancelled' }
      await yieldScan()
    }
    for (let dx = bounds.minX; dx <= bounds.maxX; dx++) {
      if (match && Math.abs(shop.x + dx - match.x) <= 3 && Math.abs(shop.y + dy - match.y) <= 3)
        continue
      const x = close.rect.x + dx,
        y = close.rect.y + dy
      if (
        difference(image, probes, x, y, 0.14) > 0.14 ||
        difference(image, close.points, x, y, 0.1) > 0.1
      )
        continue
      if (++checks > 64) return { rect: null, reason: 'candidate-overflow' }
      let best = { dx, dy, score: Infinity }
      for (let ry = -1; ry <= 1; ry++)
        for (let rx = -1; rx <= 1; rx++) {
          const tx = dx + rx,
            ty = dy + ry
          if (tx < full.minX || tx > full.maxX || ty < full.minY || ty > full.maxY) continue
          const score = difference(
            image,
            close.points,
            close.rect.x + tx,
            close.rect.y + ty,
            best.score
          )
          if (score < best.score) best = { dx: tx, dy: ty, score }
        }
      if (
        !patches.every(
          (p) => difference(image, p.points, p.rect.x + best.dx, p.rect.y + best.dy, 0.055) <= 0.055
        )
      )
        continue
      const rect = { ...shop, x: shop.x + best.dx, y: shop.y + best.dy }
      if (!accepts(rect)) continue
      if (match && (Math.abs(rect.x - match.x) > 3 || Math.abs(rect.y - match.y) > 3))
        return { rect: null, reason: 'ambiguous' }
      match = rect
    }
  }
  return current()
    ? { rect: match, reason: match ? 'matched' : 'not-found' }
    : { rect: null, reason: 'cancelled' }
}

export class ShopLocator {
  private _rect: Rect | null = null
  private _nextSearchAt = 0
  reset() {
    this._rect = null
    this._nextSearchAt = 0
  }
  async locate(
    calibration: Calibration,
    source: ShopImage,
    now: number,
    current = () => true
  ): Promise<ShopLocation> {
    const previous = this._rect
    let mode: ShopLocation['mode'] = previous ? 'track' : 'search'
    if (!previous && now < this._nextSearchAt)
      return { rect: null, mode: 'throttled', reason: 'throttled' }
    if (!calibration.shopAnchor) return { rect: null, mode, reason: 'invalid-anchors' }
    if (!previous) this._nextSearchAt = now + 2000
    const shop = calibration.shopRect
    const { close, title, border, divider } = calibration.shopAnchor
    const patches = [close, title, border, divider]
    let crop: Rect | undefined
    if (previous) {
      const dx = previous.x - shop.x,
        dy = previous.y - shop.y
      const x = Math.max(0, Math.min(...patches.map((p) => p.rect.x)) + dx - 33)
      const y = Math.max(0, Math.min(...patches.map((p) => p.rect.y)) + dy - 33)
      crop = {
        x,
        y,
        width:
          Math.min(2560, Math.max(...patches.map((p) => p.rect.x + p.rect.width)) + dx + 33) - x,
        height:
          Math.min(1440, Math.max(...patches.map((p) => p.rect.y + p.rect.height)) + dy + 33) - y
      }
    }
    const image = source.bitmap(crop)
    const limits = previous
      ? {
          minX: previous.x - shop.x - 32,
          maxX: previous.x - shop.x + 32,
          minY: previous.y - shop.y - 32,
          maxY: previous.y - shop.y + 32
        }
      : undefined
    const accepts = (rect: Rect) => {
      const dx = rect.x - shop.x,
        dy = rect.y - shop.y
      const translated = calibration.shop.map((m) => ({
        ...m,
        rect: { ...m.rect, x: m.rect.x + dx, y: m.rect.y + dy }
      }))
      if (
        translated.some(
          (m) =>
            m.rect.x < 0 ||
            m.rect.y < 0 ||
            m.rect.x + m.rect.width > 2560 ||
            m.rect.y + m.rect.height > 1440
        )
      )
        return false
      return matchesMarkers(
        translated,
        translated.map((m) => source.pixels(m.rect))
      )
    }
    let result = await scanShopAnchors(
      image,
      calibration.shopAnchor,
      shop,
      accepts,
      limits,
      current
    )
    // A drag can move farther than the cheap +/-32 tracking region between captures.
    // Reacquire from this same fresh frame rather than publishing a false close.
    // A real close still returns null; this never retains an unverified old location.
    if (previous && result.reason === 'not-found' && current()) {
      mode = 'search'
      result = await scanShopAnchors(
        source.bitmap(),
        calibration.shopAnchor,
        shop,
        accepts,
        undefined,
        current
      )
    }
    if (current()) this._rect = result.rect
    return { ...result, mode }
  }
}
