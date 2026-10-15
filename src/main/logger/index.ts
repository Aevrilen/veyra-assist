import dayjs from 'dayjs'
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { type Logger, createLogger, format, transports } from 'winston'

import {
  AUTOMATIC_POSITION_CATEGORY,
  AUTOMATIC_POSITION_LOG_PREFIX
} from './automatic-position-diagnostic'
import { DailyFileTransport, dailyLogFilename } from './daily-file-transport'
import { LOG_FLUSH } from './log-flush'

const flushers = new WeakMap<Logger, { hooks: Set<() => void>; flush(): Promise<void> }>()

export function registerAppLogFlushHook(logger: Logger, hook: () => void) {
  const state = flushers.get(logger)
  if (!state) throw new Error('Application log flushing is unavailable')
  state.hooks.add(hook)
  return () => state.hooks.delete(hook)
}

export function flushAppLogger(logger: Logger) {
  const state = flushers.get(logger)
  if (!state) return Promise.reject(new Error('Application log flushing is unavailable'))
  return state.flush()
}

const STYLES = {
  reset: '\x1b[0m',

  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  inverse: '\x1b[7m',
  hidden: '\x1b[8m',
  strikethrough: '\x1b[9m',

  // 前景色
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  brightBlack: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  // 背景色
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
  bgBrightBlack: '\x1b[100m',
  bgBrightRed: '\x1b[101m',
  bgBrightGreen: '\x1b[102m',
  bgBrightYellow: '\x1b[103m',
  bgBrightBlue: '\x1b[104m',
  bgBrightMagenta: '\x1b[105m',
  bgBrightCyan: '\x1b[106m',
  bgBrightWhite: '\x1b[107m'
}

const LEVEL_COLORS = {
  info: STYLES.green,
  debug: STYLES.cyan,
  warn: STYLES.yellow,
  error: STYLES.red
}

export function getAppLogsDirectory() {
  // Portable updates replace the program directory; keep logs in the writable profile.
  return process.platform === 'darwin' || process.argv.includes('--akari-portable')
    ? app.getPath('logs')
    : path.join(path.join(app.getPath('exe'), '..'), 'logs')
}

export function initAppLogger(level: string = 'info') {
  const logsDir = getAppLogsDirectory()

  try {
    const stats = fs.statSync(logsDir)

    if (!stats.isDirectory()) {
      fs.rmSync(logsDir, { recursive: true, force: true })
      fs.mkdirSync(logsDir, { recursive: true })
    }
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      fs.mkdirSync(logsDir, { recursive: true })
    } else {
      throw error
    }
  }

  const filename = dailyLogFilename()
  const runId = randomUUID()

  const fileTransport = new DailyFileTransport(logsDir, {
    level,
    format: format.combine(
      format((info) =>
        info[LOG_FLUSH] || info.category !== AUTOMATIC_POSITION_CATEGORY ? info : false
      )(),
      format.printf(({ level, message, namespace, timestamp }) => {
        return `[${dayjs(timestamp as number).format('YYYY-MM-DD HH:mm:ss:SSS')}] [${namespace}] [${level}] ${message}`
      })
    )
  })

  // Detailed automatic-position records have their own daily, append-only category.
  // User-facing log-level changes cannot suppress the evidence needed for feedback.
  let diagnosticFailed = false
  const diagnosticTransport = new DailyFileTransport(
    logsDir,
    {
      level: 'info',
      format: format.combine(
        format((info) =>
          info[LOG_FLUSH] || info.category === AUTOMATIC_POSITION_CATEGORY ? info : false
        )(),
        format.printf(
          ({ level, message, namespace, timestamp }) =>
            `[${dayjs(timestamp as number).format('YYYY-MM-DD HH:mm:ss:SSS')}] [${namespace}] [${level}] ${message}`
        )
      )
    },
    8 * 1024 * 1024,
    AUTOMATIC_POSITION_LOG_PREFIX,
    () => {
      diagnosticFailed = true
      logger.error({
        namespace: 'logger-factory-main',
        message:
          '[automatic-position-log-unavailable] Detailed diagnostic persistence stopped; feedback export is unavailable until restart.'
      })
    }
  )

  const consoleTransport = new transports.Console({
    level,
    format: format.combine(
      format((info) =>
        info[LOG_FLUSH] || info.category === AUTOMATIC_POSITION_CATEGORY ? false : info
      )(),
      format.printf(({ level, message, namespace, timestamp }) => {
        const timestampColored = `${STYLES.white}[${dayjs(timestamp as any).format('YYYY-MM-DD HH:mm:ss:SSS')}]${STYLES.reset}`
        const namespaceColored = `${STYLES.brightBlue}${STYLES.bold}[${namespace}]${STYLES.reset}`
        const levelColor = LEVEL_COLORS[level] || STYLES.reset
        const levelColored = `${levelColor}[${level}]${STYLES.reset}`

        return `${timestampColored} ${namespaceColored} ${levelColored} ${message}`
      })
    )
  })

  const setLevel = (level: string) => {
    fileTransport.level = level
    consoleTransport.level = level
  }

  const logger = createLogger({
    format: format.timestamp(),
    transports: [fileTransport, diagnosticTransport, consoleTransport]
  })

  logger.log({
    level,
    namespace: 'app',
    message: `[run-start] id=${runId} pid=${process.pid}`
  })

  const hooks = new Set<() => void>()
  let finishing = false
  const flush = async () => {
    // Journal hooks emit their pending repeat summaries before the queue barrier.
    for (const hook of hooks) hook()
    await new Promise<void>((resolve, reject) => {
      let remaining = 2
      let failure: Error | undefined = diagnosticFailed
        ? new Error('Automatic-position diagnostic log unavailable; feedback was not exported')
        : undefined
      const onError = () => {
        cleanup()
        reject(new Error('Application log flush failed'))
      }
      const cleanup = () => logger.off('error', onError)
      logger.on('error', onError)
      logger.log({
        level: 'error',
        namespace: 'app',
        message: '',
        [LOG_FLUSH]: (error?: Error) => {
          if (error)
            failure ??= new Error(
              'Automatic-position diagnostic log unavailable; feedback was not exported'
            )
          if (--remaining === 0) {
            cleanup()
            if (failure) reject(failure)
            else resolve()
          }
        }
      })
    })
  }
  flushers.set(logger, { hooks, flush })

  const finish = () => {
    if (finishing) return
    finishing = true
    logger.log({
      level: fileTransport.level || level,
      namespace: 'app',
      message: `[run-end] id=${runId} pid=${process.pid}`
    })
    // Drain both file channels, including pending journal records and size rotation,
    // before Winston ends its transports. No file is deleted during this operation.
    void flush().then(
      () => logger.end(),
      () => logger.end()
    )
  }

  return {
    logger,
    logsDir,
    filename,
    finish,
    flush,
    setLevel,
    getLevel: () => fileTransport.level || level
  }
}
