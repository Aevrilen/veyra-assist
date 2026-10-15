// Local test candidate only: compile source, reuse audited runtime bytes, never launch or publish.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { Readable } = require('node:stream')
const { execFileSync } = require('node:child_process')
const asar = require('@electron/asar')
const { readSourceVersion } = require('./source-version.cjs')
const { updateWindowsAsarIntegrity } = require('./asar-integrity.cjs')

const root = path.resolve(__dirname, '../..')
const baseCommit = '37e2ccc050fc67811d7b080b09cdc6f0b2e54a31'
const runtimeCommit = '24299bf76e2f0394346448df2c73f27ba00a9141'
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex')
const canonical = (value) =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item
  )
function files(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(prefix, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Unexpected link: ${relative}`)
    return entry.isDirectory() ? files(path.join(directory, entry.name), relative) : [relative]
  })
}
const blob = (name) =>
  execFileSync('git', ['show', `${baseCommit}:${name}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  })
function writeZip(stage, zip) {
  // Use extended Windows filesystem paths while keeping ordinary relative ZIP names.
  // Python's CLI otherwise loses long OCR license directories on MAX_PATH-limited hosts.
  const program = String.raw`
import os, sys, zipfile
root = os.path.abspath(sys.argv[1])
source = ('\\\\?\\' + root) if os.name == 'nt' else root
def failed(error):
    raise error
with zipfile.ZipFile(sys.argv[2], 'x', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for directory, children, names in os.walk(source, onerror=failed):
        relative = os.path.relpath(directory, source)
        archive_dir = os.path.basename(root) + ('/' + relative.replace(os.sep, '/') if relative != '.' else '')
        archive.write(directory, archive_dir + '/')
        for name in names:
            archive.write(os.path.join(directory, name), archive_dir + '/' + name)
with zipfile.ZipFile(sys.argv[2]) as archive:
    invalid = archive.testzip()
    if invalid:
        raise RuntimeError('ZIP CRC mismatch: ' + invalid)
    print('ZIP CRC verified:', len(archive.infolist()), 'entries')
`
  execFileSync('python', ['-c', program, stage, zip], { stdio: 'inherit' })
}
function auditInputs() {
  const current = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const approved = JSON.parse(blob('package.json'))
  approved.version = '1.5.2-beta.2-candidate.20261015'
  approved.dependencies['winston-transport'] = '^4.9.0'
  if (canonical(current) !== canonical(approved)) throw new Error('Unexpected manifest drift')
  const lock = fs.readFileSync(path.join(root, 'yarn.lock'), 'utf8').replace(/\r\n/g, '\n')
  if (
    lock.replace(/^    winston-transport: "npm:\^4\.9\.0"\n/m, '') !==
    blob('yarn.lock').replace(/\r\n/g, '\n')
  )
    throw new Error('Dependency resolutions changed')
  if (require('winston-transport/package.json').version !== '4.9.0')
    throw new Error('Transport version changed')
  if (
    execFileSync('git', ['diff', '--name-only', baseCommit, 'HEAD', '--', 'resources', 'native'], {
      cwd: root,
      encoding: 'utf8'
    }).trim()
  )
    throw new Error('Resource/native changes require a new runtime review')
  return current
}

async function main() {
  const [baselineArgument, outputArgument, verificationArgument] = process.argv.slice(2)
  if (!baselineArgument || !outputArgument || !verificationArgument)
    throw new Error(
      'Usage: node integration-candidate-20261015.cjs AUDITED_HOTFIX_PACKAGE NEW_OUTPUT VERIFICATION_JSON'
    )
  const baseline = path.resolve(baselineArgument)
  const output = path.resolve(outputArgument)
  if (fs.existsSync(output)) throw new Error('Output must be new')
  if (output === baseline || output.startsWith(baseline + path.sep))
    throw new Error('Output must be independent')
  const { commit } = readSourceVersion(root)
  const manifest = auditInputs()
  const verification = JSON.parse(fs.readFileSync(verificationArgument, 'utf8'))
  if (
    verification.commit !== commit ||
    verification.full.failed !== 0 ||
    !verification.full.success ||
    verification.nodeTypecheckExit !== 0 ||
    verification.webTypecheckExit !== 0 ||
    verification.nodeScriptsExit !== 0
  )
    throw new Error('Successful checks for this exact source commit are required')
  const testedCommit = verification.testedCommit || verification.commit
  if (testedCommit !== commit) {
    const changed = execFileSync('git', ['diff', '--name-only', testedCommit, commit], {
      cwd: root,
      encoding: 'utf8'
    })
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
    if (
      changed.some(
        (name) =>
          ![
            'scripts/windows-portable/integration-candidate-20261015.cjs',
            'scripts/windows-portable/asar-integrity.cjs'
          ].includes(name)
      )
    )
      throw new Error('Checks must be rerun after changes beyond this packaging helper')
  }
  const resources = path.join(baseline, 'app/resources')
  const baseMetadata = JSON.parse(
    fs.readFileSync(path.join(resources, 'portable-build.json'), 'utf8')
  )
  const sourceAudit = JSON.parse(
    fs.readFileSync(path.join(baseline, '..', 'baseline-byte-audit.json'), 'utf8')
  )
  if (
    baseMetadata.compiledFromCommit !== runtimeCommit ||
    sourceAudit.commit !== runtimeCommit ||
    sourceAudit.baseline !== baseCommit
  )
    throw new Error('Wrong audited runtime input')
  const expectedArchive = new Map(
    sourceAudit.archiveAudit.map((entry) => [entry.path, entry.sha256])
  )
  const expectedRuntime = new Map(
    sourceAudit.runtimeAudit.map((entry) => [entry.path, entry.sha256])
  )
  console.log('Inputs and source checks verified; compiling main, preload and renderers.')
  execFileSync(
    process.execPath,
    [path.join(root, 'node_modules/electron-vite/bin/electron-vite.js'), 'build'],
    {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' }
    }
  )
  fs.mkdirSync(output)
  const name = `VeyraAssist-${manifest.version}-${commit.slice(0, 8)}-Windows-x64`
  const stage = path.join(output, name)
  fs.mkdirSync(stage)
  fs.cpSync(path.join(baseline, 'app'), path.join(stage, 'app'), {
    recursive: true,
    errorOnExist: true
  })
  const originalAsar = path.join(resources, 'app.asar')
  const destinationAsar = path.join(stage, 'app/resources/app.asar')
  const names = asar.listPackage(originalAsar).map((name) => name.slice(1))
  const archiveManifest = JSON.parse(asar.extractFile(originalAsar, 'package.json'))
  archiveManifest.version = manifest.version
  archiveManifest.dependencies['winston-transport'] = '^4.9.0'
  const packageBytes = Buffer.from(JSON.stringify(archiveManifest, null, 2) + '\n')
  const streams = []
  const retained = []
  for (const name of names) {
    const portableName = name.split(path.sep).join('/')
    if (portableName === 'out' || portableName.startsWith('out/')) continue
    const stat = asar.statFile(originalAsar, name)
    if (stat.link) throw new Error('Unexpected ASAR link')
    if (stat.files) streams.push({ path: name, type: 'directory', unpacked: stat.unpacked })
    else {
      const data = name === 'package.json' ? packageBytes : asar.extractFile(originalAsar, name)
      if (name !== 'package.json') {
        if (sha(data) !== expectedArchive.get(portableName))
          throw new Error(`Unreviewed archive byte: ${portableName}`)
        retained.push(portableName)
      }
      streams.push({
        path: name,
        type: 'file',
        unpacked: stat.unpacked,
        stat: { size: data.length, mode: stat.executable ? 0o755 : 0o644 },
        streamGenerator: () => Readable.from(data)
      })
    }
  }
  const compiled = files(path.join(root, 'out')).filter(
    (name) => !/\.(?:map|tsbuildinfo)$/.test(name)
  )
  for (const name of compiled) {
    const full = path.join(root, 'out', name)
    streams.push({
      path: path.join('out', name),
      type: 'file',
      stat: fs.statSync(full),
      streamGenerator: () => fs.createReadStream(full)
    })
  }
  await asar.createPackageFromStreams(destinationAsar, streams)
  asar.uncache(destinationAsar)
  for (const name of retained) {
    if (
      sha(asar.extractFile(destinationAsar, name.split('/').join(path.sep))) !==
      expectedArchive.get(name)
    )
      throw new Error(`Archive drift: ${name}`)
  }
  const compiledHashes = []
  for (const name of compiled) {
    const portableName = path.join('out', name).split(path.sep).join('/')
    const digest = sha(fs.readFileSync(path.join(root, 'out', name)))
    if (sha(asar.extractFile(destinationAsar, portableName.split('/').join(path.sep))) !== digest)
      throw new Error(`Compiled output mismatch: ${name}`)
    compiledHashes.push({ path: portableName, sha256: digest })
  }
  let runtimeFiles = 0
  for (const name of files(path.join(baseline, 'app'))) {
    const portableName = name.split(path.sep).join('/')
    if (['resources/app.asar', 'resources/portable-build.json'].includes(portableName)) continue
    const digest = sha(fs.readFileSync(path.join(baseline, 'app', name)))
    if (
      digest !== expectedRuntime.get(portableName) ||
      sha(fs.readFileSync(path.join(stage, 'app', name))) !== digest
    )
      throw new Error(`Runtime drift: ${portableName}`)
    runtimeFiles++
  }
  // The runtime is audited before this required packaging-only EXE resource update.
  // Never reuse the old header hash or disable the validation fuse after replacing ASAR.
  const executableIntegrity = await updateWindowsAsarIntegrity(
    path.join(stage, 'app/VeyraAssist.exe'),
    destinationAsar
  )
  fs.writeFileSync(
    path.join(stage, 'app/resources/portable-build.json'),
    JSON.stringify(
      {
        commit,
        compiledFromCommit: commit,
        parentCommit: baseCommit,
        runtimeSourceCommit: runtimeCommit,
        displayName: 'Veyra Assist',
        version: manifest.version,
        label: 'independent-integration-test-candidate',
        builtAt: new Date().toISOString(),
        profile: 'EXTRACTED_CANDIDATE/user-data',
        originalProfileUntouched: true,
        state: 'Offline checked candidate; real UI/game acceptance pending',
        realGameAccepted: false,
        automaticPositionTrialEnabledByDefault: false,
        releaseReady: false
      },
      null,
      2
    ) + '\n'
  )
  fs.mkdirSync(path.join(stage, 'user-data'))
  fs.writeFileSync(
    path.join(stage, '启动隔离候选.cmd'),
    [
      '@echo off',
      'setlocal',
      'chcp 65001 >nul',
      'set "ELECTRON_RUN_AS_NODE="',
      'set "NODE_PATH="',
      'set "AKARI_PORTABLE_USER_DATA=%~dp0user-data"',
      'set "AKARI_MAYHEM_OCR_BACKEND=rapidocr"',
      'set "AKARI_RAPIDOCR_PYTHON="',
      'set "AKARI_RAPIDOCR_MODEL="',
      'if not exist "%~dp0app\\VeyraAssist.exe" (',
      '  echo 请先完整解压候选 ZIP。',
      '  pause >nul',
      '  exit /b 1',
      ')',
      'start "" "%~dp0app\\VeyraAssist.exe" --akari-portable',
      ''
    ].join('\r\n'),
    'utf8'
  )
  const guide = fs.readFileSync(path.join(root, 'handoff/INDEPENDENT_CANDIDATE_GUIDE.md'), 'utf8')
  fs.writeFileSync(path.join(stage, '使用说明.md'), `源码提交：${commit}\n\n${guide}`, 'utf8')
  fs.writeFileSync(
    path.join(stage, 'verification-summary.json'),
    JSON.stringify(verification, null, 2) + '\n'
  )
  const audit = {
    commit,
    baseCommit,
    runtimeCommit,
    retainedArchiveFiles: retained.length,
    runtimeFiles,
    runtimeFilesUnchangedAfterIntegrityUpdate: runtimeFiles - 1,
    updatedRuntimeFile: 'app/VeyraAssist.exe (INTEGRITY/ELECTRONASAR only)',
    compiledFiles: compiled.length,
    executableIntegrity,
    compiledHashes,
    profileEmpty: fs.readdirSync(path.join(stage, 'user-data')).length === 0,
    launched: false,
    uploaded: false,
    released: false
  }
  fs.writeFileSync(
    path.join(output, 'candidate-byte-audit.json'),
    JSON.stringify(audit, null, 2) + '\n'
  )
  const zip = path.join(output, `${name}.zip`)
  writeZip(stage, zip)
  const delivery = {
    commit,
    stage,
    zip,
    bytes: fs.statSync(zip).size,
    sha256: sha(fs.readFileSync(zip)),
    ...audit
  }
  fs.writeFileSync(path.join(output, 'DELIVERY.json'), JSON.stringify(delivery, null, 2) + '\n')
  console.log(
    JSON.stringify({
      commit,
      zip,
      bytes: delivery.bytes,
      sha256: delivery.sha256,
      runtimeFiles,
      compiledFiles: compiled.length
    })
  )
}
if (require.main === module)
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
module.exports = { writeZip }
