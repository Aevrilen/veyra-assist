// Rebuild first-party application/resources from a clean public commit.
// Reuse an explicitly identified, already audited Electron/dependency/OCR runtime.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { Readable } = require('node:stream')
const { execFileSync } = require('node:child_process')
const asar = require('@electron/asar')
const { readSourceVersion } = require('./source-version.cjs')
const { finalizePublicPackage } = require('./finalize-public.cjs')

const root = path.resolve(__dirname, '../..')
const [baselineArgument, outputArgument, reuseFlag, compiledSourceCommit] = process.argv.slice(2)
const hash = (data) => crypto.createHash('sha256').update(data).digest('hex')
const walk = (directory, prefix = '') =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(prefix, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symbolic link: ${name}`)
    return entry.isDirectory() ? walk(path.join(directory, entry.name), name) : [name]
  })

async function main() {
  if (
    !baselineArgument ||
    !outputArgument ||
    (reuseFlag &&
      (reuseFlag !== '--reuse-build' || !/^[a-f0-9]{40}$/.test(compiledSourceCommit || '')))
  )
    throw new Error(
      'Usage: node rebuild-public.cjs EXISTING_REVIEWED_PORTABLE_DIRECTORY NEW_OUTPUT_DIRECTORY [--reuse-build COMPILED_SOURCE_COMMIT]'
    )
  const baseline = path.resolve(baselineArgument)
  const output = path.resolve(outputArgument)
  if (fs.existsSync(output)) throw new Error('Output must be a new directory')
  const { commit } = readSourceVersion(root)
  const manifest = require(path.join(root, 'package.json'))
  const originalMetadata = JSON.parse(
    fs.readFileSync(path.join(baseline, 'app/resources/portable-build.json'), 'utf8')
  )
  if (originalMetadata.compiledFromCommit !== '24299bf76e2f0394346448df2c73f27ba00a9141')
    throw new Error('Expected the independently audited log-feedback baseline runtime')
  const helperInfo = JSON.parse(
    fs.readFileSync(path.join(root, 'docs/ELEVATE_BUILD.json'), 'utf8').replace(/^\uFEFF/, '')
  )
  if (hash(fs.readFileSync(path.join(root, helperInfo.path))) !== helperInfo.sha256)
    throw new Error('Rebuilt helper does not match committed provenance')
  for (const item of require(path.join(root, 'docs/EXTERNAL_DEPENDENCIES.json')).files) {
    if (hash(fs.readFileSync(path.join(root, item.path))) !== item.sha256)
      throw new Error(`External resource mismatch: ${item.path}`)
  }
  if (reuseFlag) {
    const changed = execFileSync(
      'git',
      [
        'diff',
        '--name-only',
        compiledSourceCommit,
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
    if (changed) throw new Error('Compiled application/helper inputs changed; cannot reuse outputs')
    const receipt = JSON.parse(
      fs.readFileSync(path.join(root, '.public-compile-receipt.json'), 'utf8')
    )
    if (receipt.commit !== compiledSourceCommit || receipt.success !== true)
      throw new Error('Missing successful compilation receipt')
    for (const item of receipt.files)
      if (hash(fs.readFileSync(path.join(root, 'out', item.path))) !== item.sha256)
        throw new Error(`Compiled output changed: ${item.path}`)
    console.log(
      `Reusing verified compilation from ${compiledSourceCommit}; application/helper inputs unchanged`
    )
  } else {
    console.log(`Building public source ${commit}; one compiler process, one Rayon worker`)
    execFileSync(
      process.execPath,
      [
        '--max-old-space-size=1536',
        path.join(root, 'node_modules/electron-vite/bin/electron-vite.js'),
        'build'
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          RAYON_NUM_THREADS: '1',
          OMP_NUM_THREADS: '1'
        },
        stdio: 'inherit'
      }
    )
    const receipt = {
      commit,
      success: true,
      files: walk(path.join(root, 'out')).map((name) => ({
        path: name,
        sha256: hash(fs.readFileSync(path.join(root, 'out', name)))
      }))
    }
    fs.writeFileSync(
      path.join(root, '.public-compile-receipt.json'),
      JSON.stringify(receipt, null, 2) + '\n'
    )
  }
  fs.mkdirSync(output)
  const stage = path.join(output, `VeyraAssist-${manifest.version}-log-feedback-public`)
  fs.mkdirSync(stage)
  fs.cpSync(path.join(baseline, 'app'), path.join(stage, 'app'), {
    recursive: true,
    errorOnExist: true
  })
  const owned = (target) => {
    const resolved = path.resolve(target)
    if (!resolved.startsWith(output + path.sep))
      throw new Error('Refusing removal outside new output')
    fs.rmSync(resolved, { recursive: true, force: true })
  }
  const resourceSidecar = path.join(stage, 'app/resources/app.asar.unpacked/resources')
  // All first-party resources are replaced. Keep only the audited external OCR runtime.
  for (const name of fs.readdirSync(resourceSidecar)) {
    if (name !== 'ocr') owned(path.join(resourceSidecar, name))
    else
      for (const child of fs.readdirSync(path.join(resourceSidecar, name)))
        if (child !== 'rapidocr') owned(path.join(resourceSidecar, name, child))
  }
  const sourceArchive = path.join(baseline, 'app/resources/app.asar')
  const destination = path.join(stage, 'app/resources/app.asar')
  owned(destination)
  const streams = []
  for (const name of asar.listPackage(sourceArchive).map((name) => name.slice(1))) {
    const portable = name.split(path.sep).join('/')
    if (portable !== 'node_modules' && !portable.startsWith('node_modules/')) continue
    const stat = asar.statFile(sourceArchive, name)
    if (stat.link) throw new Error('Unexpected dependency symlink')
    if (stat.files) streams.push({ path: name, type: 'directory', unpacked: stat.unpacked })
    else {
      const data = asar.extractFile(sourceArchive, name)
      streams.push({
        path: name,
        type: 'file',
        unpacked: stat.unpacked,
        stat: { size: data.length, mode: stat.executable ? 0o755 : 0o644 },
        streamGenerator: () => Readable.from(data)
      })
    }
  }
  const trackedResources = execFileSync('git', ['ls-files', '-z', 'resources'], {
    cwd: root,
    encoding: 'utf8'
  })
    .split('\0')
    .filter(Boolean)
  const resources = [
    ...new Set([
      ...trackedResources,
      helperInfo.path,
      ...require(path.join(root, 'docs/EXTERNAL_DEPENDENCIES.json')).files.map((item) => item.path)
    ])
  ].filter((name) => !/akari-updater.*\.exe$/i.test(name))
  const generated = walk(path.join(root, 'out'))
    .map((name) => path.join('out', name))
    .filter((name) => !/\.(?:map|tsbuildinfo)$|akari-updater[^/\\]*\.exe$/i.test(name))
  for (const name of [...generated, ...resources, 'package.json', 'LICENSE']) {
    const source = path.join(root, name)
    const data = fs.readFileSync(source)
    streams.push({
      path: name,
      type: 'file',
      unpacked: name.startsWith('resources/'),
      stat: { size: data.length, mode: fs.statSync(source).mode },
      streamGenerator: () => Readable.from(data)
    })
  }
  await asar.createPackageFromStreams(destination, streams)
  const licenseDirectory = path.join(stage, 'app/resources/veyra-notices')
  fs.mkdirSync(licenseDirectory)
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md'])
    fs.copyFileSync(path.join(root, name), path.join(licenseDirectory, name))
  fs.cpSync(path.join(root, 'third_party'), path.join(licenseDirectory, 'third_party'), {
    recursive: true
  })
  const sourceDirectory = path.join(stage, 'app/resources/third-party-sources/elevate')
  fs.cpSync(path.join(root, 'third_party/elevate'), sourceDirectory, { recursive: true })
  const metadata = {
    schemaVersion: 2,
    commit,
    compiledFromCommit: reuseFlag ? compiledSourceCommit : commit,
    version: manifest.version,
    displayName: 'Veyra Assist',
    label: 'log-feedback-public-revision',
    builtAt: new Date().toISOString(),
    sourceUrl: `https://github.com/Aevrilen/veyra-assist/tree/${commit}`,
    runtimeBaseline: originalMetadata.compiledFromCommit,
    runtimeAudit:
      'Reused previously audited Electron, native, JavaScript dependencies, RapidOCR and model bytes; application and first-party resources rebuilt/replaced',
    helper: helperInfo,
    disabledUpdaterBinaryOmitted: true,
    encyclopediaExcerptRemoved: true,
    scope:
      'Public-source cleanup and log feedback only; no later automatic-location or other development patches',
    realGameAccepted: false,
    unsigned: true
  }
  fs.writeFileSync(
    path.join(stage, 'app/resources/portable-build.json'),
    JSON.stringify(metadata, null, 2) + '\n'
  )
  const finalized = await finalizePublicPackage(stage, root, metadata)
  const notes = fs.readFileSync(path.join(root, 'docs/releases/1.5.2-beta.2-使用说明.txt'))
  fs.writeFileSync(path.join(stage, '使用说明.txt'), notes)
  fs.copyFileSync(
    path.join(baseline, '启动 Veyra Assist.cmd'),
    path.join(stage, '启动 Veyra Assist.cmd')
  )
  fs.writeFileSync(
    path.join(output, 'build-report.json'),
    JSON.stringify({ ...finalized.metadata, stage, archiveFiles: streams.length }, null, 2) + '\n'
  )
  console.log(
    JSON.stringify({
      stage,
      commit,
      version: manifest.version,
      sourceFiles: resources.length,
      helperSHA256: helperInfo.sha256
    })
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
