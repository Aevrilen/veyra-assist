import type { AutomaticPositionContext } from '@shared/champ-select-overlay/automatic-position'

/** screenToDipRect rounds to integer DIPs. Verify each axis against the real display scale. */
export function matchesAutomaticCaptureScale(context: AutomaticPositionContext, scale: number) {
  if (!Number.isFinite(scale) || scale < 1 || scale > 4) return false
  return (['width', 'height'] as const).every((axis) => {
    const physical = context.physicalClient[axis],
      dip = context.dipClient[axis]
    return (
      Number.isFinite(physical) &&
      Number.isFinite(dip) &&
      physical > 0 &&
      dip > 0 &&
      Math.abs(physical - dip * scale) <= scale / 2 + 1e-6
    )
  })
}
