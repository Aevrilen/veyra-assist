import { constants } from 'node:fs'
import { open, realpath, stat } from 'node:fs/promises'

import {
  LIMITS,
  ReplayInputError,
  replayPngWithGeometry,
  replayPositionSample,
  safeFailure
} from './replay'

const HELP = `Veyra local PositionSample replay (one frame only)
Usage: node veyra-position-sample-replay.cjs "C:\\path\\sample.json"
       node veyra-position-sample-replay.cjs --png "client.png" --geometry "geometry.json"
       node veyra-position-sample-replay.cjs --help

Reads one local PositionSample JSON OR an already-cropped local PNG plus explicit geometry.
Manual geometry is unverified; no native/bracketed evidence is fabricated.
Prints a privacy-safe JSON report to stdout.
No network, upload, Electron, native addon, app launch, or sample modification.
Use shell redirection to save the scalar report. Never share the original sample.
Exit codes: 0 = replay completed (including detector rejection); 2 = input/replay error.
A successful frame can only reach confirming; this does not prove historical success.
`

function localPath(value: string) {
  if (
    !value ||
    value.startsWith('-') ||
    value.includes('\0') ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ||
    value.startsWith('\\\\') ||
    value.startsWith('//')
  )
    throw new ReplayInputError('local-file-required')
}

async function readBoundedFile(path: string, maxBytes: number) {
  localPath(path)
  // Precheck avoids opening directories, pipes, sockets, or device files.
  const first = await stat(path)
  if (!first.isFile()) throw new ReplayInputError('input-not-regular-file')
  if (first.size > maxBytes) throw new ReplayInputError('input-too-large')
  const resolved = await realpath(path)
  localPath(resolved)
  const handle = await open(resolved, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0))
  try {
    const before = await handle.stat()
    if (!before.isFile()) throw new ReplayInputError('input-not-regular-file')
    if (before.size > maxBytes) throw new ReplayInputError('input-too-large')
    const bytes = Buffer.alloc(before.size + 1)
    let length = 0
    while (length < bytes.length) {
      const read = await handle.read(bytes, length, bytes.length - length, null)
      if (read.bytesRead === 0) break
      length += read.bytesRead
    }
    const after = await handle.stat()
    if (length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs)
      throw new ReplayInputError('input-changed-during-read')
    return bytes.subarray(0, length)
  } finally {
    await handle.close()
  }
}

function utf8(bytes: Buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new ReplayInputError('invalid-json')
  }
}
async function readInput(path: string, maxBytes: number) {
  try {
    return await readBoundedFile(path, maxBytes)
  } catch (error) {
    if (error instanceof ReplayInputError) throw error
    throw new ReplayInputError('input-unreadable')
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(HELP)
    return
  }
  try {
    let report: ReturnType<typeof replayPositionSample>
    if (args.length === 1)
      report = replayPositionSample(utf8(await readInput(args[0], LIMITS.jsonBytes)))
    else if (args.length === 4 && args[0] === '--png' && args[2] === '--geometry') {
      const geometry = utf8(await readInput(args[3], LIMITS.geometryBytes))
      const png = await readInput(args[1], LIMITS.pngBytes)
      report = replayPngWithGeometry(png, geometry)
    } else throw new ReplayInputError('invalid-arguments')
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  } catch (error) {
    process.stdout.write(JSON.stringify(safeFailure(error), null, 2) + '\n')
    process.exitCode = 2
  }
}
// Broken output pipes are not reported with stack traces or private invocation paths.
process.stdout.on('error', () => {
  process.exitCode = 2
})
void main().catch(() => {
  process.exitCode = 2
})
