import type { ChampSelectOverlaySettings } from './index'

export interface PositionPoint {
  x: number
  y: number
}
export interface PositionSelection {
  candidateFirst: PositionPoint | null
  teammateFirst: PositionPoint | null
  candidateNext: PositionPoint | null
  teammateNext: PositionPoint | null
}
export interface PositionPreview {
  requestId: string
  width: number
  height: number
  client: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  counts: { candidates: number; teammates: number }
}
export type PositionCalibrationReason =
  | 'idle'
  | 'waiting-client'
  | 'waiting-selection'
  | 'waiting-portraits'
  | 'waiting-foreground'
  | 'waiting-stable'
  | 'capture-unavailable'
  | 'unsupported'
  | 'source-changed'
  | 'geometry-changed'
  | 'save-failed'
  | 'ready'
  | 'saved'
export interface PositionCalibrationStatus {
  state: 'idle' | 'waiting' | 'ready' | 'saving' | 'saved' | 'error'
  reason: PositionCalibrationReason
  preview: PositionPreview | null
  geometryMismatch: boolean
}

export function emptyPositionSelection(): PositionSelection {
  return { candidateFirst: null, teammateFirst: null, candidateNext: null, teammateNext: null }
}

/** Points are fractions of the actual image element, not viewport or screen coordinates. */
export function positionSettingsFromSelection(
  settings: ChampSelectOverlaySettings,
  client: { width: number; height: number },
  input: unknown
): ChampSelectOverlaySettings {
  if (!input || typeof input !== 'object') throw new Error('missing-points')
  const value = input as PositionSelection
  const valid = (p: PositionPoint | null) =>
    !!p &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    p.x >= 0 &&
    p.x <= 1 &&
    p.y >= 0 &&
    p.y <= 1
  if (!valid(value.candidateFirst) || !valid(value.teammateFirst)) throw new Error('missing-points')
  if (
    (value.candidateNext !== null && !valid(value.candidateNext)) ||
    (value.teammateNext !== null && !valid(value.teammateNext))
  )
    throw new Error('invalid-points')
  if (![client.width, client.height].every((n) => Number.isFinite(n) && n > 0 && n <= 4096))
    throw new Error('invalid-size')
  const round = (n: number) => Math.round(n * 10) / 10
  const candidateStep = value.candidateNext
    ? round((value.candidateNext.x - value.candidateFirst!.x) * client.width)
    : settings.candidateStep
  const teammateStep = value.teammateNext
    ? round((value.teammateNext.y - value.teammateFirst!.y) * client.height)
    : settings.teammateStep
  if (candidateStep < 54 || candidateStep > 160 || teammateStep < 64 || teammateStep > 200)
    throw new Error('invalid-spacing')
  return {
    ...settings,
    candidateFirstCenterX: round(value.candidateFirst!.x * client.width),
    teammateFirstCenterY: round(value.teammateFirst!.y * client.height),
    candidateStep,
    teammateStep,
    calibratedClientSize: { width: client.width, height: client.height }
  }
}
