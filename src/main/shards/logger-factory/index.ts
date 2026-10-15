import { flushAppLogger, getAppLogsDirectory, registerAppLogFlushHook } from '@main/logger'
import {
  AUTOMATIC_POSITION_CATEGORY,
  AUTOMATIC_POSITION_MARKER,
  AUTOMATIC_POSITION_NAMESPACE,
  sanitizeAutomaticPositionRecord
} from '@main/logger/automatic-position-diagnostic'
import { IAkariShardInitDispose, Shard, SharedGlobalShard } from '@shared/akari-shard'
import type { AutomaticPositionDiagnosticRecord } from '@shared/champ-select-overlay/automatic-position/diagnostics'
import { type BrowserWindow, shell } from 'electron'
import { Logger } from 'winston'

import { AkariIpcMain } from '../ipc'
import { MobxUtilsMain } from '../mobx-utils'
import { LOGGER_FACTORY_MAIN_NAMESPACE, type LoggerFactoryMainContext } from './context'
import { FeedbackExportController } from './feedback-export-controller'
import { LoggerFactoryIpcHandlers } from './ipc-handlers'
import { LogMessageFormatter } from './log-message-formatter'
import { LoggerFactoryState } from './state'

export class AkariLogger {
  constructor(
    private readonly _loggerFactory: LoggerFactoryMain,
    private readonly _namespace: string
  ) {}

  info(...args: any[]) {
    return this._loggerFactory.info(this._namespace, ...args)
  }

  warn(...args: any[]) {
    return this._loggerFactory.warn(this._namespace, ...args)
  }

  error(...args: any[]) {
    return this._loggerFactory.error(this._namespace, ...args)
  }

  debug(...args: any[]) {
    return this._loggerFactory.debug(this._namespace, ...args)
  }
}

/**
 * 创建日志记录器的工厂, 供给其他模块使用
 */
@Shard(LoggerFactoryMain.id)
export class LoggerFactoryMain implements IAkariShardInitDispose {
  static id = LOGGER_FACTORY_MAIN_NAMESPACE

  public readonly state = new LoggerFactoryState()

  // 从全局注入的 logger 实例
  private readonly _logger: Logger
  private readonly _logsDir: string
  private readonly _feedbackExport: FeedbackExportController
  private readonly _formatter = new LogMessageFormatter()
  private readonly _context: LoggerFactoryMainContext
  private readonly _ipcHandlers: LoggerFactoryIpcHandlers
  private readonly _removeFlushHooks: Array<() => void> = []

  constructor(
    private readonly _shared: SharedGlobalShard,
    private readonly _ipc: AkariIpcMain,
    private readonly _mobxUtils: MobxUtilsMain
  ) {
    // macOS 下写入 .app bundle 会导致权限/签名问题，日志目录应位于用户目录。
    this._logsDir = getAppLogsDirectory()
    this._feedbackExport = new FeedbackExportController(this._logsDir, undefined, () =>
      flushAppLogger(this._logger)
    )
    this._logger = this._shared.global.logger

    this.state.setLogLevel(this._shared.global.getLogLevel())

    this._shared.global.events.on('log-level-changed', (level) => {
      this.state.setLogLevel(level)
    })

    this._context = {
      namespace: LoggerFactoryMain.id,
      shared: this._shared,
      ipc: this._ipc,
      mobxUtils: this._mobxUtils,
      loggerFactory: this,
      state: this.state
    }
    this._ipcHandlers = new LoggerFactoryIpcHandlers(this._context)
  }

  openLogsDir() {
    return shell.openPath(this._logsDir)
  }

  exportFeedbackPackage(parent: BrowserWindow) {
    return this._feedbackExport.export(parent)
  }

  /**
   * 创建一个日志记录器实例, 应该用于每个对应模块中
   * @param namespace
   * @returns
   */
  create(namespace: string) {
    return new AkariLogger(this, namespace)
  }

  /** Internal structured channel; never accepts free-form messages or renderer data. */
  createAutomaticPositionDiagnosticSink(flushPending?: () => void) {
    if (flushPending)
      this._removeFlushHooks.push(registerAppLogFlushHook(this._logger, flushPending))
    return (record: AutomaticPositionDiagnosticRecord) => {
      const safe = sanitizeAutomaticPositionRecord(record)
      if (!safe) return
      this._logger.info({
        namespace: AUTOMATIC_POSITION_NAMESPACE,
        category: AUTOMATIC_POSITION_CATEGORY,
        message: AUTOMATIC_POSITION_MARKER + JSON.stringify(safe)
      })
    }
  }

  async onDispose() {
    for (const remove of this._removeFlushHooks.splice(0)) remove()
  }

  info(namespace: string, ...args: any[]) {
    return this._logger.info({
      namespace: namespace,
      message: this._formatter.objectsToString(...args)
    })
  }

  warn(namespace: string, ...args: any[]) {
    return this._logger.warn({
      namespace: namespace,
      message: this._formatter.objectsToString(...args)
    })
  }

  error(namespace: string, ...args: any[]) {
    return this._logger.error({
      namespace: namespace,
      message: this._formatter.objectsToString(...args)
    })
  }

  debug(namespace: string, ...args: any[]) {
    return this._logger.debug({
      namespace: namespace,
      message: this._formatter.objectsToString(...args)
    })
  }

  async onInit() {
    this._mobxUtils.propSync(LoggerFactoryMain.id, 'state', this.state, 'logLevel')
    this._ipcHandlers.register()
  }
}
