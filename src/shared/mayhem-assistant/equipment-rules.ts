import {
  type EquipmentGameContext,
  type EquipmentRosterMember,
  type ItemRow,
  type OverlaySnapshot,
  type RuleItemBinding,
  equipmentPanelHeight
} from './model'
import { resolveStartingEquipment, startingEquipmentName } from './starting-equipment'

export type EquipmentRole = 'fighter' | 'assassin' | 'marksman' | 'tank' | 'mage' | 'support'
const roles = new Set<EquipmentRole>(['fighter', 'assassin', 'marksman', 'tank', 'mage', 'support'])
export function resolveEquipmentRoles(values: string[]) {
  const normalized = [...new Set(values.map((value) => value.toLowerCase().trim()))]
  const known = normalized.filter((value): value is EquipmentRole =>
    roles.has(value as EquipmentRole)
  )
  const complete = normalized.length > 0 && known.length === normalized.length
  const blade =
    complete && known.every((role) => ['fighter', 'assassin', 'marksman'].includes(role))
  const horn = complete && known.every((role) => role === 'tank')
  const mage = complete && known.every((role) => role === 'mage')
  return {
    roles: known,
    tank: known.includes('tank'),
    starting: blade ? ('guardian-blade' as const) : horn ? ('guardian-horn' as const) : null,
    startingStatus: blade || horn || mage ? ('configured' as const) : ('unresolved' as const),
    adaptation: mage
      ? ('mage' as const)
      : complete && known.every((role) => ['fighter', 'assassin'].includes(role))
        ? ('physical' as const)
        : null
  }
}
export function reviewedBinding(
  binding: RuleItemBinding | null | undefined,
  context: EquipmentGameContext
) {
  return binding &&
    binding.mode === 'KIWI' &&
    Number.isSafeInteger(binding.id) &&
    binding.id > 0 &&
    (binding.provenance === 'reviewed' ||
      (binding.provenance === 'offline-fixture' && context.debugFixture))
    ? binding.id
    : null
}
export interface RuleCandidate {
  key: string
  id: number | null
  name: string
  reason: string
  row?: ItemRow
}
const sorted = (rows: ItemRow[]) =>
  [...rows].sort((a, b) => (b.pickRate ?? -1) - (a.pickRate ?? -1))
const distinctItems = (rows: ItemRow[], excluded: Set<number>, limit: number) => {
  const seen = new Set(excluded)
  return sorted(rows)
    .filter((row) => {
      if (row.ids.length !== 1 || seen.has(row.ids[0])) return false
      seen.add(row.ids[0])
      return true
    })
    .slice(0, limit)
}
const sameIds = (a: number[], b: number[]) =>
  a.length === b.length && a.every((id, index) => id === b[index])

export function equipmentPresentation(snapshot: OverlaySnapshot) {
  const context =
    snapshot.equipmentContext?.sessionKey === snapshot.sessionKey &&
    snapshot.equipmentContext.championId === snapshot.championId
      ? snapshot.equipmentContext
      : null
  const role = resolveEquipmentRoles(context?.roles ?? [])
  const data = snapshot.equipment?.championId === snapshot.championId ? snapshot.equipment : null
  const owned = new Set(context?.inventory?.ids ?? [])
  const startingSelection = resolveStartingEquipment(
    snapshot.championId,
    role.starting,
    context ? context.startingEquipment : null
  )
  const startingTemplate: RuleCandidate[] = startingSelection.ids.map((id, index) => ({
    key: index ? `${startingSelection.key}-${index}` : startingSelection.key,
    id,
    name:
      id === null
        ? '待定装备'
        : startingEquipmentName(id) || snapshot.itemAssets[id]?.name || `未知装备 ${id}`,
    reason: startingSelection.message
  }))
  const torch = context ? reviewedBinding(context.bindings.torch, context) : null
  const luden = context ? reviewedBinding(context.bindings.luden, context) : null
  const twistedPending = snapshot.championId === 4 && (torch === null || luden === null)
  const blocked = !data || twistedPending
  let core: ItemRow | null = null
  if (!blocked && !role.tank && role.roles.length) {
    const legal = (row: ItemRow) =>
      row.ids.length === 3 &&
      new Set(row.ids).size === 3 &&
      (snapshot.championId !== 4 || (row.ids.includes(torch!) && !row.ids.includes(luden!)))
    const choice = snapshot.standardCoreIds
    const record = choice
      ? data.categories.core.find((row) => sameIds(row.ids, choice) && legal(row))
      : sorted(data.categories.core).find(legal)
    if (record) core = { ...record, ids: [...record.ids] }
    else if (choice && legal({ ids: choice, pickRate: null, winRate: null }))
      core = { ids: [...choice], pickRate: null, winRate: null }
  }
  const exclusions = new Set([...owned, ...(core?.ids ?? [])])
  if (snapshot.championId === 4 && luden !== null) exclusions.add(luden)
  const tankCandidates: RuleCandidate[] = []
  if (!blocked && role.tank && context?.teams) {
    const foeRoles = context.teams.enemies.flatMap(
      (member) => resolveEquipmentRoles(member.roles).roles
    )
    const groups: Array<{
      key: string
      bindings: RuleItemBinding[]
      matches: boolean
      reason: string
    }> = [
      {
        key: 'armor',
        bindings: context.bindings.armor,
        matches: foeRoles.some((value) => value === 'fighter' || value === 'marksman'),
        reason: '敌方含战士／射手定位，可核对护甲备选；定位不是实际伤害比例。'
      },
      {
        key: 'magic-resist',
        bindings: context.bindings.magicResist,
        matches: foeRoles.includes('mage'),
        reason: '敌方含法师定位，可核对魔抗备选；仍需结合本局伤害。'
      },
      {
        key: 'health',
        bindings: context.bindings.health,
        matches:
          foeRoles.includes('mage') &&
          foeRoles.some((value) => value === 'fighter' || value === 'marksman'),
        reason: '双方阵容可核对；生命值为混合威胁下的可选防御方向。'
      }
    ]
    const used = new Set(owned)
    for (const group of groups) {
      if (!group.matches) continue
      const valid = new Set(
        group.bindings
          .map((binding) => reviewedBinding(binding, context))
          .filter((id): id is number => id !== null)
      )
      const row = sorted(data.categories.items).find(
        (row) => row.ids.length === 1 && valid.has(row.ids[0]) && !used.has(row.ids[0])
      )
      if (!row) continue
      const id = row.ids[0]
      used.add(id)
      exclusions.add(id)
      tankCandidates.push({
        key: group.key,
        id,
        name: snapshot.itemAssets[id]?.name || `未知装备 ${id}`,
        reason: group.reason,
        row: { ...row, ids: [id] }
      })
    }
  }
  const later = blocked ? [] : distinctItems(data.categories.items, exclusions, role.tank ? 3 : 5)
  const selection = snapshot.confirmedSelection
  const confirmed =
    !!context &&
    !!selection &&
    selection.sessionKey === snapshot.sessionKey &&
    selection.championId === snapshot.championId &&
    (selection.source === 'verified-game-state' ||
      selection.source === 'reviewed-user-confirmation' ||
      (selection.source === 'offline-fixture' && !!context.debugFixture))
  const adapted: RuleCandidate[] = []
  const conditions: string[] = []
  if (confirmed && selection.ids.includes(1048) && role.adaptation) {
    conditions.push('珠光护手 · 已确认选中')
    const id = reviewedBinding(context.bindings.infinityEdge, context)
    if (id === null || !owned.has(id))
      adapted.push({
        key: 'infinity-edge',
        id,
        name: '无尽之刃',
        reason:
          role.adaptation === 'mage'
            ? '技能可暴击时的可选候选，是否购买仍需结合本局。'
            : '可考虑暴击方向；这是独立备选，不替换标准三件。'
      })
  }
  const recall = context ? reviewedBinding(context.bindings.recallAugment, context) : null
  if (confirmed && snapshot.championId === 4 && recall !== null && selection.ids.includes(recall)) {
    conditions.push('已核实的回想释放条件 · 已确认选中')
    if (luden === null || !owned.has(luden))
      adapted.push({
        key: 'luden',
        id: luden,
        name: '卢登',
        reason: '确认相应已选条件后的独立备选；标准路线仍以火炬为基础。'
      })
  }
  return {
    context,
    role,
    starting: startingTemplate[0] ?? null,
    startingTemplate,
    startingMessage: startingSelection.message,
    core,
    later,
    tankCandidates,
    teams: context?.teams ?? null,
    inventoryAvailable: context?.inventory !== null && context?.inventory !== undefined,
    standardUnavailable: !data
      ? '统计加载中或暂不可用'
      : twistedPending
        ? '卡牌火炬／卢登的目标模式映射待核实，标准路线暂不可用'
        : null,
    adapted,
    conditions,
    adaptationAvailable: confirmed && !blocked && conditions.length > 0,
    selectionUnavailable: !confirmed,
    tankMappingPending: role.tank && !!context?.teams && !tankCandidates.length
  }
}

export function equipmentPresentationHeight(snapshot: OverlaySnapshot) {
  if (snapshot.category === 'starting') {
    const websiteRows = Math.min(snapshot.equipment?.categories.starting.length ?? 0, 6)
    return 88 + 42 + 104 + 42 + 48 + Math.max(websiteRows, 1) * 84 + 64 + 2
  }
  if (snapshot.category === 'core')
    return equipmentPanelHeight(
      Math.min(snapshot.equipment?.categories.core.length ?? 0, 6),
      'core'
    )
  if (snapshot.category !== 'items') return 760
  const view = equipmentPresentation(snapshot)
  if (snapshot.buildView === 'augment' && view.adaptationAvailable) return 760
  const body = view.role.tank
    ? 88 + 118 + 45 + view.tankCandidates.length * 77 + 48 + view.later.length * 68 + 68 + 2
    : 88 + 238 + 48 + view.later.length * 68 + 68 + 2
  return Math.max(760, Math.min(900, body))
}

export function resolveEquipmentTeams(
  teams: Record<string, string[]>,
  selections: Record<string, number>,
  myPuuid: string,
  championId: number,
  catalog: Record<number, { name: string; roles: string[] }>
): EquipmentGameContext['teams'] {
  const entries = Object.entries(teams).filter(([, members]) => members.length > 0)
  if (entries.length !== 2 || selections[myPuuid] !== championId) return null
  const all = entries.flatMap(([, members]) => members)
  if (new Set(all).size !== all.length) return null
  const own = entries.find(([, members]) => members.includes(myPuuid))
  if (!own) return null
  const enemy = entries.find(([key]) => key !== own[0])!
  const members = (puuids: string[]): EquipmentRosterMember[] | null => {
    if (puuids.some((puuid) => !Number.isSafeInteger(selections[puuid]) || selections[puuid] <= 0))
      return null
    return puuids.map((puuid) => ({
      championId: selections[puuid],
      name: catalog[selections[puuid]]?.name || String(selections[puuid]),
      roles: [...(catalog[selections[puuid]]?.roles ?? [])]
    }))
  }
  const allies = members(own[1]),
    enemies = members(enemy[1])
  return allies && enemies ? { allies, enemies } : null
}
