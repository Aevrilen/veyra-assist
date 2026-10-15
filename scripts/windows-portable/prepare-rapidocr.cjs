// Build-time only. Copies an explicitly supplied, trusted runtime; never installs or downloads.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')

const MODEL = 'ch_PP-OCRv4_rec_mobile.onnx'
const MODEL_SHA256 = '48fc40f24f6d2a207a2b1091d3437eb3cc3eb6b676dc3ef9c37384005483683b'
const root = path.resolve(__dirname, '../..')
const requirements = fs
  .readFileSync(path.join(root, 'docs/rapidocr-local-test-requirements.txt'), 'utf8')
  .trim()
  .split(/\r?\n/)
  .filter((line) => !line.startsWith('pip=='))

function prepareRapidOcr({ pythonHome, sitePackages, vcRuntime, model, output }) {
  for (const value of [pythonHome, sitePackages, vcRuntime, model, output]) {
    if (!value)
      throw new Error('Supply pythonHome, sitePackages, vcRuntime, model and output explicitly')
  }
  const destination = path.resolve(output)
  if (fs.existsSync(destination)) throw new Error(`Runtime output already exists: ${destination}`)
  const modelBytes = fs.readFileSync(model)
  if (crypto.createHash('sha256').update(modelBytes).digest('hex') !== MODEL_SHA256) {
    throw new Error('Fixed RapidOCR recognition model checksum mismatch')
  }
  const version = execFileSync(
    path.join(pythonHome, 'python.exe'),
    ['-I', '-c', 'import sys; print(".".join(map(str, sys.version_info[:3])))'],
    { encoding: 'utf8' }
  ).trim()
  if (version !== '3.13.15')
    throw new Error(`Validated runtime requires Python 3.13.15, got ${version}`)

  fs.mkdirSync(destination, { recursive: true })
  for (const file of [
    'python.exe',
    'python3.dll',
    'python313.dll',
    'vcruntime140.dll',
    'vcruntime140_1.dll',
    'LICENSE.txt'
  ]) {
    fs.copyFileSync(path.join(pythonHome, file), path.join(destination, file))
  }
  const microsoftRuntime = JSON.parse(
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "$ErrorActionPreference=\"Stop\"; Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1'); @('msvcp140.dll','msvcp140_1.dll') | ForEach-Object { $file=Join-Path $env:AKARI_BUILD_VC_RUNTIME $_; $signature=Get-AuthenticodeSignature -LiteralPath $file; if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft') { throw 'Untrusted Microsoft runtime file' }; [PSCustomObject]@{name=$_;version=(Get-Item -LiteralPath $file).VersionInfo.FileVersion} } | ConvertTo-Json -Compress"
      ],
      {
        encoding: 'utf8',
        windowsHide: true,
        env: { ...process.env, AKARI_BUILD_VC_RUNTIME: path.resolve(vcRuntime) }
      }
    )
  )
  for (const file of microsoftRuntime)
    fs.copyFileSync(path.join(vcRuntime, file.name), path.join(destination, file.name))
  fs.cpSync(path.join(pythonHome, 'DLLs'), path.join(destination, 'DLLs'), {
    recursive: true,
    filter: (file) =>
      !/^(?:_tkinter\.pyd|tcl86t\.dll|tk86t\.dll|.*\.ico)$/.test(path.basename(file))
  })
  const excludedStandard = new Set([
    'site-packages',
    '__pycache__',
    'test',
    'tests',
    'idlelib',
    'tkinter',
    'turtledemo',
    'ensurepip',
    'venv'
  ])
  fs.cpSync(path.join(pythonHome, 'Lib'), path.join(destination, 'Lib'), {
    recursive: true,
    filter: (file) => !excludedStandard.has(path.basename(file)) && !file.endsWith('.pyc')
  })
  const excludedPackages = new Set([
    'pip',
    'pip-26.2.1.dist-info',
    '__pycache__',
    'test',
    'tests',
    'testing'
  ])
  fs.cpSync(sitePackages, path.join(destination, 'Lib/site-packages'), {
    recursive: true,
    filter: (file) => !excludedPackages.has(path.basename(file)) && !/\.(?:pyc|pth)$/.test(file)
  })
  // ._pth + -I ignore PYTHONHOME/PYTHONPATH, registry installs, cwd and user site packages.
  fs.writeFileSync(
    path.join(destination, 'python313._pth'),
    'Lib\nDLLs\nLib/site-packages\nimport site\n'
  )
  fs.writeFileSync(path.join(destination, MODEL), modelBytes)
  const actual = JSON.parse(
    execFileSync(
      path.join(destination, 'python.exe'),
      [
        '-I',
        '-B',
        '-c',
        'import importlib.metadata,json,sys; names=json.loads(sys.argv[1]); print(json.dumps({n:importlib.metadata.version(n) for n in names}))',
        JSON.stringify(requirements.map((line) => line.split('==')[0]))
      ],
      {
        encoding: 'utf8',
        windowsHide: true,
        env: { ...process.env, PYTHONHOME: '', PYTHONPATH: '', PYTHONUSERBASE: '' }
      }
    )
  )
  for (const line of requirements) {
    const [name, expected] = line.split('==')
    if (actual[name] !== expected)
      throw new Error(`Unvalidated dependency ${name}: ${actual[name]} (expected ${expected})`)
  }
  const licenses = path.join(destination, 'licenses')
  fs.mkdirSync(licenses)
  fs.copyFileSync(
    path.join(sitePackages, 'rapidocr-3.10.0.dist-info/licenses/LICENSE'),
    path.join(licenses, 'RapidOCR-Apache-2.0.txt')
  )
  fs.copyFileSync(
    path.join(sitePackages, 'rapidocr-3.10.0.dist-info/licenses/MODEL_LICENSES.md'),
    path.join(licenses, 'RapidOCR-MODEL_LICENSES.md')
  )
  fs.writeFileSync(path.join(destination, 'requirements.txt'), requirements.join('\n') + '\n')
  const manifest = {
    schemaVersion: 1,
    python: version,
    packages: actual,
    microsoftRuntime,
    source: { python: 'https://www.python.org/', packages: 'https://pypi.org/simple' },
    model: {
      name: MODEL,
      bytes: modelBytes.length,
      sha256: MODEL_SHA256,
      registry: 'rapidocr==3.10.0:onnxruntime.PP-OCRv4.rec.ch_PP-OCRv4_rec_mobile',
      url: 'https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.10.0/onnx/PP-OCRv4/rec/ch_PP-OCRv4_rec_mobile.onnx'
    },
    runtime:
      'Private relative Python search path; CPU-only; no pip, developer venv or model download'
  }
  fs.writeFileSync(path.join(destination, 'runtime.json'), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}

if (require.main === module) {
  const [pythonHome, sitePackages, vcRuntime, model, output] = process.argv.slice(2)
  console.log(
    JSON.stringify(prepareRapidOcr({ pythonHome, sitePackages, vcRuntime, model, output }), null, 2)
  )
}
module.exports = { prepareRapidOcr }
