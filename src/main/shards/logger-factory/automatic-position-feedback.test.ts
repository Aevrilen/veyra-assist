import type { AutomaticPositionDiagnosticMetrics } from '@shared/champ-select-overlay/automatic-position/diagnostics'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

import { collectAutomaticPositionFeedback } from './automatic-position-feedback'
import { createFeedbackBundle } from './feedback-bundle'
import { redactFeedbackLog } from './feedback-redaction'

const unzipper = createRequire(path.join(process.cwd(), 'package.json'))('unzipper') as {
  Open: {
    file(path: string): Promise<{ files: Array<{ path: string; buffer(): Promise<Buffer> }> }>
  }
}
const id = '11111111-1111-4111-8111-111111111111'
const id2 = '22222222-2222-4222-8222-222222222222'
const temporary: string[] = []
async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'veyra-attempt-export-'))
  temporary.push(directory)
  return directory
}
afterEach(async () => {
  vi.restoreAllMocks()
  for (const directory of temporary.splice(0))
    await fs.rm(directory, { recursive: true, force: true })
})
const record = (reason: string, at: number, options: Record<string, unknown> = {}) =>
  `[2026-10-15 12:34:56:789] [champ-select-overlay-main] [info] [automatic-position] ${JSON.stringify({ stage: 'controller', reason, metrics: {}, attemptId: id, firstAt: at, lastAt: at, repeatCount: 1, ...options })}\n`
async function collect(directory: string, limits?: { snapshotBytes: number; outputBytes: number }) {
  const result = (await collectAutomaticPositionFeedback(
    directory,
    await fs.readdir(directory),
    Buffer.alloc(16),
    limits
  ))!
  const entries = Object.fromEntries(
    result.entries.map((entry) => [entry.name, entry.data.toString()])
  )
  return {
    ...result,
    entries,
    manifest: JSON.parse(entries['automatic-position/manifest.json'])
  }
}

it('preserves finite numeric evidence after both generic redaction and dedicated ZIP export, without identities or images', async () => {
  const directory = await fixture()
  const metrics: AutomaticPositionDiagnosticMetrics = {
    width: 1600,
    height: 900,
    physicalWidth: 2000,
    physicalHeight: 1125,
    dipWidth: 1600,
    dipHeight: 900,
    physicalX: -1920,
    physicalY: 0,
    scaleFactor: 1.25,
    expectedScaleFactor: 1.25,
    normalizedWidth: 1600,
    normalizedHeight: 900,
    normalizationScale: 0.8,
    scaleX: 1.25,
    scaleY: 1.25,
    benchFirstLeft: 156,
    benchStep: 130,
    benchSampleTop: 160,
    benchSampleBottom: 240,
    benchOutsideY: 155,
    benchContrastThreshold: 18,
    benchSlotThreshold: 6,
    benchTotalThreshold: 60,
    teammateCenterX: 100,
    teammateFirstY: 75,
    teammateStep: 100,
    ringRadiusMin: 19,
    ringRadiusMax: 22,
    ringOutsideRadius: 28,
    teammateContrastThreshold: 20,
    teammateRowThreshold: 5,
    teammateTotalThreshold: 25,
    candidates: 10,
    teammates: 5,
    benchEdges: 4,
    required: 6,
    benchTotal: 53,
    teammateTotal: 20,
    benchSlot0Edges: 10,
    benchSlot1Edges: 9,
    benchSlot2Edges: 8,
    benchSlot3Edges: 7,
    benchSlot4Edges: 6,
    benchSlot5Edges: 5,
    benchSlot6Edges: 4,
    benchSlot7Edges: 3,
    benchSlot8Edges: 2,
    benchSlot9Edges: 1,
    teammateRow0Edges: 5,
    teammateRow1Edges: 4,
    teammateRow2Edges: 3,
    teammateRow3Edges: 2,
    teammateRow4Edges: 1,
    captureOrdinal: 2,
    captureDurationMs: 51,
    observationAgeMs: 72,
    frameGapMs: 350,
    candidateFirstDelta: 0.2,
    teammateFirstDelta: 0.1,
    candidateStepDelta: 0.3,
    teammateStepDelta: 0.4,
    confidenceHigh: false,
    ambiguous: true,
    hasSession: true,
    sessionChanged: false,
    windowChanged: false
  }
  const evidence = record('bench-slot-edges', 2, {
    stage: 'provider',
    metrics
  })
  const redacted = await redactFeedbackLog(evidence, Buffer.alloc(16))
  const parsedGeneric = JSON.parse(
    redacted.text.slice(
      redacted.text.indexOf('[automatic-position] ') + '[automatic-position] '.length
    )
  )
  expect(parsedGeneric.metrics).toEqual(metrics)
  const raw = record('trial-started', 1) + evidence + record('manual-save-succeeded', 3)
  await fs.writeFile(path.join(directory, 'AUTO_POSITION_20261015.log'), raw)
  const destination = path.join(directory, 'feedback.zip')
  const summary = await createFeedbackBundle(directory, destination, {} as never)
  const zip = await unzipper.Open.file(destination)
  const entries = Object.fromEntries(
    await Promise.all(zip.files.map(async (file) => [file.path, (await file.buffer()).toString()]))
  )
  const lines = entries['automatic-position/attempts.log'].trim().split('\n')
  const exported = lines.map((line: string) =>
    JSON.parse(line.slice(line.indexOf('[automatic-position] ') + '[automatic-position] '.length))
  )
  expect(exported[1]).toMatchObject({
    stage: 'provider',
    reason: 'bench-slot-edges',
    metrics
  })
  expect(new Set(exported.map((entry: { attemptId: string }) => entry.attemptId)).size).toBe(1)
  expect(Object.values(entries).join('')).not.toContain(id)
  expect(summary.automaticPosition).toMatchObject({
    exportedAttempts: 1,
    limited: false
  })
  expect(await fs.readFile(path.join(directory, 'AUTO_POSITION_20261015.log'), 'utf8')).toBe(raw)
})

it('reassembles an attempt across more than twenty daily/rotated volumes without generic log tails or event caps', async () => {
  const directory = await fixture()
  for (let i = 0; i < 25; i++) {
    const reason =
      i === 0 ? 'trial-started' : i === 24 ? 'manual-save-succeeded' : 'capture-finished'
    await fs.writeFile(
      path.join(directory, `AUTO_POSITION_20261015${i || ''}.log`),
      record(reason, i + 1, { metrics: { captureOrdinal: i } })
    )
  }
  const destination = path.join(directory, 'feedback.zip')
  const summary = await createFeedbackBundle(directory, destination, {} as never, {
    files: 1,
    fileBytes: 1,
    totalBytes: 1
  })
  expect(summary.automaticPosition).toMatchObject({
    exportedAttempts: 1,
    sourceFiles: 25,
    limited: false
  })
  const zip = await unzipper.Open.file(destination)
  const log = (
    await zip.files.find((file) => file.path === 'automatic-position/attempts.log')!.buffer()
  ).toString()
  expect(log.trim().split('\n')).toHaveLength(25)
  expect(log.indexOf('"reason":"trial-started"')).toBeLessThan(
    log.indexOf('"reason":"manual-save-succeeded"')
  )
  for (let i = 0; i < 25; i++) expect(log).toContain(`"captureOrdinal":${i}`)
})

it('omits an oversized attempt whole and still selects the newest small failure chain, with explicit limits', async () => {
  const directory = await fixture()
  const huge =
    record('trial-started', 1) +
    Array.from({ length: 100 }, (_, i) => record('capture-finished', 2 + i)).join('') +
    record('trial-cancelled', 102)
  const small =
    record('trial-started', 200, { attemptId: id2 }) +
    record('unsupported', 201, { attemptId: id2 })
  await fs.writeFile(path.join(directory, 'AUTO_POSITION_20261015.log'), huge + small)
  const result = await collect(directory, {
    snapshotBytes: 1024 * 1024,
    outputBytes: 1000
  })
  expect(result.summary).toMatchObject({
    exportedAttempts: 1,
    omittedAttempts: 1,
    limited: true
  })
  expect(
    result.manifest.attempts.map((attempt: { omission: string }) => attempt.omission)
  ).toContain('whole-attempt-output-limit')
  expect(result.entries['automatic-position/attempts.log'].trim().split('\n')).toHaveLength(2)
  expect(result.entries['automatic-position/attempts.log']).toContain('"reason":"unsupported"')
  expect(result.entries['automatic-position/attempts.log']).not.toContain(
    '"reason":"capture-finished"'
  )
})

it('reports skipped full source files, missing starts, ongoing and completed preview outcomes distinctly', async () => {
  const directory = await fixture()
  const old = record('trial-started', 1)
  const recent =
    record('capture-finished', 2) +
    record('trial-started', 4, { attemptId: id2 }) +
    record('preview-retained', 5, { attemptId: id2 })
  await fs.writeFile(path.join(directory, 'AUTO_POSITION_20261014.log'), old)
  await fs.writeFile(path.join(directory, 'AUTO_POSITION_20261015.log'), recent)
  const result = await collect(directory, {
    snapshotBytes: Buffer.byteLength(recent),
    outputBytes: 5000
  })
  expect(result.summary).toMatchObject({ skippedFiles: 1, limited: true })
  expect(result.manifest.skippedSourceFiles[0].reason).toBe('whole-file-source-limit')
  expect(
    result.manifest.attempts.map((attempt: { completeness: string }) => attempt.completeness)
  ).toEqual(['outcome-recorded', 'missing-start'])
  await fs.writeFile(path.join(directory, 'AUTO_POSITION_20261015.log'), record('trial-started', 1))
  await fs.unlink(path.join(directory, 'AUTO_POSITION_20261014.log'))
  expect((await collect(directory)).manifest.attempts[0].completeness).toBe('ongoing')
})

it('preserves privacy gates, rejects malformed and unfinished records, and excludes symlinks/nonlogs', async () => {
  const directory = await fixture()
  const raw =
    record('trial-started', 1) +
    record('capture-finished', 2, { sessionKey: 'PRIVATE-SESSION' }) +
    record('capture-finished', 3, { image: 'data:image/PRIVATE' }) +
    record('capture-finished', 4, {
      windowTitle: 'PRIVATE-TITLE',
      account: 'PRIVATE-NAME'
    }) +
    record('not-allowlisted', 5) +
    record('trial-cancelled', 6).trimEnd()
  await fs.writeFile(path.join(directory, 'AUTO_POSITION_20261015.log'), raw)
  await fs.writeFile(path.join(directory, 'settings.json'), 'PRIVATE-SETTINGS')
  const link = path.join(directory, 'AUTO_POSITION_20261016.log')
  try {
    await fs.symlink(path.join(directory, 'settings.json'), link)
  } catch (error) {
    if (process.platform !== 'win32' || (error as NodeJS.ErrnoException).code !== 'EPERM')
      throw error
    // Creating file symlinks needs an extra Windows privilege. Preserve every
    // privacy/export assertion and exercise the explicit lstat symlink guard.
    await fs.writeFile(link, 'PRIVATE-SETTINGS')
    const original = fs.lstat.bind(fs)
    vi.spyOn(fs, 'lstat').mockImplementation((async (target, options) => {
      const stat = await original(target, options)
      return String(target) === link ? Object.assign(stat, { isSymbolicLink: () => true }) : stat
    }) as typeof fs.lstat)
  }
  const result = await collect(directory)
  expect(result.summary).toMatchObject({
    sourceFiles: 1,
    rejectedRecords: 4,
    incompleteRecords: 1,
    limited: true
  })
  expect(Object.values(result.entries).join('')).not.toMatch(
    /PRIVATE-|data:image|sessionKey|windowTitle/
  )
  expect(result.entries['automatic-position/attempts.log'].trim().split('\n')).toHaveLength(1)
  expect(await fs.readFile(path.join(directory, 'AUTO_POSITION_20261015.log'), 'utf8')).toBe(raw)
})
