export type ChampSelectOverlayGroup = 'candidates' | 'teammates'

export interface ChampSelectOverlaySettings {
  backgroundOpacity: number
  /** Electron DIPs relative to the client. A crop cannot supply these two origins. */
  candidateFirstCenterX: number | null
  teammateFirstCenterY: number | null
  /** Initial spacing from the 100% reference crops; adjust for the actual client UI size. */
  candidateStep: number
  teammateStep: number
  /** Set by the visual editor. Legacy manually aligned profiles remain compatible. */
  calibratedClientSize?: { width: number; height: number }
}

export function matchesChampSelectClientSize(
  settings: ChampSelectOverlaySettings,
  client: { width: number; height: number }
) {
  const size = settings.calibratedClientSize
  return (
    !size ||
    (Math.abs(size.width - client.width) <= 1 && Math.abs(size.height - client.height) <= 1)
  )
}

export function createDefaultChampSelectOverlaySettings(): ChampSelectOverlaySettings {
  return {
    backgroundOpacity: 65,
    candidateFirstCenterX: null,
    teammateFirstCenterY: null,
    candidateStep: 58.5,
    teammateStep: 80
  }
}

export const CHAMP_SELECT_CANDIDATE_HEIGHT = 67
export const CHAMP_SELECT_TEAMMATE_WIDTH = 120
export const CHAMP_SELECT_MIN_TEAMMATE_WIDTH = 76

export function getChampSelectCandidateWidth(settings: ChampSelectOverlaySettings) {
  return Math.min(54, settings.candidateStep)
}

export function getChampSelectTeammateHeight(settings: ChampSelectOverlaySettings) {
  return Math.min(68, settings.teammateStep - 2)
}
