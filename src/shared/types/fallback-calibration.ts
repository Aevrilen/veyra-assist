import type { GameFrame, Scene } from '../mayhem-assistant/fallback-calibration'

export const FALLBACK_PREVIEW_EVENT = 'mayhem-fallback-preview'

export interface FallbackSelectionContext {
  sessionKey: string
  sourceKey: string
  width: number
  height: number
}

export interface FallbackSelectionStatus {
  requestId: string | null
  scene: Scene | null
  state: 'idle' | 'waiting' | 'editing'
  configured: Record<Scene, boolean>
  currentContext: FallbackSelectionContext | null
}

/** Memory-only client-area preview, sent exclusively to the existing setup window. */
export interface FallbackSelectionPreview {
  requestId: string
  scene: Scene
  frame: GameFrame
  imageUrl: string
}
