import { execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { describe, expect, it } from 'vitest'

import type { GameClientWindowSnapshot } from './lib/bindings'

describe('Game client window snapshot binding contract', () => {
  it('reports missing capability, preserves physical bounds, and propagates native errors', () => {
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
            assert.throws(() => tools.supportsGameClientWindowSnapshot())
            tools.load()
            assert.equal(tools.supportsGameClientWindowSnapshot(), false)
            assert.equal(tools.getGameClientWindowSnapshot(42), null)
            const snapshot = {
              ownerProcessId: 42, windowHandle: '123456',
              bounds: { x: -1800, y: 87, width: 2560, height: 1440 },
              isForeground: false, isMinimized: true, isVisible: false
            }
            const processIds = []
            binding.getGameClientWindowSnapshot = (processId) => {
              processIds.push(processId)
              return snapshot
            }
            assert.equal(tools.supportsGameClientWindowSnapshot(), true)
            assert.equal(tools.getGameClientWindowSnapshot(42), snapshot)
            assert.deepEqual(processIds, [42])
            binding.getGameClientWindowSnapshot = () => null
            assert.equal(tools.supportsGameClientWindowSnapshot(), true)
            assert.equal(tools.getGameClientWindowSnapshot(42), null)
            const failure = new Error('native read failure')
            binding.getGameClientWindowSnapshot = () => { throw failure }
            assert.throws(() => tools.getGameClientWindowSnapshot(42), (error) => error === failure)
          } finally {
            Module._extensions['.node'] = originalNodeLoader
          }
        `
      ],
      { cwd: path.resolve('.'), encoding: 'utf8', stdio: 'pipe', windowsHide: true }
    )
  })
})

describe.skipIf(process.platform !== 'win32' || process.env.AKARI_GAME_WINDOW_NATIVE_TEST !== '1')(
  'Game client window snapshot native Win32 integration',
  () => {
    it('reads only eligible hidden PID windows, rejects ties, and refreshes recreated/minimized windows', async () => {
      const require = createRequire(path.resolve('native/win32-x64/package.json'))
      const addon = require(path.resolve('native/win32-x64/addons/akari-tools-win64.node')) as {
        getGameClientWindowSnapshot(pid: number): GameClientWindowSnapshot | null
      }
      for (const invalid of [0, -1, 1.5, NaN, Infinity, 2 ** 32]) {
        expect(addon.getGameClientWindowSnapshot(invalid)).toBeNull()
      }
      expect(() => addon.getGameClientWindowSnapshot('invalid' as unknown as number)).toThrow(
        TypeError
      )
      expect(addon.getGameClientWindowSnapshot(process.pid)).toBeNull()

      const fixture = spawn(
        process.env.AKARI_WINDOW_FIXTURE_PYTHON || 'python',
        [path.resolve('native/win32-x64/test-fixtures/game-window.py')],
        { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }
      )
      const lines = createInterface({ input: fixture.stdout })
      const iterator = lines[Symbol.asyncIterator]()
      let stderr = ''
      fixture.stderr.on('data', (chunk) => (stderr += chunk))
      const exited = new Promise<{ code: number | null; error?: Error }>((resolve) => {
        fixture.once('error', (error) => resolve({ code: null, error }))
        fixture.once('exit', (code) => resolve({ code }))
      })
      const read = async () => {
        const line = await Promise.race([
          iterator.next(),
          exited.then(({ error }) => {
            throw error || new Error(`Hidden Win32 fixture exited: ${stderr}`)
          })
        ])
        if (line.done) throw new Error(`Hidden Win32 fixture exited: ${stderr}`)
        return JSON.parse(line.value) as {
          pid: number
          expected: Pick<
            GameClientWindowSnapshot,
            'windowHandle' | 'bounds' | 'isMinimized' | 'isVisible'
          > | null
          visibleWindowCount: number
        }
      }
      const command = async (name: string) => {
        fixture.stdin.write(JSON.stringify({ command: name }) + '\n')
        return await read()
      }
      try {
        const initial = await read()
        expect(initial.visibleWindowCount).toBe(0)
        const first = addon.getGameClientWindowSnapshot(initial.pid)
        expect(first).toMatchObject({
          ...initial.expected,
          ownerProcessId: initial.pid,
          isForeground: false
        })
        expect(first!.bounds.x).toBeLessThan(0)
        expect(first!.bounds).toMatchObject({ width: 1280, height: 720 })

        const tied = await command('tie')
        expect(tied.visibleWindowCount).toBe(0)
        expect(addon.getGameClientWindowSnapshot(initial.pid)).toBeNull()
        const untied = await command('untie')
        expect(addon.getGameClientWindowSnapshot(initial.pid)).toMatchObject(untied.expected!)

        const recreated = await command('recreate')
        expect(recreated.visibleWindowCount).toBe(0)
        expect(addon.getGameClientWindowSnapshot(initial.pid)).toMatchObject({
          ...recreated.expected,
          ownerProcessId: initial.pid,
          isForeground: false
        })
        expect(recreated.expected!.bounds).toMatchObject({ width: 1024, height: 600 })

        const minimized = await command('minimized')
        expect(minimized.visibleWindowCount).toBe(0)
        expect(minimized.expected!.isMinimized).toBe(true)
        expect(addon.getGameClientWindowSnapshot(initial.pid)).toMatchObject({
          ...minimized.expected,
          ownerProcessId: initial.pid,
          isVisible: false,
          isMinimized: true,
          isForeground: false
        })

        const removed = await command('remove-eligible')
        expect(removed.visibleWindowCount).toBe(0)
        expect(addon.getGameClientWindowSnapshot(initial.pid)).toBeNull()
      } finally {
        fixture.stdin.end(JSON.stringify({ command: 'quit' }) + '\n')
        const result = await exited
        if (result.error) throw result.error
        if (result.code !== 0) throw new Error(`Hidden Win32 fixture failed: ${stderr}`)
        lines.close()
      }
    }, 15000)
  }
)
