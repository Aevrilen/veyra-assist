import {
  type AutomaticPositionDiagnostic,
  type AutomaticPositionDiagnosticMetrics,
  type AutomaticPositionDiagnosticReason,
  sanitizeAutomaticPositionDiagnostic
} from './diagnostics'
import type { AutomaticPositionContext, AutomaticPositionObservation } from './index'

export interface GrayClientFrame {
  width: number
  height: number
  pixels: Uint8Array
  context: AutomaticPositionContext
  sequence: number
  capturedAt: number
}

/**
 * Offline prototype for the measured 1280x720 / 100% client only.
 * Checks static bench borders and teammate rings, never portrait interiors or text.
 * Thresholds are exploratory, not measured confidence probabilities. No runtime caller.
 */
export function observeLegacyLayout(frame: GrayClientFrame): AutomaticPositionObservation | null {
  const { context, width, height, pixels } = frame
  if (
    width !== 1280 ||
    height !== 720 ||
    pixels.length !== width * height ||
    context.physicalClient.width !== width ||
    context.physicalClient.height !== height ||
    context.dipClient.width !== width ||
    context.dipClient.height !== height ||
    !context.foreground ||
    context.phase !== 'ChampSelect' ||
    context.counts.teammates !== 5 ||
    !Number.isInteger(context.counts.candidates) ||
    context.counts.candidates < 1 ||
    context.counts.candidates > 10
  )
    return null

  if (!matchesLegacyChrome(pixels)) return null
  return legacyObservation(frame)
}

function inspectLegacyChrome(pixels: Uint8Array): AutomaticPositionDiagnostic {
  const gray = (x: number, y: number) => pixels[y * 1280 + x]
  // Coordinates and rule scores only; no sampled pixel values or image content are logged.
  const evaluated: AutomaticPositionDiagnosticMetrics = {
    normalizedWidth: 1280,
    normalizedHeight: 720,
    benchFirstLeft: 351.5,
    benchStep: 58.5,
    benchSampleTop: 9,
    benchSampleBottom: 11,
    benchOutsideY: 7,
    benchContrastThreshold: 15,
    benchSlotThreshold: 3,
    benchTotalThreshold: 60,
    teammateCenterX: 86,
    teammateFirstY: 135,
    teammateStep: 80,
    ringRadiusMin: 27,
    ringRadiusMax: 31,
    ringOutsideRadius: 34,
    teammateContrastThreshold: 30,
    teammateRowThreshold: 12,
    teammateTotalThreshold: 72
  }
  const result = (
    reason: AutomaticPositionDiagnosticReason,
    metrics: AutomaticPositionDiagnosticMetrics
  ): AutomaticPositionDiagnostic => ({
    stage: 'provider',
    reason,
    metrics: { ...evaluated, ...metrics }
  })
  let benchTotal = 0
  for (let slot = 0; slot < 10; slot++) {
    const left = Math.round(351.5 + 58.5 * slot)
    let edges = 0
    for (let offset = 5; offset < 45; offset += 5) {
      const x = left + offset
      if (Math.max(gray(x, 9), gray(x, 10), gray(x, 11)) - gray(x, 7) >= 15) edges++
    }
    evaluated[`benchSlot${slot}Edges` as keyof AutomaticPositionDiagnosticMetrics] = edges
    if (edges < 3)
      return result('bench-slot-edges', {
        benchSlot: slot,
        benchEdges: edges,
        benchTotal,
        required: 3
      })
    benchTotal += edges
  }
  if (benchTotal < 60) return result('bench-total-edges', { benchTotal, required: 60 })

  let teammateTotal = 0
  for (let row = 0; row < 5; row++) {
    const centerY = 135 + 80 * row
    let edges = 0
    for (let angle = 0; angle < 16; angle++) {
      const theta = (2 * Math.PI * angle) / 16
      const x = (radius: number) => Math.round(86 + radius * Math.cos(theta))
      const y = (radius: number) => Math.round(centerY + radius * Math.sin(theta))
      let ring = 0
      for (let radius = 27; radius < 32; radius++) ring = Math.max(ring, gray(x(radius), y(radius)))
      if (ring - gray(x(34), y(34)) >= 30) edges++
    }
    evaluated[`teammateRow${row}Edges` as keyof AutomaticPositionDiagnosticMetrics] = edges
    if (edges < 12)
      return result('teammate-row-edges', {
        benchTotal,
        teammateRow: row,
        teammateEdges: edges,
        teammateTotal,
        required: 12
      })
    teammateTotal += edges
  }
  return result(teammateTotal >= 72 ? 'matched' : 'teammate-total-edges', {
    benchTotal,
    teammateTotal,
    required: 72
  })
}

function matchesLegacyChrome(pixels: Uint8Array) {
  return inspectLegacyChrome(pixels).reason === 'matched'
}

function legacyObservation(frame: GrayClientFrame): AutomaticPositionObservation {
  return {
    context: frame.context,
    sequence: frame.sequence,
    capturedAt: frame.capturedAt,
    referenceId: 'legacy-1280x720-100pct-offline-v1',
    confidence: 'high',
    ambiguous: false,
    independentAnchors: 2,
    selection: {
      candidateFirst: { x: 376.5 / 1280, y: 35 / 720 },
      candidateNext: { x: 435 / 1280, y: 35 / 720 },
      teammateFirst: { x: 86 / 1280, y: 135 / 720 },
      teammateNext: { x: 86 / 1280, y: 215 / 720 }
    }
  }
}

/** Explicit candidate-only hypothesis: match scaled chrome, retain actual native/DIP context. */
export function observeNormalizedLegacyLayout(
  frame: GrayClientFrame
): AutomaticPositionObservation | null {
  return inspectNormalizedLegacyLayout(frame).observation
}

/** Same ordered gates and thresholds as the candidate; details are not confidence probabilities. */
export function inspectNormalizedLegacyLayout(frame: GrayClientFrame): {
  observation: AutomaticPositionObservation | null
  diagnostic: AutomaticPositionDiagnostic
} {
  const { context, width, height, pixels } = frame
  const metrics: AutomaticPositionDiagnosticMetrics = {
    width,
    height,
    normalizationScale: width / 1280,
    scaleX: context.physicalClient.width / context.dipClient.width,
    scaleY: context.physicalClient.height / context.dipClient.height,
    pixelCount: pixels.length,
    physicalWidth: context.physicalClient.width,
    physicalHeight: context.physicalClient.height,
    dipWidth: context.dipClient.width,
    dipHeight: context.dipClient.height,
    candidates: context.counts.candidates,
    teammates: context.counts.teammates,
    foreground: context.foreground,
    champSelect: context.phase === 'ChampSelect'
  }
  const reject = (reason: AutomaticPositionDiagnosticReason) => ({
    observation: null,
    diagnostic: sanitizeAutomaticPositionDiagnostic({
      stage: 'provider',
      reason,
      metrics
    })!
  })
  if (![1280, 1600, 1920, 2560].includes(width)) return reject('unsupported-width')
  if (width * 720 !== height * 1280) return reject('unsupported-aspect')
  if (pixels.length !== width * height) return reject('pixel-length-mismatch')
  if (context.physicalClient.width !== width || context.physicalClient.height !== height)
    return reject('physical-size-mismatch')
  if (context.dipClient.width < 1280 || context.dipClient.width > 2560)
    return reject('unsupported-dip-width')
  if (Math.abs(context.dipClient.width / context.dipClient.height - 16 / 9) > 0.001)
    return reject('unsupported-dip-aspect')
  if (!context.foreground || context.phase !== 'ChampSelect') return reject('inactive')
  if (context.counts.teammates !== 5) return reject('teammate-count')
  if (
    !Number.isInteger(context.counts.candidates) ||
    context.counts.candidates < 1 ||
    context.counts.candidates > 10
  )
    return reject('candidate-count')
  const normalized = new Uint8Array(1280 * 720)
  const scale = width / 1280
  for (let y = 0; y < 720; y++)
    for (let x = 0; x < 1280; x++)
      normalized[y * 1280 + x] = pixels[Math.ceil(y * scale) * width + Math.ceil(x * scale)]
  const chrome = inspectLegacyChrome(normalized)
  const diagnostic = sanitizeAutomaticPositionDiagnostic({
    ...chrome,
    metrics: { ...metrics, ...chrome.metrics }
  })!
  if (chrome.reason !== 'matched') return { observation: null, diagnostic }
  return {
    observation: {
      ...legacyObservation(frame),
      referenceId: 'legacy-normalized-candidate-v1'
    },
    diagnostic
  }
}
