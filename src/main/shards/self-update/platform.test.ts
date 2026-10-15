import { describe, expect, test } from 'vitest'

import {
  shouldApplyDownloadedUpdate,
  shouldDownloadUpdateArchive,
  shouldLaunchUpdaterOnQuit,
  shouldRunSelfUpdateLifecycle,
  shouldUninstallWithUpdater
} from './platform'

describe('Veyra manual ZIP update boundary', () => {
  test.each([
    ['win32', 'x64'],
    ['win32', 'arm64'],
    ['darwin', 'arm64'],
    ['linux', 'x64']
  ] as const)('blocks Akari updater and installer actions on %s %s', (platform, arch) => {
    expect(shouldRunSelfUpdateLifecycle(platform, arch, false)).toBe(false)
    expect(shouldRunSelfUpdateLifecycle(platform, arch, true)).toBe(false)
    expect(shouldDownloadUpdateArchive(platform, arch)).toBe(false)
    expect(shouldApplyDownloadedUpdate(platform, arch)).toBe(false)
    expect(shouldLaunchUpdaterOnQuit(true, platform, arch)).toBe(false)
    expect(shouldUninstallWithUpdater(platform, arch)).toBe(false)
  })
})
