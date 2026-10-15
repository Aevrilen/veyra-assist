import {
  CHAMP_SELECT_GRAB_BUTTON_HEIGHT,
  CHAMP_SELECT_GRAB_BUTTON_WIDTH
} from '@shared/champ-select-overlay/candidate-grab'
import type { Rectangle } from 'electron'

/** A separate input row above the unchanged 67 DIP, mouse-transparent data band. */
export function getCandidateButtonBounds(
  band: Rectangle,
  workArea: Rectangle,
  slot: number,
  slotWidth: number,
  step: number
): Rectangle | null {
  const bounds = {
    x: Math.round(band.x + slotWidth / 2 + slot * step - CHAMP_SELECT_GRAB_BUTTON_WIDTH / 2),
    y: band.y - CHAMP_SELECT_GRAB_BUTTON_HEIGHT - 2,
    width: CHAMP_SELECT_GRAB_BUTTON_WIDTH,
    height: CHAMP_SELECT_GRAB_BUTTON_HEIGHT
  }
  return bounds.x >= workArea.x &&
    bounds.y >= workArea.y &&
    bounds.x + bounds.width <= workArea.x + workArea.width &&
    bounds.y + bounds.height <= workArea.y + workArea.height
    ? bounds
    : null
}

export function sameCandidateWindowBounds(left: Rectangle, right: Rectangle) {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}
