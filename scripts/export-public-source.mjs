import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(resolve(root, 'public-export.json'), 'utf8'))
const [sourceArg, destinationArg] = process.argv.slice(2)
if (!sourceArg || !destinationArg) {
  throw new Error('Usage: node scripts/export-public-source.mjs SOURCE EMPTY_DESTINATION')
}
const source = await realpath(sourceArg)
const destination = resolve(destinationArg)
// A new directory keeps this command from overwriting an existing project or following its links.
await mkdir(destination)
for (const file of manifest.sourceFiles) {
  const input = await realpath(resolve(source, file.path))
  const pathFromSource = relative(source, input)
  if (isAbsolute(pathFromSource) || pathFromSource.startsWith(`..${sep}`)) {
    throw new Error(`Source path escapes the selected tree: ${file.path}`)
  }
  const bytes = await readFile(input)
  if (createHash('sha256').update(bytes).digest('hex') !== file.sourceSha256) {
    throw new Error(`Unreviewed source changes: ${file.path}`)
  }
  const output = resolve(destination, file.path)
  await mkdir(dirname(output), { recursive: true })
  await copyFile(input, output)
}
console.log(`Exported ${manifest.sourceFiles.length} reviewed source files`)
