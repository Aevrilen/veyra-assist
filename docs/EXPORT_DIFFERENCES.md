# 源码导出差异

本快照基于冻结提交的 Git 对象导出，采用全新本地历史，没有导入旧仓库对象、远程、私人作者邮箱或活动工作树改动。

## 初次清理

- 排除内部交接、证据、真实对局 / 截图测试数据、任务与编辑器配置，以及原自动发布工作流。
- 不携带已编译应用、原生扩展输出和用户配置 / 数据库。四个上游预编译运行文件改列 [外部依赖](EXTERNAL_DEPENDENCIES.json)，并提供固定官方来源与校验值。
- 四个测试 / 示例中的疑似真实昵称、账号标识和本机用户路径替换为合成值；运行时功能未因此重写。
- `resources/AKARI` 删除独立非商业许可百科摘录，仅保留资源定位标记。程序不采用该摘录的非商业条款。
- 重写 README，补充架构、开发、路线图、隐私和第三方许可说明；保留原 MIT、模型 Apache 文本及真实来源归属。
- 授权群邀请原图放在 `assets/community-qq.jpg`，群号和图片引用集中于 README。

## 依赖与文档修正

新增文件：

- `docs/rapidocr-local-test-requirements.txt`：恢复冻结基线已有的纯依赖版本清单，包含 `rapidocr==3.10.0`，不含个人路径、token 或账号。
- `docs/EXTERNAL_DEPENDENCIES.json`：记录四个外部预编译依赖的官方固定地址、Git blob、大小和 SHA-256。
- 本文 `docs/EXPORT_DIFFERENCES.md`。

修改文件：`README.md`、`docs/DEVELOPMENT.md`、`THIRD_PARTY_NOTICES.md`。修正源码快照定位、RapidOCR 包名、外部依赖准备方法，以及 Seraphine 历史许可和端点列表的局部待核范围。

该文档修正阶段删除文件为零，恢复了原来整批排除的纯依赖清单，避免便携准备脚本读取不存在的文件。

## 公开副本中的局部功能整理

- `src/renderer/src-main-window/views/toolkit/misc/SummonerProfile.vue` 暂时移除 Seraphine 来源未决的两个非核心个人资料操作及对应按钮，仅涉及清除声望饰章、清除挑战代币。个人资料背景、横幅和表情操作保留；没有删除整个组件。
- `src/renderer/src-main-window/components/settings-modal/lcu-endpoints.ts` 移除授权记录未明的静态端点列表，保留来源注释并导出空补全。`DebugSettings.vue` 的手填输入、路由校验和添加规则流程保持原样，后续补全待自行生成。
- 主选人、截图 OCR、装备推荐、LCU 连接和外部更新器逻辑均未修改；本轮未替换素材、未做其他 UI 改造。
- 公开文档使用“开发者本机实测”，并明确本快照仍基于 `37e2ccc`，没有合入之后单独交付的日志反馈 hotfix。

上述修改仅位于干净公开副本，没有改动运行开发版。原 MIT、ISC、OFL、Apache 等许可原文及真实归属保留。待公开的 Git 历史从清理后的最终文件树重新起始，避免移除片段残留在公开提交历史中。

此前 ZIP 仅代表其原封存提交，本轮不重新压缩；公开前应按最终确认的文件树准备分发材料。
