import { inflateSync } from 'node:zlib'
import { PNG } from 'pngjs'

import { createDefaultChampSelectOverlaySettings } from '../../src/shared/champ-select-overlay'
import {
  type AutomaticPositionContext,
  AutomaticPositionResolver
} from '../../src/shared/champ-select-overlay/automatic-position'
import { inspectNormalizedLegacyLayout } from '../../src/shared/champ-select-overlay/automatic-position/legacy-layout-provider'

export const LIMITS = Object.freeze({
  jsonBytes: 32 * 1024 * 1024,
  geometryBytes: 16 * 1024,
  pngBytes: 24 * 1024 * 1024,
  imageSide: 4096,
  pixels: 4096 * 4096,
  jsonDepth: 32,
  pngChunks: 4096
})

export type ReplayFailureCode =
  | 'invalid-arguments'
  | 'local-file-required'
  | 'input-unreadable'
  | 'input-not-regular-file'
  | 'input-too-large'
  | 'input-changed-during-read'
  | 'invalid-json'
  | 'json-too-deep'
  | 'unsupported-sample-version'
  | 'invalid-preview-metadata'
  | 'missing-capture-evidence'
  | 'invalid-capture-metadata'
  | 'invalid-manual-geometry'
  | 'unsupported-image-encoding'
  | 'invalid-image-base64'
  | 'image-too-large'
  | 'invalid-png'
  | 'unsupported-png-format'
  | 'unsupported-image-transparency'
  | 'image-dimensions-mismatch'
  | 'physical-client-dimensions-mismatch'
  | 'replay-failed'

/** Only these fixed messages can cross the CLI boundary; never forward parser/OS errors. */
export class ReplayInputError extends Error {
  constructor(readonly code: ReplayFailureCode) {
    super(code)
    this.name = 'ReplayInputError'
  }
}

function fail(code: ReplayFailureCode): never {
  throw new ReplayInputError(code)
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
function dimension(value: unknown): value is number {
  return finite(value) && Number.isInteger(value) && value > 0 && value <= LIMITS.imageSide
}
function count(value: unknown): value is number {
  return finite(value) && Number.isInteger(value) && value >= 0 && value <= 20
}
function timestamp(value: unknown): value is number {
  return finite(value) && Number.isSafeInteger(value) && value >= 0
}
function rectangle(
  value: unknown
): value is { x: number; y: number; width: number; height: number } {
  return (
    record(value) &&
    finite(value.x) &&
    finite(value.y) &&
    Math.abs(value.x) <= 1_000_000 &&
    Math.abs(value.y) <= 1_000_000 &&
    finite(value.width) &&
    finite(value.height) &&
    value.width > 0 &&
    value.height > 0 &&
    value.width <= LIMITS.imageSide &&
    value.height <= LIMITS.imageSide
  )
}

/** Bound nesting before JSON.parse; strings and escapes do not alter nesting depth. */
function checkDepth(text: string) {
  let depth = 0,
    quoted = false,
    escaped = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') quoted = false
    } else if (c === '"') quoted = true
    else if (c === '{' || c === '[') {
      if (++depth > LIMITS.jsonDepth) fail('json-too-deep')
    } else if (c === '}' || c === ']') depth--
  }
}

function decodeBase64(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('data:image/png;base64,'))
    fail('unsupported-image-encoding')
  const encoded = value.slice('data:image/png;base64,'.length)
  if (encoded.length > Math.ceil(LIMITS.pngBytes / 3) * 4) fail('image-too-large')
  if (!encoded.length || encoded.length % 4 !== 0) fail('invalid-image-base64')
  // Linear validation avoids a large repeated regexp stack and Node's permissive decoder.
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
  for (let i = 0; i < encoded.length - padding; i++) {
    const c = encoded.charCodeAt(i)
    if (!(
      (c >= 65 && c <= 90) ||
      (c >= 97 && c <= 122) ||
      (c >= 48 && c <= 57) ||
      c === 43 ||
      c === 47
    ))
      fail('invalid-image-base64')
  }
  const decoded = Buffer.from(encoded, 'base64')
  if (decoded.length > LIMITS.pngBytes) fail('image-too-large')
  if (decoded.toString('base64') !== encoded) fail('invalid-image-base64')
  return decoded
}

/**
 * Validate resource-critical PNG fields before pngjs allocates or inflates anything.
 * Restrict to the opaque 8-bit, non-interlaced RGB/RGBA PNG emitted by the capture path.
 * Reject repeated headers/IDAT gaps/APNG and trailing bytes, rather than accepting
 * multiple images or ambiguous metadata. pngjs checks CRC and handles scanline filters.
 */
function inspectPng(buffer: Buffer) {
  if (
    buffer.length < 45 ||
    !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    fail('invalid-png')
  let offset = 8,
    chunks = 0,
    width = 0,
    height = 0,
    channels = 0
  const compressed: Buffer[] = []
  let sawData = false,
    closedData = false,
    ended = false
  while (offset < buffer.length) {
    if (++chunks > LIMITS.pngChunks || buffer.length - offset < 12) fail('invalid-png')
    const length = buffer.readUInt32BE(offset)
    if (length > buffer.length - offset - 12) fail('invalid-png')
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    if (!/^[A-Za-z]{4}$/.test(type)) fail('invalid-png')
    if (chunks === 1) {
      if (type !== 'IHDR' || length !== 13) fail('invalid-png')
      width = buffer.readUInt32BE(offset + 8)
      height = buffer.readUInt32BE(offset + 12)
      if (!dimension(width) || !dimension(height) || width * height > LIMITS.pixels)
        fail('image-too-large')
      if (
        buffer[offset + 16] !== 8 ||
        ![2, 6].includes(buffer[offset + 17]) ||
        buffer[offset + 18] !== 0 ||
        buffer[offset + 19] !== 0 ||
        buffer[offset + 20] !== 0
      )
        fail('unsupported-png-format')
      channels = buffer[offset + 17] === 6 ? 4 : 3
    } else if (type === 'IHDR') fail('invalid-png')
    else if (type === 'IDAT') {
      if (closedData) fail('invalid-png')
      sawData = true
      compressed.push(buffer.subarray(offset + 8, offset + 8 + length))
    } else {
      if (sawData) closedData = true
      if (type === 'IEND') {
        if (length !== 0 || !sawData || offset + 12 !== buffer.length) fail('invalid-png')
        ended = true
      } else if (['acTL', 'fcTL', 'fdAT'].includes(type)) fail('unsupported-png-format')
      else if (type[0] === type[0].toUpperCase() && type !== 'PLTE') fail('unsupported-png-format')
    }
    offset += length + 12
  }
  if (!ended) fail('invalid-png')
  // Check exact scanline length with a hard zlib output limit. pngjs also bounds
  // non-interlaced inflation, but can otherwise truncate an overlong stream.
  const expectedBytes = (width * channels + 1) * height
  try {
    const raw = inflateSync(Buffer.concat(compressed), { maxOutputLength: expectedBytes })
    if (raw.length !== expectedBytes) fail('invalid-png')
  } catch {
    fail('invalid-png')
  }
  return { width, height }
}

export function safeFailure(error: unknown) {
  return {
    schema: 'veyra-position-replay-v1' as const,
    status: 'input-rejected' as const,
    reason: error instanceof ReplayInputError ? error.code : 'replay-failed',
    privacy: { imageIncluded: false, identifiersIncluded: false, pathsIncluded: false }
  }
}

function parseJson(text: string, maxBytes: number): unknown {
  if (Buffer.byteLength(text, 'utf8') > maxBytes) fail('input-too-large')
  checkDepth(text)
  try {
    return JSON.parse(text)
  } catch {
    fail('invalid-json')
  }
}

interface ReplayGeometry {
  physicalClient: AutomaticPositionContext['physicalClient']
  dipClient: AutomaticPositionContext['dipClient']
  counts: AutomaticPositionContext['counts']
  source: 'position-sample-v1' | 'local-png-manual-geometry'
  capture?: { startedAt: number; finishedAt: number }
}

export function replayPositionSample(text: string) {
  const input = parseJson(text, LIMITS.jsonBytes)
  if (!record(input) || input.version !== 1) fail('unsupported-sample-version')
  const preview = input.preview
  if (
    !record(preview) ||
    !dimension(preview.width) ||
    !dimension(preview.height) ||
    !rectangle(preview.client) ||
    !record(preview.counts) ||
    !count(preview.counts.candidates) ||
    !count(preview.counts.teammates)
  )
    fail('invalid-preview-metadata')
  const capture = preview.capture
  if (capture === undefined || capture === null) fail('missing-capture-evidence')
  if (
    !record(capture) ||
    !rectangle(capture.physicalClient) ||
    !Number.isInteger(capture.physicalClient.width) ||
    !Number.isInteger(capture.physicalClient.height) ||
    !timestamp(capture.startedAt) ||
    !timestamp(capture.finishedAt) ||
    capture.finishedAt < capture.startedAt ||
    capture.geometryCheck !== 'bracketed'
  )
    fail('invalid-capture-metadata')
  return replayDecodedImage(
    decodeBase64(input.imageUrl),
    {
      source: 'position-sample-v1',
      physicalClient: {
        x: capture.physicalClient.x,
        y: capture.physicalClient.y,
        width: capture.physicalClient.width,
        height: capture.physicalClient.height
      },
      dipClient: {
        x: preview.client.x,
        y: preview.client.y,
        width: preview.client.width,
        height: preview.client.height
      },
      counts: { candidates: preview.counts.candidates, teammates: preview.counts.teammates },
      capture: { startedAt: capture.startedAt, finishedAt: capture.finishedAt }
    },
    { width: preview.width, height: preview.height }
  )
}

/** Explicit manual metadata, never promoted to native/bracketed capture evidence. */
export function replayPngWithGeometry(bytes: Buffer, geometryText: string) {
  const input = parseJson(geometryText, LIMITS.geometryBytes)
  const allowed = ['version', 'kind', 'crop', 'physicalClientSize', 'dipClientSize', 'counts']
  if (
    !record(input) ||
    Object.keys(input).some((key) => !allowed.includes(key)) ||
    input.version !== 1 ||
    input.kind !== 'veyra-manual-client-geometry' ||
    input.crop !== 'actual-client-area'
  )
    fail('invalid-manual-geometry')
  const physical = input.physicalClientSize,
    dip = input.dipClientSize,
    counts = input.counts
  const onlyKeys = (value: unknown, keys: string[]) =>
    record(value) && Object.keys(value).every((key) => keys.includes(key))
  if (
    !record(physical) ||
    !onlyKeys(physical, ['width', 'height']) ||
    !dimension(physical.width) ||
    !dimension(physical.height) ||
    !record(dip) ||
    !onlyKeys(dip, ['width', 'height']) ||
    !finite(dip.width) ||
    !finite(dip.height) ||
    dip.width <= 0 ||
    dip.height <= 0 ||
    dip.width > LIMITS.imageSide ||
    dip.height > LIMITS.imageSide ||
    !record(counts) ||
    !onlyKeys(counts, ['candidates', 'teammates']) ||
    !count(counts.candidates) ||
    !count(counts.teammates)
  )
    fail('invalid-manual-geometry')
  return replayDecodedImage(bytes, {
    source: 'local-png-manual-geometry',
    // Origins are irrelevant to the single-frame size/layout check. These zeros
    // are explicitly synthetic in the report, not recovered screen coordinates.
    physicalClient: { x: 0, y: 0, width: physical.width, height: physical.height },
    dipClient: { x: 0, y: 0, width: dip.width, height: dip.height },
    counts: { candidates: counts.candidates, teammates: counts.teammates }
  })
}

function replayDecodedImage(
  bytes: Buffer,
  geometry: ReplayGeometry,
  previewSize?: { width: number; height: number }
) {
  if (bytes.length > LIMITS.pngBytes) fail('image-too-large')
  const pngHeader = inspectPng(bytes)
  if (
    previewSize &&
    (pngHeader.width !== previewSize.width || pngHeader.height !== previewSize.height)
  )
    fail('image-dimensions-mismatch')
  if (
    pngHeader.width !== geometry.physicalClient.width ||
    pngHeader.height !== geometry.physicalClient.height
  )
    fail('physical-client-dimensions-mismatch')
  let image: { width: number; height: number; data: Buffer }
  try {
    image = PNG.sync.read(bytes, { checkCRC: true })
  } catch {
    fail('invalid-png')
  }
  if (
    image.width !== pngHeader.width ||
    image.height !== pngHeader.height ||
    image.data.length !== image.width * image.height * 4
  )
    fail('invalid-png')
  const pixels = new Uint8Array(image.width * image.height)
  for (let i = 0; i < pixels.length; i++) {
    const offset = i * 4
    if (image.data[offset + 3] !== 255) fail('unsupported-image-transparency')
    pixels[i] =
      (image.data[offset] * 77 + image.data[offset + 1] * 150 + image.data[offset + 2] * 29) >> 8
  }
  const context: AutomaticPositionContext = {
    sessionKey: 'offline-synthetic',
    pid: 1,
    windowHandle: 'offline-synthetic',
    displayId: 'offline-synthetic',
    physicalClient: geometry.physicalClient,
    dipClient: geometry.dipClient,
    counts: geometry.counts,
    foreground: true,
    phase: 'ChampSelect'
  }
  const capturedAt = geometry.capture?.finishedAt ?? 0
  const manual = geometry.source === 'local-png-manual-geometry'
  const result = inspectNormalizedLegacyLayout({
    width: image.width,
    height: image.height,
    pixels,
    context,
    sequence: 1,
    capturedAt
  })
  const decision = new AutomaticPositionResolver().evaluate({
    enabled: true,
    current: context,
    settings: createDefaultChampSelectOverlaySettings(),
    observation: result.observation,
    now: capturedAt
  })
  return {
    schema: 'veyra-position-replay-v1' as const,
    status: 'replayed' as const,
    source: {
      kind: geometry.source,
      geometryEvidence: manual ? 'user-supplied-unverified' : 'exported-capture-metadata',
      cropEvidence: manual ? 'user-asserted-actual-client-area' : 'exported-client-crop'
    },
    sample: {
      imageWidth: image.width,
      imageHeight: image.height,
      dipWidth: context.dipClient.width,
      dipHeight: context.dipClient.height,
      candidates: context.counts.candidates,
      teammates: context.counts.teammates,
      ...(geometry.capture
        ? { captureDurationMs: geometry.capture.finishedAt - geometry.capture.startedAt }
        : {})
    },
    provider: {
      observationAvailable: result.observation !== null,
      reason: result.diagnostic.reason,
      metrics: result.diagnostic.metrics
    },
    resolver: {
      scope: 'synthetic-current-context-single-frame',
      kind: decision.kind,
      ...('reason' in decision ? { reason: decision.reason } : {})
    },
    assumptions: {
      phase: 'ChampSelect',
      foreground: true,
      identities: 'synthetic-placeholders',
      enabled: true,
      manualCalibration: 'none-default-settings',
      currentGeometry: manual ? 'copied-from-user-supplied-metadata' : 'copied-from-export',
      origin: manual ? 'synthetic-zero' : 'copied-from-export',
      now: manual ? 'synthetic-zero' : 'capture-finished-at',
      sequence: 1
    },
    notReproduced: [
      ...(manual ? ['client-crop-boundaries-and-manual-dip-measurement'] : []),
      'historical-foreground-phase-and-identities',
      'current-display-id-and-scale-factor-check',
      'native-before-after-geometry-stability',
      'historical-capture-freshness-and-saved-manual-settings',
      'previous-frame-timing-or-two-frame-agreement'
    ],
    privacy: { imageIncluded: false, identifiersIncluded: false, pathsIncluded: false }
  }
}
