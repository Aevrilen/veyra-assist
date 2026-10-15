import type { PositionSample } from '@shared/champ-select-overlay/position-calibration'
import { dialog } from 'electron'
import { writeFile } from 'node:fs/promises'

/** User-selected local JSON contains one cropped image and its paired scalar metadata. */
export async function exportPositionSample(sample: PositionSample) {
  const result = await dialog.showSaveDialog({
    defaultPath: `Veyra-position-sample-${sample.preview.requestId.slice(0, 8)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return false
  await writeFile(result.filePath, JSON.stringify(sample, null, 2), 'utf8')
  return true
}
