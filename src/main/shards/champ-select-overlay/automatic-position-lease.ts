import type { ChampSelectOverlaySettings } from '@shared/champ-select-overlay'

export interface AutomaticPositionLease {
  settings: ChampSelectOverlaySettings
  isCurrent: () => boolean
}
/** Read-time guard matters: UI/input consumers must never rely on the next polling tick. */
export function resolveAutomaticPositionLease(
  manual: ChampSelectOverlaySettings,
  lease: AutomaticPositionLease | null
): ChampSelectOverlaySettings {
  if (manual.candidateFirstCenterX !== null || manual.teammateFirstCenterY !== null || !lease)
    return manual
  try {
    if (!lease.isCurrent()) return manual
  } catch {
    return manual
  }
  return { ...lease.settings, backgroundOpacity: manual.backgroundOpacity }
}
