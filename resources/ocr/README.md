# 本地中文 OCR 模型

`chi_sim.traineddata` 来自 Tesseract 官方 `tessdata_best`，提交 `e12c65a915945e4c28e237a9b52bc4a8f39a0cec`，读取时间 2026-10-11 22:12:30 UTC。使用 Tesseract 5.5.0 的 `combine_tessdata -c` 将原始浮点 LSTM 模型压缩为整数模型；运行时无需安装这个转换工具。

- [原始模型](https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/e12c65a915945e4c28e237a9b52bc4a8f39a0cec/chi_sim.traineddata)
- [官方模型说明](https://github.com/tesseract-ocr/tessdata_best)与[整数转换命令说明](https://github.com/tesseract-ocr/tesseract/blob/main/doc/combine_tessdata.1.asc)，运行时仅使用 `LSTM_ONLY`。
- [Apache-2.0 许可](https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/e12c65a915945e4c28e237a9b52bc4a8f39a0cec/LICENSE)，原文保存在同目录 `LICENSE`。

随包模型为 2,471,033 字节，SHA-256 `9784f7c917c546424b690fcde708ce1f604a4393d08bb51ddab146d7d7c794e6`。`SOURCE.json` 保存原始下载、转换步骤、随包文件和许可的来源及校验值。

运行时先检查模型可读，再通过显式本地 `langPath` 加载 `chi_sim`，禁用缓存并读取未压缩模型。没有在线模型地址、默认 CDN 下载或截图上传；缺失模型时明确暂停自动识别。

打包使用现有 `resources/**` 解包规则；Node OCR worker 和实际运行时依赖也解包至 `app.asar.unpacked/node_modules`。保留 Tesseract 的全部核心 WASM 变体，由库按当前 CPU 支持选择。
