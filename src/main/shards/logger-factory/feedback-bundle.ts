import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import {
  AUTOMATIC_POSITION_FEEDBACK_LIMITS,
  collectAutomaticPositionFeedback
} from './automatic-position-feedback'
import { redactFeedbackLog } from './feedback-redaction'
import { writeFeedbackZip } from './feedback-zip'

export const FEEDBACK_LIMITS = {
  files: 20,
  totalBytes: 32 * 1024 * 1024,
  fileBytes: 8 * 1024 * 1024
}
const LOG_NAME = /^LA_\d{8}(?:_\d{9})?\d*\.log$/i

export interface FeedbackEnvironment {
  appVersion: string
  sourceCommit: string | null
  platform: string
  arch: string
  osRelease: string
  electronVersion: string
  nodeVersion: string
  timezoneOffsetMinutes: number
  displays: Array<{
    primary: boolean
    x: number
    y: number
    width: number
    height: number
    scaleFactor: number
    rotation: number
  }>
}

export async function createFeedbackBundle(
  directory: string,
  destination: string,
  environment: FeedbackEnvironment,
  limits = FEEDBACK_LIMITS,
  diagnosticLimits = AUTOMATIC_POSITION_FEEDBACK_LIMITS
) {
  const salt = randomBytes(16)
  const entries: Array<{ name: string; data: Buffer }> = []
  let names: string[]
  try {
    names = await fs.readdir(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    names = []
  }
  const candidates: Array<{ name: string; mtime: number; ino: number }> = []
  for (const name of names.filter((name) => LOG_NAME.test(name))) {
    const stat = await fs.lstat(path.join(directory, name)).catch(() => null)
    if (stat?.isFile() && !stat.isSymbolicLink())
      candidates.push({ name, mtime: stat.mtimeMs, ino: stat.ino })
  }
  candidates.sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name))
  let bytes = 0
  let omittedRecords = 0
  let truncated = 0
  let unreadable = 0
  for (const candidate of candidates.slice(0, limits.files)) {
    if (bytes >= limits.totalBytes) break
    const source = await fs.open(path.join(directory, candidate.name), 'r').catch(() => null)
    if (!source) {
      unreadable++
      continue
    }
    let text: string
    try {
      const stat = await source.stat()
      if (!stat.isFile() || stat.ino !== candidate.ino) {
        unreadable++
        continue
      }
      const length = Math.min(stat.size, limits.fileBytes, limits.totalBytes - bytes)
      const start = stat.size - length
      const data = Buffer.alloc(length)
      let read = 0
      while (read < length) {
        const result = await source.read(data, read, length - read, start + read)
        if (!result.bytesRead) break
        read += result.bytesRead
      }
      bytes += read
      text = data.subarray(0, read).toString('utf8')
      if (start > 0) {
        truncated++
        const firstRecord = text.search(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}:\d{3}\]/m)
        text = firstRecord < 0 ? '' : text.slice(firstRecord)
      }
    } finally {
      await source.close()
    }
    const redacted = await redactFeedbackLog(text, salt)
    omittedRecords += redacted.omitted
    entries.push({
      name: `logs/${candidate.name}`,
      data: Buffer.from(redacted.text || '[No exportable diagnostic records]\n')
    })
  }
  const generalLogFiles = entries.length
  const diagnostics = await collectAutomaticPositionFeedback(
    directory,
    names,
    salt,
    diagnosticLimits
  )
  if (diagnostics) entries.push(...diagnostics.entries)
  const summary = {
    logFiles: generalLogFiles + (diagnostics?.summary.exportedAttempts ? 1 : 0),
    sourceBytesRead: bytes,
    olderFilesOmitted: candidates.length - generalLogFiles,
    truncatedFiles: truncated,
    unreadableFiles: unreadable,
    privateOrUnsupportedRecordsOmitted: omittedRecords,
    automaticPosition: diagnostics?.summary ?? null
  }
  entries.push({
    name: 'environment.json',
    data: Buffer.from(
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          ...environment,
          ...summary,
          limits
        },
        null,
        2
      )
    )
  })
  entries.push({
    name: 'README.txt',
    data: Buffer.from(
      'Veyra Assist local feedback package\nNo automatic upload. Share this ZIP privately with the maintainer.\nOnly allowlisted operational log records are exported. Credentials, identity/chat/request payload records, local paths and URLs are omitted/redacted. Raw logs stay on this computer.\nRecent logs are selected automatically within the limits in environment.json; oversized files contribute their most recent records. Both historical startup logs and daily logs are supported.\nDedicated AUTO_POSITION daily volumes are handled separately: complete attempts are selected newest-first, without tail slicing, under the explicit source/output budgets and limitations in automatic-position/manifest.json. An ongoing or interrupted attempt is identified there. Manual save does not erase history.\nAn empty log folder still produces environment information. No settings, database, cookies, screenshots or other profile files are included.\nLog timestamps retain the local timezone; createdAt is UTC.\n'
    )
  })
  await writeFeedbackZip(destination, entries)
  return summary
}
