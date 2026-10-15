import { z } from 'zod'

import defaults from './defaults.json'

export type StartingRoleKey = 'guardian-blade' | 'guardian-horn'
export interface StartingEquipmentPreferences {
  roleDefaults: Record<StartingRoleKey, Array<number | null>>
  championOverrides: Record<string, Array<number | null>>
}

const slots = z.array(z.number().int().positive().nullable())
const preferencesSchema = z
  .object({
    roleDefaults: z
      .object({
        'guardian-blade': slots.optional(),
        'guardian-horn': slots.optional()
      })
      .passthrough()
      .optional(),
    championOverrides: z.record(z.string(), slots).optional()
  })
  .passthrough()
export const DEFAULT_STARTING_EQUIPMENT: StartingEquipmentPreferences = {
  roleDefaults: defaults.roleDefaults,
  championOverrides: defaults.championOverrides
}

// Merge missing defaults only in memory. Never rewrite an existing user preference file.
export function resolveStartingEquipmentPreferences(
  equipment?: unknown
): StartingEquipmentPreferences {
  const user = preferencesSchema.parse(equipment === undefined ? {} : equipment)
  return {
    roleDefaults: {
      'guardian-blade':
        user.roleDefaults?.['guardian-blade'] ?? defaults.roleDefaults['guardian-blade'],
      'guardian-horn':
        user.roleDefaults?.['guardian-horn'] ?? defaults.roleDefaults['guardian-horn']
    },
    championOverrides: { ...defaults.championOverrides, ...user.championOverrides }
  }
}

export function resolveStartingEquipment(
  championId: number | null,
  role: StartingRoleKey | null,
  preferences: StartingEquipmentPreferences | null = DEFAULT_STARTING_EQUIPMENT
) {
  if (preferences === null)
    return { key: 'unavailable', ids: [], message: '用户模板配置不可用，请核对 preferences.json' }
  const champion = String(championId)
  const override = championId !== null && Object.hasOwn(preferences.championOverrides, champion)
  const ids = override
    ? preferences.championOverrides[champion]
    : role
      ? preferences.roleDefaults[role]
      : []
  return {
    key: override ? `champion-${champion}` : role || 'unconfigured',
    ids,
    message:
      championId === 887 && ids.includes(null)
        ? '格温：守护者装备待定'
        : !ids.length
          ? override
            ? '按用户配置不显示固定模板'
            : '当前定位未配置固定出门装'
          : '用户模板配置 · 不含网站统计'
  }
}

export function startingEquipmentName(id: number): string | undefined {
  return (defaults.itemNames as Record<string, string>)[id]
}
