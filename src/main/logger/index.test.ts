import { EventEmitter, once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

import { LoggerFactoryMain } from '../shards/logger-factory'
import { initAppLogger } from './index'

const runtime = vi.hoisted(() => ({ logs: '', openPath: vi.fn() }))
vi.mock('electron', () => ({
  app: { getPath: (name: string) => (name === 'logs' ? runtime.logs : 'C:/program/Veyra.exe') },
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
