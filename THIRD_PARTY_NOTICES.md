# 许可、代码来源与致谢

本项目基于 League Akari 二次开发，保留其原有版权、许可证与代码内来源注释。Veyra 不声称从零实现整个应用。根目录 `LICENSE` 是 Akari 随基线提供的 MIT 文本，版权归属为 Hanxven；不将其他项目的个人非商业许可套用于本项目。

## 已有证据

| 来源                                                                      | 本仓库中的用途或证据                                                              | 许可处理                                                                          |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [League Akari](https://github.com/LeagueAkari/LeagueAkari)                | Electron / Vue 应用主体、LCU、shard 框架与继承功能                                | 保留根目录 MIT LICENSE 与原作者归属                                               |
| [react-sticky-box](https://github.com/codecks-io/react-sticky-box)        | `src/renderer-shared/components/sticky-box/useStickyBox.ts` 首行标注 adapted from | ISC，原文见 `third_party/react-sticky-box-LICENSE`                                |
| [fix-lcu-window](https://github.com/LeagueTavern/fix-lcu-window)          | `league-client/index.ts` 窗口修正方法有来源注释                                   | MIT，原文见 `third_party/fix-lcu-window-LICENSE.txt`                              |
| [Tesseract tessdata_best](https://github.com/tesseract-ocr/tessdata_best) | 整数化后的本地中文识别模型                                                        | Apache-2.0，原文、变换和 hash 见 `resources/ocr/`                                 |
| [Comfortaa](https://github.com/alexeiva/comfortaa)                        | `src/renderer-shared/assets/fonts/comfortaa/` 字体                                | OFL-1.1，补充文本见 `third_party/Comfortaa-OFL.txt`；仍需核对随基线字体的准确版本 |
| [Yarn](https://github.com/yarnpkg/berry)                                  | 随仓 `.yarn/releases/yarn-4.18.0.cjs`                                             | BSD-2-Clause，补充原文见 `third_party/Yarn-LICENSE.md`                            |

`third_party/LICENSE_SOURCES.json` 记录补充许可证的获取地址、日期和 SHA-256。网络补充文本与冻结基线不是同一时间的快照；适用版本不明确时仍需进一步核对。

## 文件级来源核验与待确认范围

公开整理前的冻结版本中，`SummonerProfile.vue`、`lcu-endpoints.ts`、`github-markdown.css` 和 `useStickyBox.ts` 已与 [Akari 提交 5109b2f](https://github.com/LeagueAkari/LeagueAkari/tree/5109b2f7fcce6e02312e534cd1729ed0f2142b51) 按 Git blob 核对一致；该提交附 MIT LICENSE。这是直接来源和许可证据。本快照对前两文件进行了下述局部移除，其余同源代码保留原许可。

### Seraphine 的两项个人资料工具

冻结版本的 `src/renderer/src-main-window/views/toolkit/misc/SummonerProfile.vue` 曾在 `handleRemovePrestigeCrest`、`handleRemoveTokens` 两处标注 copied from Seraphine。原仓库仍可读取的历史提交包含 [GPLv3 LICENSE](https://github.com/Zzaphkiel/Seraphine/blob/e6f1b423bcdbefbf83f28b402667f9cb55ca0073/LICENSE)、[历史 README](https://github.com/Zzaphkiel/Seraphine/blob/e6f1b423bcdbefbf83f28b402667f9cb55ca0073/readme.md) 和 [Python 实现](https://github.com/Zzaphkiel/Seraphine/blob/e6f1b423bcdbefbf83f28b402667f9cb55ca0073/app/lol/connector.py)。此处保留真实来源记录与归属。

Python 的 `removeTokens`、`removePrestigeCrest` 与这两段 TypeScript 使用对应的 LCU 请求步骤、数据字段和饰章值；TypeScript 另有 Akari 的界面状态、API 包装和错误处理。历史 LICENSE 为 GPLv3，历史 README 另有非商用表述。两者不能被概括成给 Veyra 全项目套用个人非商业许可。

为避免分发存在明确未决出处的实现，本公开快照已暂时移除这两个非核心个人资料操作及对应按钮，没有保留其实现代码。其余个人资料背景、横幅和表情操作保留；主选人、OCR 与装备辅助未改。以后如需恢复，应先明确具体采用版本、额外授权或独立实现依据。该局部处理不改变其余 Akari MIT 代码的许可。

### 静态端点列表

原 `src/renderer/src-main-window/components/settings-modal/lcu-endpoints.ts` 注明来自 [KebsCS/lcu-and-riotclient-api](https://github.com/KebsCS/lcu-and-riotclient-api)，用于 `DebugSettings.vue` 的端点补全。检查上游当前目录及常见许可证路径历史后，未取得独立许可记录。本快照已移除全部静态候选，导出空的 `string[]`，保留来源说明；调试规则仍可手填并通过原有路由校验。后续补全列表应自行从有明确来源的客户端 OpenAPI 等数据生成，不继续复制授权未明的列表。

### 样式、字体与素材

Markdown CSS 的直接来源 Akari 已确认，另外保留 [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) 的 MIT 原文；其最初采用版本与主题修改记录仍可补充。Comfortaa 依据 OFL-1.1 随软件分发，原许可与版权文本保留，精确字体版本待追溯，不改标成 MIT。

版权许可与商标使用分别判断。继承的游戏 / 启动器 / OP.GG 标识应注明对应权利人，不因未持有独立商标许可就宣称整个源码项目禁止公开；具体品牌展示用途仍需符合适用规则。段位图、示意图和装饰图的原始来源逐项追溯，未证实出处的图形不自动断言为 Riot 作品或无授权。Veyra 品牌资源按项目公开授权保留；当前群邀请原图已获维护者明确展示授权。它们不代表 Riot、腾讯、Akari 或其他服务提供方认可本项目。

## 外部预编译运行依赖

未随源码快照提供的 `resources/elevate.exe`、`resources/akari-updater.exe`、`resources/magic/magic.win32-x64.node`、`resources/magic/magic.darwin-arm64.node` 已与上述 Akari 提交逐个核对相同。[外部依赖清单](docs/EXTERNAL_DEPENDENCIES.json)给出固定官方地址和 hash。这些文件的缺失导致当前静态资源导入无法完成构建；不自动构成其余源码禁止公开的理由。MIT 本身也不普遍要求分发二进制时必须同时给出源码。

- 旧 `elevate.exe` 的版本信息指向 Johannes Passing 1.0.0.2894；作者仓库的 MIT 文本与源码 LGPL 文件头曾需要进一步区分。1.5.2-beta.2 不再使用该旧二进制，改由[固定官方源码](https://github.com/jpassing/elevate/tree/d5cfc93d1ce06844a39d1a334a7a8081d26b6204/Elevate)重建独立 helper，保留提权入口与原命令行。源码明确提供 LGPL-2.1-or-later 授权；完整对应 `main.c`、`stdafx.h`、构建命令、原版权及许可均保存在 [third_party/elevate](third_party/elevate/README.md)，并随程序包提供，helper 可自行重建替换。它作为独立进程使用，未链接进 MIT 应用。二进制摘要见 [ELEVATE_BUILD.json](docs/ELEVATE_BUILD.json)。
- `akari-updater.exe` 为 Hanxven 的 2.0.0 上游工具，同作者 [源码仓库](https://github.com/LeagueAkari/akari-updater) 可读取，精确构建提交和 Rust 依赖归属待补。直接取得来源是附 MIT 的 Akari 固定提交。Veyra 的 `shouldRunSelfUpdateLifecycle()` 恒为 false；1.5.2-beta.2 保留该禁用策略及遗留源码，但不向程序包复制这个从不调用的 updater 文件。静态导入仍需构建时按清单准备文件；本次没有移除已启用的应用功能。
- 两平台 `magic` addon 暂无对应源码 / 重建脚本随基线提供，已知直接分发来源是附 MIT 的 Akari 固定提交。可记录为外部预编译依赖；源码重建可复现性与按适用许可再分发分别核对，不因缺源码一律判定禁止 MIT 分发。

## 依赖和数据服务

`resources/regedit-vbs/` 沿用 regedit 包的注册表脚本，原文许可补充于 `third_party/regedit-LICENSE`，版本以直接依赖清单为准。资源定位标记 `resources/AKARI` 原含带有独立非商业许可的百科文字摘录，此候选已移除摘录，只保留定位标记，不将该摘录纳入 MIT 范围。

依赖由 `package.json`、`yarn.lock` 指定，包括 Electron、Vue、Naive UI、MobX、Pinia、TypeORM、better-sqlite3、Tesseract.js 等。`third_party/DIRECT_DEPENDENCIES.json` 记录本轮独立安装后读取的直接依赖版本和许可声明。声明清单不替代许可证原文，也不证明全部传递依赖或打包后的资源已完成审查。

`@vicons/fa` 的包声明为 CC BY 4.0，来自 xicons 对 Font Awesome 图标的 Vue 封装。使用和分发相应图标时保留 [Font Awesome](https://fontawesome.com/license/free)、[xicons / 07akioni](https://github.com/07akioni/xicons) 来源、许可链接与适用的修改说明；当前尚需核对对应图标集的准确上游版本和完整归属文本。

制作二进制包前，使用 `scripts/windows-portable/notices.cjs` 等流程收集实际安装包的 LICENSE / NOTICE / COPYING / AUTHORS，保留 vfonts 内的字体许可，并另外核对 Python、ONNX Runtime、RapidOCR、模型与 Microsoft runtime 的分发条款。源仓库未随附这些 runtime 和 RapidOCR 模型。

装备与海克斯数据实际请求来自腾讯101和 ARAMKit；OP.GG、GTIMG、Fandom 等仍在部分继承适配器中出现。感谢这些数据和资源维护者；接口可访问不等于数据可任意再分发。本候选不公开真实接口响应快照，不声称获得这些服务的背书。

Akari 原 README 还列出一些启发性参考。本页仅将有源码或依赖证据的项目列为具体实现来源，不将上游全部历史参考写成 Veyra 直接使用的代码。
