import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MayhemOcrExecutor } from './ocr-executor'

const createWorker = vi.hoisted(() => vi.fn())
vi.mock('tesseract.js', () => ({ createWorker, OEM: { LSTM_ONLY: 1 }, PSM: { SINGLE_LINE: '7' } }))
let directory: string
let executor: MayhemOcrExecutor
const worker = {
  recognize: vi.fn(),
  setParameters: vi.fn(),
  terminate: vi.fn()
}
beforeEach(() => {
  vi.clearAllMocks()
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mayhem-ocr-'))
  fs.writeFileSync(path.join(directory, 'chi_sim.traineddata'), Buffer.from('local-model-fixture'))
  worker.recognize.mockResolvedValue({ data: { text: ' 下雪天\n', confidence: 95 } })
  worker.setParameters.mockResolvedValue(undefined)
  worker.terminate.mockResolvedValue(undefined)
  createWorker.mockResolvedValue(worker)
  executor = new MayhemOcrExecutor(directory)
})
afterEach(() => {
  executor.dispose()
  fs.rmSync(directory, { recursive: true, force: true })
  vi.useRealTimers()
})
describe('local OCR worker lifecycle', () => {
  it('preloads the same local worker once without recognizing any image', async () => {
    await executor.preload()
    await executor.preload()
    expect(createWorker).toHaveBeenCalledTimes(1)
    expect(worker.recognize).not.toHaveBeenCalled()
    await executor.recognize([Buffer.from('png-fixture')])
    expect(createWorker).toHaveBeenCalledTimes(1)
    expect(worker.recognize).toHaveBeenCalledTimes(1)
  })
  it('shares pending initialization between preload and recognition', async () => {
    let resolve!: (value: typeof worker) => void
    createWorker.mockReturnValue(
      new Promise((done) => {
        resolve = done
      })
    )
    const warmup = executor.preload()
    const recognition = executor.recognize([Buffer.from('png-fixture')])
    await vi.waitFor(() => expect(createWorker).toHaveBeenCalledTimes(1))
    expect(worker.recognize).not.toHaveBeenCalled()
    resolve(worker)
    await Promise.all([warmup, recognition])
    expect(createWorker).toHaveBeenCalledTimes(1)
    expect(worker.recognize).toHaveBeenCalledTimes(1)
  })
  it('reports a missing preload model without retrying or recognizing', async () => {
    fs.unlinkSync(path.join(directory, 'chi_sim.traineddata'))
    await expect(executor.preload()).rejects.toThrow('模型不可读')
    await expect(executor.preload()).rejects.toThrow('模型不可读')
    await expect(executor.recognize([Buffer.from('png-fixture')])).rejects.toThrow('模型不可读')
    expect(createWorker).not.toHaveBeenCalled()
    expect(worker.recognize).not.toHaveBeenCalled()
  })
  it('terminates preload initialization that completes after disposal', async () => {
    let resolve!: (value: typeof worker) => void
    createWorker.mockReturnValue(
      new Promise((done) => {
        resolve = done
      })
    )
    const pending = executor.preload()
    const rejected = expect(pending).rejects.toThrow('已停止')
    await vi.waitFor(() => expect(createWorker).toHaveBeenCalledTimes(1))
    executor.dispose()
    resolve(worker)
    await rejected
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(worker.recognize).not.toHaveBeenCalled()
  })
  it('passes an explicit local model path and PNG buffers to a reused worker, and terminates on disposal', async () => {
    const image = Buffer.from('png-fixture')
    expect(await executor.recognize([image])).toEqual([{ text: '下雪天', confidence: 95 }])
    await executor.recognize([image])
    expect(createWorker).toHaveBeenCalledTimes(1)
    expect(createWorker.mock.calls[0][0]).toBe('chi_sim')
    expect(createWorker.mock.calls[0][2]).toMatchObject({
      langPath: directory,
      cacheMethod: 'none',
      gzip: false
    })
    expect(worker.recognize.mock.calls[0][0]).toBe(image)
    executor.dispose()
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    await expect(executor.recognize([image])).rejects.toThrow('已停止')
  })
  it('fails before spawning a worker when the packaged model is missing', async () => {
    fs.unlinkSync(path.join(directory, 'chi_sim.traineddata'))
    await expect(executor.recognize([Buffer.from('png-fixture')])).rejects.toThrow('模型不可读')
    expect(createWorker).not.toHaveBeenCalled()
  })
  it('terminates a timed out worker and reports failure on later calls', async () => {
    await executor.recognize([Buffer.from('png-fixture')])
    vi.useFakeTimers()
    worker.recognize.mockImplementation(() => new Promise(() => {}))
    const pending = executor.recognize([Buffer.from('png-fixture')])
    const rejected = expect(pending).rejects.toThrow('超时')
    await vi.advanceTimersByTimeAsync(8000)
    await rejected
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    await expect(executor.recognize([Buffer.from('png-fixture')])).rejects.toThrow('超时')
    expect(createWorker).toHaveBeenCalledTimes(1)
  })
  it('owns cancellation and terminates a worker that finishes initialization after disposal', async () => {
    let resolve!: (value: typeof worker) => void
    createWorker.mockReturnValue(
      new Promise((done) => {
        resolve = done
      })
    )
    const pending = executor.recognize([Buffer.from('png-fixture')])
    const rejected = expect(pending).rejects.toThrow('已停止')
    await vi.waitFor(() => expect(createWorker).toHaveBeenCalledTimes(1))
    executor.dispose()
    await rejected
    resolve(worker)
    await vi.waitFor(() => expect(worker.terminate).toHaveBeenCalledTimes(1))
    expect(worker.recognize).not.toHaveBeenCalled()
  })
})
