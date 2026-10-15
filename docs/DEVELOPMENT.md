# 开发与构建

## 当前可复现范围

此源码开发快照清理了旧历史、真实测试数据、内部交接和预编译应用，并将四个上游预编译运行文件作为外部依赖列出。原生扩展的 C++ 源码仍保留，但 `resources/magic/*.node` 没有相应源码或构建脚本随基线提供。主进程仍静态导入这些资源，缺少时不能直接完成应用构建。

`resources/akari-updater.exe`、`resources/elevate.exe` 和原生 workspace 的 `addons/`、`dist/` 也未随快照提供。四个外部文件已与 Akari 固定提交逐项匹配，来源及 hash 见 [EXTERNAL_DEPENDENCIES.json](EXTERNAL_DEPENDENCIES.json)。MIT 允许按其条件分发软件，是否同时提供依赖源码与源码能否公开、二进制能否再分发应分别判断；恢复二进制分发时保留适用的原许可。根目录 `build/icon.png` 是打包图标资源。

## 取得外部预编译依赖

仅从校验清单指定的官方固定提交取得文件，放回清单的本地相对路径，并校验 SHA-256。以下为显式本地准备命令，不自动执行下载或分发：

```powershell
$dependencyManifest = Get-Content -LiteralPath 'docs/EXTERNAL_DEPENDENCIES.json' -Raw | ConvertFrom-Json
foreach ($dependency in $dependencyManifest.files) {
  $target = Join-Path (Get-Location) $dependency.path
  New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
  Invoke-WebRequest -Uri $dependency.download -OutFile $target
  $actualHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
  if ($actualHash -ne $dependency.sha256) { throw "Dependency checksum mismatch: $($dependency.path)" }
}
```

这些文件是上游依赖，不是 Veyra 安装包。本轮没有重新下载或执行它们。`elevate.exe` 的作者来源及许可文本差异见 [许可说明](../THIRD_PARTY_NOTICES.md)；同名的其他提权工具不保证接口相同。Veyra 自动更新已禁用，上游更新器仍因遗留静态导入成为构建依赖，此轮不改其调用逻辑。

## 环境

- `.node-version` 指定 Node.js 24.19.0；`packageManager` 指定 Yarn 4.18.0，仓库保留 `.yarn/releases/` 下的工具。
- Windows 原生扩展仅声明 win32-x64。构建需要 Visual Studio C++ 工具链、Windows SDK、Python 和 node-gyp 所需环境。
- SQLite 与 Electron / Node ABI、native addon 的 Node-API 和目标架构需匹配。单纯通过 TypeScript 检查不能证明 native runtime 可用。
- 开发工具及依赖安装需联网，锁文件固定了本次依赖解析。不得提交安装缓存、node_modules、用户配置和编译输出。

## 安装和离线检查

在项目根目录运行：

```powershell
node .yarn/releases/yarn-4.18.0.cjs install --immutable
node .yarn/releases/yarn-4.18.0.cjs typecheck
node .yarn/releases/yarn-4.18.0.cjs test
```

也可在启用 Corepack 后使用同等的 `yarn` 命令。依赖版本以锁文件为准；遇到 peer dependency 警告应记录具体结果，不自动升级整套依赖。

源树中依赖真实对局快照、录制画面和相关衍生输入的测试与 Storybook 示例已移除。保留的测试不能覆盖被移除的实机场景，未来应使用专门编写的合成输入补充回归。

## 开发运行与常规打包

以下是源码已定义的入口；运行前先准备上述构建资源，并阅读相应许可说明：

```powershell
node .yarn/releases/yarn-4.18.0.cjs build:native:win
node .yarn/releases/yarn-4.18.0.cjs dev
node .yarn/releases/yarn-4.18.0.cjs build
node .yarn/releases/yarn-4.18.0.cjs build:win
```

`build:native:win` 调用 `native/win32-x64/scripts/build.js`，编译 C++ 扩展和 TypeScript 包装，产物留在本地。它不会补齐 `resources/magic`。`build` 做类型检查并生成 `out/`；`build:win` 再通过 electron-builder 打包。`build:mac` 仍是继承入口，不能据此声明 Veyra 在 macOS 可用。

`electron.vite.config.ts` 配置主进程、preload 和七个 renderer HTML 入口。`electron-builder.yml` 定义 Veyra 名称、图标与归档规则。包名、appId、内部模块名和数据目录仍有 `league-akari` 命名，当前保留以避免在源码清理中隐式改变持久化与接口契约。

## OCR 后端

Tesseract 开发路径使用 `resources/ocr/chi_sim.traineddata`，其 Apache-2.0 许可和来源记录与模型放在一起。

RapidOCR CPU 路径实际要求 `rapidocr==3.10.0`，便携准备脚本还校验 Python 3.13.15、`onnxruntime==1.31.0` 及其余锁定版本。完整清单保存在 [rapidocr-local-test-requirements.txt](rapidocr-local-test-requirements.txt)。从 [Python 官方 3.13.15 页面](https://www.python.org/downloads/release/python-31315/) 和 [PyPI 的 RapidOCR 3.10.0](https://pypi.org/project/rapidocr/3.10.0/) 准备隔离环境，再按清单安装依赖：

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install --index-url https://pypi.org/simple -r docs/rapidocr-local-test-requirements.txt
```

`python` 需先确认指向上述固定版本。另需本地 `ch_PP-OCRv4_rec_mobile.onnx`：来源以 [RapidOCR v3.10.0 官方 registry](https://github.com/RapidAI/RapidOCR/blob/v3.10.0/python/rapidocr/default_models.yaml) 的 `onnxruntime.PP-OCRv4.rec.ch_PP-OCRv4_rec_mobile` 为准，[官方模型地址](https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.10.0/onnx/PP-OCRv4/rec/ch_PP-OCRv4_rec_mobile.onnx)，SHA-256 为 `48fc40f24f6d2a207a2b1091d3437eb3cc3eb6b676dc3ef9c37384005483683b`。worker 会核对模型及 RapidOCR 版本。本快照不携带 Python runtime、该模型或已安装包。后端选择示例：

```powershell
$env:AKARI_MAYHEM_OCR_BACKEND = 'rapidocr'
$env:AKARI_RAPIDOCR_PYTHON = '<本地隔离Python路径>'
$env:AKARI_RAPIDOCR_MODEL = '<本地模型路径>'
```

必须用实际文件路径替换占位符。选择 RapidOCR 后资源缺失会报错；不会自动退回 Tesseract。具体依赖收集和校验由 `scripts/windows-portable/prepare-rapidocr.cjs` 执行，版本和再分发许可需在制作测试包时逐项核对。

## 便携包状态

`build:win:portable` 需要 Python、site-packages、VC runtime、模型、全新输出目录和 label 参数。该脚本还要求 `bootstrap-provenance.json`、已审核的 native bootstrap 及干净提交；这些二进制相关前置已从候选移除，**当前不能直接用该入口产出可交付 ZIP**。保留脚本用于说明原有组装流程，待补齐可复现构建与新的来源核验后再恢复。

源码导出使用新的 Git 历史。旧脚本中的 `source-version.cjs` 在 Git checkout 内读取新的提交；不要把旧私有仓库 URL、备份分支或历史对象重新接入公开仓库。

## 变更和验收

保持 shard id、IPC namespace、设置 key 和持久化格式稳定，确需修改时说明迁移方式。格式化改动文件，运行与改动相关的测试和类型检查，再按风险补实机或打包检查。

建议实机验收至少记录：Windows 与客户端版本、CPU、显卡、分辨率、DPI、显示器数量、权限等级、窗口模式；覆盖选人到游戏、切屏、遮挡、商店、海克斯刷新、断线重连和跨局。记录结果应脱敏，不把原始画面和账号数据直接提交到仓库。
