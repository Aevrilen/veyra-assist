import {
  AUTOMATIC_POSITION_MARKER,
  sanitizeAutomaticPositionRecord
} from '@main/logger/automatic-position-diagnostic'
import type { AutomaticPositionDiagnosticRecord } from '@shared/champ-select-overlay/automatic-position/diagnostics'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { setImmediate } from 'node:timers/promises'

import { isPrivateFeedbackRecord, pseudonymizeFeedbackId } from './feedback-redaction'

export const AUTOMATIC_POSITION_FEEDBACK_LIMITS = {
  // Whole source volumes only, never a tail; a second consistency pass may read
  // the same snapshots once more. Local retention has no event/count/age cap.
  snapshotBytes: 256 * 1024 * 1024,
  outputBytes: 64 * 1024 * 1024
}
const NAME = /^AUTO_POSITION_(\d{8})(\d*)\.log$/
const HEADER =
  /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}:\d{3}\] \[champ-select-overlay-main\] \[info\] /
const TERMINAL = new Set([
  'trial-cancelled',
  'trial-disposed',
  'manual-save-succeeded',
  'capture-unavailable',
  'unsupported',
  'source-changed',
  'geometry-changed'
])
type Snapshot = {
  name: string
  ino: number
  dev: number
  size: number
  hash?: string
}
type Trace = {
  id: string
  firstAt: number
  lastAt: number
  records: number
  occurrences: number
  bytes: number
  started: boolean
  ended: boolean
  outcomePresent: boolean
  selected: boolean
  copied: number
  lines: string[]
  changed: boolean
}

function parsedLine(line: string, salt: Buffer) {
  const match = HEADER.exec(line)
  if (!match || isPrivateFeedbackRecord(line)) return null
  const body = line.slice(match[0].length)
  if (!body.startsWith(AUTOMATIC_POSITION_MARKER)) return null
  let record: AutomaticPositionDiagnosticRecord | null
  try {
    record = sanitizeAutomaticPositionRecord(
      JSON.parse(body.slice(AUTOMATIC_POSITION_MARKER.length))
    )
  } catch {
    return null
  }
  if (!record) return null
  const id = pseudonymizeFeedbackId(record.attemptId, salt)
  const text =
    match[0] + AUTOMATIC_POSITION_MARKER + JSON.stringify({ ...record, attemptId: id }) + '\n'
  return { record, id, text }
}

async function readSnapshot(directory: string, snapshot: Snapshot) {
  const handle = await fs.open(path.join(directory, snapshot.name), 'r').catch(() => null)
  if (!handle) return null
  try {
    const stat = await handle.stat()
    if (
      !stat.isFile() ||
      stat.ino !== snapshot.ino ||
      stat.dev !== snapshot.dev ||
      stat.size < snapshot.size
    )
      return null
    const data = Buffer.alloc(snapshot.size)
    let read = 0
    while (read < data.length) {
      const result = await handle.read(data, read, data.length - read, read)
      if (!result.bytesRead) return null
      read += result.bytesRead
    }
    return data
  } catch {
    return null
  } finally {
    await handle.close()
  }
}

/** Whole attempts, newest first; every limitation is represented in the manifest. */
export async function collectAutomaticPositionFeedback(
  directory: string,
  names: string[],
  salt: Buffer,
  limits = AUTOMATIC_POSITION_FEEDBACK_LIMITS
) {
  const candidates: Snapshot[] = []
  let unreadableFiles = 0
  for (const name of names.filter((name) => NAME.test(name))) {
    const stat = await fs.lstat(path.join(directory, name)).catch(() => null)
    if (stat?.isFile() && !stat.isSymbolicLink())
      candidates.push({ name, ino: stat.ino, dev: stat.dev, size: stat.size })
    else if (!stat) unreadableFiles++
  }
  // Local day + numeric rotation is the writer order, independent of mtime.
  candidates.sort((a, b) => {
    const aa = NAME.exec(a.name)!,
      bb = NAME.exec(b.name)!
    return bb[1].localeCompare(aa[1]) || Number(bb[2] || 0) - Number(aa[2] || 0)
  })
  if (candidates.length === 0 && unreadableFiles === 0) return null
  const snapshots: Snapshot[] = []
  const skippedFiles: Array<{ name: string; reason: string; bytes: number }> = []
  let snapshotBytes = 0
  for (const candidate of candidates) {
    if (snapshotBytes + candidate.size > limits.snapshotBytes) {
      skippedFiles.push({
        name: candidate.name,
        reason: 'whole-file-source-limit',
        bytes: candidate.size
      })
      continue
    }
    snapshotBytes += candidate.size
    snapshots.push(candidate)
  }
  snapshots.reverse()
  const traces = new Map<string, Trace>()
  let rejectedRecords = 0
  let incompleteRecords = 0
  let sourceBytesRead = 0
  const visit = async (
    data: Buffer,
    callback: (parsed: NonNullable<ReturnType<typeof parsedLine>>) => void,
    countRejected: boolean
  ) => {
    let start = 0,
      count = 0
    for (;;) {
      const end = data.indexOf(10, start)
      if (end < 0) break
      if (++count % 250 === 0) await setImmediate()
      const parsed = parsedLine(data.subarray(start, end).toString('utf8').replace(/\r$/, ''), salt)
      if (parsed) callback(parsed)
      else if (countRejected) rejectedRecords++
      start = end + 1
    }
    if (start < data.length && countRejected) incompleteRecords++
  }
  for (const snapshot of snapshots) {
    const data = await readSnapshot(directory, snapshot)
    if (!data) {
      unreadableFiles++
      continue
    }
    sourceBytesRead += data.length
    snapshot.hash = createHash('sha256').update(data).digest('hex')
    await visit(
      data,
      ({ record, id, text }) => {
        let trace = traces.get(id)
        if (!trace) {
          trace = {
            id,
            firstAt: record.firstAt,
            lastAt: record.lastAt,
            records: 0,
            occurrences: 0,
            bytes: 0,
            started: false,
            ended: false,
            outcomePresent: false,
            selected: false,
            copied: 0,
            lines: [],
            changed: false
          }
          traces.set(id, trace)
        }
        trace.firstAt = Math.min(trace.firstAt, record.firstAt)
        trace.lastAt = Math.max(trace.lastAt, record.lastAt)
        trace.records++
        trace.occurrences += record.repeatCount
        trace.bytes += Buffer.byteLength(text)
        if (record.stage === 'controller') {
          trace.started ||= record.reason === 'trial-started'
          trace.ended ||= TERMINAL.has(record.reason)
          trace.outcomePresent ||= record.reason === 'preview-retained'
        }
      },
      true
    )
  }
  const sorted = [...traces.values()].sort((a, b) => b.lastAt - a.lastAt || b.firstAt - a.firstAt)
  let outputBytes = 0
  for (const trace of sorted) {
    if (outputBytes + trace.bytes <= limits.outputBytes) {
      trace.selected = true
      outputBytes += trace.bytes
    }
  }
  // Re-read consistent complete snapshots, retaining only selected whole traces.
  // This bounds retained trace text by outputBytes rather than all scanned history.
  for (const snapshot of snapshots) {
    if (!snapshot.hash) continue
    const data = await readSnapshot(directory, snapshot)
    if (!data || createHash('sha256').update(data).digest('hex') !== snapshot.hash) {
      unreadableFiles++
      // Cannot safely know which affected traces changed; report and do not label
      // any selected trace as complete. Missing counts below omit affected traces.
      for (const trace of sorted) if (trace.selected) trace.changed = true
      continue
    }
    sourceBytesRead += data.length
    await visit(
      data,
      ({ id, text }) => {
        const trace = traces.get(id)!
        if (trace.selected) {
          trace.lines.push(text)
          trace.copied++
        }
      },
      false
    )
  }
  const entries: Array<{ name: string; data: Buffer }> = []
  let partialAttempts = 0,
    omittedAttempts = 0,
    exportedAttempts = 0,
    recordOffset = 0
  const exportedText: string[] = []
  const attempts = sorted.map((trace) => {
    const exported = trace.selected && trace.copied === trace.records
    if (!exported) omittedAttempts++
    const completeness = !trace.started
      ? 'missing-start'
      : trace.ended
        ? 'complete'
        : trace.outcomePresent
          ? 'outcome-recorded'
          : 'ongoing'
    const uncertain =
      trace.changed ||
      rejectedRecords > 0 ||
      incompleteRecords > 0 ||
      unreadableFiles > 0 ||
      skippedFiles.length > 0
    if (exported && (completeness === 'missing-start' || completeness === 'ongoing' || uncertain))
      partialAttempts++
    const name = 'automatic-position/attempts.log'
    const firstRecord = exported ? recordOffset + 1 : null
    if (exported) {
      exportedAttempts++
      recordOffset += trace.records
      exportedText.push(trace.lines.join(''))
    }
    return {
      attempt: trace.id,
      firstAt: trace.firstAt,
      lastAt: trace.lastAt,
      records: trace.records,
      occurrences: trace.occurrences,
      bytes: trace.bytes,
      completeness,
      integrity: uncertain ? 'source-incomplete-or-rejected-records' : 'verified-snapshot',
      exported,
      file: exported ? name : null,
      firstRecord,
      omission: exported
        ? null
        : !trace.selected
          ? 'whole-attempt-output-limit'
          : 'source-changed-during-export'
    }
  })
  if (exportedText.length)
    entries.push({
      name: 'automatic-position/attempts.log',
      data: Buffer.from(exportedText.join(''))
    })
  const summary = {
    sourceFiles: candidates.length,
    includedSourceFiles: snapshots.filter((s) => s.hash).length,
    sourceBytesRead,
    snapshotBytes,
    exportedAttempts,
    omittedAttempts,
    partialAttempts,
    unreadableFiles,
    rejectedRecords,
    incompleteRecords,
    skippedFiles: skippedFiles.length,
    limited:
      skippedFiles.length > 0 ||
      omittedAttempts > 0 ||
      partialAttempts > 0 ||
      unreadableFiles > 0 ||
      rejectedRecords > 0 ||
      incompleteRecords > 0
  }
  entries.push({
    name: 'automatic-position/manifest.json',
    data: Buffer.from(
      JSON.stringify(
        {
          schema: 1,
          ...summary,
          limits,
          skippedSourceFiles: skippedFiles,
          attempts,
          notes: [
            'Newest whole attempts are selected first. No event cap or tail slicing is applied to a selected attempt.',
            'Only complete source volumes inside the snapshot budget are scanned; skipped history can contain earlier attempt records.',
            'ongoing means no terminal outcome yet; outcome-recorded means preview retained, possibly awaiting manual save.',
            'Private/unsupported and unfinished records are excluded and counted; originals stay unchanged.',
            'Attempt IDs are random correlations pseudonymized consistently within this export; no screenshots/settings/raw exceptions are included.',
            'Source snapshots may be read twice for consistency. No automatic upload or retention deletion occurs.'
          ]
        },
        null,
        2
      )
    )
  })
  return { entries, summary }
}
