import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'

import { type FeedbackEnvironment, createFeedbackBundle } from './feedback-bundle'
import { redactFeedbackLog } from './feedback-redaction'
import { writeFeedbackZip } from './feedback-zip'

// Independent ZIP reader already present in the baseline build toolchain.
const unzipper = createRequire(path.join(process.cwd(), 'package.json'))('unzipper') as {
  Open: {
    file(path: string): Promise<{ files: Array<{ path: string; buffer(): Promise<Buffer> }> }>
  }
}
const environment: FeedbackEnvironment = {
  appVersion: '1.5.2-beta.1',
  sourceCommit: 'a'.repeat(40),
  platform: 'win32',
  arch: 'x64',
  osRelease: '10.0.test',
  electronVersion: '43.2.0',
  nodeVersion: '24',
  timezoneOffsetMinutes: -480,
  displays: [
    { primary: true, x: -1920, y: 0, width: 1920, height: 1080, scaleFactor: 1.25, rotation: 0 }
  ]
}
const temporary: string[] = []
async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'veyra-feedback-'))
  temporary.push(directory)
  const logs = path.join(directory, '中文 日志')
  await fs.mkdir(logs)
  return { directory, logs, destination: path.join(directory, '问题 反馈.zip') }
}
const record = (body: string, namespace = 'mayhem-assistant-main') =>
  `[2026-10-15 12:34:56:789] [${namespace}] [info] ${body}\n`
async function readZip(filename: string) {
  const zip = await unzipper.Open.file(filename)
  return Object.fromEntries(
    await Promise.all(
      zip.files.map(async (file) => [file.path, (await file.buffer()).toString('utf8')])
    )
  ) as Record<string, string>
}
afterEach(async () => {
  for (const directory of temporary.splice(0))
    await fs.rm(directory, { recursive: true, force: true })
})

it('keeps operational timing and event context while omitting credentials, identity, chat and payload records', async () => {
  const raw = [
    record('[mayhem-timing] {"stage":"capture","at":123,"width":1920,"foreground":false}'),
    record('accessToken: SHORT-CREDENTIAL'),
    record('{"data": "PRIVATE-RESPONSE"}'),
    record('Cookie: a=COOKIE-VALUE'),
    record('sessionKey: PRIVATE-KEY'),
    record('sgp token RAW-TOKEN', 'sgp-main'),
    record('PRIVATE-CHAT', 'in-game-send-main'),
    record('chatLines: ["PRIVATE-CHAT-2"]'),
    record('summonerName: PRIVATE-NAME'),
    record('Authorization: Bearer PRIVATE-AUTH'),
    record('api_key=PRIVATE-API-KEY'),
    record('Capture failed at C:\\Users\\PrivateUser\\profile\\data.db'),
    record('Endpoint https://example.test/path?credential=PRIVATE-URL'),
    record('contact user@example.test id=12345678-1234-1234-1234-123456789abc'),
    record('Second instance with command line: PRIVATE-ARGS', 'app')
  ].join('')
  const result = await redactFeedbackLog(raw)
  expect(result.text).toContain('"stage":"capture","at":123,"width":1920,"foreground":false')
  expect(result.text).toContain('12:34:56:789')
  expect(result.text).toContain('Capture failed at [local-path]')
  expect(result.text).toContain('[id:')
  for (const privateValue of [
    'SHORT-CREDENTIAL',
    'PRIVATE-',
    'COOKIE-VALUE',
    'RAW-TOKEN',
    'PrivateUser',
    'user@example.test',
    '12345678-1234'
  ]) {
    expect(result.text).not.toContain(privateValue)
  }
  expect(result.omitted).toBeGreaterThan(8)
  expect(raw).toContain('PRIVATE-CHAT')
})

it('exports old startup and new daily volumes through an independent ZIP reader, excluding all other files and subdirectories', async () => {
  const f = await fixture()
  const source = record('诊断：窗口位置未稳定，stage=geometry') + record('password=DO-NOT-EXPORT')
  const hash = (value: string) => createHash('sha256').update(value).digest('hex')
  for (const name of [
    'LA_20261015.log',
    'LA_202610151.log',
    'LA_20261014_120000000.log',
    'LA_20261014_1200000001.log'
  ]) {
    await fs.writeFile(path.join(f.logs, name), source)
  }
  for (const name of [
    'Cookies',
    'settings.json',
    'chat.log',
    'LA_20261015.png',
    '.env',
    'database.sqlite',
    'LA_invalid.log'
  ]) {
    await fs.writeFile(path.join(f.logs, name), 'FORBIDDEN-FILE')
  }
  await fs.mkdir(path.join(f.logs, 'LA_20261016.log'))
  await fs.writeFile(path.join(f.logs, 'LA_20261016.log', 'LA_20261016.log'), 'FORBIDDEN-NESTED')
  const summary = await createFeedbackBundle(f.logs, f.destination, environment)
  const zip = await readZip(f.destination)
  expect(summary.logFiles).toBe(4)
  expect(Object.keys(zip)).toHaveLength(6)
  expect(zip['logs/LA_20261015.log']).toContain('窗口位置未稳定')
  expect(Object.values(zip).join('')).not.toMatch(/DO-NOT-EXPORT|FORBIDDEN-/)
  expect(JSON.parse(zip['environment.json'])).toMatchObject(environment)
  expect(hash(await fs.readFile(path.join(f.logs, 'LA_20261015.log'), 'utf8'))).toBe(hash(source))
})

it('takes a bounded snapshot while the log remains open and appending, without closing or changing the writer', async () => {
  const f = await fixture()
  const filename = path.join(f.logs, 'LA_20261015.log')
  const writer = await fs.open(filename, 'a')
  try {
    await writer.write(record('snapshot-start'))
    const collecting = createFeedbackBundle(f.logs, f.destination, environment)
    for (let i = 0; i < 50; i++) await writer.write(record(`concurrent-${i}`))
    await collecting
    const zip = await readZip(f.destination)
    expect(zip['logs/LA_20261015.log']).toContain('snapshot-start')
    expect(zip['logs/LA_20261015.log']).not.toContain('\ufffd')
    await writer.write(record('writer-still-usable'))
    expect(await fs.readFile(filename, 'utf8')).toContain('writer-still-usable')
  } finally {
    await writer.close()
  }
})

it('handles empty and absent log folders with environment-only ZIPs', async () => {
  const f = await fixture()
  for (const directory of [f.logs, path.join(f.directory, 'missing')]) {
    expect((await createFeedbackBundle(directory, f.destination, environment)).logFiles).toBe(0)
    expect(Object.keys(await readZip(f.destination)).sort()).toEqual([
      'README.txt',
      'environment.json'
    ])
  }
})

it('enforces file and total read limits, retaining complete recent records and reporting skipped history', async () => {
  const f = await fixture()
  const recent = path.join(f.logs, 'LA_20261015.log')
  await fs.writeFile(path.join(f.logs, 'LA_20261014.log'), record('older-record'))
  await fs.utimes(path.join(f.logs, 'LA_20261014.log'), 1, 1)
  await fs.writeFile(recent, record('old '.repeat(1000)) + record('most-recent-record'))
  const summary = await createFeedbackBundle(f.logs, f.destination, environment, {
    files: 1,
    totalBytes: 240,
    fileBytes: 200
  })
  expect(summary).toMatchObject({
    logFiles: 1,
    sourceBytesRead: 200,
    truncatedFiles: 1,
    olderFilesOmitted: 1
  })
  expect((await readZip(f.destination))['logs/LA_20261015.log']).toContain('most-recent-record')
})

it('cleans partial ZIPs after failure and supports a simple retry without altering original logs', async () => {
  const f = await fixture()
  await fs.writeFile(path.join(f.logs, 'LA_20261015.log'), record('preserved'))
  await expect(
    createFeedbackBundle(f.logs, path.join(f.directory, 'missing', 'feedback.zip'), environment)
  ).rejects.toThrow()
  await expect(createFeedbackBundle(f.logs, f.logs, environment)).rejects.toThrow()
  await createFeedbackBundle(f.logs, f.destination, environment)
  expect((await fs.readdir(f.directory)).some((name) => name.endsWith('.tmp'))).toBe(false)
  expect((await readZip(f.destination))['logs/LA_20261015.log']).toContain('preserved')
})

it('creates standard UTF-8 ZIP entries with exact binary and empty-file content', async () => {
  const f = await fixture()
  const data = Buffer.from(Array.from({ length: 256 }, (_, index) => index))
  await writeFeedbackZip(f.destination, [
    { name: '中文/二进制.bin', data },
    { name: 'empty.txt', data: Buffer.alloc(0) }
  ])
  const zip = await unzipper.Open.file(f.destination)
  expect(zip.files.map((file) => file.path)).toEqual(['中文/二进制.bin', 'empty.txt'])
  expect(await zip.files[0].buffer()).toEqual(data)
  expect(await zip.files[1].buffer()).toHaveLength(0)
})
