import { type Rect, isRect } from '@shared/mayhem-assistant/model'

import { cardChrome } from './card-chrome'

export interface GamePixels {
  width: number
  height: number
  pixels: Uint8Array
}
export interface UiGeometryCache {
  version: 1
  width: number
  height: number
  cards: Rect[]
  shop: Rect | null
}

export interface LocatedCards {
  scale: number
  cardRects: Rect[]
  titleRects: Rect[]
}

export interface GameUiLocation {
  cards: LocatedCards | null
  shop: Rect | null
  mode: 'track' | 'search'
  reason: 'matched' | 'not-found' | 'ambiguous' | 'budget' | 'invalid-image'
  checks: number
  durationMs: number
}

type Probe = { x: number; y: number; orientation: number }
type CardPose = { x: number; y: number; scale: number }
type ShopPose = CardPose
const groups = cardChrome.groups.map((group) => {
  const bytes = Buffer.from(group.points, 'base64')
  const points: Probe[] = []
  for (let i = 0; i < bytes.length; i += 5)
    points.push({
      x: bytes.readUInt16LE(i),
      y: bytes.readUInt16LE(i + 2),
      orientation: bytes[i + 4]
    })
  return points
})
const SEARCH_BUDGET_MS = 80
const MAX_CANDIDATES = 96

class FrameEdges {
  private _gray: Uint8Array | null = null
  constructor(readonly image: GamePixels) {}
  gray(x: number, y: number) {
    const index = y * this.image.width + x
    if (this._gray) return this._gray[index]
    const i = index * 4
    const p = this.image.pixels
    return (p[i] * 29 + p[i + 1] * 150 + p[i + 2] * 77) >> 8
  }
  prepare() {
    if (this._gray) return this._gray
    const pixels = this.image.pixels
    const gray = new Uint8Array(this.image.width * this.image.height)
    for (let i = 0, j = 0; i < gray.length; i++, j += 4)
      gray[i] = (pixels[j] * 29 + pixels[j + 1] * 150 + pixels[j + 2] * 77) >> 8
    this._gray = gray
    return gray
  }
  edge(x: number, y: number, orientation: number, radius = 1) {
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const px = x + dx,
          py = y + dy
        if (px < 1 || py < 1 || px >= this.image.width - 1 || py >= this.image.height - 1) continue
        const a = orientation ? this.gray(px, py - 1) : this.gray(px - 1, py)
        const b = orientation ? this.gray(px, py + 1) : this.gray(px + 1, py)
        if (Math.abs(a - b) >= 8) return true
      }
    return false
  }
  bright(x: number, y: number) {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (x + dx >= 0 && y + dy >= 0 && x + dx < this.image.width && y + dy < this.image.height)
          if (this.gray(x + dx, y + dy) >= 110) return true
    return false
  }
}

function fits(
  image: Pick<GamePixels, 'width' | 'height'>,
  x: number,
  y: number,
  width: number,
  height: number
) {
  return x >= 0 && y >= 0 && x + width <= image.width && y + height <= image.height
}

function cardScore(edges: FrameEdges, pose: CardPose) {
  const { x, y, scale } = pose
  if (
    !fits(
      edges.image,
      x,
      y,
      Math.round(cardChrome.width * scale),
      Math.round(cardChrome.height * scale)
    )
  )
    return 0
  let score = 1
  for (const probes of groups) {
    let matched = 0
    for (let i = 0; i < probes.length; i++) {
      const p = probes[i]
      if (edges.edge(x + Math.round(p.x * scale), y + Math.round(p.y * scale), p.orientation))
        matched++
      if (matched + probes.length - i - 1 < probes.length * 0.9) return 0
    }
    score = Math.min(score, matched / probes.length)
    if (score < 0.9) return 0
  }
  // The blank inner header is also evidence: a busy world/text region cannot pass on edges alone.
  let blank = 0,
    count = 0
  for (let px = 78; px <= 350; px += 16) {
    const tx = x + Math.round(px * scale),
      ty = y + Math.round(10 * scale)
    if (!edges.edge(tx, ty, 0) && !edges.edge(tx, ty, 1)) blank++
    count++
  }
  return blank / count >= 0.8 ? score : 0
}

function cardsScore(edges: FrameEdges, pose: CardPose) {
  let score = 1
  for (const index of [0, 1, 2]) {
    score = Math.min(
      score,
      cardScore(edges, { ...pose, x: pose.x + Math.round(index * cardChrome.spacing * pose.scale) })
    )
    if (!score) return 0
  }
  return score
}

function cardLayout(pose: CardPose): LocatedCards {
  const { x, y, scale } = pose
  return {
    scale,
    cardRects: [0, 1, 2].map((index) => ({
      x: x + Math.round(index * cardChrome.spacing * scale),
      y,
      width: Math.round(cardChrome.width * scale),
      height: Math.round(cardChrome.height * scale)
    })),
    titleRects: [0, 1, 2].map((index) => ({
      x: x + Math.round((index * cardChrome.spacing + cardChrome.title[0]) * scale),
      y: y + Math.round(cardChrome.title[1] * scale),
      width: Math.round(cardChrome.title[2] * scale),
      height: Math.round(cardChrome.title[3] * scale)
    }))
  }
}

function lineMatches(
  edges: FrameEdges,
  x: number,
  y: number,
  length: number,
  vertical: boolean,
  scale: number
) {
  let matched = 0,
    count = 0
  for (let offset = 0; offset <= length; offset += 8) {
    if (
      edges.edge(
        Math.round(x + (vertical ? 0 : offset * scale)),
        Math.round(y + (vertical ? offset * scale : 0)),
        vertical ? 0 : 1
      )
    )
      matched++
    count++
  }
  return matched / count >= 0.9
}

function shopRect(pose: ShopPose): Rect {
  return {
    x: pose.x,
    y: pose.y,
    width: Math.round(1400 * pose.scale),
    height: Math.round(1000 * pose.scale)
  }
}

// Analytic shop geometry, not a copied calibration bitmap. The right-hand chrome stays clear of
// our equipment overlay when neither side has enough room; do not require an occluded left edge.
function shopMatches(edges: FrameEdges, pose: ShopPose) {
  const { x, y, scale } = pose
  const rect = shopRect(pose)
  if (!fits(edges.image, x, y, rect.width, rect.height)) return false
  const right = x + rect.width,
    cx = Math.round(right - 33 * scale),
    cy = Math.round(y + 31 * scale)
  let bright = 0,
    count = 0
  for (const t of [-8, -6, -4, 4, 6, 8]) {
    for (const diagonal of [-1, 1]) {
      if (edges.bright(cx + Math.round(t * scale), cy + Math.round(t * diagonal * scale))) bright++
      count++
    }
  }
  if (bright / count < 0.9) return false
  const background = [
    [-9, 0],
    [9, 0],
    [0, -9],
    [0, 9]
  ].map(([dx, dy]) => edges.gray(cx + Math.round(dx * scale), cy + Math.round(dy * scale)))
  if (background.some((value) => value > 65)) return false
  return (
    lineMatches(edges, right - 5 * scale, y + 12 * scale, 120, true, scale) &&
    lineMatches(edges, right - 550 * scale, y + 12 * scale, 120, true, scale) &&
    lineMatches(edges, right - 525 * scale, y + 2 * scale, 500, false, scale) &&
    lineMatches(edges, right - 525 * scale, y + 6 * scale, 500, false, scale)
  )
}

function nearby(a: CardPose, b: CardPose) {
  // Several pixel phases can describe the same 20px close glyph. Distinct controls remain ambiguous.
  return a.scale === b.scale && Math.abs(a.x - b.x) <= 8 && Math.abs(a.y - b.y) <= 8
}

export class GameUiLocator {
  private _cards: CardPose | null = null
  private _shop: ShopPose | null = null
  reset() {
    this._cards = this._shop = null
  }
  seed(value: unknown): UiGeometryCache | null {
    if (!value || typeof value !== 'object') return null
    const cache = value as UiGeometryCache
    if (
      cache.version !== 1 ||
      ![1920, 2560].includes(cache.width) ||
      cache.height !== (cache.width / 16) * 9 ||
      !Array.isArray(cache.cards) ||
      ![0, 3].includes(cache.cards.length) ||
      !cache.cards.every(isRect) ||
      (cache.shop !== null && !isRect(cache.shop))
    )
      return null
    const scale = cache.height / 1440
    const first = cache.cards[0]
    if (
      first &&
      !cache.cards.every(
        (rect, index) =>
          rect.x === first.x + Math.round(index * cardChrome.spacing * scale) &&
          rect.y === first.y &&
          rect.width === Math.round(cardChrome.width * scale) &&
          rect.height === Math.round(cardChrome.height * scale) &&
          fits(cache, rect.x, rect.y, rect.width, rect.height)
      )
    )
      return null
    if (
      cache.shop &&
      (cache.shop.width !== Math.round(1400 * scale) ||
        cache.shop.height !== Math.round(1000 * scale) ||
        !fits(cache, cache.shop.x, cache.shop.y, cache.shop.width, cache.shop.height))
    )
      return null
    this._cards = first ? { x: first.x, y: first.y, scale } : null
    this._shop = cache.shop ? { x: cache.shop.x, y: cache.shop.y, scale } : null
    return cache
  }
  locate(image: GamePixels, expectedScene?: 'cards' | 'shop'): GameUiLocation {
    const started = performance.now()
    let checks = 0
    const result = (
      cards: CardPose | null,
      shop: ShopPose | null,
      mode: GameUiLocation['mode'],
      reason: GameUiLocation['reason']
    ): GameUiLocation => {
      // Cached poses are only candidates. Every returned positive was verified on this frame.
      this._cards = cards ?? this._cards
      this._shop = shop ?? this._shop
      return {
        cards: cards ? cardLayout(cards) : null,
        shop: shop ? shopRect(shop) : null,
        mode,
        reason,
        checks,
        durationMs: performance.now() - started
      }
    }
    if (
      image.pixels.length !== image.width * image.height * 4 ||
      ![1920, 2560].includes(image.width) ||
      image.height !== (image.width / 16) * 9
    )
      return result(null, null, 'search', 'invalid-image')
    const edges = new FrameEdges(image)
    const scales = [image.height / 1440]
    if (
      expectedScene !== 'shop' &&
      this._cards?.scale === scales[0] &&
      cardsScore(edges, this._cards)
    )
      return result(this._cards, null, 'track', 'matched')
    if (
      expectedScene !== 'cards' &&
      this._shop?.scale === scales[0] &&
      shopMatches(edges, this._shop)
    )
      return result(null, this._shop, 'track', 'matched')
    if (expectedScene !== 'shop') {
      // This viewport prior is only a candidate. It never authorizes a scene without all three
      // independent frame proofs; changed layouts continue into the bounded full search below.
      const scale = scales[0]
      const seed = { x: Math.round(583 * scale), y: Math.round(256 * scale), scale }
      if (cardsScore(edges, seed)) return result(seed, null, 'search', 'matched')
    }
    // Card item panels can exhaust the stale-card candidate limit before the old
    // search ever reaches the shop. Verify the independent shop chrome first; cached
    // cards and the default card pose above still keep the common card path cheap.
    const gray = edges.prepare()
    let shop: ShopPose | null = null,
      overflow = false
    if (expectedScene !== 'cards') {
      const checkSegment = (start: number, end: number, row: number) => {
        const length = end - start
        for (const scale of scales) {
          if (length >= 400 * scale && length <= 1400 * scale) {
            const seed = {
              x: Math.round(end + 4 - 1400 * scale),
              y: Math.round(row - 4 * scale),
              scale
            }
            if (!fits(image, seed.x, seed.y, Math.round(1400 * scale), Math.round(1000 * scale)))
              continue
            if (++checks > MAX_CANDIDATES) {
              overflow = true
              return
            }
            for (let dy = -3; dy <= 3; dy++)
              for (let dx = -3; dx <= 3; dx++) {
                const pose = { ...seed, x: seed.x + dx, y: seed.y + dy }
                if (!shopMatches(edges, pose)) continue
                if (shop && !nearby(shop, pose)) {
                  overflow = true
                  return
                }
                shop ??= pose
              }
          }
        }
      }
      // Long horizontal edges generate candidates only. The independent features above accept them.
      for (let y = 1; y <= image.height - Math.round(1000 * scales[0]) + 8; y++) {
        if (y % 16 === 0 && performance.now() - started > SEARCH_BUDGET_MS)
          return result(null, null, 'search', 'budget')
        let start = -1,
          last = -1,
          gap = 0
        const above = (y - 1) * image.width,
          below = (y + 1) * image.width
        for (let x = 1; x < image.width - 1; x++) {
          if (Math.abs(gray[above + x] - gray[below + x]) >= 8) {
            if (start < 0) start = x
            last = x
            gap = 0
          } else if (start >= 0 && ++gap > 3) {
            if (last - start >= 250) checkSegment(start, last, y)
            start = -1
            if (overflow) return result(null, null, 'search', 'ambiguous')
          }
        }
        if (start >= 0 && last - start >= 250) checkSegment(start, last, y)
        if (overflow) return result(null, null, 'search', 'ambiguous')
      }
      if (shop) return result(null, shop, 'search', 'matched')
    }
    // Search a small neighborhood of the last pixel-verified card group first.
    // A move still requires every chrome probe; the previous pose supplies no evidence.
    if (expectedScene !== 'shop' && this._cards?.scale === scales[0]) {
      const previous = this._cards
      let local: CardPose | null = null,
        bestScore = 0
      for (let dy = -96; dy <= 96; dy += 4) {
        if (performance.now() - started > SEARCH_BUDGET_MS)
          return result(null, null, 'search', 'budget')
        for (let dx = -96; dx <= 96; dx += 4) {
          const x = previous.x + dx,
            y = previous.y + dy,
            scale = previous.scale
          if (
            !edges.edge(x + Math.round(4 * scale), y + Math.round(14 * scale), 0, 2) ||
            !edges.edge(x + Math.round(40 * scale), y + Math.round(2 * scale), 1, 2)
          )
            continue
          if (++checks > MAX_CANDIDATES) return result(null, null, 'search', 'ambiguous')
          for (let py = -2; py <= 2; py++)
            for (let px = -2; px <= 2; px++) {
              const pose = { x: x + px, y: y + py, scale }
              const score = cardsScore(edges, pose)
              if (!score) continue
              if (local && !nearby(local, pose)) return result(null, null, 'search', 'ambiguous')
              if (score > bestScore) {
                local = pose
                bestScore = score
              }
            }
        }
      }
      if (local) return result(local, null, 'track', 'matched')
    }
    let cards: CardPose | null = null
    let bestCardScore = 0
    for (const scale of expectedScene === 'shop' ? [] : scales) {
      const prefix = new Int32Array(image.width + 1)
      const span = Math.round(348 * scale)
      const topColumns = [0, 1, 2].map((index) =>
        Math.round((index * cardChrome.spacing + 40) * scale)
      )
      const maxX = image.width - Math.round((cardChrome.spacing * 2 + cardChrome.width) * scale)
      for (let y = 2; y <= image.height - Math.round(cardChrome.height * scale); y += 2) {
        if (y % 16 === 0 && performance.now() - started > SEARCH_BUDGET_MS)
          return result(null, null, 'search', 'budget')
        const row = y + Math.round(2 * scale)
        const above = (row - 1) * image.width,
          below = (row + 1) * image.width
        for (let x = 1; x < image.width - 1; x++)
          prefix[x + 1] = prefix[x] + Number(Math.abs(gray[above + x] - gray[below + x]) >= 8)
        for (let x = 4; x <= maxX; x += 4) {
          if (
            prefix[x + topColumns[0] + span] - prefix[x + topColumns[0]] < span * 0.9 ||
            prefix[x + topColumns[1] + span] - prefix[x + topColumns[1]] < span * 0.9 ||
            prefix[x + topColumns[2] + span] - prefix[x + topColumns[2]] < span * 0.9
          )
            continue
          if (
            ![0, 1, 2].every((index) => {
              const left = x + Math.round(index * cardChrome.spacing * scale)
              return (
                edges.edge(left + Math.round(4 * scale), y + Math.round(14 * scale), 0, 2) &&
                edges.edge(left + Math.round(424 * scale), y + Math.round(14 * scale), 0, 2)
              )
            })
          )
            continue
          if (++checks > MAX_CANDIDATES) return result(null, null, 'search', 'ambiguous')
          let best: CardPose | null = null,
            score = 0
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -2; dx <= 2; dx++) {
              const pose = { x: x + dx, y: y + dy, scale }
              const value = cardsScore(edges, pose)
              if (value > score) {
                score = value
                best = pose
              }
            }
          if (best) {
            if (
              cards &&
              (cards.scale !== best.scale ||
                Math.abs(cards.x - best.x) > 8 ||
                Math.abs(cards.y - best.y) > 4)
            )
              return result(null, null, 'search', 'ambiguous')
            if (score > bestCardScore) {
              cards = best
              bestCardScore = score
            }
          }
        }
      }
    }
    if (cards) return result(cards, null, 'search', 'matched')
    if (expectedScene === 'cards') return result(null, null, 'search', 'not-found')
    return result(null, null, 'search', 'not-found')
  }
}
