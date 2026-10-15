// Update Electron's existing PE integrity record after rebuilding app.asar.
// Keep integrity validation enabled; the executable is already an unsigned Veyra build.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const ResEdit = require('resedit')
const { computeData } = require('app-builder-lib/out/asar/integrity')
const { readSourceVersion } = require('./source-version.cjs')

async function finalizePublicPackage(stage, root, suppliedMetadata) {
  const { commit } = readSourceVersion(root)
  const metadataPath = path.join(stage, 'app/resources/portable-build.json')
  const metadata = suppliedMetadata || JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
  if (
    metadata.version !== '1.5.2-beta.2' ||
    metadata.label !== 'log-feedback-public-revision' ||
    !metadata.sourceUrl?.startsWith('https://github.com/Aevrilen/veyra-assist/tree/')
  )
    throw new Error('Only the new isolated public revision may be finalized')
  const inputChanges = execFileSync(
    'git',
    [
      'diff',
      '--name-only',
      metadata.commit,
      commit,
      '--',
      'src',
      'resources',
      'package.json',
      'yarn.lock',
      'electron.vite.config.ts',
      'tsconfig*.json',
      'third_party/elevate'
    ],
    { cwd: root, encoding: 'utf8' }
  ).trim()
  if (inputChanges)
    throw new Error('Application/helper inputs changed; rebuild the application/package')
  const resourcesPath = path.join(stage, 'app/resources')
  const integrity = await computeData({
    resourcesPath,
    resourcesRelativePath: 'resources',
    resourcesDestinationPath: resourcesPath,
    extraResourceMatchers: []
  })
  const executablePath = path.join(stage, 'app/VeyraAssist.exe')
  const executable = ResEdit.NtExecutable.from(fs.readFileSync(executablePath))
  const resource = ResEdit.NtExecutableResource.from(executable)
  const existing = resource.entries.filter(
    (entry) => entry.type === 'INTEGRITY' && entry.id === 'ELECTRONASAR'
  )
  if (existing.length !== 1) throw new Error('Expected one existing Electron integrity resource')
  const previousIntegrity = JSON.parse(Buffer.from(existing[0].bin).toString('utf8'))
  existing[0].bin = Buffer.from(
    JSON.stringify(
      Object.entries(integrity).map(([file, value]) => ({
        file: path.win32.normalize(file),
        alg: value.algorithm,
        value: value.hash
      }))
    )
  )
  resource.outputResource(executable)
  fs.writeFileSync(executablePath, Buffer.from(executable.generate()))
  const updated = {
    ...metadata,
    commit,
    sourceUrl: `https://github.com/Aevrilen/veyra-assist/tree/${commit}`,
    asarIntegrity: integrity,
    integrityValidation: 'Enabled; PE record refreshed with electron-builder computeData algorithm',
    executableResourceChanged: true
  }
  fs.writeFileSync(metadataPath, JSON.stringify(updated, null, 2) + '\n')
  return { metadata: updated, previousIntegrity, integrity }
}

module.exports = { finalizePublicPackage }
if (require.main === module) {
  const stage = process.argv[2]
  if (!stage) throw new Error('Usage: node finalize-public.cjs NEW_PUBLIC_REVISION_DIRECTORY')
  finalizePublicPackage(path.resolve(stage), path.resolve(__dirname, '../..'))
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
