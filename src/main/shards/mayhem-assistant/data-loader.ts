import {
  isStatisticsDate,
  parseAugments,
  parseEquipment
} from '@shared/mayhem-assistant/data-adapter'
import {
  type AugmentData,
  type EquipmentData,
  MAX_EQUIPMENT_ROWS
} from '@shared/mayhem-assistant/model'
import { type AxiosInstance, CanceledError, isCancel } from 'axios'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import type { AkariLogger } from '../logger-factory'

const CACHE_SCHEMA_VERSION = 2
const DAY_MS = 24 * 60 * 60 * 1000
// Offline fallback is bounded both by fetch time and by the source's statistics date.
const MAX_CACHE_AGE_MS = DAY_MS
const MAX_STATISTICS_AGE_MS = 7 * DAY_MS

type StatisticsData = EquipmentData | AugmentData

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validRate(value: unknown) {
  return (
    value === null ||
    (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)
  )
}

function validId(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function equipmentData(value: unknown, championId: number): value is EquipmentData {
  if (
    !record(value) ||
    value.championId !== championId ||
    value.source !== '腾讯101' ||
    !isStatisticsDate(value.date, true)
  )
    return false
  const categories = value.categories
  return (
    record(categories) &&
    ['items', 'shoes', 'core', 'starting'].every((category) => {
      const rows = categories[category]
      return (
        Array.isArray(rows) &&
        rows.length <= MAX_EQUIPMENT_ROWS &&
        rows.every(
          (row) =>
            record(row) &&
            Array.isArray(row.ids) &&
            row.ids.length > 0 &&
            row.ids.every(validId) &&
            validRate(row.pickRate) &&
            validRate(row.winRate)
        )
      )
    })
  )
}

function augmentData(value: unknown, championId: number): value is AugmentData {
  return (
    record(value) &&
    value.championId === championId &&
    value.source === 'ARAMKit · 全阶段' &&
    isStatisticsDate(value.date) &&
    typeof value.patch === 'string' &&
    /^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(value.patch) &&
    Array.isArray(value.augments) &&
    value.augments.every(
      (row) =>
        record(row) &&
        validId(row.id) &&
        validRate(row.pickRate) &&
        validRate(row.winRate) &&
        (row.tier === null || row.tier === 'S' || row.tier === 'A' || row.tier === 'B')
    )
  )
}

export class MayhemDataLoader {
  private readonly _requests = new Map<string, AbortController>()

  constructor(
    private readonly _http: AxiosInstance,
    private readonly _directory: string,
    private readonly _logger: AkariLogger
  ) {}

  private _readCache<T extends StatisticsData>(
    file: string,
    championId: number,
    source: T['source'],
    validate: (value: unknown) => value is T
  ): T | null {
    try {
      const cache: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
      const now = Date.now()
      if (
        !record(cache) ||
        cache.schemaVersion !== CACHE_SCHEMA_VERSION ||
        cache.source !== source ||
        cache.championId !== championId ||
        typeof cache.savedAt !== 'number' ||
        !Number.isFinite(cache.savedAt) ||
        cache.savedAt > now ||
        now - cache.savedAt > MAX_CACHE_AGE_MS ||
        !validate(cache.data)
      )
        throw new Error('Invalid or expired statistics cache')
      const sourceDate = cache.data.date.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
      const sourceTime = Date.parse(`${sourceDate}T00:00:00Z`)
      const today = Math.floor(now / DAY_MS) * DAY_MS
      if (sourceTime > today || today - sourceTime > MAX_STATISTICS_AGE_MS)
        throw new Error('Statistics cache source date is stale or in the future')
      return { ...cache.data, cached: true }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this._logger.warn('Mayhem statistics cache was ignored', error)
      return null
    }
  }

  private _saveCache(file: string, data: StatisticsData) {
    const temporaryFile = `${file}.${randomUUID()}.tmp`
    try {
      fs.mkdirSync(this._directory, { recursive: true })
      fs.writeFileSync(
        temporaryFile,
        JSON.stringify({
          schemaVersion: CACHE_SCHEMA_VERSION,
          source: data.source,
          championId: data.championId,
          savedAt: Date.now(),
          data
        }),
        { flag: 'wx' }
      )
      fs.renameSync(temporaryFile, file)
    } catch (error) {
      this._logger.warn('Mayhem statistics cache could not be saved', error)
    } finally {
      try {
        fs.rmSync(temporaryFile, { force: true })
      } catch (error) {
        this._logger.warn('Mayhem statistics temporary cache could not be removed', error)
      }
    }
  }

  private async _cached<T extends StatisticsData>(
    name: string,
    championId: number,
    source: T['source'],
    signal: AbortSignal,
    validate: (value: unknown) => value is T,
    load: (signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    if (!validId(championId)) throw new Error('Invalid champion ID')
    signal.throwIfAborted()
    this._requests.get(name)?.abort(new CanceledError('Mayhem statistics request superseded'))
    const controller = new AbortController()
    this._requests.set(name, controller)
    const requestSignal = AbortSignal.any([signal, controller.signal])
    const assertCurrent = () => {
      requestSignal.throwIfAborted()
      if (this._requests.get(name) !== controller)
        throw new CanceledError('Mayhem statistics request superseded')
    }
    const file = path.join(this._directory, `${name}.json`)
    try {
      const result = await load(requestSignal)
      assertCurrent()
      this._saveCache(file, result)
      return result
    } catch (error) {
      // Cancellation and supersession are control flow, never reasons to restore old data.
      assertCurrent()
      if (isCancel(error) || (error instanceof Error && error.name === 'AbortError')) throw error
      this._logger.warn(
        'Mayhem statistics request failed',
        error instanceof Error ? error.message : String(error)
      )
      const cached = this._readCache(file, championId, source, validate)
      if (cached) return cached
      throw error
    } finally {
      if (this._requests.get(name) === controller) this._requests.delete(name)
    }
  }

  equipment(championId: number, signal: AbortSignal): Promise<EquipmentData> {
    return this._cached(
      `qq101-mayhem-${championId}`,
      championId,
      '腾讯101',
      signal,
      (value): value is EquipmentData => equipmentData(value, championId),
      async (signal) => {
        const response = await this._http.get(
          'https://mlol.qt.qq.com/go/battle_info/odp_proxy/fuwen_hero_rank',
          { params: { championid: championId }, signal }
        )
        return parseEquipment(response.data, championId)
      }
    )
  }

  augments(championId: number, signal: AbortSignal): Promise<AugmentData> {
    let version: { version: string; dataPath: string; dataDate: string } | undefined
    return this._cached(
      `aramkit-mayhem-${championId}`,
      championId,
      'ARAMKit · 全阶段',
      signal,
      (value): value is AugmentData =>
        augmentData(value, championId) &&
        (!version || (value.patch === version.version && value.date === version.dataDate)),
      async (signal) => {
        const response = await this._http.get('https://data.aramkit.cn/data/versions.json', {
          signal
        })
        signal.throwIfAborted()
        const metadata: unknown = response.data
        const latest =
          record(metadata) &&
          typeof metadata.latest === 'string' &&
          Array.isArray(metadata.versions)
            ? metadata.versions.find((value) => record(value) && value.version === metadata.latest)
            : null
        if (
          !record(latest) ||
          typeof latest.version !== 'string' ||
          !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(latest.version) ||
          typeof latest.dataPath !== 'string' ||
          !/^data\/[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(latest.dataPath) ||
          !isStatisticsDate(latest.dataDate)
        )
          throw new Error('Invalid ARAMKit version metadata')
        version = { version: latest.version, dataPath: latest.dataPath, dataDate: latest.dataDate }
        const statistics = await this._http.get(
          `https://data.aramkit.cn/${version.dataPath}/stats/all/champion-details/${championId}.json`,
          { signal }
        )
        return parseAugments(statistics.data, championId, version.version, version.dataDate)
      }
    )
  }
}
