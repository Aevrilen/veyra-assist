# 配置、日志与反馈

## 本地数据

主进程使用 Electron 的 `userData` 保存数据。便携模式默认使用 `%APPDATA%/LeagueAkari-Portable`，可通过 `AKARI_PORTABLE_USER_DATA` 指向本地隔离目录；普通开发和打包路径由 Electron 配置及平台决定。

| 数据             | 位置或模块                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| 基础配置         | `<userData>/base-config.json`                                                                        |
| 数据库与模块设置 | `storage`、`setting-factory`；包含 `LeagueAkari.db`                                                  |
| 海克斯辅助设置   | `<userData>/mayhem-assistant/preferences.json`                                                       |
| 识别会话与校准   | `mayhem-assistant` 中的 `session.json`、`calibration.json`、`automatic-location.json` 及备用校准数据 |
| 统计缓存         | `<userData>/mayhem-assistant/statistics/`                                                            |
| 日志             | 便携 / macOS 使用 Electron `logs` 路径；其他 Windows 路径在可执行文件旁的 `logs/`                    |

配置、数据库和会话可能包含玩家标识、偏好、窗口位置和使用记录；错误日志可能带本地路径或接口细节。删除配置前先退出应用并自行备份，源码中的默认配置不应替换用户文件。

## 截图和网络

OCR 主流程在本机裁剪画面并识别。截图可能包含游戏内昵称、聊天或桌面内容，因此反馈时只保留必要区域并遮挡个人信息。

应用并非整体离线：装备与海克斯统计会访问腾讯101和 ARAMKit，继承功能还有素材、SGP、Akari API 配置、公告、版本和统计相关代码。完整审查需结合 `src/main/shards/network/`、`akari-api/`、`statistics/` 和实际调用条件。当前不宣称已完成全应用网络与日志脱敏审计。

冻结基线的 `StatisticsMain.onInit()` 会调用版本使用统计：通过继承的 Akari API 记录应用版本，首次还记录占位版本 `v0.0.0`，并在本地保存已计数版本。该行为在此次源码清理中未改变，需在后续 Veyra 独立化中决定保留、关闭或提供明确选择。自动更新已另行禁用，不会应用 Akari 更新包。

LCU / Riot token、认证 header 和客户端启动命令行属于敏感材料，不要复制到源码、截图或公开反馈中。

## 提交问题

公开反馈仅包含：现象、最小复现步骤、预期与实际行为、应用版本、系统与客户端版本、分辨率和缩放，以及已脱敏的短错误摘要。用“示例玩家”“测试机器”等占位符代替个人信息。

**不要公开提交** 原始日志、完整数据库、完整客户端接口响应、token、真实玩家 PUUID / 账号 ID、录屏和未遮挡截图。需要更多材料时，先与维护者约定私下接收范围和方式；交流群信息见 [README](../README.md#当前交流群)。

日志反馈 ZIP 的独立 hotfix 已完成交付，当前 `37e2ccc` 源码基线尚未包含该补丁。使用后续包含补丁的版本时，仍应在发送前检查材料范围与脱敏结果，并由用户选择发送内容。
