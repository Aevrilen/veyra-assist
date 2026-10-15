import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { createLogger, format } from 'winston'

import { DailyFileTransport } from './daily-file-transport'

it('keeps Winston size-based append volumes and historical logs without deleting records', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'veyra-volumes-test-'))
  const history = path.join(directory, 'LA_20250101_120000000.log')
  fs.writeFileSync(history, 'old release log')
  const logger = createLogger({
    format: format.timestamp(),
    transports: [
      new DailyFileTransport(
        directory,
        { format: format.printf((info) => String(info.message)) },
        256
      )
    ]
  })
  try {
    for (let i = 0; i < 11; i++) {
      await new Promise<void>((resolve, reject) => {
        logger.write({ level: 'info', message: `record-${i}: ${'x'.repeat(80)}` }, (error) =>
          error ? reject(error) : resolve()
        )
      })
      await vi.waitFor(() => {
        const contents = fs
          .readdirSync(directory)
          .map((name) => fs.readFileSync(path.join(directory, name), 'utf8'))
          .join('')
        expect(contents).toContain(`record-${i}:`)
      })
    }
    const finished = once(logger, 'finish')
    logger.end()
    await finished
    const volumes = fs.readdirSync(directory).filter((name) => name !== path.basename(history))
    expect(volumes.length).toBeGreaterThan(1)
    const contents = volumes
      .map((name) => fs.readFileSync(path.join(directory, name), 'utf8'))
      .join('')
    for (let i = 0; i < 11; i++) expect(contents).toContain(`record-${i}:`)
    expect(fs.readFileSync(history, 'utf8')).toBe('old release log')
  } finally {
    logger.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

it('flushes a burst immediately followed by shutdown while a size volume is rotating', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'veyra-burst-test-'))
  const logger = createLogger({
    format: format.timestamp(),
    transports: [
      new DailyFileTransport(
        directory,
        { format: format.printf((info) => String(info.message)) },
        256
      )
    ]
  })
  try {
    for (let i = 0; i < 12; i++) logger.info(`burst-${i}: ${'x'.repeat(80)}`)
    const finished = once(logger, 'finish')
    logger.end()
    await finished
    const contents = fs
      .readdirSync(directory)
      .map((name) => fs.readFileSync(path.join(directory, name), 'utf8'))
      .join('')
    for (let i = 0; i < 12; i++) expect(contents).toContain(`burst-${i}:`)
    expect(contents.match(/burst-\d+:/g)).toHaveLength(12)
  } finally {
    logger.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

it('resumes existing size volumes after restart and drains both days during a midnight burst', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'veyra-midnight-burst-'))
  vi.useFakeTimers({ toFake: ['Date'] })
  const create = () =>
    createLogger({
      format: format.timestamp(),
      transports: [
        new DailyFileTransport(
          directory,
          { format: format.printf((info) => String(info.message)) },
          256
        )
      ]
    })
  const finish = async (logger: ReturnType<typeof create>) => {
    const finished = once(logger, 'finish')
    logger.end()
    await finished
    logger.close()
  }
  try {
    vi.setSystemTime(new Date(2026, 9, 15, 23, 59))
    const first = create()
    for (let i = 0; i < 6; i++) first.info(`saved-${i}: ${'x'.repeat(80)}`)
    await finish(first)
    const restarted = create()
    for (let i = 0; i < 6; i++) restarted.info(`evening-${i}: ${'x'.repeat(80)}`)
    vi.setSystemTime(new Date(2026, 9, 16, 0, 1))
    for (let i = 0; i < 6; i++) restarted.info(`morning-${i}: ${'x'.repeat(80)}`)
    await finish(restarted)
    const contentsForDay = (day: string) =>
      fs
        .readdirSync(directory)
        .filter((name) => name.startsWith(`LA_${day}`))
        .map((name) => fs.readFileSync(path.join(directory, name), 'utf8'))
        .join('')
    const yesterday = contentsForDay('20261015')
    const today = contentsForDay('20261016')
    for (let i = 0; i < 6; i++) {
      expect(yesterday).toContain(`saved-${i}:`)
      expect(yesterday).toContain(`evening-${i}:`)
      expect(today).toContain(`morning-${i}:`)
    }
    expect(yesterday).not.toContain('morning-')
    expect(today).not.toContain('evening-')
    expect(yesterday.match(/(?:saved|evening)-\d+:/g)).toHaveLength(12)
    expect(today.match(/morning-\d+:/g)).toHaveLength(6)
  } finally {
    vi.useRealTimers()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
