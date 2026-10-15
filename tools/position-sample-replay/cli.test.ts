import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const bundle = fileURLToPath(new URL('./dist/veyra-position-sample-replay.cjs', import.meta.url))
let directory: string
beforeAll(() => {
  directory = mkdtempSync(fileURLToPath(new URL('./.test-', import.meta.url)))
})
afterAll(() => {
  rmSync(directory, { recursive: true, force: true })
})
function run(...args: string[]) {
  return spawnSync(process.execPath, [bundle, ...args], {
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' }
  })
}

describe('bundled CLI privacy and offline behavior', () => {
  it('has only builtin external requires and no network/browser/app modules', () => {
    const code = readFileSync(bundle, 'utf8')
    const requires = [...code.matchAll(/require\(["']([^"']+)["']\)/g)].map((match) => match[1])
    expect(requires.length).toBeGreaterThan(0)
    expect(
      requires.every((name) =>
        /^(node:)?(fs(?:\/promises)?|path|stream|util|assert|zlib|events|buffer)$/.test(name)
      )
    ).toBe(true)
    expect(code).not.toMatch(
      /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bchild_process\b|\belectron\b|\btesseract\b/
    )
    expect(code).not.toMatch(/\/workspace\/|\/opt\/codex\/|\/tmp\/veyra-/)
  })
  it('supports help without opening a sample', () => {
    const result = run('--help')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('No network, upload')
    expect(result.stderr).toBe('')
  })
  it('does not include a private missing-file path in failures', () => {
    const result = run(join(directory, 'PRIVATE_USERNAME_UNREADABLE.json'))
    expect(result.status).toBe(2)
    expect(JSON.parse(result.stdout).reason).toBe('input-unreadable')
    expect(result.stdout + result.stderr).not.toMatch(/PRIVATE_USERNAME|\.test-|stack|ENOENT/)
  })
  it.each([
    'https://example.invalid/private.json',
    'file:///private.json',
    '\\\\server\\private.json'
  ])('refuses remote/URL paths', (path) => {
    const result = run(path)
    expect(result.status).toBe(2)
    expect(JSON.parse(result.stdout).reason).toBe('local-file-required')
    expect(result.stderr).toBe('')
  })
  it('refuses directories and malformed JSON with fixed codes', () => {
    expect(JSON.parse(run(directory).stdout).reason).toBe('input-not-regular-file')
    const path = join(directory, 'malformed.json')
    writeFileSync(path, '{"PRIVATE_USERNAME":')
    const result = run(path)
    expect(JSON.parse(result.stdout).reason).toBe('invalid-json')
    expect(result.stdout + result.stderr).not.toContain('PRIVATE_USERNAME')
  })
  it('rejects invalid UTF-8 rather than silently replacing bytes', () => {
    const path = join(directory, 'invalid-utf8.json')
    writeFileSync(path, Buffer.from([123, 34, 120, 34, 58, 34, 0xff, 34, 125]))
    expect(JSON.parse(run(path).stdout).reason).toBe('invalid-json')
  })
  it('returns a scalar report for a synthetic local PNG and does not modify the file', () => {
    const width = 1280,
      height = 720,
      data = Buffer.alloc(width * height * 4)
    for (let i = 3; i < data.length; i += 4) data[i] = 255
    const path = join(directory, 'PRIVATE_SAMPLE.json')
    const text = JSON.stringify({
      version: 1,
      imageUrl:
        'data:image/png;base64,' + PNG.sync.write({ width, height, data }).toString('base64'),
      note: 'PRIVATE_NOTE',
      preview: {
        width,
        height,
        requestId: 'PRIVATE_REQUEST',
        client: { x: 0, y: 0, width, height },
        counts: { candidates: 3, teammates: 5 },
        capture: {
          physicalClient: { x: 0, y: 0, width, height },
          startedAt: 1,
          finishedAt: 2,
          geometryCheck: 'bracketed'
        }
      }
    })
    writeFileSync(path, text)
    const result = run(path)
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).not.toMatch(/PRIVATE|data:image|imageUrl/)
    expect(JSON.parse(result.stdout).provider.observationAvailable).toBe(false)
    expect(readFileSync(path, 'utf8')).toBe(text)
  })
  it('supports --png plus --geometry with explicit user-supplied evidence labels', () => {
    const width = 1280,
      height = 720,
      data = Buffer.alloc(width * height * 4, 255)
    const pngPath = join(directory, 'PRIVATE_FRAME.png'),
      geometryPath = join(directory, 'PRIVATE_GEOMETRY.json')
    const png = PNG.sync.write({ width, height, data })
    const metadata = JSON.stringify({
      version: 1,
      kind: 'veyra-manual-client-geometry',
      crop: 'actual-client-area',
      physicalClientSize: { width, height },
      dipClientSize: { width, height },
      counts: { candidates: 3, teammates: 5 }
    })
    writeFileSync(pngPath, png)
    writeFileSync(geometryPath, metadata)
    const result = run('--png', pngPath, '--geometry', geometryPath)
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout).source.geometryEvidence).toBe('user-supplied-unverified')
    expect(result.stdout).not.toMatch(/PRIVATE|bracketed|startedAt|finishedAt/)
    expect(readFileSync(pngPath)).toEqual(png)
    expect(readFileSync(geometryPath, 'utf8')).toBe(metadata)
  })
  it('requires both explicit PNG flags and rejects missing values', () => {
    for (const args of [
      ['--png', 'x.png'],
      ['--png', 'x.png', '--geometry'],
      ['--geometry', 'x.json', '--png', 'x.png']
    ]) {
      const result = run(...args)
      expect(result.status).toBe(2)
      expect(JSON.parse(result.stdout).reason).toBe('invalid-arguments')
    }
  })
})
