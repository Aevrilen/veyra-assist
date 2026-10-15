// Creates a program ZIP through the existing Electron builder; source export is a separate step.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const { build, Platform, Arch } = require('electron-builder')
const { getPath7za } = require('app-builder-lib/out/toolsets/7zip')
const { prepareRapidOcr } = require('./prepare-rapidocr.cjs')
const { collectNotices } = require('./notices.cjs')
const { readSourceVersion, nativeSourceBlob } = require('./source-version.cjs')

const root = path.resolve(__dirname, '../..')
const executableName = 'VeyraAssist'

async function main() {
  const options = {}
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index]
    if (
      ![
        '--python-home',
        '--site-packages',
        '--vc-runtime',
        '--model',
        '--output',
        '--label',
        '--display-name',
        '--readme'
      ].includes(key) ||
      !process.argv[index + 1]
    ) {
      throw new Error(
        'Usage: node scripts/windows-portable/build.cjs --python-home PATH --site-packages PATH --vc-runtime PATH --model FILE --output NEW_DIRECTORY --label LABEL [--readme FILE]'
      )
    }
    options[key.slice(2)] = process.argv[index + 1]
  }
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error('Build on Windows x64')
  if (!/^[a-zA-Z0-9._-]+$/.test(options.label || ''))
    throw new Error('Supply an ASCII release label')
  if (!options.output) throw new Error('Supply a new output directory')
  const displayName = options['display-name'] || 'Veyra Assist'
  if (
    /[<>:"/\\|?*\x00-\x1f]/.test(displayName) ||
    displayName.trim() !== displayName ||
    /akari/i.test(displayName)
  )
    throw new Error(
      'Supply the confirmed public display name without Windows filename metacharacters'
    )
  const output = path.resolve(options.output)
  if (fs.existsSync(output)) throw new Error(`Output already exists: ${output}`)
  const sourceVersion = readSourceVersion(root)
  const { commit } = sourceVersion
  const nativeProvenance = JSON.parse(
    fs.readFileSync(path.join(root, 'native/win32-x64/bootstrap-provenance.json'), 'utf8')
  )
  const nativeSource = nativeSourceBlob(root)
  if (nativeSource !== nativeProvenance.sourceGitBlob)
    throw new Error(
      'Reviewed native source changed; rebuild and review its bootstrap before packaging'
    )
  const nativeFile = path.join(root, 'native/win32-x64/addons/akari-tools-win64.node')
  const dependencyNative = path.join(
    root,
    'node_modules/league-akari-native-win32/addons/akari-tools-win64.node'
  )
  if (!fs.readFileSync(nativeFile).equals(fs.readFileSync(dependencyNative)))
    throw new Error('Installed native workspace must match the reviewed bootstrap')
  const nativeTools = require(dependencyNative)
  for (const name of nativeProvenance.requiredExports) {
    if (typeof nativeTools[name] !== 'function' || nativeTools[name](0) !== null)
      throw new Error(`Native capability missing: ${name}`)
  }
  fs.mkdirSync(output, { recursive: true })
  const runtime = path.join(output, 'build-work/rapidocr')
  const runtimeInfo = prepareRapidOcr({
    pythonHome: options['python-home'],
    sitePackages: options['site-packages'],
    vcRuntime: options['vc-runtime'],
    model: options.model,
    output: runtime
  })
  const compile = spawnSync(
    process.execPath,
    [path.join(root, '.yarn/releases/yarn-4.18.0.cjs'), 'build'],
    { cwd: root, stdio: 'inherit' }
  )
  if (compile.status !== 0) throw new Error(`Application build failed: ${compile.status}`)
  const buildInfo = {
    schemaVersion: 1,
    commit,
    sourceKind: sourceVersion.sourceKind,
    ...(sourceVersion.localEdits ? { localEdits: sourceVersion.localEdits } : {}),
    label: options.label,
    displayName,
    version: require(path.join(root, 'package.json')).version,
    platform: 'win32-x64',
    ocrBackend: 'rapidocr',
    native: nativeProvenance,
    builtAt: new Date().toISOString(),
    profile: '%APPDATA%/LeagueAkari-Portable',
    updates: 'Replace the extracted program folder; user profile stays outside it',
    validation: 'Package preparation. Real game/UI acceptance remains a separate review.'
  }
  const metadata = path.join(output, 'build-work/portable-build.json')
  fs.writeFileSync(metadata, JSON.stringify(buildInfo, null, 2) + '\n')
  const notices = path.join(output, 'build-work/third-party-notices')
  collectNotices(path.join(root, 'node_modules'), notices)
  const tools = path.join(output, 'build-work/tools')
  fs.mkdirSync(tools, { recursive: true })
  fs.writeFileSync(
    path.join(tools, 'yarn.cmd'),
    '@echo off\r\n"%AKARI_BUILD_NODE%" "%AKARI_BUILD_YARN%" %*\r\n',
    'ascii'
  )
  process.env.AKARI_BUILD_NODE = process.execPath
  process.env.AKARI_BUILD_YARN = path.join(root, '.yarn/releases/yarn-4.18.0.cjs')
  process.env.PATH = tools + path.delimiter + process.env.PATH
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  process.env.ELECTRON_BUILDER_CACHE ||= path.join(output, 'build-work/tool-cache')
  await build({
    projectDir: root,
    targets: Platform.WINDOWS.createTarget(['dir'], Arch.x64),
    config: {
      extends: path.join(root, 'electron-builder.yml'),
      productName: displayName,
      directories: { output: path.join(output, 'build-work/electron') },
      electronDist: path.dirname(require('electron')),
      files: [
        'out/**',
        'resources/**',
        'package.json',
        'LICENSE',
        '!**/*.map',
        '!**/*.tsbuildinfo',
        '!resources/ocr/README.md'
      ],
      extraResources: [
        { from: runtime, to: 'app.asar.unpacked/resources/ocr/rapidocr' },
        { from: metadata, to: 'portable-build.json' },
        { from: notices, to: 'third-party-notices' }
      ],
      win: { target: ['dir'], executableName, requestedExecutionLevel: 'asInvoker' }
    }
  })
  const name = `${displayName}-${options.label}-${commit.slice(0, 8)}-Windows-x64`
  const stage = path.join(output, name)
  fs.mkdirSync(stage)
  fs.cpSync(path.join(output, 'build-work/electron/win-unpacked'), path.join(stage, 'app'), {
    recursive: true
  })
  fs.rmSync(path.join(stage, 'app/resources/default_app.asar'), { force: true })
  const launcher = [
    '@echo off',
    'setlocal',
    'chcp 65001 >nul',
    'set ELECTRON_RUN_AS_NODE=',
    'set NODE_PATH=',
    'set AKARI_MAYHEM_OCR_BACKEND=rapidocr',
    'set AKARI_RAPIDOCR_PYTHON=',
    'set AKARI_RAPIDOCR_MODEL=',
    `if not exist "%~dp0app\\${executableName}.exe" (`,
    '  echo 请先完整解压 ZIP，再启动 Veyra Assist。',
    '  echo 按任意键关闭。',
    '  pause >nul',
    '  exit /b 1',
    ')',
    `start "" "%~dp0app\\${executableName}.exe" --akari-portable`,
    ''
  ].join('\r\n')
  fs.writeFileSync(path.join(stage, `启动 ${displayName}.cmd`), launcher, 'utf8')
  if (options.readme) fs.copyFileSync(options.readme, path.join(stage, '使用说明.txt'))
  else
    fs.writeFileSync(
      path.join(stage, '使用说明.txt'),
      '\ufeff' +
        `${displayName} · 内部打包预览 · 非最终版\r\n提交：${commit}\r\n标签：${options.label}\r\n\r\n这是基线打包检查用运行包，最终主 UI / 可见品牌 / 图标候选尚未合入，也未完成游戏实机验收。\r\n完整解压后双击“启动 ${displayName}.cmd”。内部 app 目录必须保持完整。\r\n玩家说明由项目负责人审查最终版本后替换。\r\n`,
      'utf8'
    )
  const archive = path.join(output, `${name}.zip`)
  execFileSync(await getPath7za(), ['a', '-tzip', '-mx=5', '-mcu', archive, name], {
    cwd: output,
    stdio: 'inherit'
  })
  const report = { ...buildInfo, archive, directory: stage, runtime: runtimeInfo }
  fs.writeFileSync(path.join(output, 'build-report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}
main().catch((cause) => {
  console.error(cause)
  process.exitCode = 1
})
