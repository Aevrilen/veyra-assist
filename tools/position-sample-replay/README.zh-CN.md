# Veyra 单帧本地回放

这个工具读取已有 PositionSample JSON，或已在本地裁好的 PNG + 手工几何参数 JSON。
原图只在你电脑内存中
解析，不上传，不启动 Veyra，不调用 Electron 或原生模块，也不修改原样本
和程序设置。无需重新截图或开游戏。

## 运行

需要电脑上已经安装 Node.js 22.13 或更高版本。这个包不包含 Node，也不会
自动安装任何软件。把本目录的 `.cjs` 和许可证文件放在一起。

在本目录打开 PowerShell，替换成你自己的本地 JSON 路径后运行：

```powershell
node .\veyra-position-sample-replay.cjs "C:\你的文件夹\Veyra-position-sample.json"
```

将不含图像的诊断结果另存为报告：

```powershell
node .\veyra-position-sample-replay.cjs "C:\你的文件夹\Veyra-position-sample.json" |
  Set-Content -Encoding utf8 .\position-replay-report.json
```

不要将输出文件设置成原样本路径，否则 PowerShell 本身可能先覆盖原文件。
请使用已经下载到本地磁盘的文件，不要使用 URL、网络共享或尚未下载的云端占位文件。

如果需要反馈结果，只发送 `position-replay-report.json` 即可。原始样本 JSON
包含图像，请继续保留在本机。工具没有任何自动上传或发送功能。

## 原导出样本不在时：已有录屏的本地 PNG

只使用已有录屏中的首次进入选人画面，不需要重新进游戏调查。这个工具不读取
录屏、不抽帧、不自动找窗口或裁图；输入必须是你已经在本地处理好的 PNG。

PNG 必须精确裁到真实客户端区域，不能含桌面、窗口边框，不能缩放或拉伸。
如果录屏本身缩放过，不能把录屏像素冒充原始物理像素。如果实际裁剪边界或
当时的客户端 DIP 尺寸无法确认，请先停下，不要填猜测值。

复制同目录的 `manual-geometry.template.json` 为 `frame-geometry.json`，填完
所有 null。模板故意不能直接运行，避免把示例尺寸误当成真实数据：

```json
{
  "version": 1,
  "kind": "veyra-manual-client-geometry",
  "crop": "actual-client-area",
  "physicalClientSize": { "width": null, "height": null },
  "dipClientSize": { "width": null, "height": null },
  "counts": { "candidates": null, "teammates": null }
}
```

字段要求：

- 六个顶层字段都必须存在，不接受额外字段；version、kind、crop 保持上方固定值。
- physicalClientSize 是物理像素尺寸，整数 1–4096，必须等于 PNG 尺寸。
- dipClientSize 是录制当时真实客户端的 DIP 尺寸，大于 0 且不超过 4096；
  不会根据 PNG 像素大小猜测。两个尺寸对象只接受 width、height。
- counts 只接受 candidates、teammates，填画面当时的真实数量，整数 0–20；
  检测器之后还会判断这个数量是否受支持。
- 不要添加 capture、geometryCheck、显示器 ID、窗口 ID 或时间戳。

运行命令，参数顺序固定为 --png 文件 --geometry 文件：

```powershell
node .\veyra-position-sample-replay.cjs --png "C:\你的文件夹\first-select-client.png" --geometry "C:\你的文件夹\frame-geometry.json" |
  Set-Content -Encoding utf8 .\position-replay-report.json
```

这条路径明确标为 `user-supplied-unverified`（用户提供、未经原生窗口验证）。
裁剪边界只视为用户声明；原点和时间明确为模拟零值，不会伪造 bracketed 抓图
证据，也不会编造抓图时长。原图和录屏仍留在本机，只需反馈无图的报告即可。

## 怎么看结果

- `provider.reason` 是当前这张图通过或拒绝的具体检测关口，`metrics` 是数字
  或布尔值，例如边缘命中数。`matched` 表示单帧图像通过现有规则。
- `resolver.scope` 明确为 `synthetic-current-context-single-frame`。当前窗口、
  前台、选人阶段、身份字段及默认设置使用显式模拟条件，不是历史现场记录。
- 单帧通过时一般得到 `confirming`，不代表自动定位已经完成。工具不会把同一
  张图复制成第二帧来伪造一致性。
- 不能根据这个样本还原：当时真实前台和阶段、窗口/会话/进程身份、当前显示器
  与缩放检查、抓图前后窗口稳定性、旧手动标定、历史时效、上一帧和两帧间隔。
- `missing-capture-evidence` 表示导出文件缺少需要的抓图元数据；
  `image-dimensions-mismatch` 或 `physical-client-dimensions-mismatch` 表示
  图片尺寸与元数据不一致。工具会拒绝，而不是猜测。
- 错误报告不包含文件路径、原图、用户名、标识符、样本备注或错误堆栈。

支持：版本 1 样本且带原导出的 bracketed 抓图证据，或符合上述手工元数据格式的
本地 PNG。图片均需非交错、不透明的 8 位 RGB/RGBA PNG。
最多 32 MiB 原样本 JSON、16 KiB 手工元数据 JSON、24 MiB PNG、单边 4096 像素。其他格式或损坏文件会得到固定
错误码。退出码 0 表示回放执行完成（包括检测拒绝），2 表示输入/执行出错。

验证范围：云端 Node 24.19 上的人工生成图像和异常输入测试已通过；没有使用
你的私人截图，也没有在 Windows 上运行你的样本。它是诊断工具，不是新程序版本。
