import type { AutomaticPositionDiagnosticRecord } from './automatic-position/diagnostics'
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
  capture?: PositionCaptureEvidence
  automaticDiagnostics?: AutomaticPositionDiagnosticRecord[]
  automatic?: {
    reason: 'suggested' | 'manual-priority' | 'uncertain' | 'unavailable'
    selection: PositionSelection | null
  }
}
export interface PositionCaptureEvidence {
  startedAt: number
  finishedAt: number
  physicalClient: PositionPreview['client']
  physicalDisplay: PositionPreview['client']
  displayId: string
  scaleFactor: number
  nativeBeforeAt?: number
  nativeAfterAt?: number
  geometryCheck: 'bracketed'
}
export interface PositionSample {
  version: 1
  imageUrl: string
  preview: PositionPreview
  note: string
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
  automaticDiagnostics?: AutomaticPositionDiagnosticRecord[]
}

/** Require an exact physical screen image; never guess offsets from a resized thumbnail. */
export function positionPreviewCrop(
  client: PositionPreview['client'],
  display: PositionPreview['client'],
  image: { width: number; height: number }
) {
  if (
    image.width !== display.width ||
    image.height !== display.height ||
    client.width <= 0 ||
    client.height <= 0 ||
    client.x < display.x ||
    client.y < display.y ||
    client.x + client.width > display.x + display.width ||
    client.y + client.height > display.y + display.height
  )
    return null
  return {
    x: client.x - display.x,
    y: client.y - display.y,
    width: client.width,
    height: client.height
  }
}

export function emptyPositionSelection(): PositionSelection {
  return {
    candidateFirst: null,
    teammateFirst: null,
    candidateNext: null,
    teammateNext: null
  }
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
