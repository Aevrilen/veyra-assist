import { expect, it, vi } from 'vitest'

import { VersionUsageRecorder } from './version-usage-recorder'

it('does not send Veyra usage or mark it counted in upstream storage', async () => {
  const postStatisticsRecord = vi.fn()
  const settingService = { _getFromStorage: vi.fn(), _saveToStorage: vi.fn() }
  const recorder = new VersionUsageRecorder({
    akariApi: { postStatisticsRecord },
    logger: { info: vi.fn() },
    settingService
  } as never)
  await recorder.recordOnce()
  expect(postStatisticsRecord).not.toHaveBeenCalled()
  expect(settingService._getFromStorage).not.toHaveBeenCalled()
  expect(settingService._saveToStorage).not.toHaveBeenCalled()
})
