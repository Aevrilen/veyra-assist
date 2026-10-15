import { BrowserWindow } from 'electron'

import type { LoggerFactoryMainContext } from './context'

export class LoggerFactoryIpcHandlers {
  constructor(private readonly context: LoggerFactoryMainContext) {}

  register() {
    const { ipc, loggerFactory, namespace, shared } = this.context

    ipc.onCall(namespace, 'log', (_, logNamespace: string, level: string, ...args: any[]) => {
      switch (level) {
        case 'info':
          loggerFactory.info(logNamespace, ...args)
          return
        case 'warn':
          loggerFactory.warn(logNamespace, ...args)
          return
        case 'error':
          loggerFactory.error(logNamespace, ...args)
          return
        case 'debug':
          loggerFactory.debug(logNamespace, ...args)
          return
        default:
          loggerFactory.info(logNamespace, ...args)
      }
    })

    ipc.onCall(namespace, 'setLogLevel', (_, level: string) => {
      loggerFactory.info(namespace, `Setting log level to ${level}`)
      shared.global.setLogLevel(level)
    })

    ipc.onCall(namespace, 'openLogsDir', () => loggerFactory.openLogsDir())

    ipc.onCall(namespace, 'exportFeedbackPackage', (event) => {
      const parent = BrowserWindow.fromWebContents(event.sender)
      if (
        !parent ||
        event.senderFrame !== event.sender.mainFrame ||
        !new URL(event.senderFrame.url).pathname.endsWith('/main-window.html')
      ) {
        throw new Error('Feedback export is only available from the main window')
      }
      return loggerFactory.exportFeedbackPackage(parent)
    })
  }
}
