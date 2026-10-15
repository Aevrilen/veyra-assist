import { AutomaticPositionDiagnosticJournal } from '@shared/champ-select-overlay/automatic-position/diagnostics'
import { EventEmitter, once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

import { LoggerFactoryMain } from '../shards/logger-factory'
import { createFeedbackBundle } from '../shards/logger-factory/feedback-bundle'
import { FeedbackExportController } from '../shards/logger-factory/feedback-export-controller'
import { dailyLogFilename } from './daily-file-transport'
import { initAppLogger } from './index'

const runtime = vi.hoisted(() => ({ logs: '', openPath: vi.fn() }))
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'logs' ? runtime.logs : 'C:/program/Veyra.exe')
  },
  shell: { openPath: runtime.openPath }
}))
vi.mock('@shared/akari-shard', () => ({
  Shard: () => (target: unknown) => target,
  SharedGlobalShard: class {}
}))
vi.mock('../shards/ipc', () => ({ AkariIpcMain: class {} }))
vi.mock('../shards/mobx-utils', () => ({ MobxUtilsMain: class {} }))

afterEach(() => vi.restoreAllMocks())

it('drains records buffered by backpressure before writing the run end and finishing', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'veyra-shutdown-test-'))
  const previousArgv = process.argv
  process.argv = [...previousArgv, '--akari-portable']
  runtime.logs = directory
  const logging = initAppLogger()
  try {
    for (let i = 0; i < 40; i++) logging.logger.info({ namespace: 'app', message: `shutdown-${i}` })
    const finished = once(logging.logger, 'finish')
    logging.finish()
    await finished
    const text = fs.readFileSync(path.join(directory, logging.filename), 'utf8')
    expect(text.match(/shutdown-\d+(?=\r?\n)/g)).toEqual(
      Array.from({ length: 40 }, (_, i) => `shutdown-${i}`)
    )
    expect(text).toContain('[run-end]')
  } finally {
    logging.logger.close()
    process.argv = previousArgv
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

it('reveals the log actually written to the portable profile, including a custom profile', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'veyra-log-test-'))
  const previousArgv = process.argv
  process.argv = [...previousArgv, '--akari-portable']
  runtime.logs = path.join(directory, 'custom-profile', 'logs')
  const logging = initAppLogger()
  try {
    const factory = new LoggerFactoryMain(
      {
        global: {
          ...logging,
          logFilename: logging.filename,
          getLogLevel: logging.getLevel,
          events: new EventEmitter()
        }
      } as never,
      {} as never,
      {} as never
    )
    logging.logger.info({ namespace: 'test', message: 'portable diagnostic' })
    const finished = once(logging.logger, 'finish')
    logging.finish()
    await finished
    const logfile = path.join(runtime.logs, logging.filename)
    expect(fs.readFileSync(logfile, 'utf8')).toContain('portable diagnostic')
    factory.openLogsDir()
    expect(runtime.openPath).toHaveBeenCalledWith(runtime.logs)
  } finally {
    logging.logger.close()
    process.argv = previousArgv
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

it('appends same-day runs, marks their boundaries and switches dates after midnight', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'veyra-daily-test-'))
  const previousArgv = process.argv
  process.argv = [...previousArgv, '--akari-portable']
  runtime.logs = directory
  vi.useFakeTimers({ toFake: ['Date'] })
  const close = async (logging: ReturnType<typeof initAppLogger>) => {
    const finished = once(logging.logger, 'finish')
    logging.finish()
    await finished
    logging.logger.close()
  }
  try {
    // Construct local dates: the production logger retains local-time day boundaries.
    vi.setSystemTime(new Date(2026, 9, 15, 23, 58))
    const first = initAppLogger()
    first.logger.info({ namespace: 'test', message: 'first run' })
    await close(first)
    const second = initAppLogger()
    second.logger.info({ namespace: 'test', message: 'second run' })
    // Wait for the pre-midnight record to reach its transport before advancing the clock.
    await new Promise<void>((resolve, reject) =>
      second.logger.write(
        { level: 'info', namespace: 'test', message: 'before midnight' },
        (error) => (error ? reject(error) : resolve())
      )
    )
    vi.setSystemTime(new Date(2026, 9, 16, 0, 1))
    second.logger.info({ namespace: 'test', message: 'after midnight' })
    await close(second)
    const yesterday = fs.readFileSync(path.join(directory, 'LA_20261015.log'), 'utf8')
    const today = fs.readFileSync(path.join(directory, 'LA_20261016.log'), 'utf8')
    expect(yesterday).toContain('first run')
    expect(yesterday).toContain('second run')
    expect(yesterday.match(/\[run-start\]/g)).toHaveLength(2)
    expect(yesterday.match(/\[run-end\]/g)).toHaveLength(1)
    expect(today).toContain('after midnight')
    expect(today).toContain('[run-end]')
    expect(today).not.toContain('first run')
    const startIds = [...yesterday.matchAll(/\[run-start\] id=([^ ]+)/g)].map((m) => m[1])
    expect(new Set(startIds).size).toBe(2)
    expect(today).toContain(`[run-end] id=${startIds[1]}`)
  } finally {
    process.argv = previousArgv
    vi.useRealTimers()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

it('persists a dedicated complete attempt independently of normal level, flushes pending polls and retains manual-save history', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'veyra-dedicated-test-'))
  const previousArgv = process.argv
  process.argv = [...previousArgv, '--akari-portable']
  runtime.logs = directory
  const logging = initAppLogger('error')
  const factory = new LoggerFactoryMain(
    {
      global: {
        ...logging,
        getLogLevel: logging.getLevel,
        events: new EventEmitter()
      }
    } as never,
    {} as never,
    {} as never
  )
  let journal: InstanceType<typeof AutomaticPositionDiagnosticJournal>
  const flushPending = vi.fn(() => journal.flush())
  const sink = factory.createAutomaticPositionDiagnosticSink(flushPending)
  expect(flushPending).not.toHaveBeenCalled()
  journal = new AutomaticPositionDiagnosticJournal('11111111-1111-4111-8111-111111111111', sink)
  try {
    journal.record({ stage: 'controller', reason: 'trial-started', metrics: {} }, 100)
    for (let i = 0; i < 400; i++)
      journal.record(
        {
          stage: 'controller',
          reason: 'waiting-stable',
          metrics: { elapsedMs: i }
        },
        101 + i
      )
    await logging.flush()
    const diagnosticFiles = () =>
      fs.readdirSync(directory).filter((name) => name.startsWith('AUTO_POSITION_'))
    const diagnosticText = () =>
      diagnosticFiles()
        .map((name) => fs.readFileSync(path.join(directory, name), 'utf8'))
        .join('')
    expect(diagnosticFiles()).toHaveLength(1)
    expect(diagnosticText()).toContain('"repeatCount":399')
    expect(diagnosticText()).toContain('"firstAt":102,"lastAt":500')
    expect(fs.readFileSync(path.join(directory, logging.filename), 'utf8')).not.toContain(
      '[automatic-position]'
    )
    logging.setLevel('error')
    // No event-count cap: every changing edge score survives the queue and shutdown.
    for (let i = 0; i < 550; i++)
      journal.record(
        {
          stage: 'provider',
          reason: 'bench-slot-edges',
          metrics: { benchEdges: i }
        },
        501 + i
      )
    journal.record({ stage: 'controller', reason: 'manual-save-succeeded', metrics: {} }, 1100)
    const finished = once(logging.logger, 'finish')
    logging.finish()
    await finished
    const text = diagnosticText()
    expect(text.match(/"reason":"bench-slot-edges"/g)).toHaveLength(550)
    expect(text).toContain('"reason":"trial-started"')
    expect(text).toContain('"reason":"manual-save-succeeded"')
    expect(text).not.toContain('[run-end]')
    expect(flushPending).toHaveBeenCalledTimes(2)
  } finally {
    factory.onDispose()
    logging.logger.close()
    process.argv = previousArgv
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

it('flushes the final pending diagnostic summary on immediate application shutdown', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'veyra-pending-shutdown-'))
  const previousArgv = process.argv
  process.argv = [...previousArgv, '--akari-portable']
  runtime.logs = directory
  const logging = initAppLogger('error')
  const factory = new LoggerFactoryMain(
    {
      global: {
        ...logging,
        getLogLevel: logging.getLevel,
        events: new EventEmitter()
      }
    } as never,
    {} as never,
    {} as never
  )
  let journal: InstanceType<typeof AutomaticPositionDiagnosticJournal>
  journal = new AutomaticPositionDiagnosticJournal(
    '22222222-2222-4222-8222-222222222222',
    factory.createAutomaticPositionDiagnosticSink(() => journal.flush())
  )
  try {
    journal.record({ stage: 'controller', reason: 'trial-started', metrics: {} }, 1)
    for (let i = 0; i < 250; i++)
      journal.record({ stage: 'controller', reason: 'waiting-foreground', metrics: {} }, 2 + i)
    const finished = once(logging.logger, 'finish')
    logging.finish()
    await finished
    const contents = fs
      .readdirSync(directory)
      .filter((name) => name.startsWith('AUTO_POSITION_'))
      .map((name) => fs.readFileSync(path.join(directory, name), 'utf8'))
      .join('')
    expect(contents).toContain('"firstAt":3,"lastAt":251,"repeatCount":249')
  } finally {
    factory.onDispose()
    logging.logger.close()
    process.argv = previousArgv
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

it('one-click feedback drains the last pending poll summary into an actual ZIP and leaves the logger writable', async () => {
  const { createRequire } = await import('node:module')
  const unzipper = createRequire(path.join(process.cwd(), 'package.json'))('unzipper') as {
    Open: {
      file(path: string): Promise<{ files: Array<{ path: string; buffer(): Promise<Buffer> }> }>
    }
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'veyra-export-drain-'))
  const previousArgv = process.argv
  process.argv = [...previousArgv, '--akari-portable']
  runtime.logs = directory
  const logging = initAppLogger('error')
  const factory = new LoggerFactoryMain(
    {
      global: {
        ...logging,
        getLogLevel: logging.getLevel,
        events: new EventEmitter()
      }
    } as never,
    {} as never,
    {} as never
  )
  let journal: InstanceType<typeof AutomaticPositionDiagnosticJournal>
  journal = new AutomaticPositionDiagnosticJournal(
    '33333333-3333-4333-8333-333333333333',
    factory.createAutomaticPositionDiagnosticSink(() => journal.flush())
  )
  const destination = path.join(directory, 'feedback.zip')
  const controller = new FeedbackExportController(
    directory,
    {
      chooseDestination: async () => destination,
      environment: async () => ({}) as never,
      createBundle: createFeedbackBundle,
      reveal: () => {}
    },
    logging.flush
  )
  try {
    journal.record({ stage: 'controller', reason: 'trial-started', metrics: {} }, 1)
    for (let i = 0; i < 301; i++)
      journal.record({ stage: 'controller', reason: 'waiting-stable', metrics: {} }, 2 + i)
    expect(await controller.export({} as never)).toMatchObject({
      status: 'saved',
      limited: true
    })
    const zip = await unzipper.Open.file(destination)
    const text = (
      await zip.files.find((file) => file.path === 'automatic-position/attempts.log')!.buffer()
    ).toString()
    expect(text).toContain('"firstAt":3,"lastAt":302,"repeatCount":300')
    const manifest = JSON.parse(
      (
        await zip.files.find((file) => file.path === 'automatic-position/manifest.json')!.buffer()
      ).toString()
    )
    expect(manifest.attempts[0]).toMatchObject({
      completeness: 'ongoing',
      records: 3,
      occurrences: 302
    })
    journal.record({ stage: 'controller', reason: 'manual-save-succeeded', metrics: {} }, 303)
    const finished = once(logging.logger, 'finish')
    logging.finish()
    await finished
    const raw = fs
      .readdirSync(directory)
      .filter((name) => name.startsWith('AUTO_POSITION_'))
      .map((name) => fs.readFileSync(path.join(directory, name), 'utf8'))
      .join('')
    expect(raw).toContain('"reason":"trial-started"')
    expect(raw).toContain('"reason":"manual-save-succeeded"')
    expect(raw).toContain('"repeatCount":300')
  } finally {
    factory.onDispose()
    logging.logger.close()
    process.argv = previousArgv
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

it('isolates an optional diagnostic disk-open failure, refuses incomplete feedback and still shuts down', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'veyra-diagnostic-io-failure-'))
  const previousArgv = process.argv
  process.argv = [...previousArgv, '--akari-portable']
  runtime.logs = directory
  // A directory at the expected file path causes a genuine file-open failure.
  fs.mkdirSync(path.join(directory, dailyLogFilename(undefined, 'AUTO_POSITION')))
  const logging = initAppLogger('error')
  const factory = new LoggerFactoryMain(
    {
      global: {
        ...logging,
        getLogLevel: logging.getLevel,
        events: new EventEmitter()
      }
    } as never,
    {} as never,
    {} as never
  )
  const loggerError = vi.fn()
  logging.logger.on('error', loggerError)
  try {
    factory.createAutomaticPositionDiagnosticSink()({
      stage: 'controller',
      reason: 'trial-started',
      metrics: {},
      attemptId: '44444444-4444-4444-8444-444444444444',
      firstAt: 1,
      lastAt: 1,
      repeatCount: 1
    })
    await expect(logging.flush()).rejects.toThrow(/unavailable|flush failed/)
    await expect(logging.flush()).rejects.toThrow('diagnostic log unavailable')
    expect(loggerError).not.toHaveBeenCalled()
    logging.logger.error({
      namespace: 'app',
      message: 'normal-logger-still-available'
    })
    const finished = once(logging.logger, 'finish')
    logging.finish()
    await finished
    const normal = fs.readFileSync(path.join(directory, logging.filename), 'utf8')
    expect(normal).toContain('normal-logger-still-available')
    expect(normal.match(/\[automatic-position-log-unavailable\]/g)).toHaveLength(1)
    expect(normal).not.toContain(directory)
    expect(loggerError).not.toHaveBeenCalled()
  } finally {
    factory.onDispose()
    logging.logger.close()
    process.argv = previousArgv
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
