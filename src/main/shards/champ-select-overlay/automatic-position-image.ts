import type { AutomaticPositionContext } from '@shared/champ-select-overlay/automatic-position'
import {
  type AutomaticPositionDiagnosticMetrics,
  type AutomaticPositionDiagnosticReason,
  type AutomaticPositionDiagnosticSink,
  reportAutomaticPositionDiagnostic
} from '@shared/champ-select-overlay/automatic-position/diagnostics'
import { inspectNormalizedLegacyLayout } from '@shared/champ-select-overlay/automatic-position/legacy-layout-provider'
import { nativeImage, screen } from 'electron'

import type { CapturedPosition } from './position-calibration-controller'

/** Runs only for an explicitly armed trial; media stays in main-process memory. */
export function observeAutomaticPositionImage(
  capture: CapturedPosition,
  context: AutomaticPositionContext,
  sequence: number,
  diagnostic?: AutomaticPositionDiagnosticSink
) {
  const reject = (
    reason: AutomaticPositionDiagnosticReason,
    metrics: AutomaticPositionDiagnosticMetrics = {}
  ) => {
    reportAutomaticPositionDiagnostic(diagnostic, {
      stage: 'image',
      reason,
      metrics
    })
    return null
  }
  const evidence = capture.capture
  const display = screen.getDisplayMatching(context.dipClient)
  if (!evidence) return reject('missing-capture-evidence')
  if (String(display.id) !== evidence.displayId) return reject('display-changed')
  if (display.scaleFactor !== evidence.scaleFactor)
    return reject('scale-changed', {
      scaleFactor: display.scaleFactor,
      expectedScaleFactor: evidence.scaleFactor
    })
  const image = nativeImage.createFromDataURL(capture.imageUrl)
  if (image.isEmpty()) return reject('empty-image')
  if (image.getSize().width !== capture.width || image.getSize().height !== capture.height)
    return reject('image-size-mismatch', {
      width: capture.width,
      height: capture.height,
      imageWidth: image.getSize().width,
      imageHeight: image.getSize().height
    })
  const bitmap = image.toBitmap()
  if (bitmap.length !== capture.width * capture.height * 4)
    return reject('bitmap-length-mismatch', {
      bitmapBytes: bitmap.length,
      width: capture.width,
      height: capture.height
    })
  // Windows NativeImage bitmap is BGRA, matching the existing game UI locator conversion.
  const pixels = new Uint8Array(capture.width * capture.height)
  for (let i = 0; i < pixels.length; i++) {
    const offset = i * 4
    pixels[i] = (bitmap[offset] * 29 + bitmap[offset + 1] * 150 + bitmap[offset + 2] * 77) >> 8
  }
  const result = inspectNormalizedLegacyLayout({
    width: capture.width,
    height: capture.height,
    pixels,
    context,
    sequence,
    capturedAt: evidence.finishedAt
  })
  reportAutomaticPositionDiagnostic(diagnostic, result.diagnostic)
  return result.observation
}
