import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

import type { MayhemBackendOcrEngine, RapidOcrLine } from './ocr-contract'

export interface RapidOcrOptions {
  pythonPath: string
  workerPath: string
  modelPath: string
  startupTimeoutMs?: number
}

interface PendingRead {
  id: number
  count: number
  started: number
  encodeMs: number
  sentAtNs: bigint
  timer: ReturnType<typeof setTimeout>
  resolve: (lines: RapidOcrLine[]) => void
  reject: (cause: Error) => void
}

// One owned CPU process, one in-flight read, no queue or recognition cache.
export class RapidOcrCpuExecutor implements MayhemBackendOcrEngine {
  readonly backend = 'rapidocr' as const
  private _worker: ChildProcessWithoutNullStreams | null = null
  private _initializing: Promise<void> | null = null
  private _resolveReady: (() => void) | null = null
  private _rejectReady: ((cause: Error) => void) | null = null
  private _startupTimer: ReturnType<typeof setTimeout> | null = null
  private _stopTimer: ReturnType<typeof setTimeout> | null = null
  private _pending: PendingRead | null = null
  private _expired: PendingRead | null = null
  private _recovering = false
  private _recovery: Promise<void> | null = null
  private _resolveRecovery: (() => void) | null = null
  private _rejectRecovery: ((cause: Error) => void) | null = null
  private _recoveryTimer: ReturnType<typeof setTimeout> | null = null
  private _cancelStopWait: ((cause: Error) => void) | null = null
  private _restartAttempts = 0
  private _failure: Error | null = null
  private _disposed = false
  private _busy = false
  private _sequence = 0
  private _output = ''
  private _stderr = ''
  private _details: Record<string, unknown> = { backend: 'rapidocr', state: 'unprepared' }

  constructor(private readonly _options: RapidOcrOptions) {}

  diagnostics() {
    return { ...this._details }
  }

  async recover() {
    if (!this._recovery) return false
    await this._recovery
    // A drained response can be followed by exit/disposal before this waiter resumes.
    if (this._disposed) throw new Error('RapidOCR CPU 已停止')
    if (this._failure) throw this._failure
    return true
  }

  async preload() {
    if (this._disposed) throw new Error('RapidOCR CPU 已停止')
    if (this._failure) throw this._failure
    if (!this._initializing) {
      this._initializing = this._start().catch((cause) => {
        const failure = cause instanceof Error ? cause : new Error(String(cause))
        this._fail(failure)
        throw failure
      })
    }
    await this._initializing
    if (this._disposed) throw new Error('RapidOCR CPU 已停止')
    if (this._failure) throw this._failure
  }

  private async _start() {
    if (process.platform !== 'win32') throw new Error('RapidOCR CPU 本机候选仅支持 Windows')
    const started = performance.now()
    for (const name of ['pythonPath', 'workerPath', 'modelPath'] as const) {
      const file = this._options[name]
      if (!file) throw new Error(`RapidOCR CPU 缺少本地 ${name} 配置`)
      await fs.access(file, fs.constants.R_OK)
    }
    if (this._disposed) throw new Error('RapidOCR CPU 已停止')
    this._output = ''
    this._stderr = ''
    this._details = {
      backend: this.backend,
      state: 'starting',
      restartAttempts: this._restartAttempts
    }
    const ready = new Promise<void>((resolve, reject) => {
      this._resolveReady = resolve
      this._rejectReady = reject
    })
    const child = spawn(
      this._options.pythonPath,
      ['-I', '-B', '-u', this._options.workerPath, '--model', this._options.modelPath],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    this._worker = child
    this._details.pid = child.pid ?? null
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      if (this._worker !== child || this._disposed || (this._failure && !this._expired)) return
      this._output += chunk
      if (this._output.length > 65536) {
        this._fail(new Error('RapidOCR CPU 响应超出标题限制'))
        return
      }
      let newline: number
      while ((newline = this._output.indexOf('\n')) !== -1) {
        const line = this._output.slice(0, newline)
        this._output = this._output.slice(newline + 1)
        this._receive(line, started)
      }
    })
    child.stderr.on('data', (chunk: string) => {
      if (this._worker !== child) return
      this._stderr = (this._stderr + chunk).slice(-2000)
    })
    child.on('error', (cause) => {
      if (this._worker === child) this._fail(new Error('RapidOCR CPU 进程启动失败', { cause }))
    })
    child.stdin.on('error', (cause) => {
      if (this._worker === child && !this._failure)
        this._fail(new Error('RapidOCR CPU 请求通道失败', { cause }))
    })
    child.on('close', (code) => {
      if (this._worker !== child) return
      if (this._startupTimer) clearTimeout(this._startupTimer)
      if (this._stopTimer) clearTimeout(this._stopTimer)
      this._startupTimer = null
      this._stopTimer = null
      this._worker = null
      this._details.exitCode = code
      if (!this._disposed && !this._failure)
        this._fail(new Error(`RapidOCR CPU 意外退出 ${code}：${this._stderr.trim()}`))
      if (this._disposed) this._details.state = 'stopped'
    })
    this._startupTimer = setTimeout(
      () => this._fail(new Error('RapidOCR CPU 启动或推理预热超时')),
      this._options.startupTimeoutMs ?? 10000
    )
    await ready
  }

  private _receive(line: string, startupStarted: number) {
    const receivedAtNs = process.hrtime.bigint()
    try {
      const data = JSON.parse(line)
      if (data.type === 'ready') {
        if (
          !this._resolveReady ||
          data.backend !== this.backend ||
          data.warmupComplete !== true ||
          !Number.isFinite(data.warmupInferenceMs) ||
          data.warmupInferenceMs < 0 ||
          JSON.stringify(data.providers) !== JSON.stringify(['CPUExecutionProvider'])
        )
          throw new Error('RapidOCR CPU 未确认单CPU后端及真实推理预热')
        if (this._startupTimer) clearTimeout(this._startupTimer)
        this._details = {
          ...this._details,
          state: 'ready',
          preloadMs: performance.now() - startupStarted,
          workerStartupMs: data.workerStartupMs,
          importMs: data.importMs,
          modelInitMs: data.modelInitMs,
          warmupInferenceMs: data.warmupInferenceMs,
          timingClock: data.timingClock ?? null,
          completedRequests: 0
        }
        this._resolveReady()
        this._resolveReady = null
        this._rejectReady = null
        return
      }
      const pending = this._pending ?? this._expired
      if (!pending || data.id !== pending.id) throw new Error('RapidOCR CPU 响应帧编号不匹配')
      if (data.error) throw new Error(`RapidOCR CPU 后端失败：${String(data.error)}`)
      if (!Array.isArray(data.lines) || data.lines.length !== pending.count)
        throw new Error('RapidOCR CPU 返回标题数量不匹配')
      const lines: RapidOcrLine[] = data.lines.map((entry: unknown, index: number) => {
        const item = entry as Record<string, unknown>
        const rejection = item.inputRejection
        if (
          item.index !== index ||
          item.backend !== this.backend ||
          typeof item.text !== 'string' ||
          item.text.length > 128 ||
          (rejection !== undefined &&
            !['invalid-image', 'empty-title', 'truncated-title'].includes(String(rejection))) ||
          (rejection
            ? item.rawScore !== null || item.text !== ''
            : typeof item.rawScore !== 'number' ||
              !Number.isFinite(item.rawScore) ||
              item.rawScore < 0 ||
              item.rawScore > 1)
        )
          throw new Error('RapidOCR CPU 卡位、文字或原始分数协议无效')
        return {
          backend: this.backend,
          text: item.text,
          rawScore: item.rawScore as number | null,
          ...(rejection ? { inputRejection: rejection as RapidOcrLine['inputRejection'] } : {})
        }
      })
      // A valid but late response proves this worker drained the expired request.
      // Reuse it, but never resolve the old result into the current cards.
      if (pending === this._expired || performance.now() - pending.started > 1000) {
        if (!this._expired) this._timeout()
        this._details.lastTimedOutRequest = {
          id: pending.id,
          roundTripMs: performance.now() - pending.started,
          ...data.timing,
          ...this._pipeTiming(pending.sentAtNs, receivedAtNs, data)
        }
        this._finishRecovery('late-response')
        return
      }
      clearTimeout(pending.timer)
      this._pending = null
      this._details = {
        ...this._details,
        completedRequests: Number(this._details.completedRequests) + 1,
        inferenceCount: data.inferenceCount,
        lastRequest: {
          id: pending.id,
          imageCount: pending.count,
          encodeMs: pending.encodeMs,
          roundTripMs: performance.now() - pending.started,
          ...data.timing,
          ...this._pipeTiming(pending.sentAtNs, receivedAtNs, data)
        }
      }
      pending.resolve(lines)
    } catch (cause) {
      this._fail(cause instanceof Error ? cause : new Error(String(cause)))
    }
  }

  private _pipeTiming(
    sentAtNs: bigint,
    receivedAtNs: bigint,
    data: { workerReadNs?: string; workerFinishedNs?: string }
  ) {
    // CPython monotonic_ns and libuv hrtime share Windows QPC. Keep unknown timing
    // explicit for legacy workers; timing never decides recognition or freshness.
    if (
      this._details.timingClock === 'win32-qpc-ns' &&
      typeof data.workerReadNs === 'string' &&
      /^\d{1,20}$/.test(data.workerReadNs) &&
      typeof data.workerFinishedNs === 'string' &&
      /^\d{1,20}$/.test(data.workerFinishedNs)
    ) {
      const readAtNs = BigInt(data.workerReadNs)
      const finishedAtNs = BigInt(data.workerFinishedNs)
      if (sentAtNs <= readAtNs && readAtNs <= finishedAtNs && finishedAtNs <= receivedAtNs) {
        return {
          inputWaitMs: Number(readAtNs - sentAtNs) / 1e6,
          returnWaitMs: Number(receivedAtNs - finishedAtNs) / 1e6,
          timingClockValid: true
        }
      }
    }
    return { inputWaitMs: null, returnWaitMs: null, timingClockValid: false }
  }

  async recognize(images: readonly Buffer[]) {
    if (this._disposed) throw new Error('RapidOCR CPU 已停止')
    if (this._recovering) throw new Error('RapidOCR CPU 正在恢复；等待下一帧重试')
    if (this._failure) throw this._failure
    if (this._busy) throw new Error('RapidOCR CPU 正在识别上一帧')
    if (!images.length || images.length > 3 || images.some((image) => image.length > 512 * 1024))
      throw new Error('RapidOCR CPU 只接受一至三个有界标题PNG')
    this._busy = true
    this._recovery = null
    try {
      await this.preload()
      const started = performance.now()
      const id = ++this._sequence
      const payload =
        JSON.stringify({
          type: 'recognize',
          id,
          images: images.map((image, index) => ({ index, png: image.toString('base64') }))
        }) + '\n'
      const encodeMs = performance.now() - started
      return await new Promise<RapidOcrLine[]>((resolve, reject) => {
        const timer = setTimeout(() => this._timeout(), 1000)
        this._pending = {
          id,
          count: images.length,
          started,
          encodeMs,
          sentAtNs: process.hrtime.bigint(),
          timer,
          resolve,
          reject
        }
        this._worker!.stdin.write(payload)
      })
    } finally {
      this._busy = false
    }
  }

  private _timeout() {
    if (this._disposed || this._recovering || !this._pending) return
    const cause = new Error('RapidOCR CPU 标题请求超时；正在恢复，等待下一帧重试')
    this._failure = cause
    this._recovering = true
    this._expired = this._pending
    this._pending = null
    clearTimeout(this._expired.timer)
    this._details = {
      ...this._details,
      state: 'recovering',
      recoveryPhase: 'draining',
      failure: cause.message,
      retryable: true,
      restartAttempts: this._restartAttempts
    }
    this._recovery = new Promise<void>((resolve, reject) => {
      this._resolveRecovery = resolve
      this._rejectRecovery = reject
    })
    // Recovery may finish before its caller's rejection handler is dispatched.
    void this._recovery.catch(() => {})
    this._expired.reject(cause)
    this._recoveryTimer = setTimeout(() => void this._replaceTimedOutWorker(), 1500)
  }

  private async _replaceTimedOutWorker() {
    this._recoveryTimer = null
    this._expired = null
    this._details.recoveryPhase = 'stopping'
    const child = this._worker
    try {
      if (child) {
        // Never spawn a replacement before the owned old process is confirmed closed.
        await new Promise<void>((resolve, reject) => {
          const finish = (cause?: Error) => {
            if (this._recoveryTimer) clearTimeout(this._recoveryTimer)
            this._recoveryTimer = null
            child.removeListener('close', closed)
            this._cancelStopWait = null
            if (cause) reject(cause)
            else resolve()
          }
          const closed = () => finish()
          this._cancelStopWait = finish
          child.once('close', closed)
          this._recoveryTimer = setTimeout(() => {
            finish(new Error('旧 OCR 进程未确认退出'))
          }, 2500)
          this._stopWorker()
        })
      }
      if (this._disposed || !this._recovering) return
      if (this._restartAttempts >= 1) throw new Error('本次启动的自动重启次数已用完')
      this._restartAttempts++
      this._failure = null
      this._initializing = this._start()
      await this._initializing
      if (!this._disposed && this._recovering) this._finishRecovery('worker-restarted')
    } catch (cause) {
      this._fail(cause instanceof Error ? cause : new Error(String(cause)))
    }
  }

  private _finishRecovery(outcome: 'late-response' | 'worker-restarted') {
    if (!this._recovering || this._disposed) return
    if (this._recoveryTimer) clearTimeout(this._recoveryTimer)
    this._recoveryTimer = null
    this._expired = null
    this._failure = null
    this._recovering = false
    this._details = {
      ...this._details,
      state: 'ready',
      failure: null,
      retryable: false,
      recoveryPhase: null,
      recoveryOutcome: outcome,
      restartAttempts: this._restartAttempts
    }
    this._resolveRecovery?.()
    this._resolveRecovery = null
    this._rejectRecovery = null
  }

  private _fail(cause: Error) {
    if ((this._failure && !this._recovering) || this._disposed) return
    if (!this._recovering) this._recovery = null
    if (this._recovering) {
      cause = new Error(
        `RapidOCR CPU 自动恢复失败；请退出并重新打开 Veyra Assist 重试：${cause.message}`,
        { cause }
      )
      this._details = { ...this._details, retryable: true, retryAction: 'restart-app' }
    }
    this._recovering = false
    this._expired = null
    this._cancelStopWait?.(cause)
    if (this._recoveryTimer) clearTimeout(this._recoveryTimer)
    this._recoveryTimer = null
    this._rejectRecovery?.(cause)
    this._resolveRecovery = null
    this._rejectRecovery = null
    this._failure = cause
    this._details = { ...this._details, state: 'failed', failure: cause.message }
    if (this._startupTimer) clearTimeout(this._startupTimer)
    this._rejectReady?.(cause)
    this._resolveReady = null
    this._rejectReady = null
    if (this._pending) {
      clearTimeout(this._pending.timer)
      this._pending.reject(cause)
      this._pending = null
    }
    this._stopWorker()
  }

  private _stopWorker() {
    const child = this._worker
    if (!child || this._stopTimer) return
    if (!child.stdin.destroyed) child.stdin.end('{"type":"stop"}\n')
    // Only this executor's owned helper can be terminated after a bounded graceful stop.
    this._stopTimer = setTimeout(() => {
      if (this._worker === child) child.kill()
    }, 1500)
    this._stopTimer.unref()
  }

  dispose() {
    if (this._disposed) return
    this._disposed = true
    const cause = new Error('RapidOCR CPU 已停止')
    this._cancelStopWait?.(cause)
    if (this._recoveryTimer) clearTimeout(this._recoveryTimer)
    this._recoveryTimer = null
    this._expired = null
    this._recovering = false
    this._rejectRecovery?.(cause)
    this._resolveRecovery = null
    this._rejectRecovery = null
    if (this._startupTimer) clearTimeout(this._startupTimer)
    this._rejectReady?.(cause)
    if (this._pending) {
      clearTimeout(this._pending.timer)
      this._pending.reject(cause)
      this._pending = null
    }
    this._details.state = 'stopping'
    this._stopWorker()
  }
}
