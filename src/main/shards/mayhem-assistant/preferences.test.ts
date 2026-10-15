import { resolveStartingEquipmentPreferences } from '@shared/mayhem-assistant/starting-equipment'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { readMayhemPreferences, saveAugmentBackgroundOpacity } from './preferences'

let directory: string
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akari-preferences-'))
})
afterEach(() => {
  fs.rmSync(path.join(directory, 'preferences.json'), { force: true })
  fs.rmSync(path.join(directory, 'preferences.json.tmp'), { force: true })
  fs.rmdirSync(directory)
})

it('creates defaults once and preserves user equipment fields when saving opacity', () => {
  const file = path.join(directory, 'preferences.json')
  expect(readMayhemPreferences(directory).appearance.augmentBackgroundOpacity).toBe(0.65)
  expect(
    resolveStartingEquipmentPreferences(readMayhemPreferences(directory).equipment).roleDefaults[
      'guardian-blade'
    ]
  ).toEqual([3177, 1036])
  const equipment = { championOverrides: { 887: [null, 1052] } }
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      appearance: { augmentBackgroundOpacity: 0.3 },
      equipment,
      $comment: '我的偏好'
    })
  )
  expect(readMayhemPreferences(directory).appearance.augmentBackgroundOpacity).toBe(0.3)
  saveAugmentBackgroundOpacity(directory, 0.45)
  expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({
    version: 1,
    appearance: { augmentBackgroundOpacity: 0.45 },
    equipment,
    $comment: '我的偏好'
  })
})

it('rejects invalid values without changing an existing preference file', () => {
  readMayhemPreferences(directory)
  const file = path.join(directory, 'preferences.json')
  const original = fs.readFileSync(file, 'utf8')
  expect(() => saveAugmentBackgroundOpacity(directory, 2)).toThrow('0–1')
  expect(fs.readFileSync(file, 'utf8')).toBe(original)
})

it('reports malformed user content without replacing it with defaults', () => {
  const file = path.join(directory, 'preferences.json')
  fs.writeFileSync(file, '{broken')
  expect(() => readMayhemPreferences(directory)).toThrow()
  expect(fs.readFileSync(file, 'utf8')).toBe('{broken')
})

it('merges missing fields in memory without replacing explicit old overrides or changing file bytes', () => {
  const file = path.join(directory, 'preferences.json')
  const original = JSON.stringify({
    version: 1,
    appearance: { augmentBackgroundOpacity: 0.3 },
    equipment: {
      roleDefaults: { 'guardian-blade': [3031] },
      championOverrides: { '887': [null, 1052] },
      myNote: '保留我的配置'
    }
  })
  fs.writeFileSync(file, original)
  const resolved = resolveStartingEquipmentPreferences(readMayhemPreferences(directory).equipment)
  expect(resolved.roleDefaults['guardian-blade']).toEqual([3031])
  expect(resolved.roleDefaults['guardian-horn']).toEqual([2051, 1028])
  expect(resolved.championOverrides['887']).toEqual([null, 1052])
  expect(fs.readFileSync(file, 'utf8')).toBe(original)
})
