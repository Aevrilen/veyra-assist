export interface CandidateGrabIdentity {
  sessionId: string
  revision: number
  championId: number
}

export interface CandidateGrabView {
  sessionId: string | null
  revision: number
  candidates: { role: 'bench'; championId: number; eligible: boolean }[]
  busy: boolean
}

export type CandidateGrabResult =
  | { state: 'confirmed'; operation: 'swap'; championId: number }
  | { state: 'unconfirmed'; championId: number }
  | { state: 'stale' | 'unavailable' | 'busy' | 'failed' }
export const CHAMP_SELECT_GRAB_BUTTON_WIDTH = 32
export const CHAMP_SELECT_GRAB_BUTTON_HEIGHT = 22
/** Main-owned native clipping region; some Windows builds impose a larger outer window height. */
export const CHAMP_SELECT_GRAB_INPUT_SHAPE = {
  x: 0,
  y: 0,
  width: CHAMP_SELECT_GRAB_BUTTON_WIDTH,
  height: CHAMP_SELECT_GRAB_BUTTON_HEIGHT
} as const

export type CandidateCardRole = 'personal-choice' | 'bench'

export const CANDIDATE_GRAB_NAMESPACE = 'champ-select-overlay-main'

export interface CandidateGrabButtonState {
  identity: CandidateGrabIdentity | null
  busy: boolean
}

export interface CandidateGrabFeedback {
  identity: CandidateGrabIdentity
  result: CandidateGrabResult
}
