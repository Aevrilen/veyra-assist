import type { StartingEquipmentPreferences } from './starting-equipment'

export type Rarity = 'silver' | 'gold' | 'prismatic'
export type Category = 'items' | 'shoes' | 'core' | 'starting'
export const EQUIPMENT_PANEL_WIDTH = 640
export const EQUIPMENT_CONTROLS_HEIGHT = 88
export const EQUIPMENT_ACTIONS_WIDTH = 210
export const EQUIPMENT_ACTIONS_HEIGHT = 48
export const MAX_EQUIPMENT_ROWS = 128
export type EquipmentBuildView = 'standard' | 'augment'
export interface RuleItemBinding {
  id: number
  mode: 'KIWI'
  provenance: 'reviewed' | 'offline-fixture'
}
export interface EquipmentRuleBindings {
  guardianBlade: RuleItemBinding | null
  guardianHorn: RuleItemBinding | null
  torch: RuleItemBinding | null
  luden: RuleItemBinding | null
  infinityEdge: RuleItemBinding | null
  recallAugment: RuleItemBinding | null
  armor: RuleItemBinding[]
  magicResist: RuleItemBinding[]
  health: RuleItemBinding[]
}
export const emptyEquipmentBindings = (): EquipmentRuleBindings => ({
  guardianBlade: null,
  guardianHorn: null,
  torch: null,
  luden: null,
  infinityEdge: null,
  recallAugment: null,
  armor: [],
  magicResist: [],
  health: []
})
export interface EquipmentRosterMember {
  championId: number
  name: string
  roles: string[]
}
export interface ConfirmedAugmentSelection {
  sessionKey: string
  championId: number
  ids: number[]
  source: 'verified-game-state' | 'reviewed-user-confirmation' | 'offline-fixture'
}
export interface EquipmentGameContext {
  sessionKey: string
  championId: number
  roles: string[]
  teams: { allies: EquipmentRosterMember[]; enemies: EquipmentRosterMember[] } | null
  inventory: { ids: number[]; observedAt: number } | null
  bindings: EquipmentRuleBindings
  startingEquipment?: StartingEquipmentPreferences | null
  debugFixture?: boolean
}
export function equipmentPanelHeight(rowCount: number, category: Category) {
  const rowHeight = category === 'core' || category === 'starting' ? 110 : 100
  return Math.min(900, Math.max(760, 222 + rowCount * rowHeight))
}
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}
// Fresh runtime placement, separate from the persisted manual marker calibration.
export interface AutomaticOverlayLayout {
  displayId: string
  clientBounds: Rect
  scaleFactor: number
  cardRects: Rect[]
  titleRects: Rect[]
  shopRect: Rect | null
}
export interface AutomaticLocationSample {
  scene: 'cards' | 'shop' | null
  state: 'idle' | 'waiting' | 'confirmed' | 'failed'
  message: string
}
export interface Marker {
  rect: Rect
  open: number[]
  openVariants?: number[][]
  closed: number[]
}
export interface ShopAnchorPatch {
  rect: Rect
  pixels: number[]
}
export interface ShopAnchor {
  version: 1
  close: ShopAnchorPatch
  title: ShopAnchorPatch
  border: ShopAnchorPatch
  divider: ShopAnchorPatch
}
export interface Calibration {
  version: 1
  displayId: string
  shop: Marker[]
  cards: Marker[]
  shopping?: Marker[]
  cardRects: Rect[]
  titleRects: Rect[]
  shopRect: Rect
  shopAnchor?: ShopAnchor
}
export interface ItemRow {
  ids: number[]
  pickRate: number | null
  winRate: number | null
}
export interface EquipmentData {
  championId: number
  date: string
  source: '腾讯101'
  categories: Record<Category, ItemRow[]>
  cached?: boolean
}
export interface AugmentStat {
  id: number
  pickRate: number | null
  winRate: number | null
  tier: 'S' | 'A' | 'B' | null
}
export interface AugmentData {
  championId: number
  date: string
  patch: string
  source: 'ARAMKit · 全阶段'
  augments: AugmentStat[]
  cached?: boolean
}
export interface Candidate extends AugmentStat {
  rarity: Rarity
}
export type AugmentRecognition = {
  text: string
  id: number | null
  stable: boolean
  corrected?: boolean
} & (
  | { backend?: 'tesseract'; confidence: number }
  | {
      backend: 'rapidocr'
      rawScore: number | null
      inputRejection?: 'invalid-image' | 'empty-title' | 'truncated-title'
    }
)
export interface OverlaySnapshot {
  augmentBackgroundOpacity?: number
  sessionKey: string | null
  championId: number | null
  championName: string
  shopVisible: boolean
  cardsVisible: boolean
  suppressed: boolean
  equipmentCollapsed?: boolean
  equipmentExpanded?: boolean
  category: Category
  buildView?: EquipmentBuildView
  standardCoreIds?: number[] | null
  confirmedSelection?: ConfirmedAugmentSelection | null
  equipmentContext?: EquipmentGameContext | null
  candidates: Array<Candidate | null>
  equipment: EquipmentData | null
  augmentData: AugmentData | null
  itemAssets: Record<number, { name: string; icon: string | null }>
  diagnostic: string
}
export interface OverlayDispatchMeta {
  snapshotVersion: number
  captureSequence: number | null
}
export const CARD_RECTS: Rect[] = [560, 1069, 1578].map((x) => ({
  x,
  y: 360,
  width: 421,
  height: 560
}))
export const TITLE_RECTS: Rect[] = [596, 1105, 1614].map((x) => ({
  x,
  y: 632,
  width: 349,
  height: 92
}))
export const SHOP_RECT: Rect = { x: 180, y: 180, width: 1300, height: 1060 }
export function percentage(value: number | null) {
  return value === null ? '--' : `${(value * 100).toFixed(1)}%`
}
export function ratio(value: unknown, divisor = 1): number | null {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && value.trim() === '') ||
    !Number.isFinite(divisor) ||
    divisor <= 0
  )
    return null
  const result = Number(value) / divisor
  return Number.isFinite(result) && result >= 0 && result <= 1 ? result : null
}
export function sortRows(rows: ItemRow[], limit = 6) {
  return rows.sort((a, b) => (b.pickRate ?? -1) - (a.pickRate ?? -1)).slice(0, limit)
}
export function isRect(value: unknown): value is Rect {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const r = value as Rect
  return (
    [r.x, r.y, r.width, r.height].every(Number.isInteger) &&
    r.x >= 0 &&
    r.y >= 0 &&
    r.width > 0 &&
    r.height > 0 &&
    r.x + r.width <= 2560 &&
    r.y + r.height <= 1440
  )
}
export function isCalibration(value: unknown): value is Calibration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const c = value as Calibration
  const markers = (list: Marker[]) =>
    Array.isArray(list) &&
    list.length === 2 &&
    Array.from(list).every(
      (m) =>
        !!m &&
        typeof m === 'object' &&
        !Array.isArray(m) &&
        isRect(m.rect) &&
        m.rect.width === 24 &&
        m.rect.height === 24 &&
        [m.open, m.closed].every(
          (p) =>
            Array.isArray(p) &&
            p.length === 24 * 24 * 4 &&
            Array.from(p).every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
        ) &&
        pixelDistance(m.open, m.closed) >= 0.06 &&
        (m.openVariants === undefined ||
          (Array.isArray(m.openVariants) &&
            m.openVariants.length <= 3 &&
            m.openVariants.every(
              (p) =>
                Array.isArray(p) &&
                p.length === 24 * 24 * 4 &&
                p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
                pixelDistance(p, m.closed) >= 0.06
            )))
    )
  return (
    c.version === 1 &&
    typeof c.displayId === 'string' &&
    c.displayId.trim().length > 0 &&
    markers(c.shop) &&
    markers(c.cards) &&
    (c.shopping === undefined || markers(c.shopping)) &&
    Array.isArray(c.cardRects) &&
    c.cardRects.length === 3 &&
    Array.from(c.cardRects).every((r) => isRect(r) && r.y + r.height + 108 <= 1440) &&
    Array.isArray(c.titleRects) &&
    c.titleRects.length === 3 &&
    Array.from(c.titleRects).every(isRect) &&
    isRect(c.shopRect) &&
    (c.shopAnchor === undefined
      ? c.shopRect.x + c.shopRect.width + 28 + 640 <= 2560 && c.shopRect.y + 880 <= 1440
      : isShopAnchor(c.shopAnchor, c.shopRect) &&
        c.shop.every(
          (m) =>
            m.rect.x >= c.shopRect.x &&
            m.rect.y >= c.shopRect.y &&
            m.rect.x + m.rect.width <= c.shopRect.x + c.shopRect.width &&
            m.rect.y + m.rect.height <= c.shopRect.y + c.shopRect.height
        ))
  )
}
export function isShopAnchor(value: unknown, shop: Rect): value is ShopAnchor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const anchor = value as ShopAnchor
  const patches = [anchor.close, anchor.title, anchor.border, anchor.divider]
  const sizes = [
    [34, 34],
    [98, 30],
    [8, 130],
    [8, 126]
  ]
  return (
    anchor.version === 1 &&
    patches.every(
      (patch, i) =>
        !!patch &&
        isRect(patch.rect) &&
        patch.rect.width === sizes[i][0] &&
        patch.rect.height === sizes[i][1] &&
        patch.rect.x >= shop.x &&
        patch.rect.y >= shop.y &&
        patch.rect.x + patch.rect.width <= shop.x + shop.width &&
        patch.rect.y + patch.rect.height <= shop.y + shop.height &&
        Array.isArray(patch.pixels) &&
        patch.pixels.length === patch.rect.width * patch.rect.height * 4 &&
        Array.from(patch.pixels).every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    )
  )
}
// Electron bitmap buffers are BGRA. Alpha is excluded from visual comparisons.
export function pixelDistance(a: ArrayLike<number>, b: ArrayLike<number>) {
  if (a.length !== b.length || a.length === 0) return 1
  let sum = 0
  for (let i = 0; i < a.length; i++) if (i % 4 !== 3) sum += Math.abs(a[i] - b[i])
  return sum / (a.length * 0.75 * 255)
}
// Compensate only small, uniform lighting/antialias changes; changed glyphs still differ.
export function titlePixelDistance(a: ArrayLike<number>, b: ArrayLike<number>) {
  if (a.length !== b.length || a.length === 0) return 1
  const offsets = [0, 1, 2].map((channel) => {
    const deltas: number[] = []
    for (let i = channel; i < a.length; i += 64) deltas.push(a[i] - b[i])
    deltas.sort((x, y) => x - y)
    const offset = deltas[Math.floor(deltas.length / 2)]
    return Math.abs(offset) <= 8 ? offset : 0
  })
  let sum = 0
  for (let i = 0; i < a.length; i++) if (i % 4 !== 3) sum += Math.abs(a[i] - b[i] - offsets[i % 4])
  return sum / (a.length * 0.75 * 255)
}
export function matchesMarkers(markers: Marker[], pixels: number[][]) {
  return (
    markers.length === 2 &&
    markers.every((m, i) => {
      const current = pixels[i]
      if (!current) return false
      const opened = Math.min(
        ...[m.open, ...(m.openVariants ?? [])].map((open) => pixelDistance(current, open))
      )
      return opened <= 0.055 && pixelDistance(current, m.closed) >= opened + 0.035
    })
  )
}
