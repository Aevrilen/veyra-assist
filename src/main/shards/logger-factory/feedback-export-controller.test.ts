import { expect, it, vi } from 'vitest'

import { FeedbackExportController } from './feedback-export-controller'
import { LoggerFactoryIpcHandlers } from './ipc-handlers'

const runtime = vi.hoisted(() => ({ fromWebContents: vi.fn() }))
vi.mock('electron', () => ({
  app: {},
  dialog: {},
  screen: {},
  shell: {},
  BrowserWindow: { fromWebContents: runtime.fromWebContents }
}))

function fixture() {
  const dependencies = {
    chooseDestination: vi.fn().mockResolvedValue('C:/feedback.zip'),
    environment: vi.fn().mockResolvedValue({}),
    createBundle: vi.fn().mockResolvedValue({
      logFiles: 2,
      olderFilesOmitted: 0,
      truncatedFiles: 0,
      unreadableFiles: 0
    }),
    reveal: vi.fn()
  }
  const controller = new FeedbackExportController('C:/logs', dependencies)
  return { controller, dependencies, parent: {} as never }
}

it('does not read logs or metadata after cancelling the save dialog', async () => {
  const f = fixture()
  f.dependencies.chooseDestination.mockResolvedValue(null)
  expect(await f.controller.export(f.parent)).toEqual({ status: 'cancelled' })
  expect(f.dependencies.createBundle).not.toHaveBeenCalled()
  expect(f.dependencies.environment).not.toHaveBeenCalled()
  expect(f.dependencies.reveal).not.toHaveBeenCalled()
})

it('reveals only a completed ZIP, resets busy after failure and allows retry', async () => {
  const f = fixture()
  f.dependencies.createBundle.mockRejectedValueOnce(new Error('disk full'))
  await expect(f.controller.export(f.parent)).rejects.toThrow('disk full')
  expect(f.dependencies.reveal).not.toHaveBeenCalled()
  expect(await f.controller.export(f.parent)).toEqual({
    status: 'saved',
    logFiles: 2,
    limited: false,
    revealed: true
  })
  expect(f.dependencies.reveal).toHaveBeenCalledWith('C:/feedback.zip')
})

it('prevents concurrent save dialogs and still reports success if Explorer cannot open', async () => {
  const f = fixture()
  let finish!: (path: string) => void
  f.dependencies.chooseDestination.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const first = f.controller.export(f.parent)
  expect(await f.controller.export(f.parent)).toEqual({ status: 'busy' })
  f.dependencies.reveal.mockImplementation(() => {
    throw new Error('Explorer unavailable')
  })
  f.dependencies.createBundle.mockResolvedValue({
    logFiles: 2,
    olderFilesOmitted: 1,
    truncatedFiles: 0,
    unreadableFiles: 0
  })
  finish('C:/feedback.zip')
  expect(await first).toMatchObject({ status: 'saved', limited: true, revealed: false })
})

it('accepts only the main window main frame and never accepts a source directory from the renderer', async () => {
  const handlers: Record<string, (...args: any[]) => any> = {}
  const parent = {}
  runtime.fromWebContents.mockReturnValue(parent)
  const loggerFactory = {
    exportFeedbackPackage: vi.fn().mockResolvedValue({ status: 'cancelled' })
  }
  new LoggerFactoryIpcHandlers({
    ipc: {
      onCall: (_namespace: string, name: string, callback: (...args: any[]) => any) => {
        handlers[name] = callback
      }
    },
    loggerFactory,
    shared: {},
    namespace: 'logger-factory-main'
  } as never).register()
  const mainFrame = { url: 'file:///app/out/renderer/main-window.html' }
  const sender = { mainFrame }
  await handlers.exportFeedbackPackage({ senderFrame: mainFrame, sender }, 'C:/secret-profile')
  expect(loggerFactory.exportFeedbackPackage).toHaveBeenCalledExactlyOnceWith(parent)
  expect(() => handlers.exportFeedbackPackage({ senderFrame: { ...mainFrame }, sender })).toThrow(
    'main window'
  )
  const overlayFrame = { url: 'file:///app/out/renderer/mayhem-overlay-window.html' }
  expect(() =>
    handlers.exportFeedbackPackage({
      senderFrame: overlayFrame,
      sender: { mainFrame: overlayFrame }
    })
  ).toThrow('main window')
})
