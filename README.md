# Veyra Assist

基于 [League Akari](https://github.com/LeagueAkari/LeagueAkari) 二次开发的《英雄联盟》桌面辅助工具，提供选人辅助、局内海克斯识别与装备推荐，以及战绩查询和自动化功能。

> **开发中 / 半成品。** 当前提供 Windows x64 版本。

> **部分开源**：2026-10-24 已同步经白名单审查的战绩 UI、通用快捷设置与测试，提供可运行的模拟结果接口；当前识别重构实现保留私有。默认分支保留旧公开基线及其许可，不代表最新完整程序源码。范围、历史公开限制和运行示例见 [开源边界](docs/SOURCE_BOUNDARY.md) 与 [导出清单](public-export.json)。

**[下载 1.0.20](https://github.com/Aevrilen/veyra-assist/releases/tag/v1.0.20)** · [历史版本 1.5.2-beta.3](https://github.com/Aevrilen/veyra-assist/releases/tag/v1.5.2-beta.3) · [开始使用](docs/USAGE.md) · [功能索引](docs/FEATURES.md) · [路线图 / Todo](docs/ROADMAP.md)

首次安装请选择 Release Assets 中的 `Veyra-Assist-1.0.20-Setup.exe`；已有匹配运行环境请选择 `Veyra-Assist-1.0.20-Business-Update.exe`，并继续使用原安装目录。请同时阅读随包说明。GitHub 自动生成的 Source code 是源码，不能直接作为安装包运行。

1.0.20 新增装备推荐面板样式调节。[beta.3 源码](https://github.com/Aevrilen/veyra-assist/tree/v1.5.2-beta.3)及[本版说明](https://github.com/Aevrilen/veyra-assist/blob/v1.5.2-beta.3/docs/releases/1.5.2-beta.3.md)仍供查阅。

## 给使用者

### 当前功能

| 场景         | 已发布功能                                                             |
| ------------ | ---------------------------------------------------------------------- |
| 首页         | 对局悬浮窗、自动接受、自动匹配三个快捷开关，与设置页同步保存           |
| 选人         | 支持布局中的自动定位、候选英雄胜率与登场率、队友近期战绩及当前英雄统计 |
| 局内         | 海克斯标题本地 OCR 与统计浮层；热门装备、鞋子、核心组合和出门装推荐，装备面板支持样式调节 |
| 对局与战绩   | 双方对局面板、召唤师查询、战绩筛选与详情，包括符文、构建和时间线       |
| 自动化与工具 | 自动接受和匹配、选禁英雄及英雄配置；功能搜索、内置离线更新日志         |
| Debug 反馈   | 帮助与修复中的日志目录和反馈 ZIP 导出，由用户检查后私下提交            |

自动接受缺省开启，已有明确关闭设置保留；自动匹配缺省关闭。**对局悬浮窗**沿用原显示方式和快捷键，旧 **Mini 白框弹窗**已停用。功能入口、适用范围和来源见 [功能索引](docs/FEATURES.md)。

**外观自定义**：提供浅色冷灰、深色石墨、低饱和蓝灰、雾紫灰四套快捷配色；可在“自定义外观 → 背景图片设置 → 自定义壁纸 → 浏览”选择本地图片作为主窗口背景，并调整蒙层深度。程序保存图片路径和设置，请保留原文件。操作见 [使用说明](docs/USAGE.md#外观与图片导入)。

**装备面板样式**：局内装备推荐标题右侧提供“样式调节”入口。面板大小可在 75%–125% 间以 5% 为步长调整，背景透明度可单独设置，偏好会保存。

### 界面预览

以下为实机画面，部分个人信息已处理。画面展示不同场景，具体数值会随对局和数据变化。

**自定义外观**：主题配色与背景图片设置入口。

<img src="assets/previews/real-2.png" alt="自定义外观页面中的主题配色和背景图片设置入口" width="960" />

**选人辅助**：选人画面显示队友近期统计和候选英雄统计浮窗。

<img src="assets/previews/real-3.png" alt="选人画面中的队友近期统计和候选英雄统计浮窗" width="960" />

**局内海克斯**：在海克斯选项下方查看胜率与选取率。

<img src="assets/previews/real-1.png" alt="局内海克斯选项下方显示胜率和选取率" width="960" />

**装备推荐**：在局内查看装备分类及推荐；标题右侧提供样式调节入口。

<img src="assets/previews/real-5.png" alt="游戏商店旁的装备推荐面板，展示出门装和右上角样式调节入口" width="960" />

**战绩面板**：查看历史对局、队列筛选和玩家统计。

<img src="assets/previews/real-4.png" alt="战绩页面，显示队列筛选、玩家统计和历史对局列表" width="960" />

### 安装与使用

1. 从 [1.0.20 Release](https://github.com/Aevrilen/veyra-assist/releases/tag/v1.0.20) 下载适合的安装包并阅读随包说明。首次安装选择 Setup；已有匹配运行环境选择 Business Update，继续使用原安装目录。
2. 启动 Veyra，登录游戏客户端，确认连接状态，按需设置快捷开关。
3. 进入选人或支持的局内场景后使用辅助界面；选人自动定位时保持客户端前台、窗口稳定。

当前面向 **Windows x64**。不同分辨率与系统缩放下的适配仍在完善；macOS 尚无 Veyra 功能验收，Linux 暂无支持承诺。更多说明见 [使用说明](docs/USAGE.md)。

### 路线图 / Todo

产品方向清单，编号不代表优先级，均为待完善或待实现：

1. 优化识别方案与硬件适配，提供高、低性能两档。
2. 对比备选英雄与已选英雄的胜率，辅助选择推荐。
3. 海克斯与装备特殊组合的算法推荐。
4. 自定义装备构筑导入。
5. UI 美术优化／重做，完善信息层级、模块布局和视觉一致性，保留原交互。
6. 有充分数据支持的评分系统。
7. 完善识别流程的全自动化。
8. 新增统一一键显示／隐藏快捷键。

掌盟数据链仍在研究，尚未接入。差分下载仍待完善。

后续公开版本将同步更新仓库主页、功能状态、预览和包内说明。完整进度见 [路线图](docs/ROADMAP.md)。

### 配置、日志和反馈

遇到问题，在 **设置 → 帮助与修复 → 导出反馈 ZIP** 选择保存位置。先检查内容，再私下发给维护者；程序不会自动上传。公开 Issue 请附版本、现象、复现步骤、分辨率和缩放，避免发送原始日志、完整配置或未脱敏截图。详见 [Debug 反馈](docs/USAGE.md#debug-反馈) 与 [隐私说明](docs/PRIVACY.md)。

### 当前交流群

当前QQ群：**1084465318**。这是现阶段的临时交流群；新版推出后可能更换。入群不代表获得最终新版测试名额。

<img src="assets/community-qq.jpg" alt="Veyra Assist 当前交流群二维码" width="320" />

二维码由项目维护者提供，保留原图。过期时可尝试群号；后续群信息集中在本节更新。

## 给开发者

技术栈包括 TypeScript、Electron、Vue 3、Pinia、MobX、Naive UI、Tailwind CSS、TypeORM / SQLite；Windows 原生扩展使用 C++ / Node-API。准确版本以所选源码版本的 `package.json` 和 `yarn.lock` 为准。

- [开发与构建](docs/DEVELOPMENT.md)：源码依赖、构建入口和本地 OCR 环境；公开源码未附全部外部预编译运行依赖。
- [架构与数据流程](docs/ARCHITECTURE.md)：主进程、渲染窗口、LCU 和数据源。
- [外部依赖校验清单](docs/EXTERNAL_DEPENDENCIES.json) · [公开整理差异](docs/EXPORT_DIFFERENCES.md)。
- [已发布 beta.3 源码](https://github.com/Aevrilen/veyra-assist/tree/v1.5.2-beta.3) · [本版来源与验证](https://github.com/Aevrilen/veyra-assist/blob/v1.5.2-beta.3/docs/releases/1.5.2-beta.3.md)。

欢迎提交问题和 Pull Request。请说明复现条件、改动范围及实际运行的检查；新测试使用合成输入，不提交真实账号标识或个人对局数据。

### 许可与致谢

保留 Akari 的 [MIT LICENSE](LICENSE) 及原作者 Hanxven 的版权声明，另保留适用的 ISC、OFL、Apache 等许可与真实归属。文件级来源、素材归属和公开整理记录见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。版权许可与商标使用分别说明。

本项目与 Riot Games、腾讯、Akari 上游及第三方数据提供方无官方合作或认可关系。游戏名称、商标和相关资源归各权利人所有；不承诺游戏更新、反作弊或平台规则兼容性。


