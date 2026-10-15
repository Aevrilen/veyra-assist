import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rolldown } from 'rolldown'

const root = dirname(fileURLToPath(import.meta.url))
const output = join(root, 'dist')
await mkdir(output, { recursive: true })
const bundle = await rolldown({
  input: join(root, 'cli.ts'),
  platform: 'node',
  external: [/^(node:|fs$|path$|stream$|util$|assert$|zlib$|events$|buffer$)/],
  treeshake: true
})
await bundle.write({
  file: join(output, 'veyra-position-sample-replay.cjs'),
  format: 'cjs',
  sourcemap: false,
  comments: false
})
await bundle.close()
const require = createRequire(import.meta.url)
await copyFile(
  join(dirname(require.resolve('pngjs/package.json')), 'LICENSE'),
  join(output, 'PNGJS-LICENSE.txt')
)
await copyFile(join(root, '../../LICENSE'), join(output, 'VEYRA-LICENSE.txt'))
await copyFile(join(root, 'README.zh-CN.md'), join(output, '本地回放说明.md'))
await copyFile(
  join(root, 'manual-geometry.template.json'),
  join(output, 'manual-geometry.template.json')
)
// Rolldown's region comments can contain build-machine paths; omit them.
const code = (await readFile(join(output, 'veyra-position-sample-replay.cjs'), 'utf8')).replace(
  /^\/\/#(?:end)?region[^\r\n]*\r?\n/gm,
  ''
)
await writeFile(join(output, 'veyra-position-sample-replay.cjs'), code)
const external = [...code.matchAll(/require\(["']([^"']+)["']\)/g)].map((match) => match[1])
const allowed = /^(node:)?(fs(?:\/promises)?|path|stream|util|assert|zlib|events|buffer)$/
if (external.some((name) => !allowed.test(name))) throw new Error('Unexpected bundle dependency')
console.log('Built local-only replay bundle and license notices.')
