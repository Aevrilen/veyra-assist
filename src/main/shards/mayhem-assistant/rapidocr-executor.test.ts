import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMayhemOcrBackend } from './ocr-executor'
import { RapidOcrCpuExecutor } from './rapidocr-executor'

const spawn = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ spawn }))
let directory: string
let engine: RapidOcrCpuExecutor
let child: EventEmitter & {
  pid: number
  stdout: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> }
  stderr: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> }
  stdin: EventEmitter & {
    write: ReturnType<typeof vi.fn>
    end: ReturnType<typeof vi.fn>
    destroyed: boolean
  }
  kill: ReturnType<typeof vi.fn>
}
const image = Buffer.from('PNG fixture handled by mocked local worker')
function createChild() {
  return Object.assign(new EventEmitter(), {
    pid: 123,
    stdout: Object.assign(new EventEmitter(), { setEncoding: vi.fn() }),
    stderr: Object.assign(new EventEmitter(), { setEncoding: vi.fn() }),
    stdin: Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn(), destroyed: false }),
    kill: vi.fn()
  })
}
const ready = (timingClock?: string) =>
  child.stdout.emit(
    'data',
    JSON.stringify({
      type: 'ready',
      backend: 'rapidocr',
      warmupComplete: true,
      warmupInferenceMs: 240,
      providers: ['CPUExecutionProvider'],
      timingClock
    }) + '\n'
  )
const respond = (id: number, index = 0, rawScore = 0.96979) =>
  child.stdout.emit(
    'data',
    JSON.stringify({
      id,
      lines: [{ index, backend: 'rapidocr', text: '杀戮时间到了', rawScore }],
      timing: { workerMs: 80 },
      inferenceCount: id + 1
    }) + '\n'
  )
async function warmed(timingClock?: string) {
  const pending = engine.preload()
  await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1))
  ready(timingClock)
  await pending
}
beforeEach(() => {
  vi.clearAllMocks()
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rapidocr-worker-test-'))
  for (const file of ['python.exe', 'worker.py', 'model.onnx'])
    fs.writeFileSync(path.join(directory, file), 'local fixture')
  child = createChild()
  spawn.mockImplementation(() => child)
  engine = new RapidOcrCpuExecutor({
    pythonPath: path.join(directory, 'python.exe'),
    workerPath: path.join(directory, 'worker.py'),
    modelPath: path.join(directory, 'model.onnx')
  })
})
afterEach(() => {
  engine.dispose()
  child.emit('close', 0)
  vi.useRealTimers()
  vi.restoreAllMocks()
  if (!fs.realpathSync(directory).startsWith(fs.realpathSync(os.tmpdir()) + path.sep))
    throw new Error('Unexpected fixture directory')
  fs.rmSync(directory, { recursive: true, force: true })
})
describe('bounded owned CPU worker', () => {
  it('separates worker input and return dispatch waits in the shared Windows QPC clock', async () => {
    await warmed('win32-qpc-ns')
    const clock = vi.spyOn(process.hrtime, 'bigint').mockReturnValue(1000000000n)
    const pending = engine.recognize([image])
    await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalledTimes(1))
    clock.mockReturnValue(1115000000n)
    child.stdout.emit(
      'data',
      JSON.stringify({
        id: 1,
        lines: [{ index: 0, backend: 'rapidocr', text: '杀戮时间到了', rawScore: 0.96 }],
        timing: { decodeCropMs: 5, recognitionMs: 75, workerMs: 80 },
        workerReadNs: '1010000000',
        workerFinishedNs: '1090000000',
        inferenceCount: 2
      }) + '\n'
    )
    expect(await pending).toEqual([{ backend: 'rapidocr', text: '杀戮时间到了', rawScore: 0.96 }])
    expect(engine.diagnostics().lastRequest).toMatchObject({
      inputWaitMs: 10,
      returnWaitMs: 25,
      recognitionMs: 75,
      timingClockValid: true
    })
  })
  it.each(['legacy', 'clock-order', 'invalid-timestamp'])(
    'keeps timing unavailable without changing recognition for %s responses',
    async (mode) => {
      await warmed(mode === 'legacy' ? undefined : 'win32-qpc-ns')
      vi.spyOn(process.hrtime, 'bigint').mockReturnValue(1000000000n)
      const pending = engine.recognize([image])
      await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalledTimes(1))
      child.stdout.emit(
        'data',
        JSON.stringify({
          id: 1,
          lines: [{ index: 0, backend: 'rapidocr', text: '杀戮时间到了', rawScore: 0.96 }],
          timing: { workerMs: 80 },
          workerReadNs: mode === 'invalid-timestamp' ? 'not-a-clock' : '1010000000',
          workerFinishedNs: '1090000000',
          inferenceCount: 2
        }) + '\n'
      )
      expect((await pending)[0].rawScore).toBe(0.96)
      expect(engine.diagnostics().lastRequest).toMatchObject({
        inputWaitMs: null,
        returnWaitMs: null,
        timingClockValid: false
      })
      expect(engine.diagnostics().state).toBe('ready')
    }
  )
  it('preload resolves only after acknowledged real inference warmup; same inputs still infer twice', async () => {
    const first = engine.preload(),
      second = engine.preload()
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1))
    expect(child.stdin.write).not.toHaveBeenCalled()
    ready()
    await Promise.all([first, second])
    for (const id of [1, 2]) {
      const pending = engine.recognize([image])
      await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalledTimes(id))
      respond(id)
      expect(await pending).toEqual([
        { backend: 'rapidocr', text: '杀戮时间到了', rawScore: 0.96979 }
      ])
    }
    expect(engine.diagnostics()).toMatchObject({ completedRequests: 2, inferenceCount: 3 })
    expect(spawn.mock.calls[0][2]).toMatchObject({ windowsHide: true })
  })
  it('rejects a parallel read without queuing or sending it', async () => {
    await warmed()
    const pending = engine.recognize([image])
    await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalledTimes(1))
    await expect(engine.recognize([image])).rejects.toThrow('上一帧')
    respond(1)
    await pending
    expect(child.stdin.write).toHaveBeenCalledTimes(1)
  })
  it('does not accept a worker that reports ready before real inference warmup', async () => {
    const pending = engine.preload()
    const rejected = expect(pending).rejects.toThrow('真实推理预热')
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1))
    child.stdout.emit(
      'data',
      JSON.stringify({
        type: 'ready',
        backend: 'rapidocr',
        warmupComplete: false,
        warmupInferenceMs: 0,
        providers: ['CPUExecutionProvider']
      }) + '\n'
    )
    await rejected
    expect(child.stdin.write).not.toHaveBeenCalled()
  })
  it('rejects a response past the deadline even before the timeout callback can run', async () => {
    await warmed()
    const started = performance.now()
    const pending = engine.recognize([image])
    const rejected = expect(pending).rejects.toThrow('请求超时')
    await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalledTimes(1))
    vi.spyOn(performance, 'now').mockReturnValue(started + 2000)
    respond(1)
    await rejected
    await expect(engine.recover()).resolves.toBe(true)
    expect(engine.diagnostics()).toMatchObject({ state: 'ready', recoveryOutcome: 'late-response' })
    expect(child.stdin.end).not.toHaveBeenCalled()
  })
  it.each(['frame-id', 'card-index', 'percent-score'] as const)(
    'fails closed on corrupted response: %s',
    async (corruption) => {
      await warmed()
      const pending = engine.recognize([image])
      const rejected = expect(pending).rejects.toThrow(/编号|协议/)
      await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalledTimes(1))
      respond(
        corruption === 'frame-id' ? 2 : 1,
        corruption === 'card-index' ? 1 : 0,
        corruption === 'percent-score' ? 95 : 0.96
      )
      await rejected
      await expect(engine.preload()).rejects.toThrow()
      expect(spawn).toHaveBeenCalledTimes(1)
      expect(engine.diagnostics().state).toBe('failed')
    }
  )
  it('drains a late response without applying it or queuing reads, then accepts a fresh request', async () => {
    await warmed()
    vi.useFakeTimers()
    const pending = engine.recognize([image])
    const rejected = expect(pending).rejects.toThrow('请求超时')
    await vi.advanceTimersByTimeAsync(1000)
    await rejected
    const recovering = engine.recover()
    await expect(engine.recognize([image])).rejects.toThrow('正在恢复')
    expect(child.stdin.write).toHaveBeenCalledTimes(1)
    respond(1)
    await expect(recovering).resolves.toBe(true)
    expect(child.stdin.end).not.toHaveBeenCalled()
    const fresh = engine.recognize([Buffer.from('fresh capture')])
    await vi.advanceTimersByTimeAsync(0)
    respond(2)
    expect(await fresh).toHaveLength(1)
    expect(engine.diagnostics()).toMatchObject({ state: 'ready', completedRequests: 1 })
    expect(spawn).toHaveBeenCalledTimes(1)
  })
  it('confirms old-worker cleanup before one restart and never starts a restart storm', async () => {
    await warmed()
    vi.useFakeTimers()
    const pending = engine.recognize([image])
    const rejected = expect(pending).rejects.toThrow('请求超时')
    await vi.advanceTimersByTimeAsync(1000)
    await rejected
    const recovering = engine.recover()
    await vi.advanceTimersByTimeAsync(1500)
    expect(child.stdin.end).toHaveBeenCalledWith('{"type":"stop"}\n')
    expect(child.kill).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1500)
    expect(child.kill).toHaveBeenCalledTimes(1)
    expect(spawn).toHaveBeenCalledTimes(1)
    const old = child
    child = createChild()
    old.emit('close', 0)
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2))
    ready()
    await expect(recovering).resolves.toBe(true)
    old.stdout.emit('data', '{"id":1,"lines":[]}\n')
    old.emit('close', 1)
    expect(engine.diagnostics()).toMatchObject({ state: 'ready', restartAttempts: 1 })
    const fresh = engine.recognize([image])
    await vi.advanceTimersByTimeAsync(0)
    respond(2)
    expect(await fresh).toHaveLength(1)

    const stalledAgain = engine.recognize([image])
    const secondRejected = expect(stalledAgain).rejects.toThrow('请求超时')
    await vi.advanceTimersByTimeAsync(1000)
    await secondRejected
    const recoveryFailed = expect(engine.recover()).rejects.toThrow('自动重启次数已用完')
    await vi.advanceTimersByTimeAsync(1500)
    child.emit('close', 0)
    await recoveryFailed
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(engine.recognize([image])).rejects.toThrow('重新打开 Veyra Assist 重试')
    }
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(engine.diagnostics()).toMatchObject({
      state: 'failed',
      retryable: true,
      retryAction: 'restart-app'
    })
  })
  it('reports retryable failure instead of replacing an old worker whose exit is unconfirmed', async () => {
    await warmed()
    vi.useFakeTimers()
    const rejected = expect(engine.recognize([image])).rejects.toThrow('请求超时')
    await vi.advanceTimersByTimeAsync(1000)
    await rejected
    const failed = expect(engine.recover()).rejects.toThrow('未确认退出')
    await vi.advanceTimersByTimeAsync(4000)
    await failed
    expect(child.kill).toHaveBeenCalledTimes(1)
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(engine.diagnostics()).toMatchObject({ state: 'failed', retryable: true })
  })
  it.each(['draining', 'stopping'])(
    'cancels recovery during %s on disposal and never restarts from a late response',
    async (phase) => {
      await warmed()
      vi.useFakeTimers()
      const rejected = expect(engine.recognize([image])).rejects.toThrow('请求超时')
      await vi.advanceTimersByTimeAsync(1000)
      await rejected
      const cancelled = expect(engine.recover()).rejects.toThrow('已停止')
      if (phase === 'stopping') await vi.advanceTimersByTimeAsync(1500)
      engine.dispose()
      respond(1)
      child.emit('close', 0)
      await cancelled
      await vi.advanceTimersByTimeAsync(5000)
      expect(spawn).toHaveBeenCalledTimes(1)
      expect(child.listenerCount('close')).toBe(1)
    }
  )
  it.each(['exit', 'dispose'] as const)(
    'rejects a waiting recovery caller when %s follows the drained response immediately',
    async (event) => {
      await warmed()
      vi.useFakeTimers()
      const rejected = expect(engine.recognize([image])).rejects.toThrow('请求超时')
      await vi.advanceTimersByTimeAsync(1000)
      await rejected
      const recovering = engine.recover()
      const failed = expect(recovering).rejects.toThrow(event === 'exit' ? '意外退出' : '已停止')
      respond(1)
      if (event === 'exit') child.emit('close', 1)
      else engine.dispose()
      await failed
      expect(spawn).toHaveBeenCalledTimes(1)
    }
  )
  it('does not report an earlier successful recovery after a later worker exit', async () => {
    await warmed()
    vi.useFakeTimers()
    const rejected = expect(engine.recognize([image])).rejects.toThrow('请求超时')
    await vi.advanceTimersByTimeAsync(1000)
    await rejected
    respond(1)
    await expect(engine.recover()).resolves.toBe(true)
    child.emit('close', 1)
    await expect(engine.recover()).resolves.toBe(false)
    await expect(engine.recognize([image])).rejects.toThrow('意外退出')
    expect(spawn).toHaveBeenCalledTimes(1)
  })
  it('disposal cancels initialization and ignores a late ready message', async () => {
    const pending = engine.preload()
    const rejected = expect(pending).rejects.toThrow('已停止')
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1))
    engine.dispose()
    ready()
    await rejected
    await expect(engine.recognize([image])).rejects.toThrow('已停止')
    expect(child.stdin.write).not.toHaveBeenCalled()
  })
  it('reports backend exit and missing model without silently selecting another backend', async () => {
    await warmed()
    const pending = engine.recognize([image])
    const rejected = expect(pending).rejects.toThrow('意外退出')
    await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalledTimes(1))
    child.stderr.emit('data', 'fixed local worker error')
    child.emit('close', 1)
    await rejected
    expect(engine.diagnostics()).toMatchObject({ state: 'failed', exitCode: 1 })
    engine = new RapidOcrCpuExecutor({ pythonPath: '', modelPath: '', workerPath: '' })
    await expect(engine.preload()).rejects.toThrow('缺少本地')
    expect(spawn).toHaveBeenCalledTimes(1)
  })
  it('default and explicit rollback select Tesseract without creating a Python process', () => {
    const fallback = createMayhemOcrBackend(directory, {})
    const rollback = createMayhemOcrBackend(directory, { AKARI_MAYHEM_OCR_BACKEND: 'tesseract' })
    expect(fallback.backend).toBe('tesseract')
    expect(rollback.backend).toBe('tesseract')
    expect(spawn).not.toHaveBeenCalled()
    fallback.dispose()
    rollback.dispose()
    expect(() =>
      createMayhemOcrBackend(directory, { AKARI_MAYHEM_OCR_BACKEND: 'unknown' })
    ).toThrow('未知')
  })
  it('resolves a selected RapidOCR from bundled relative files without a developer environment', async () => {
    const bundled = path.join(directory, 'rapidocr')
    fs.mkdirSync(bundled)
    fs.writeFileSync(path.join(bundled, 'python.exe'), '')
    fs.writeFileSync(path.join(bundled, 'ch_PP-OCRv4_rec_mobile.onnx'), '')
    fs.writeFileSync(path.join(directory, 'rapidocr-worker.py'), '')
    const portable = createMayhemOcrBackend(directory, { AKARI_MAYHEM_OCR_BACKEND: 'rapidocr' })
    try {
      const pending = portable.preload()
      await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1))
      ready()
      await pending
      expect(spawn.mock.calls[0][0]).toBe(path.join(bundled, 'python.exe'))
      expect(spawn.mock.calls[0][1]).toEqual([
        '-I',
        '-B',
        '-u',
        path.join(directory, 'rapidocr-worker.py'),
        '--model',
        path.join(bundled, 'ch_PP-OCRv4_rec_mobile.onnx')
      ])
    } finally {
      portable.dispose()
    }
  })
})
