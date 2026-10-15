import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { describe, it } from 'vitest'

describe('League client window snapshot addon contract', () => {
  it('keeps an older binary unavailable and preserves current physical bounds and native failures', () => {
    execFileSync(
      process.execPath,
      [
        '-e',
        `
          const assert = require('node:assert/strict')
          const Module = require('node:module')
          const originalNodeLoader = Module._extensions['.node']
          const binding = {}
          Module._extensions['.node'] = (module) => { module.exports = binding }

          try {
            const tools = require(${JSON.stringify(path.resolve('native/win32-x64/dist/tools/index.js'))}).default
            tools.load()
            assert.equal(tools.getLeagueClientWindowSnapshot(42), null)

            const snapshot = {
              bounds: { x: -1800, y: 87, width: 1280, height: 720 },
              isForeground: true,
              isMinimized: false,
              isVisible: true
            }
            const processIds = []
            binding.getLeagueClientWindowSnapshot = (processId) => {
              processIds.push(processId)
              return snapshot
            }
            assert.equal(tools.getLeagueClientWindowSnapshot(42), snapshot)
            assert.deepEqual(processIds, [42])

            binding.getLeagueClientWindowSnapshot = () => null
            assert.equal(tools.getLeagueClientWindowSnapshot(42), null)

            const failure = new Error('native read failure')
            binding.getLeagueClientWindowSnapshot = () => { throw failure }
            assert.throws(() => tools.getLeagueClientWindowSnapshot(42), (error) => error === failure)
          } finally {
            Module._extensions['.node'] = originalNodeLoader
          }
        `
      ],
      { cwd: path.resolve('.'), encoding: 'utf8', stdio: 'pipe' }
    )
  })
})
