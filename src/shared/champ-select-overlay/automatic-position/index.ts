import { type ChampSelectOverlaySettings, matchesChampSelectClientSize } from '..'
import { type PositionSelection, positionSettingsFromSelection } from '../position-calibration'
import {
  type AutomaticPositionDiagnosticMetrics,
  type AutomaticPositionDiagnosticReason,
  type AutomaticPositionDiagnosticSink,
  reportAutomaticPositionDiagnostic
} from './diagnostics'

interface ClientRectangle {
  x: number
  y: number
  width: number
  height: number
}

/** Supplied by main from fresh native/LCU state, never by an overlay renderer. */
export interface AutomaticPositionContext {
  sessionKey: string
  pid: number
  windowHandle: string
  displayId: string
  physicalClient: ClientRectangle
  dipClient: ClientRectangle
  counts: { candidates: number; teammates: number }
  foreground: boolean
  phase: string
}

/** Provider contract only. No provider/layout is enabled until real samples validate it. */
export interface AutomaticPositionObservation {
  context: AutomaticPositionContext
  sequence: number
  capturedAt: number
  referenceId: string
  confidence: 'high' | 'low'
  ambiguous: boolean
  independentAnchors: number
  selection: PositionSelection
}

export type AutomaticPositionDecision =
  | { kind: 'manual'; settings: ChampSelectOverlaySettings }
  | {
      kind: 'suggestion'
      settings: ChampSelectOverlaySettings
      referenceId: string
    }
  | { kind: 'confirming' }
  | {
      kind: 'unavailable'
      reason:
        | 'inactive'
        | 'invalid-context'
        | 'manual-geometry-changed'
        | 'disabled'
        | 'no-observation'
        | 'uncertain'
        | 'stale'
        | 'context-changed'
        | 'invalid-selection'
    }

export function automaticPositionContextKey(context: AutomaticPositionContext) {
  return JSON.stringify([
    context.sessionKey,
    context.pid,
    context.windowHandle,
    context.displayId,
    context.physicalClient.x,
    context.physicalClient.y,
    context.physicalClient.width,
    context.physicalClient.height,
    context.dipClient.x,
    context.dipClient.y,
    context.dipClient.width,
    context.dipClient.height,
    context.counts.candidates,
    context.counts.teammates
  ])
}

function validContext(context: AutomaticPositionContext) {
  const rectangles = [context.physicalClient, context.dipClient]
  if (
    !context.sessionKey ||
    !context.windowHandle ||
    !context.displayId ||
    !Number.isInteger(context.pid) ||
    context.pid <= 0
  )
    return false
  if (
    !rectangles.every(
      (rect) =>
        [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.width <= 4096 &&
        rect.height <= 4096
    )
  )
    return false
  if (
    !Object.values(context.counts).every(
      (count) => Number.isInteger(count) && count > 0 && count <= 20
    )
  )
    return false
  const scaleX = context.physicalClient.width / context.dipClient.width
  const scaleY = context.physicalClient.height / context.dipClient.height
  return scaleX >= 1 && scaleX <= 4 && Math.abs(scaleX - scaleY) <= 0.01
}

/**
 * Reuses the manual selection validator and DIP settings consumed by placement.ts.
 * This is an offline integration boundary, not a detector or a live fallback controller.
 * No captures, IO, persistence, timers, settings mutation or grab-button authorization.
 */
export class AutomaticPositionResolver {
  private _previous: {
    key: string
    contextKey: string
    referenceId: string
    proposal: ChampSelectOverlaySettings
    sequence: number
    capturedAt: number
  } | null = null

  reset() {
    this._previous = null
  }

  evaluate(input: {
    enabled?: boolean
    current: AutomaticPositionContext
    settings: ChampSelectOverlaySettings
    observation: AutomaticPositionObservation | null
    now: number
    diagnostic?: AutomaticPositionDiagnosticSink
  }): AutomaticPositionDecision {
    const report = (
      reason: AutomaticPositionDiagnosticReason,
      metrics: AutomaticPositionDiagnosticMetrics = {}
    ) =>
      reportAutomaticPositionDiagnostic(input.diagnostic, {
        stage: 'resolver',
        reason,
        metrics: {
          physicalWidth: input.current.physicalClient.width,
          physicalHeight: input.current.physicalClient.height,
          dipWidth: input.current.dipClient.width,
          dipHeight: input.current.dipClient.height,
          scaleX: input.current.physicalClient.width / input.current.dipClient.width,
          scaleY: input.current.physicalClient.height / input.current.dipClient.height,
          candidates: input.current.counts.candidates,
          teammates: input.current.counts.teammates,
          ageLimitMs: 1500,
          agreementGapLimitMs: 1500,
          independentAnchorMinimum: 2,
          ...(input.observation
            ? {
                observationAgeMs: input.now - input.observation.capturedAt,
                sequence: input.observation.sequence
              }
            : {}),
          ...metrics
        }
      })
    const reject = (
      reason: Extract<AutomaticPositionDecision, { kind: 'unavailable' }>['reason'],
      detail: AutomaticPositionDiagnosticMetrics = {}
    ): AutomaticPositionDecision => {
      this.reset()
      report(reason, {
        observationPresent: !!input.observation,
        ...(input.observation
          ? {
              observationAgeMs: input.now - input.observation.capturedAt,
              sequence: input.observation.sequence,
              confidenceHigh: input.observation.confidence === 'high',
              ambiguous: input.observation.ambiguous,
              independentAnchors: input.observation.independentAnchors,
              referencePresent: !!input.observation.referenceId,
              nowValid: Number.isFinite(input.now),
              timestampValid: Number.isFinite(input.observation.capturedAt),
              sequenceValid:
                Number.isInteger(input.observation.sequence) && input.observation.sequence >= 0
            }
          : {}),
        ...detail
      })
      return { kind: 'unavailable', reason }
    }
    const { current, settings, observation, now } = input
    if (!current.foreground || current.phase !== 'ChampSelect') return reject('inactive')
    if (!validContext(current)) return reject('invalid-context')
    // A user's saved alignment always wins. A stale manual size requires manual review;
    // an automatic proposal must never silently replace it or partially merge with it.
    if (settings.candidateFirstCenterX !== null || settings.teammateFirstCenterY !== null) {
      this.reset()
      if (!matchesChampSelectClientSize(settings, current.dipClient))
        return reject('manual-geometry-changed')
      report('manual-priority')
      return { kind: 'manual', settings }
    }
    if (!input.enabled) return reject('disabled')
    if (!observation) return reject('no-observation')
    if (
      !observation.context.foreground ||
      observation.context.phase !== 'ChampSelect' ||
      !validContext(observation.context) ||
      automaticPositionContextKey(observation.context) !== automaticPositionContextKey(current)
    )
      return reject('context-changed')
    if (
      observation.confidence !== 'high' ||
      observation.ambiguous ||
      !Number.isInteger(observation.independentAnchors) ||
      observation.independentAnchors < 2 ||
      !observation.referenceId
    )
      return reject('uncertain')
    if (
      !Number.isFinite(now) ||
      !Number.isFinite(observation.capturedAt) ||
      now < observation.capturedAt ||
      now - observation.capturedAt > 1500 ||
      !Number.isInteger(observation.sequence) ||
      observation.sequence < 0
    )
      return reject('stale')
    const points = observation.selection
    if (
      !points.candidateFirst ||
      !points.candidateNext ||
      !points.teammateFirst ||
      !points.teammateNext
    )
      return reject('invalid-selection')
    let proposed: ChampSelectOverlaySettings
    try {
      proposed = positionSettingsFromSelection(settings, current.dipClient, points)
    } catch {
      return reject('invalid-selection')
    }
    if (
      Math.abs(points.candidateNext.y - points.candidateFirst.y) * current.dipClient.height > 2 ||
      Math.abs(points.teammateNext.x - points.teammateFirst.x) * current.dipClient.width > 2 ||
      proposed.candidateFirstCenterX! + (current.counts.candidates - 1) * proposed.candidateStep >
        current.dipClient.width ||
      proposed.teammateFirstCenterY! + (current.counts.teammates - 1) * proposed.teammateStep >
        current.dipClient.height
    )
      return reject('invalid-selection')
    const contextKey = automaticPositionContextKey(current)
    const key = JSON.stringify([
      contextKey,
      observation.referenceId,
      proposed.candidateFirstCenterX,
      proposed.teammateFirstCenterY,
      proposed.candidateStep,
      proposed.teammateStep
    ])
    const previous = this._previous
    if (
      previous &&
      (observation.sequence <= previous.sequence || observation.capturedAt <= previous.capturedAt)
    ) {
      // Preserve the public decision while making a duplicate/reordered frame distinguishable.
      return reject('stale', {
        increasingSequence: observation.sequence > previous.sequence,
        increasingTime: observation.capturedAt > previous.capturedAt
      })
    }
    this._previous = {
      key,
      contextKey,
      referenceId: observation.referenceId,
      proposal: proposed,
      sequence: observation.sequence,
      capturedAt: observation.capturedAt
    }
    if (!previous || previous.key !== key || observation.capturedAt - previous.capturedAt > 1500) {
      report(!previous ? 'first-frame' : previous.key !== key ? 'frame-mismatch' : 'frame-gap', {
        previousPresent: !!previous,
        ...(previous
          ? {
              frameGapMs: observation.capturedAt - previous.capturedAt,
              sameContext: contextKey === previous.contextKey,
              sameReference: observation.referenceId === previous.referenceId,
              candidateFirstDelta:
                proposed.candidateFirstCenterX! - previous.proposal.candidateFirstCenterX!,
              teammateFirstDelta:
                proposed.teammateFirstCenterY! - previous.proposal.teammateFirstCenterY!,
              candidateStepDelta: proposed.candidateStep - previous.proposal.candidateStep,
              teammateStepDelta: proposed.teammateStep - previous.proposal.teammateStep
            }
          : {})
      })
      return { kind: 'confirming' }
    }
    report('suggestion', {
      frameGapMs: observation.capturedAt - previous.capturedAt
    })
    return {
      kind: 'suggestion',
      settings: proposed,
      referenceId: observation.referenceId
    }
  }
}
