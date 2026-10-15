// Explicit package QA only: no client connection, game capture, input hooks or queue actions.
import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DataSource } from 'typeorm'

import { createMayhemOcrBackend } from './shards/mayhem-assistant/ocr-executor'
import { EncounteredGame } from './shards/storage/entities/EncounteredGame'
import { v10_LA1_2_0initializationUpgrade } from './shards/storage/upgrades/version-10'
import { v15_LA1_2_2Upgrade } from './shards/storage/upgrades/version-15'

export async function runPortablePackageCheck() {
  const reportPath = process.env.AKARI_PACKAGE_CHECK_REPORT
  const inputDirectory = process.env.AKARI_PACKAGE_CHECK_INPUTS
  const started = performance.now()
  const result: Record<string, unknown> = {
    scope: 'Extracted package startup, native, SQLite and synthetic OCR; no real game acceptance',
    observedAt: new Date().toISOString(),
    executable: app.getPath('exe'),
    userData: app.getPath('userData'),
    electron: process.versions.electron,
    packaged: app.isPackaged
  }
  let exitCode = 0
  try {
    if (!reportPath || !inputDirectory || !app.isPackaged)
      throw new Error(
        'Package check requires an extracted package, report path and synthetic inputs'
      )
    await app.whenReady()
    const tools = require(
      path.join(
        path.dirname(require.resolve('league-akari-native-win32')),
        '..',
        'addons/akari-tools-win64.node'
      )
    )
    for (const name of ['getLeagueClientWindowSnapshot', 'getGameClientWindowSnapshot']) {
      if (typeof tools[name] !== 'function')
        throw new Error(`Packaged native capability missing: ${name}`)
      if (tools[name](0) !== null || tools[name](2 ** 32) !== null)
        throw new Error(`Native snapshot did not reject invalid PIDs: ${name}`)
    }
    const facade = require('league-akari-native-win32/tools').default
    facade.load()
    if (!facade.supportsGameClientWindowSnapshot())
      throw new Error('Native JS facade lost the game snapshot capability')
    result.native = {
      leagueSnapshot: true,
      gameSnapshot: true,
      facadeCapability: true,
      invalidPidsRejected: true,
      elevated: tools.isElevated()
    }

    const Database = require('better-sqlite3')
    const database = new Database(':memory:')
    try {
      if (database.prepare('SELECT 1 AS value').get().value !== 1)
        throw new Error('SQLite query failed')
    } finally {
      database.close()
    }
    result.sqlite = 'in-memory query passed'

    const inputs = await Promise.all(
      [0, 1, 2].map((index) =>
        fs.readFile(path.join(inputDirectory, `synthetic-title-${index}.png`))
      )
    )
    const modelDirectory = path.join(
      app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked'),
      'resources/ocr'
    )
    const ocr: Record<string, unknown> = {}
    for (const backend of ['rapidocr', 'tesseract'] as const) {
      const engine = createMayhemOcrBackend(modelDirectory, { AKARI_MAYHEM_OCR_BACKEND: backend })
      try {
        await engine.preload()
        const lines = await engine.recognize(inputs)
        const expected = ['暗影疾奔', '下雪天', '防护面纱']
        for (let index = 0; index < expected.length; index++) {
          if (lines[index].text.normalize('NFKC').replace(/\s/gu, '') !== expected[index])
            throw new Error(`${backend} synthetic title ${index} did not match`)
        }
        ocr[backend] = { lines, diagnostics: engine.diagnostics?.() ?? null }
      } finally {
        engine.dispose()
      }
    }
    result.ocr = ocr

    // Seed a fresh QA profile with auto-connect disabled before the separate full UI launch.
    if (process.env.AKARI_PACKAGE_CHECK_SEED_PROFILE === '1') {
      const databasePath = path.join(app.getPath('userData'), 'LeagueAkari.db')
      try {
        await fs.access(databasePath)
        throw new Error('QA seed requires a new profile')
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause
      }
      const source = new DataSource({
        type: 'better-sqlite3',
        database: databasePath,
        entities: [EncounteredGame],
        synchronize: false
      })
      await source.initialize()
      try {
        const runner = source.createQueryRunner()
        await v10_LA1_2_0initializationUpgrade(runner)
        await v15_LA1_2_2Upgrade(runner)
        await runner.query('INSERT INTO Settings(key,value) VALUES(?,?)', [
          'league-client-main/autoConnect',
          'false'
        ])
        await runner.query('INSERT INTO Settings(key,value) VALUES(?,?)', [
          'windows-portable-qa/sentinel',
          JSON.stringify('preserve-across-updates')
        ])
        await runner.release()
      } finally {
        await source.destroy()
      }
      result.qaProfile =
        'Fresh production migrations; LCU auto-connect disabled; persistence sentinel inserted'
    }
    result.success = true
  } catch (cause) {
    exitCode = 1
    result.success = false
    result.error =
      cause instanceof Error ? { message: cause.message, stack: cause.stack } : String(cause)
  } finally {
    result.durationMs = performance.now() - started
    if (reportPath) await fs.writeFile(reportPath, JSON.stringify(result, null, 2) + '\n')
    app.exit(exitCode)
  }
}
