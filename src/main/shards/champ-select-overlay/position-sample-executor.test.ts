import { beforeEach, describe, expect, it, vi } from 'vitest'

import { exportPositionSample } from './position-sample-executor'

const mocks = vi.hoisted(() => ({ choose: vi.fn(), write: vi.fn() }))
vi.mock('electron', () => ({ dialog: { showSaveDialog: mocks.choose } }))
vi.mock('node:fs/promises', () => ({ writeFile: mocks.write }))
const sample = {
  version: 1 as const,
  imageUrl: 'SYNTHETIC_LOCAL_IMAGE',
  note: 'local only',
  preview: {
    requestId: 'synthetic-id',
    width: 1280,
    height: 720,
    client: { x: 0, y: 0, width: 1280, height: 720 },
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    counts: { candidates: 3, teammates: 5 }
  }
}
beforeEach(() => vi.clearAllMocks())
describe('user-requested local sample export', () => {
  it('writes nothing when the user cancels the save dialog', async () => {
    mocks.choose.mockResolvedValue({ canceled: true })
    await expect(exportPositionSample(sample)).resolves.toBe(false)
    expect(mocks.write).not.toHaveBeenCalled()
  })
  it('writes only the paired bundle to the user-selected local path', async () => {
    mocks.choose.mockResolvedValue({ canceled: false, filePath: 'SYNTHETIC-CHOSEN-PATH.json' })
    await expect(exportPositionSample(sample)).resolves.toBe(true)
    expect(mocks.write).toHaveBeenCalledExactlyOnceWith(
      'SYNTHETIC-CHOSEN-PATH.json',
      JSON.stringify(sample, null, 2),
      'utf8'
    )
  })
})
