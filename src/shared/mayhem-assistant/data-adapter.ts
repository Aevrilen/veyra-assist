import { assertQq101Envelope } from '../data-adapter/champion-data/qq101-protocol'
import {
  type AugmentData,
  type EquipmentData,
  type ItemRow,
  MAX_EQUIPMENT_ROWS,
  ratio,
  sortRows
} from './model'

function object(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function positiveId(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (!/^\d+$/.test(String(value).trim())) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function ids(value: unknown): number[] {
  if (typeof value !== 'string' && typeof value !== 'number') return []
  const parsed = String(value).split(/[&,]/).map(positiveId)
  // A partially decoded build would describe a different combination.
  return parsed.every((id): id is number => id !== null) ? parsed : []
}

export function isStatisticsDate(value: unknown, compact = false): value is string {
  if (typeof value !== 'string') return false
  if (!(compact ? /^\d{8}$/ : /^\d{4}-\d{2}-\d{2}$/).test(value)) return false
  const iso = compact ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}` : value
  const date = new Date(`${iso}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso
}

export function parseEquipment(response: unknown, championId: number): EquipmentData {
  if (positiveId(championId) !== championId) throw new Error('Invalid champion ID')
  const envelope = object(assertQq101Envelope(response))
  const fields = object(object(envelope?.data)?._fieldValues)
  // R-numbers and unrelated fields can change; decode each field independently.
  const payloads = Object.values(fields ?? {})
    .map(object)
    .filter(
      (payload): payload is Record<string, unknown> =>
        payload !== null &&
        ['itemone_json', 'itemcore_json', 'itemshoes', 'itemout'].some((key) => key in payload)
    )
  if (payloads.length !== 1 || !isStatisticsDate(payloads[0].dtstatdate, true))
    throw new Error('Missing or ambiguous equipment statistics')
  const payload = payloads[0]
  // This endpoint has no champion identity field. championid_json contains partners,
  // so identity is bound to the validated championid request, never that partner list.
  const jsonRows = (value: unknown, key: string): ItemRow[] | null => {
    const records = object(value)
    if (!records) return null
    const rows = Object.values(records).flatMap((value) => {
      const row = object(value)
      if (!row) return []
      const itemIds = ids(row[key])
      return itemIds.length && (key !== 'itemone' || itemIds.length === 1)
        ? [
            {
              ids: itemIds,
              pickRate: ratio(row.showrate, 10000),
              winRate: ratio(row.winrate, 10000)
            }
          ]
        : []
    })
    return Object.keys(records).length === 0 || rows.length > 0 ? rows : null
  }
  const delimited = (value: unknown): ItemRow[] | null => {
    if (typeof value !== 'string') return null
    const rows = value.split('#').flatMap((row) => {
      const [item, pick, win] = row.split('$')
      const itemIds = ids(item)
      return itemIds.length ? [{ ids: itemIds, pickRate: ratio(pick), winRate: ratio(win) }] : []
    })
    return value.trim() === '' || rows.length > 0 ? rows : null
  }
  const items = jsonRows(payload.itemone_json, 'itemone')
  const shoes = delimited(payload.itemshoes)
  const core = jsonRows(payload.itemcore_json, 'itemcore')
  const starting = delimited(payload.itemout)
  if ([items, shoes, core, starting].every((rows) => rows === null))
    throw new Error('Malformed equipment statistics')
  return {
    championId,
    date: payload.dtstatdate as string,
    source: '腾讯101',
    categories: {
      items: sortRows(items ?? [], MAX_EQUIPMENT_ROWS),
      shoes: sortRows(shoes ?? []),
      // Different orders carry separate upstream statistics. Do not normalize or merge them.
      core: sortRows(core ?? [], MAX_EQUIPMENT_ROWS),
      starting: sortRows(starting ?? [])
    }
  }
}

export function parseAugments(
  response: unknown,
  championId: number,
  patch: string,
  date: string
): AugmentData {
  if (positiveId(championId) !== championId) throw new Error('Invalid champion ID')
  if (
    typeof patch !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(patch) ||
    !isStatisticsDate(date)
  )
    throw new Error('Invalid ARAMKit statistics version')
  const payload = object(response)
  const champion = object(payload?.champion)
  if (positiveId(champion?.id) !== championId)
    throw new Error('Champion statistics do not match request')
  const all = object(payload?.augments)?.all
  if (!Array.isArray(all)) throw new Error('Missing augment statistics')
  const augments: AugmentData['augments'] = all.flatMap((value) => {
    const row = object(value)
    const id = positiveId(row?.id)
    return row && id !== null
      ? [
          {
            id,
            pickRate: ratio(row.pickRate),
            // augmentWinRate / augmentTier are global statistics, not this champion's.
            winRate: ratio(row.winRate),
            tier: row.tier === 'S' || row.tier === 'A' || row.tier === 'B' ? row.tier : null
          }
        ]
      : []
  })
  if (all.length > 0 && augments.length === 0) throw new Error('Malformed augment statistics')
  return {
    championId,
    patch,
    date,
    source: 'ARAMKit · 全阶段',
    augments
  }
}

const normalizeAugmentName = (text: string) =>
  text.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '')

export function matchAugmentName(text: string, dictionary: Array<{ id: number; name: string }>) {
  const name = normalizeAugmentName(text)
  const matches = dictionary.filter((d) => normalizeAugmentName(d.name) === name)
  return matches.length === 1 ? matches[0].id : null
}

// Recorded OCR confusions only; no arbitrary edit distance, truncation, or ID guessing.
export function matchOcrAugmentName(text: string, dictionary: Array<{ id: number; name: string }>) {
  const name = normalizeAugmentName(text)
  const exact = dictionary.filter((d) => normalizeAugmentName(d.name) === name)
  if (exact.length) return exact.length === 1 ? exact[0].id : null
  // Two recorded native-size title reads insert 和 into this exact four-character title.
  // Keep it specific to the reviewed title and resolve the current dictionary's unique ID.
  if (name === '由暴生和急') {
    const recordedTitle = dictionary.filter(
      (entry) => normalizeAugmentName(entry.name) === '由暴生急'
    )
    return recordedTitle.length === 1 ? recordedTitle[0].id : null
  }
  if (name.length < 4) return null
  const matches = dictionary.filter((entry) => {
    const canonical = normalizeAugmentName(entry.name)
    if (canonical.length !== name.length) return false
    let substitutions = 0
    for (let i = 0; i < name.length; i++) {
      if (canonical[i] === name[i]) continue
      const pair = name[i] + canonical[i]
      if (pair !== '内闪' && pair !== '闪内') return false
      if (++substitutions > 1) return false
    }
    return substitutions === 1
  })
  return matches.length === 1 ? matches[0].id : null
}
