import {
  CHAMP_SELECT_CANDIDATE_HEIGHT,
  CHAMP_SELECT_MIN_TEAMMATE_WIDTH,
  CHAMP_SELECT_TEAMMATE_WIDTH,
  type ChampSelectOverlayGroup,
  type ChampSelectOverlaySettings,
  getChampSelectCandidateWidth,
  getChampSelectTeammateHeight,
  matchesChampSelectClientSize
} from '@shared/champ-select-overlay'
import type { Rectangle } from 'electron'

export type ChampSelectOverlayBounds = Record<ChampSelectOverlayGroup, Rectangle | null>

/** All values are Electron DIPs. Never shift a group away from its configured row centers. */
export function getChampSelectOverlayBounds(
  client: Rectangle,
  workArea: Rectangle,
  settings: ChampSelectOverlaySettings,
  counts: { candidates: number; teammates: number }
): ChampSelectOverlayBounds {
  const result: ChampSelectOverlayBounds = { candidates: null, teammates: null }
  if (!matchesChampSelectClientSize(settings, client)) return result

  if (
    settings.candidateFirstCenterX !== null &&
    settings.candidateStep >= 54 &&
    counts.candidates > 0
  ) {
    const slotWidth = getChampSelectCandidateWidth(settings)
    const candidate = roundedBounds({
      x: client.x + settings.candidateFirstCenterX - slotWidth / 2,
      y: client.y - CHAMP_SELECT_CANDIDATE_HEIGHT - 4,
      width: slotWidth + settings.candidateStep * (counts.candidates - 1),
      height: CHAMP_SELECT_CANDIDATE_HEIGHT
    })
    if (
      candidate.x >= client.x &&
      candidate.x + candidate.width <= client.x + client.width &&
      inside(candidate, workArea)
    ) {
      result.candidates = candidate
    }
  }

  const leftBlank = client.x - workArea.x
  if (
    settings.teammateFirstCenterY !== null &&
    counts.teammates > 0 &&
    leftBlank >= CHAMP_SELECT_MIN_TEAMMATE_WIDTH + 4
  ) {
    const rowHeight = getChampSelectTeammateHeight(settings)
    const gap = leftBlank >= CHAMP_SELECT_TEAMMATE_WIDTH + 16 ? 8 : 2
    const width = Math.min(CHAMP_SELECT_TEAMMATE_WIDTH, leftBlank - gap * 2)
    const teammates = roundedBounds({
      x: client.x - width - gap,
      y: client.y + settings.teammateFirstCenterY - rowHeight / 2,
      width,
      height: rowHeight + settings.teammateStep * (counts.teammates - 1)
    })
    if (
      teammates.y >= client.y &&
      teammates.y + teammates.height <= client.y + client.height &&
      inside(teammates, workArea)
    ) {
      result.teammates = teammates
    }
  }

  return result
}

function roundedBounds(bounds: Rectangle): Rectangle {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.ceil(bounds.width),
    height: Math.ceil(bounds.height)
  }
}

function inside(bounds: Rectangle, area: Rectangle) {
  return (
    bounds.x >= area.x &&
    bounds.y >= area.y &&
    bounds.x + bounds.width <= area.x + area.width &&
    bounds.y + bounds.height <= area.y + area.height
  )
}
