import { deflateSync } from 'node:zlib'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'

import {
  LIMITS,
  ReplayInputError,
  replayPngWithGeometry,
  replayPositionSample,
  safeFailure
} from './replay'

/** Artificial geometry only. This fixture is not a screenshot or accuracy evidence. */
function syntheticSample(width = 1280, height = 720) {
  const base = new Uint8Array(1280 * 720)
  for (let slot = 0; slot < 10; slot++) {
    const left = Math.round(351.5 + 58.5 * slot)
    for (let offset = 5; offset < 45; offset += 5) base[10 * 1280 + left + offset] = 100
  }
  for (let row = 0; row < 5; row++)
    for (let angle = 0; angle < 16; angle++) {
      const theta = (2 * Math.PI * angle) / 16
      base[
        Math.round(135 + 80 * row + 29 * Math.sin(theta)) * 1280 +
          Math.round(86 + 29 * Math.cos(theta))
      ] = 120
    }
  const scale = width / 1280
  const data = Buffer.alloc(width * height * 4, 255)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const gray = base[Math.floor(y / scale) * 1280 + Math.floor(x / scale)] ?? 0
      const offset = (y * width + x) * 4
      data[offset] = gray
      data[offset + 1] = gray
      data[offset + 2] = gray
    }
  return {
    version: 1,
    imageUrl: 'data:image/png;base64,' + PNG.sync.write({ width, height, data }).toString('base64'),
    note: 'PRIVATE_NOTE_DO_NOT_COPY',
    preview: {
      requestId: 'PRIVATE_REQUEST_DO_NOT_COPY',
      width,
      height,
      client: { x: 10, y: 30, width: 1280, height: 720 },
      counts: { candidates: 3, teammates: 5 },
      capture: {
        physicalClient: { x: 10, y: 30, width, height },
        startedAt: 1000,
        finishedAt: 1025,
        geometryCheck: 'bracketed',
        displayId: 'PRIVATE_DISPLAY_DO_NOT_COPY',
        scaleFactor: scale
      },
      automatic: { reason: 'uncertain', selection: null }
    }
  }
}
function replay(sample: ReturnType<typeof syntheticSample>) {
  return replayPositionSample(JSON.stringify(sample))
}
function assertFailure(sample: unknown, reason: string) {
  expect(() => replayPositionSample(JSON.stringify(sample))).toThrow(reason)
}
function pngChange(sample: ReturnType<typeof syntheticSample>, change: (png: Buffer) => void) {
  const png = Buffer.from(sample.imageUrl.split(',')[1], 'base64')
  change(png)
  sample.imageUrl = 'data:image/png;base64,' + png.toString('base64')
}
function chunk(type: string, payload: Buffer) {
  const bytes = Buffer.alloc(payload.length + 12)
  bytes.writeUInt32BE(payload.length, 0)
  bytes.write(type, 4, 'ascii')
  payload.copy(bytes, 8)
  let crc = 0xffffffff
  for (const byte of bytes.subarray(4, bytes.length - 4)) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, bytes.length - 4)
  return bytes
}
function manualGeometry() {
  return {
    version: 1,
    kind: 'veyra-manual-client-geometry',
    crop: 'actual-client-area',
    physicalClientSize: { width: 1280, height: 720 },
    dipClientSize: { width: 1280, height: 720 },
    counts: { candidates: 3, teammates: 5 }
  }
}

describe('ordinary cropped PNG plus explicit unverified geometry', () => {
  const png = () => Buffer.from(syntheticSample().imageUrl.split(',')[1], 'base64')
  it('uses the shared decoder/detector without fabricating bracketed evidence', () => {
    const report = replayPngWithGeometry(png(), JSON.stringify(manualGeometry()))
    expect(report.provider.observationAvailable).toBe(true)
    expect(report.resolver.kind).toBe('confirming')
    expect(report.source).toEqual({
      kind: 'local-png-manual-geometry',
      geometryEvidence: 'user-supplied-unverified',
      cropEvidence: 'user-asserted-actual-client-area'
    })
    expect(report.assumptions).toMatchObject({ origin: 'synthetic-zero', now: 'synthetic-zero' })
    expect(report.sample).not.toHaveProperty('captureDurationMs')
    expect(JSON.stringify(report)).not.toMatch(/bracketed|startedAt|finishedAt|data:image|imageUrl/)
  })
  it('requires explicit dimensions and counts instead of inferring them from the PNG', () => {
    const metadata = manualGeometry()
    delete (metadata as { dipClientSize?: unknown }).dipClientSize
    expect(() => replayPngWithGeometry(png(), JSON.stringify(metadata))).toThrow(
      'invalid-manual-geometry'
    )
    expect(() => replayPngWithGeometry(png(), '{}')).toThrow('invalid-manual-geometry')
  })
  it('refuses a fabricated capture or bracket declaration in manual metadata', () => {
    for (const extra of [
      { capture: { geometryCheck: 'bracketed' } },
      { geometryCheck: 'bracketed' },
      { username: 'PRIVATE' }
    ])
      expect(() =>
        replayPngWithGeometry(png(), JSON.stringify({ ...manualGeometry(), ...extra }))
      ).toThrow('invalid-manual-geometry')
  })
  it('requires the actual-client-area crop assertion and matching dimensions', () => {
    const metadata = manualGeometry()
    metadata.crop = 'whole-screen'
    expect(() => replayPngWithGeometry(png(), JSON.stringify(metadata))).toThrow(
      'invalid-manual-geometry'
    )
    metadata.crop = 'actual-client-area'
    metadata.physicalClientSize.width = 1600
    expect(() => replayPngWithGeometry(png(), JSON.stringify(metadata))).toThrow(
      'physical-client-dimensions-mismatch'
    )
  })
  it('shares PNG rejection and applies a smaller metadata size bound', () => {
    expect(() =>
      replayPngWithGeometry(Buffer.from('PRIVATE_NOT_PNG'), JSON.stringify(manualGeometry()))
    ).toThrow('invalid-png')
    expect(() => replayPngWithGeometry(png(), ' '.repeat(LIMITS.geometryBytes + 1))).toThrow(
      'input-too-large'
    )
  })
})

describe('local single-frame replay with synthetic PNG fixtures', () => {
  it.each([1280, 1600, 1920, 2560])(
    'uses the shared detector at width %i and stops at single-frame confirming',
    (width) => {
      const report = replay(syntheticSample(width, (width * 720) / 1280))
      expect(report.status).toBe('replayed')
      expect(report.provider.observationAvailable).toBe(true)
      expect(report.resolver).toEqual({
        scope: 'synthetic-current-context-single-frame',
        kind: 'confirming'
      })
      expect(report.assumptions.foreground).toBe(true)
      expect(report.notReproduced).toContain('previous-frame-timing-or-two-frame-agreement')
      expect(
        Object.values(report.provider.metrics).every(
          (value) =>
            typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
        )
      ).toBe(true)
    }
  )
  it('reports a blank-frame provider rejection without suggesting an alignment', () => {
    const sample = syntheticSample()
    const data = Buffer.alloc(1280 * 720 * 4)
    for (let i = 3; i < data.length; i += 4) data[i] = 255
    sample.imageUrl =
      'data:image/png;base64,' +
      PNG.sync.write({ width: 1280, height: 720, data }).toString('base64')
    const report = replay(sample)
    expect(report.provider.observationAvailable).toBe(false)
    expect(report.provider.reason).not.toBe('matched')
    expect(report.resolver.kind).toBe('unavailable')
    expect(report.resolver.reason).toBe('no-observation')
  })
  it('accepts opaque RGB PNG and uses RGBA channels with the same grayscale weights as BGRA', () => {
    const sample = syntheticSample()
    const png = PNG.sync.read(Buffer.from(sample.imageUrl.split(',')[1], 'base64'))
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i + 1] = 0
      png.data[i + 2] = 0
    }
    sample.imageUrl =
      'data:image/png;base64,' + PNG.sync.write(png, { colorType: 2 }).toString('base64')
    expect(replay(sample).provider.observationAvailable).toBe(true)
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i + 2] = png.data[i]
      png.data[i] = 0
    }
    sample.imageUrl = 'data:image/png;base64,' + PNG.sync.write(png).toString('base64')
    expect(replay(sample).provider.observationAvailable).toBe(false)
  })
  it('reports unsupported teammate counts through the provider', () => {
    const sample = syntheticSample()
    sample.preview.counts.teammates = 4
    expect(replay(sample).provider.observationAvailable).toBe(false)
  })
  it('fails closed when capture evidence is missing', () => {
    const sample = syntheticSample()
    delete (sample.preview as { capture?: unknown }).capture
    assertFailure(sample, 'missing-capture-evidence')
  })
  it('rejects mismatched PNG and preview dimensions before decoding', () => {
    const sample = syntheticSample()
    sample.preview.width = 1600
    assertFailure(sample, 'image-dimensions-mismatch')
  })
  it('rejects PNG and capture physical dimensions mismatch', () => {
    const sample = syntheticSample()
    sample.preview.capture.physicalClient.height = 800
    assertFailure(sample, 'physical-client-dimensions-mismatch')
  })
  it('rejects reversed capture timing', () => {
    const sample = syntheticSample()
    sample.preview.capture.finishedAt = 999
    assertFailure(sample, 'invalid-capture-metadata')
  })
  it('does not accept missing bracketed capture metadata', () => {
    const sample = syntheticSample()
    sample.preview.capture.geometryCheck = 'unknown'
    assertFailure(sample, 'invalid-capture-metadata')
  })
  it('ignores user strings and the saved automatic decision', () => {
    const sample = syntheticSample(),
      before = JSON.stringify(sample)
    const report = replay(sample),
      output = JSON.stringify(report)
    expect(JSON.stringify(sample)).toBe(before)
    for (const privateText of [
      'PRIVATE_',
      'imageUrl',
      'data:image',
      'requestId',
      'displayId',
      'selection'
    ])
      expect(output).not.toContain(privateText)
    expect(report.resolver.kind).toBe('confirming')
  })
  it('rejects unknown versions and malformed metadata', () => {
    const sample = syntheticSample()
    sample.version = 2
    assertFailure(sample, 'unsupported-sample-version')
    sample.version = 1
    sample.preview.counts.candidates = 1.5
    assertFailure(sample, 'invalid-preview-metadata')
  })
  it('refuses URLs and permissive base64 decoding', () => {
    const sample = syntheticSample()
    sample.imageUrl = 'https://example.invalid/private.png'
    assertFailure(sample, 'unsupported-image-encoding')
    sample.imageUrl = 'data:image/png;base64,%%%='
    assertFailure(sample, 'invalid-image-base64')
    sample.imageUrl = 'data:image/png;base64,AB=='
    assertFailure(sample, 'invalid-image-base64')
  })
  it('bounds JSON nesting and byte size', () => {
    expect(() => replayPositionSample('['.repeat(LIMITS.jsonDepth + 1))).toThrow('json-too-deep')
    expect(() => replayPositionSample(' '.repeat(LIMITS.jsonBytes + 1))).toThrow('input-too-large')
  })
  it('does not confuse escaped JSON strings with nesting', () => {
    const sample = syntheticSample()
    sample.note = '"\\' + '['.repeat(100)
    expect(replay(sample).status).toBe('replayed')
  })
  it('rejects oversized dimensions before allocation or decompression', () => {
    const sample = syntheticSample()
    pngChange(sample, (png) => png.writeUInt32BE(0x7fffffff, 16))
    assertFailure(sample, 'image-too-large')
  })
  it.each(['interlaced', '16bit', 'indexed'])(
    'rejects unsupported %s PNG before decode',
    (kind) => {
      const sample = syntheticSample()
      pngChange(sample, (png) => {
        if (kind === 'interlaced') png[28] = 1
        else if (kind === '16bit') png[24] = 16
        else png[25] = 3
      })
      assertFailure(sample, 'unsupported-png-format')
    }
  )
  it('rejects corrupted PNG checksums and truncated data', () => {
    const sample = syntheticSample()
    pngChange(sample, (png) => {
      png[29] ^= 1
    })
    assertFailure(sample, 'invalid-png')
    sample.imageUrl =
      'data:image/png;base64,' + Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64')
    assertFailure(sample, 'invalid-png')
  })
  it('rejects inflated data beyond the bounded expected scanline size', () => {
    const sample = syntheticSample()
    const original = Buffer.from(sample.imageUrl.split(',')[1], 'base64')
    const tooLong = deflateSync(Buffer.alloc((1280 * 4 + 1) * 720 + 1))
    const png = Buffer.concat([
      original.subarray(0, 33),
      chunk('IDAT', tooLong),
      chunk('IEND', Buffer.alloc(0))
    ])
    sample.imageUrl = 'data:image/png;base64,' + png.toString('base64')
    assertFailure(sample, 'invalid-png')
  })
  it('rejects trailing bytes, repeated headers, and out-of-bounds chunks', () => {
    const sample = syntheticSample(),
      original = Buffer.from(sample.imageUrl.split(',')[1], 'base64')
    sample.imageUrl =
      'data:image/png;base64,' + Buffer.concat([original, Buffer.from([0])]).toString('base64')
    assertFailure(sample, 'invalid-png')
    sample.imageUrl =
      'data:image/png;base64,' +
      Buffer.concat([original.subarray(0, 33), original.subarray(8)]).toString('base64')
    assertFailure(sample, 'invalid-png')
    original.writeUInt32BE(0x7fffffff, 33)
    sample.imageUrl = 'data:image/png;base64,' + original.toString('base64')
    assertFailure(sample, 'invalid-png')
  })
  it('rejects transparent samples rather than assuming NativeImage premultiplication parity', () => {
    const sample = syntheticSample()
    const png = PNG.sync.read(Buffer.from(sample.imageUrl.split(',')[1], 'base64'))
    png.data[3] = 0
    sample.imageUrl = 'data:image/png;base64,' + PNG.sync.write(png).toString('base64')
    assertFailure(sample, 'unsupported-image-transparency')
  })
  it('sanitizes unexpected errors and never returns stack traces or input paths', () => {
    const report = safeFailure(new Error('C:\\Users\\PRIVATE_NAME\\sample.json PRIVATE_NOTE'))
    expect(report.reason).toBe('replay-failed')
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE|stack|Users/)
    expect(safeFailure(new ReplayInputError('input-unreadable')).reason).toBe('input-unreadable')
  })
})
