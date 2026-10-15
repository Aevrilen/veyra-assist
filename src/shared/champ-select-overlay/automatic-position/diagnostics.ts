/** Scalar-only diagnostics. Never attach context, IDs, pixels, URLs or exception text. */
const reasons = {
  provider: [
    'legacy-size',
    'legacy-dip-size',
    'unsupported-width',
    'unsupported-aspect',
    'pixel-length-mismatch',
    'physical-size-mismatch',
    'unsupported-dip-width',
    'unsupported-dip-aspect',
    'inactive',
    'teammate-count',
    'candidate-count',
    'bench-slot-edges',
    'bench-total-edges',
    'teammate-row-edges',
    'teammate-total-edges',
    'matched'
  ],
  capture: [
    'display-match-count',
    'oversized-client',
    'missing-screen-thumbnail',
    'empty-screen-thumbnail',
    'invalid-crop',
    'empty-crop',
    'captured'
  ],
  image: [
    'missing-capture-evidence',
    'display-changed',
    'scale-changed',
    'empty-image',
    'image-size-mismatch',
    'bitmap-length-mismatch'
  ],
  resolver: [
    'inactive',
    'invalid-context',
    'manual-geometry-changed',
    'disabled',
    'no-observation',
    'uncertain',
    'stale',
    'context-changed',
    'invalid-selection',
    'first-frame',
    'frame-mismatch',
    'frame-gap',
    'suggestion',
    'manual-priority'
  ],
  controller: [
    'waiting-client',
    'waiting-selection',
    'waiting-portraits',
    'waiting-foreground',
    'waiting-stable',
    'trial-started',
    'trial-cancelled',
    'trial-disposed',
    'capture-started',
    'capture-finished',
    'manual-save-requested',
    'save-preview-expired',
    'save-invalid-selection',
    'save-outside',
    'manual-save-started',
    'manual-save-succeeded',
    'manual-save-failed',
    'capture-unavailable',
    'unsupported',
    'source-changed',
    'geometry-changed',
    'save-failed',
    'missing-window-identity',
    'capture-limit',
    'capture-context-changed',
    'capture-null',
    'capture-dip-mismatch',
    'missing-automatic-context',
    'observer-unavailable',
    'observer-exception',
    'capture-exception',
    'confirmation-exhausted',
    'preview-retained'
  ]
} as const

export type AutomaticPositionDiagnosticStage = keyof typeof reasons
export type AutomaticPositionDiagnosticReason =
  (typeof reasons)[AutomaticPositionDiagnosticStage][number]
const metricNames = [
  'normalizedWidth',
  'normalizedHeight',
  'normalizationScale',
  'scaleX',
  'scaleY',
  'benchFirstLeft',
  'benchStep',
  'benchSampleTop',
  'benchSampleBottom',
  'benchOutsideY',
  'benchContrastThreshold',
  'benchSlotThreshold',
  'benchTotalThreshold',
  'teammateCenterX',
  'teammateFirstY',
  'teammateStep',
  'ringRadiusMin',
  'ringRadiusMax',
  'ringOutsideRadius',
  'teammateContrastThreshold',
  'teammateRowThreshold',
  'teammateTotalThreshold',
  'benchSlot0Edges',
  'benchSlot1Edges',
  'benchSlot2Edges',
  'benchSlot3Edges',
  'benchSlot4Edges',
  'benchSlot5Edges',
  'benchSlot6Edges',
  'benchSlot7Edges',
  'benchSlot8Edges',
  'benchSlot9Edges',
  'teammateRow0Edges',
  'teammateRow1Edges',
  'teammateRow2Edges',
  'teammateRow3Edges',
  'teammateRow4Edges',
  'matchingDisplays',
  'physicalX',
  'physicalY',
  'width',
  'height',
  'pixelCount',
  'physicalWidth',
  'physicalHeight',
  'dipWidth',
  'dipHeight',
  'candidates',
  'teammates',
  'foreground',
  'champSelect',
  'benchSlot',
  'benchEdges',
  'benchTotal',
  'teammateRow',
  'teammateEdges',
  'teammateTotal',
  'required',
  'imageWidth',
  'imageHeight',
  'bitmapBytes',
  'scaleFactor',
  'expectedScaleFactor',
  'captureOrdinal',
  'elapsedMs',
  'captureDurationMs',
  'ageLimitMs',
  'agreementGapLimitMs',
  'independentAnchorMinimum',
  'observationAgeMs',
  'frameGapMs',
  'sequence',
  'confidenceHigh',
  'ambiguous',
  'independentAnchors',
  'referencePresent',
  'nowValid',
  'timestampValid',
  'sequenceValid',
  'increasingSequence',
  'increasingTime',
  'hasEvidence',
  'hasSession',
  'hasOwner',
  'hasWindow',
  'observationPresent',
  'previewSuggested',
  'manualPriority',
  'physicalChanged',
  'dipChanged',
  'countsChanged',
  'sessionChanged',
  'windowChanged',
  'displayChanged',
  'pidChanged',
  'phaseChanged',
  'previousPresent',
  'sameProposal',
  'sameContext',
  'sameReference',
  'candidateFirstDelta',
  'teammateFirstDelta',
  'candidateStepDelta',
  'teammateStepDelta'
] as const
export type AutomaticPositionDiagnosticMetrics = Partial<
  Record<(typeof metricNames)[number], number | boolean>
>
export interface AutomaticPositionDiagnostic {
  stage: AutomaticPositionDiagnosticStage
  reason: AutomaticPositionDiagnosticReason
  metrics: AutomaticPositionDiagnosticMetrics
}
export type AutomaticPositionDiagnosticSink = (diagnostic: AutomaticPositionDiagnostic) => void

/** Runtime allowlist as well as TS types: third-party providers cannot leak extra fields. */
export function sanitizeAutomaticPositionDiagnostic(
  value: unknown
): AutomaticPositionDiagnostic | null {
  try {
    if (!value || typeof value !== 'object') return null
    const input = value as AutomaticPositionDiagnostic
    const stage = input.stage,
      reason = input.reason,
      suppliedMetrics = input.metrics
    if (typeof stage !== 'string' || typeof reason !== 'string' || !Object.hasOwn(reasons, stage))
      return null
    if (!(reasons[stage] as readonly string[]).includes(reason)) return null
    const metrics: AutomaticPositionDiagnosticMetrics = {}
    for (const key of metricNames) {
      const value = suppliedMetrics?.[key]
      if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
        metrics[key] = value
    }
    return { stage, reason, metrics }
  } catch {
    // Malformed provider objects/getters must not alter recognition or reach logs.
    return null
  }
}

/** Optional diagnostics must not turn a safe rejection/suggestion into a capture failure. */
export function reportAutomaticPositionDiagnostic(
  sink: AutomaticPositionDiagnosticSink | undefined,
  diagnostic: AutomaticPositionDiagnostic
) {
  if (!sink) return
  const safe = sanitizeAutomaticPositionDiagnostic(diagnostic)
  if (!safe) return
  try {
    sink(safe)
  } catch {
    /* Logging is best-effort and never changes recognition. */
  }
}

export interface AutomaticPositionDiagnosticRecord extends AutomaticPositionDiagnostic {
  /** Random per-attempt correlation only; never a session, account, window or display ID. */
  attemptId: string
  firstAt: number
  lastAt: number
  /** Number of occurrences represented by this record; duplicate summaries are additional. */
  repeatCount: number
}

/** Keep every state change; coalesce only consecutive identical polls, never distinct evidence. */
export class AutomaticPositionDiagnosticJournal {
  private _records: AutomaticPositionDiagnosticRecord[] = []
  private _lastKey: string | null = null
  private _repeated: AutomaticPositionDiagnosticRecord | null = null

  constructor(
    private readonly _attemptId: string,
    private readonly _sink?: (record: AutomaticPositionDiagnosticRecord) => void
  ) {}

  record(input: AutomaticPositionDiagnostic, now: number) {
    const safe = sanitizeAutomaticPositionDiagnostic(input)
    if (!safe || !Number.isFinite(now)) return
    const { elapsedMs: _elapsed, ...stableMetrics } = safe.metrics
    const key = JSON.stringify({
      stage: safe.stage,
      reason: safe.reason,
      metrics: stableMetrics
    })
    if (key === this._lastKey) {
      if (this._repeated) {
        this._repeated.lastAt = now
        this._repeated.repeatCount++
      } else {
        this._repeated = {
          ...safe,
          attemptId: this._attemptId,
          firstAt: now,
          lastAt: now,
          repeatCount: 1
        }
      }
      return
    }
    this.flush()
    this._lastKey = key
    this._emit({
      ...safe,
      attemptId: this._attemptId,
      firstAt: now,
      lastAt: now,
      repeatCount: 1
    })
  }

  flush() {
    if (!this._repeated) return
    this._emit(this._repeated)
    this._repeated = null
  }

  snapshot(): AutomaticPositionDiagnosticRecord[] {
    return [...this._records, ...(this._repeated ? [this._repeated] : [])].map((entry) => ({
      ...entry,
      metrics: { ...entry.metrics }
    }))
  }

  private _emit(record: AutomaticPositionDiagnosticRecord) {
    this._records.push(record)
    try {
      this._sink?.({ ...record, metrics: { ...record.metrics } })
    } catch {
      /* best effort */
    }
  }
}
