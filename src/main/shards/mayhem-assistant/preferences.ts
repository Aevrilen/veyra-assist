import { resolveStartingEquipmentPreferences } from '@shared/mayhem-assistant/starting-equipment'
import fs from 'node:fs'
import path from 'node:path'

export const DEFAULT_AUGMENT_BACKGROUND_OPACITY = 0.65

export function readMayhemPreferences(directory: string) {
  const file = path.join(directory, 'preferences.json')
  fs.mkdirSync(directory, { recursive: true })
  if (!fs.existsSync(file))
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          $comment: '用户偏好；更新不会替换已有文件。背景值 0–1；删除本文件后重启恢复默认。',
          version: 1,
          appearance: { augmentBackgroundOpacity: DEFAULT_AUGMENT_BACKGROUND_OPACITY },
          equipment: resolveStartingEquipmentPreferences()
        },
        null,
        2
      ),
      { flag: 'wx' }
    )
  const preferences = JSON.parse(fs.readFileSync(file, 'utf8'))
  const opacity = preferences?.appearance?.augmentBackgroundOpacity
  if (
    preferences?.version !== 1 ||
    typeof opacity !== 'number' ||
    !Number.isFinite(opacity) ||
    opacity < 0 ||
    opacity > 1
  )
    throw new Error(
      'preferences.json 需为 version 1，appearance.augmentBackgroundOpacity 为 0–1 数值'
    )
  return preferences as {
    version: 1
    appearance: { augmentBackgroundOpacity: number }
    [key: string]: unknown
  }
}

export function saveAugmentBackgroundOpacity(directory: string, opacity: unknown) {
  if (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity < 0 || opacity > 1)
    throw new Error('评分背景不透明度必须为 0–1 数值')
  const preferences = readMayhemPreferences(directory)
  preferences.appearance.augmentBackgroundOpacity = opacity
  const file = path.join(directory, 'preferences.json')
  fs.writeFileSync(file + '.tmp', JSON.stringify(preferences, null, 2))
  fs.renameSync(file + '.tmp', file)
  return opacity
}
