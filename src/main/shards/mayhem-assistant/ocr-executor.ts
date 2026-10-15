import fs from 'node:fs/promises'
import path from 'node:path'
import { OEM, PSM, type Worker, createWorker } from 'tesseract.js'

import type { MayhemBackendOcrEngine } from './ocr-contract'
import { RapidOcrCpuExecutor } from './rapidocr-executor'

export interface OcrLine {
  text: string
  confidence: number
  backend?: 'tesseract'
}
export interface MayhemOcrEngine {
  preload(): Promise<void>
  recognize(images: readonly Buffer[]): Promise<OcrLine[]>
  dispose(): void
}

// One reusable local LSTM worker; no model URL, image upload, or recognition queue.
export class MayhemOcrExecutor implements MayhemOcrEngine {
  readonly backend = 'tesseract' as const
  private _worker: Worker | null = null
  private _initializing: Promise<Worker> | null = null
  private _failure: Error | null = null
  private _disposed = false
  private _cancel: ((cause: Error) => void) | null = null
  constructor(private readonly _modelDirectory: string) {}

  async preload() {
    if (this._disposed) throw new Error('本地 OCR 已停止')
    if (this._failure) throw this._failure
    try {
      await this._getWorker()
      if (this._disposed) throw new Error('本地 OCR 已停止')
    } catch (cause) {
      this._failure = cause instanceof Error ? cause : new Error(String(cause))
      this._terminate()
      throw this._failure
    }
  }

  private _getWorker() {
    if (!this._initializing) {
      this._initializing = (async () => {
        try {
          await fs.access(path.join(this._modelDirectory, 'chi_sim.traineddata'), fs.constants.R_OK)
        } catch (cause) {
          throw new Error('本地 OCR 模型不可读，请安装完整版本', { cause })
        }
        if (this._disposed || this._failure) throw new Error('本地 OCR 已停止')
        const worker = await createWorker('chi_sim', OEM.LSTM_ONLY, {
          langPath: this._modelDirectory,
          workerPath: require
            .resolve('tesseract.js/src/worker-script/node/index.js')
            .replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'),
          cacheMethod: 'none',
          gzip: false,
          errorHandler: (cause) => this._cancel?.(new Error(String(cause)))
        })
        if (this._disposed || this._failure) {
          await worker.terminate()
          throw new Error('本地 OCR 已停止')
        }
        this._worker = worker
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE })
        return worker
      })()
    }
    return this._initializing
  }

  async recognize(images: readonly Buffer[]) {
    if (this._disposed) throw new Error('本地 OCR 已停止')
    if (this._failure) throw this._failure
    if (this._cancel) throw new Error('本地 OCR 正在识别上一帧')
    const cancelled = new Promise<never>((_, reject) => {
      this._cancel = reject
    })
    const timeout = setTimeout(() => this._cancel?.(new Error('本地 OCR 超时，识别未完成')), 8000)
    const recognition = (async () => {
      const worker = await this._getWorker()
      const lines: OcrLine[] = []
      for (const image of images) {
        if (this._disposed || this._failure) throw new Error('本地 OCR 已停止')
        const { data } = await worker.recognize(image, {}, { text: true, blocks: false })
        lines.push({ text: data.text.trim(), confidence: data.confidence })
      }
      return lines
    })()
    try {
      return await Promise.race([recognition, cancelled])
    } catch (cause) {
      this._failure = cause instanceof Error ? cause : new Error(String(cause))
      this._terminate()
      throw this._failure
    } finally {
      clearTimeout(timeout)
      this._cancel = null
    }
  }

  private _terminate() {
    if (!this._worker) return
    void this._worker.terminate()
    this._worker = null
  }
  dispose() {
    this._disposed = true
    this._cancel?.(new Error('本地 OCR 已停止'))
    this._terminate()
  }
}

// Explicit local candidate selection. Missing/failed RapidOCR never silently changes backend.
export function createMayhemOcrBackend(
  modelDirectory: string,
  environment: NodeJS.ProcessEnv = process.env
): MayhemBackendOcrEngine {
  const backend = environment.AKARI_MAYHEM_OCR_BACKEND || 'tesseract'
  if (backend === 'tesseract') return new MayhemOcrExecutor(modelDirectory)
  if (backend !== 'rapidocr') throw new Error(`未知本地OCR后端：${backend}`)
  return new RapidOcrCpuExecutor({
    pythonPath:
      environment.AKARI_RAPIDOCR_PYTHON || path.join(modelDirectory, 'rapidocr', 'python.exe'),
    modelPath:
      environment.AKARI_RAPIDOCR_MODEL ||
      path.join(modelDirectory, 'rapidocr', 'ch_PP-OCRv4_rec_mobile.onnx'),
    workerPath: path.join(modelDirectory, 'rapidocr-worker.py'),
    ...(!environment.AKARI_RAPIDOCR_PYTHON && !environment.AKARI_RAPIDOCR_MODEL
      ? { startupTimeoutMs: 30000 }
      : {})
  })
}
