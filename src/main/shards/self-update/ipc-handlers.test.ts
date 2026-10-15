import { expect, test, vi } from 'vitest'

import type { SelfUpdateMainContext } from './context'
import { SelfUpdateIpcHandlers } from './ipc-handlers'
import type { SelfUpdateUninstaller } from './uninstaller'
import type { SelfUpdateController } from './update-controller'
import type { SelfUpdateExecutor } from './update-executor'

vi.mock('electron', () => ({ app: { getPath: vi.fn() }, shell: { openPath: vi.fn() } }))

test('existing IPC calls cannot check, download, install, open update files, or remove user data', async () => {
  const handlers = new Map<string, () => unknown>()
  const start = vi.fn(),
    uninstallApp = vi.fn(),
    checkLatestRelease = vi.fn(),
    cancel = vi.fn()
  const context = {
    namespace: 'self-update-main',
    ipc: {
      onCall: (_namespace: string, name: string, handler: () => unknown) =>
        handlers.set(name, handler)
    }
  } as unknown as SelfUpdateMainContext
  new SelfUpdateIpcHandlers(
    context,
    { start, cancel } as unknown as SelfUpdateExecutor,
    { uninstallApp } as unknown as SelfUpdateUninstaller,
    { checkLatestRelease } as unknown as SelfUpdateController
  ).register()
  for (const name of [
    'checkUpdates',
    'startUpdate',
    'forceStartUpdate',
    'cancelUpdate',
    'openNewUpdatesDir',
    'uninstallApp'
  ])
    expect(await handlers.get(name)!()).toEqual({
      result: 'failed',
      reason: 'veyra-update-unavailable'
    })
  expect(start).not.toHaveBeenCalled()
  expect(cancel).not.toHaveBeenCalled()
  expect(uninstallApp).not.toHaveBeenCalled()
  expect(checkLatestRelease).not.toHaveBeenCalled()
})
