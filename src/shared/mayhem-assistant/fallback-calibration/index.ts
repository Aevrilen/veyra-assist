import type { Rect } from '../model'

export type Scene = 'cards' | 'shop'
export interface GameFrame {
  width: number
  height: number
  /** BGRA, from the existing validated game-client capture only. */
  pixels: Uint8Array
  sourceSequence: number
  capturedAt: number
  sessionKey: string
  /** Existing capture window/source signature; invalidated on source replacement. */
  sourceKey: string
  foreground: boolean
}
type Probe = { x: number; y: number; axis: 'x' | 'y'; gray: number; contrast: number }
export interface FallbackCalibration {
  version: 1
  scene: Scene
  width: number
  height: number
  rect: Rect
  cardRects: Rect[]
  titleRects: Rect[]
  /** Sparse local chrome only; no screenshot or title pixels. */
  groups: Probe[][]
}
export const FALLBACK_FRAME_TTL = 1500
export const CALIBRATION_HINT = '请先打开游戏中的三卡或商店，再使用当前游戏截图框选完整区域。'

/** Validate persisted local data before using it. Never treat restored geometry as open evidence. */
export function readCalibration(value: unknown): FallbackCalibration | null {
  if (!value || typeof value !== 'object') return null
  const c = value as FallbackCalibration
  if (
    c.version !== 1 ||
    !['cards', 'shop'].includes(c.scene) ||
    ![1920, 2560].includes(c.width) ||
    c.height !== (c.width * 9) / 16 ||
    !c.rect ||
    !fits(c.rect, c.width, c.height) ||
    !Array.isArray(c.cardRects) ||
    !Array.isArray(c.titleRects) ||
    c.cardRects.length !== (c.scene === 'cards' ? 3 : 0) ||
    c.titleRects.length !== c.cardRects.length ||
    ![...c.cardRects, ...c.titleRects].every((r) => r && fits(r, c.width, c.height)) ||
    !Array.isArray(c.groups) ||
    c.groups.length !== (c.scene === 'cards' ? 15 : 4)
  )
    return null
  const referenceWidth = c.scene === 'cards' ? 1409 : 1400
  const referenceHeight = c.scene === 'cards' ? 704 : 1000
  const scale = c.rect.width / referenceWidth
  if (scale < 0.4 || scale > 1.5 || Math.abs(c.rect.height / referenceHeight / scale - 1) > 0.08)
    return null
  if (
    !c.groups.every(
      (g, index) =>
        Array.isArray(g) &&
        g.length >= 12 &&
        g.length <= 16 &&
        g.every(
          (p) =>
            p &&
            [p.x, p.y, p.gray, p.contrast].every(Number.isInteger) &&
            ['x', 'y'].includes(p.axis) &&
            p.x >= 0 &&
            p.y >= 0 &&
            p.x < c.rect.width &&
            p.y < c.rect.height &&
            p.gray >= 0 &&
            p.gray <= 255 &&
            (index >= (c.scene === 'cards' ? 9 : 3) || Math.abs(p.contrast) >= 12) &&
            Math.abs(p.contrast) <= 255
        )
    )
  )
    return null
  for (let index = 0; index < c.cardRects.length; index++) {
    const expected = [
      [c.cardRects[index], 490 * index, 0, 429, 704],
      [c.titleRects[index], 490 * index + 36, 318, 357, 42]
    ] as const
    for (const [rect, x, y, width, height] of expected) {
      if (
        rect.x !== c.rect.x + Math.round(x * scale) ||
        rect.y !== c.rect.y + Math.round(y * scale) ||
        rect.width !== Math.round(width * scale) ||
        rect.height !== Math.round(height * scale)
      )
        return null
    }
  }
  return c
}

function fits(rect: Rect, width: number, height: number) {
  return (
    Object.values(rect).every(Number.isInteger) &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x + rect.width <= width &&
    rect.y + rect.height <= height
  )
}
export function trustedFrame(frame: GameFrame, now: number) {
  return (
    frame.foreground &&
    !!frame.sessionKey &&
    !!frame.sourceKey &&
    Number.isInteger(frame.sourceSequence) &&
    frame.sourceSequence >= 0 &&
    Number.isFinite(frame.capturedAt) &&
    now >= frame.capturedAt &&
    now - frame.capturedAt <= FALLBACK_FRAME_TTL &&
    [1920, 2560].includes(frame.width) &&
    frame.height === (frame.width * 9) / 16 &&
    frame.pixels.length === frame.width * frame.height * 4
  )
}

/** Coordinates are relative to the displayed image content, not a letterboxed container or screen. */
export function mapSelection(
  selection: Rect,
  displayed: { width: number; height: number },
  physical: { width: number; height: number }
): Rect | null {
  if (
    ![displayed.width, displayed.height].every((n) => Number.isFinite(n) && n > 0) ||
    !Object.values(selection).every(Number.isFinite) ||
    selection.width <= 0 ||
    selection.height <= 0 ||
    selection.x < 0 ||
    selection.y < 0 ||
    selection.x + selection.width > displayed.width ||
    selection.y + selection.height > displayed.height
  )
    return null
  const x = Math.round((selection.x * physical.width) / displayed.width)
  const y = Math.round((selection.y * physical.height) / displayed.height)
  const right = Math.round(((selection.x + selection.width) * physical.width) / displayed.width)
  const bottom = Math.round(((selection.y + selection.height) * physical.height) / displayed.height)
  const rect = { x, y, width: right - x, height: bottom - y }
  return fits(rect, physical.width, physical.height) ? rect : null
}
function gray(frame: GameFrame, x: number, y: number) {
  const i = (y * frame.width + x) * 4
  return (frame.pixels[i] * 29 + frame.pixels[i + 1] * 150 + frame.pixels[i + 2] * 77) >> 8
}
function contrast(frame: GameFrame, x: number, y: number, axis: Probe['axis']) {
  return axis === 'x'
    ? gray(frame, x + 1, y) - gray(frame, x - 1, y)
    : gray(frame, x, y + 1) - gray(frame, x, y - 1)
}

/** Known layout proportions only. This never calls the automatic locator or OCR. */
export function prepareCalibration(
  frame: GameFrame,
  scene: Scene,
  rect: Rect,
  now: number
): FallbackCalibration {
  if (!trustedFrame(frame, now)) throw new Error('当前没有可用的游戏截图。请返回游戏后重试。')
  if (!fits(rect, frame.width, frame.height)) throw new Error('请在截图内重新框选。')
  const reference = scene === 'cards' ? { width: 1409, height: 704 } : { width: 1400, height: 1000 }
  const scale = frame.width / 2560
  if (
    Math.abs(rect.width - reference.width * scale) > 24 * scale ||
    Math.abs(rect.height - reference.height * scale) > 24 * scale
  )
    throw new Error('区域比例不符。请框选完整三卡或商店外框。')
  // Small surrounding margins do not become part of the layout. Use the
  // supported physical layout centred in the selection, then learn only chrome.
  rect = {
    x: Math.round(rect.x + (rect.width - reference.width * scale) / 2),
    y: Math.round(rect.y + (rect.height - reference.height * scale) / 2),
    width: Math.round(reference.width * scale),
    height: Math.round(reference.height * scale)
  }
  if (!fits(rect, frame.width, frame.height)) throw new Error('请重新框选完整区域。')
  const transform = (x: number, y: number, width: number, height: number): Rect => ({
    x: rect.x + Math.round(x * scale),
    y: rect.y + Math.round(y * scale),
    width: Math.round(width * scale),
    height: Math.round(height * scale)
  })
  const cardRects = scene === 'cards' ? [0, 490, 980].map((x) => transform(x, 0, 429, 704)) : []
  const titleRects =
    scene === 'cards' ? [0, 490, 980].map((x) => transform(x + 36, 318, 357, 42)) : []
  if (![...cardRects, ...titleRects].every((r) => fits(r, frame.width, frame.height)))
    throw new Error('请重新框选完整区域。')
  // Each independent spatial group must retain a line of chrome. Content and titles are excluded.
  const lines: Array<[number, number, number, Probe['axis']]> =
    scene === 'cards'
      ? [0, 490, 980].flatMap((x): Array<[number, number, number, Probe['axis']]> => [
          [x + 40, 2, 340, 'y'],
          [x + 29, 52, 200, 'x'],
          [x + 400, 52, 200, 'x']
        ])
      : [
          [1395, 12, 120, 'x'],
          [850, 12, 120, 'x'],
          [875, 2, 480, 'y']
        ]
  const groups = lines.map(([x, y, length, axis]) => {
    let probes: Probe[] = []
    let bestScore = 0
    // A whole line shares one offset. Do not gather unrelated strongest pixels
    // from character artwork independently for every sample.
    for (let d = -Math.ceil(5 * scale); d <= Math.ceil(5 * scale); d++) {
      const candidate: Probe[] = []
      for (let i = 0; i < 16; i++) {
        const offset = (length * (i + 0.5)) / 16
        const px = rect.x + Math.round((x + (axis === 'y' ? offset : 0)) * scale)
        const py = rect.y + Math.round((y + (axis === 'x' ? offset : 0)) * scale)
        const tx = px + (axis === 'x' ? d : 0),
          ty = py + (axis === 'y' ? d : 0)
        // Keep the sample and both gradient neighbours inside the selected
        // geometry, matching the persisted-data contract exactly.
        if (
          tx < rect.x + 1 ||
          ty < rect.y + 1 ||
          tx >= rect.x + rect.width - 1 ||
          ty >= rect.y + rect.height - 1
        )
          continue
        if (tx < 1 || ty < 1 || tx >= frame.width - 1 || ty >= frame.height - 1) continue
        const c = contrast(frame, tx, ty, axis)
        if (Math.abs(c) >= 12)
          candidate.push({
            x: tx - rect.x,
            y: ty - rect.y,
            axis,
            gray: gray(frame, tx, ty),
            contrast: c
          })
      }
      const score =
        candidate.length * 256 + candidate.reduce((sum, p) => sum + Math.abs(p.contrast), 0) / 16
      if (score > bestScore) {
        bestScore = score
        probes = candidate
      }
    }
    if (probes.length < 12) throw new Error('未找到完整边框。请重新框选，避免遮挡。')
    return probes
  })
  // Local ornament/glyph signatures distinguish real chrome from generic
  // straight black borders. They stay in the top chrome, outside card artwork.
  const ornaments =
    scene === 'cards'
      ? [0, 490, 980].flatMap((x) => [
          [x + 4, 2, 28, 14],
          [x + 397, 2, 28, 14]
        ])
      : [[1355, 19, 24, 24]]
  for (const [x, y, width, height] of ornaments) {
    const group: Probe[] = []
    for (let row = 0; row < 4; row++)
      for (let column = 0; column < 4; column++) {
        const px = Math.round((x + (width * (column + 0.5)) / 4) * scale)
        const py = Math.round((y + (height * (row + 0.5)) / 4) * scale)
        const tx = rect.x + px,
          ty = rect.y + py
        group.push({
          x: px,
          y: py,
          axis: 'x',
          gray: gray(frame, tx, ty),
          contrast: contrast(frame, tx, ty, 'x')
        })
      }
    if (Math.max(...group.map((p) => p.gray)) - Math.min(...group.map((p) => p.gray)) < 15)
      throw new Error('未找到完整边框。请重新框选，避免遮挡。')
    groups.push(group)
  }
  return {
    version: 1,
    scene,
    width: frame.width,
    height: frame.height,
    rect: { ...rect },
    cardRects,
    titleRects,
    groups
  }
}

function matches(frame: GameFrame, calibration: FallbackCalibration, rect: Rect) {
  if (!fits(rect, frame.width, frame.height)) return false
  for (const group of calibration.groups) {
    let matched = 0
    for (const p of group) {
      const x = rect.x + p.x,
        y = rect.y + p.y
      if (x < 1 || y < 1 || x >= frame.width - 1 || y >= frame.height - 1) return false
      if (
        Math.abs(gray(frame, x, y) - p.gray) <= 20 &&
        Math.abs(contrast(frame, x, y, p.axis) - p.contrast) <= 24
      )
        matched++
    }
    if (matched / group.length < 0.85) return false
  }
  return true
}
/** A frozen preview may be inspected at human speed; saving requires this new-frame check. */
export function validateCalibrationFrame(
  calibration: FallbackCalibration,
  frame: GameFrame,
  now: number
) {
  return (
    trustedFrame(frame, now) &&
    frame.width === calibration.width &&
    frame.height === calibration.height &&
    matches(frame, calibration, calibration.rect)
  )
}
export function fallbackPlacement(calibration: FallbackCalibration, rect: Rect) {
  const shift = (r: Rect) => ({
    ...r,
    x: r.x + rect.x - calibration.rect.x,
    y: r.y + rect.y - calibration.rect.y
  })
  return {
    cardRects: calibration.cardRects.map(shift),
    titleRects: calibration.titleRects.map(shift),
    shopRect: calibration.scene === 'shop' ? rect : null
  }
}
export interface FallbackResult {
  /** false only for duplicate: ignore this observation, preserve prior output
   * without extending its original 1500ms deadline. All other results replace it. */
  shouldUpdate: boolean
  visible: boolean
  rect: Rect | null
  reason:
    | 'untrusted'
    | 'resolution-changed'
    | 'duplicate'
    | 'not-found'
    | 'ambiguous'
    | 'confirming'
    | 'matched'
}
/** Runtime only. The caller owns capture, persistence and overlay placement. */
export class FallbackTracker {
  private _calibration: FallbackCalibration | null = null
  private _session: string | null = null
  private _source: string | null = null
  private _sequence = -1
  private _capturedAt = -1
  private _pending: Rect | null = null
  private _pose: Rect | null = null
  reset() {
    this._session = null
    this._source = null
    this._sequence = this._capturedAt = -1
    this._pending = this._pose = null
  }
  evaluate(calibration: FallbackCalibration, frame: GameFrame, now: number): FallbackResult {
    const hidden = (reason: FallbackResult['reason']): FallbackResult => ({
      shouldUpdate: true,
      visible: false,
      rect: null,
      reason
    })
    if (this._calibration !== calibration) {
      this.reset()
      this._calibration = calibration
    }
    if (!trustedFrame(frame, now)) {
      this.reset()
      return hidden('untrusted')
    }
    if (frame.width !== calibration.width || frame.height !== calibration.height) {
      this.reset()
      return hidden('resolution-changed')
    }
    if (this._session !== frame.sessionKey || this._source !== frame.sourceKey) {
      this.reset()
      this._session = frame.sessionKey
      this._source = frame.sourceKey
    }
    if (frame.sourceSequence <= this._sequence || frame.capturedAt <= this._capturedAt) {
      if (now - this._capturedAt > FALLBACK_FRAME_TTL) {
        this.reset()
        return hidden('untrusted')
      }
      return { ...hidden('duplicate'), shouldUpdate: false }
    }
    if (frame.capturedAt - this._capturedAt > FALLBACK_FRAME_TTL) this._pending = null
    this._sequence = frame.sourceSequence
    this._capturedAt = frame.capturedAt
    const origin = this._pose ?? calibration.rect
    // Independent local search. Large drags fail closed and request one new selection.
    const radius = calibration.scene === 'shop' ? 48 : 6
    let found: Rect | null = null
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const rect = { ...origin, x: origin.x + dx, y: origin.y + dy }
        if (!matches(frame, calibration, rect)) continue
        if (found && (Math.abs(found.x - rect.x) > 3 || Math.abs(found.y - rect.y) > 3)) {
          this._pending = null
          return hidden('ambiguous')
        }
        found ??= rect
      }
    if (!found) {
      this._pending = null
      return hidden('not-found')
    }
    const confirmed =
      !!this._pending &&
      Math.abs(this._pending.x - found.x) <= 3 &&
      Math.abs(this._pending.y - found.y) <= 3
    this._pending = this._pose = found
    return {
      shouldUpdate: true,
      visible: confirmed,
      rect: confirmed ? found : null,
      reason: confirmed ? 'matched' : 'confirming'
    }
  }
}
