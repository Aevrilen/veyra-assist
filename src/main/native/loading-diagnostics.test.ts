import { performance } from 'node:perf_hooks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  LoadingDiagnostic,
  type LoadingDiagnosticReport,
  type LoadingNativeSource,
  loadingDiagnosticsRecording,
  measureLoadingNativeCall,
  prepareLoadingDiagnostics
} from './loading-diagnostics'

const instances: LoadingDiagnostic[] = []
const fixture = (phase: unknown = 'Lobby') => {
  const phases = new Set<(phase: unknown) => void>(),
    sessions = new Set<() => void>(),
    exits = new Set<() => void>()
  let gameId: number | null = 1
  const write = vi
    .fn<(report: LoadingDiagnosticReport) => Promise<void>>()
    .mockResolvedValue(undefined)
  const recorder = prepareLoadingDiagnostics({
    getPhase: () => phase,
    getGameId: () => gameId,
    onPhase: (listener) => {
      phases.add(listener)
      return () => phases.delete(listener)
    },
    onSessionChange: (listener) => {
      sessions.add(listener)
      return () => sessions.delete(listener)
    },
    onExit: (listener) => {
      exits.add(listener)
      return () => exits.delete(listener)
    },
    write
  })
  instances.push(recorder)
  return {
    recorder,
    write,
    phase(value: unknown) {
      phase = value
      phases.forEach((listener) => listener(value))
    },
    session(value: number | null) {
      gameId = value
      sessions.forEach((listener) => listener())
    },
    exit() {
      exits.forEach((listener) => listener())
    },
    listeners: () => phases.size + sessions.size + exits.size
  }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
})
afterEach(async () => {
  await Promise.all(instances.splice(0).map((recorder) => recorder.cancel()))
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('explicit bounded loading diagnostics', () => {
  it('refuses duplicate preparation and does not time native calls before the trigger', async () => {
    const f = fixture()
    expect(() => fixture()).toThrow('already prepared')
    const clockCalls = vi.mocked(performance.now).mock.calls.length
    expect(measureLoadingNativeCall('isProcessForeground', 'other', () => false)).toBe(false)
    expect(vi.mocked(performance.now).mock.calls.length).toBe(clockCalls)
    await f.recorder.cancel()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('is inert while prepared, starts only on a later GameStart, and writes once after twenty seconds', async () => {
    const f = fixture()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(60000)
    expect(f.recorder.status.startedAt).toBeNull()
    const original = { private: 'PRIVATE_VALUE' }
    expect(measureLoadingNativeCall('getPidsByName', 'other', () => original)).toBe(original)
    expect(loadingDiagnosticsRecording()).toBe(false)
    f.phase('ChampSelect')
    expect(f.write).not.toHaveBeenCalled()
    f.phase('GameStart')
    expect(f.recorder.status.startedAt).toBe(60000)
    f.phase('InProgress')
    expect(loadingDiagnosticsRecording()).toBe(true)
    await vi.advanceTimersByTimeAsync(20000)
    const report = await f.recorder.done
    expect(report.reason).toBe('time-limit')
    expect(report.actualWorldEntryRecorded).toBe(false)
    expect(
      report.events.filter((event) => event.kind === 'event-loop-delay').length
    ).toBeLessThanOrEqual(20)
    expect(f.write).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    expect(f.listeners()).toBe(0)
    f.phase('GameStart')
    await vi.advanceTimersByTimeAsync(20000)
    expect(f.write).toHaveBeenCalledTimes(1)
  })
  it('does not trigger from a duplicated current GameStart and permits cancellation before trigger', async () => {
    const f = fixture('GameStart')
    f.phase('GameStart')
    expect(f.recorder.state).toBe('prepared')
    expect(vi.getTimerCount()).toBe(0)
    const report = await f.recorder.cancel()
    expect(report.reason).toBe('cancelled-before-start')
    expect(report.startedAt).toBeNull()
    expect(f.listeners()).toBe(0)
    expect(f.write).toHaveBeenCalledTimes(1)
  })
  it('preserves native values and exact thrown errors while aggregating only allowed scalar metadata', async () => {
    const f = fixture()
    f.phase('GameStart')
    const value = { secret: 'PRIVATE_RETURN' }
    expect(
      measureLoadingNativeCall('getPidsByName', 'game-client', () => {
        vi.setSystemTime(12)
        return value
      })
    ).toBe(value)
    const error = new Error('PRIVATE_ERROR')
    expect(() =>
      measureLoadingNativeCall(
        'isProcessForeground',
        'PRIVATE_SOURCE' as LoadingNativeSource,
        () => {
          vi.setSystemTime(72)
          throw error
        }
      )
    ).toThrow(error)
    const report = await f.recorder.cancel()
    expect(report.native).toEqual(
      expect.arrayContaining([
        {
          api: 'getPidsByName',
          source: 'game-client',
          calls: 1,
          errors: 0,
          totalMs: 12,
          maxMs: 12
        },
        { api: 'isProcessForeground', source: 'other', calls: 1, errors: 1, totalMs: 60, maxMs: 60 }
      ])
    )
    expect(JSON.stringify(report)).not.toContain('PRIVATE_')
    expect(loadingDiagnosticsRecording()).toBe(false)
  })
  it('caps events at 128 while preserving aggregates and a dropped count', async () => {
    const f = fixture()
    f.phase('GameStart')
    for (let index = 0; index < 300; index++)
      f.recorder.recordNative('getGameClientWindowSnapshot', 'game-client', 51, false)
    const report = await f.recorder.cancel()
    expect(report.events).toHaveLength(128)
    expect(report.droppedEvents).toBeGreaterThan(0)
    expect(report.native[0].calls).toBe(300)
    expect(f.write).toHaveBeenCalledTimes(1)
  })
  it.each(['Lobby', 'EndOfGame', 'None', 'PRIVATE_PHASE'])(
    'cleans up on ending phase %s without emitting raw phase data',
    async (phase) => {
      const f = fixture()
      f.phase('GameStart')
      f.phase(phase)
      const report = await f.recorder.done
      expect(report.reason).toBe('phase-context-ended')
      expect(JSON.stringify(report)).not.toContain('PRIVATE_')
      expect(f.listeners()).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    }
  )
  it('binds post-trigger session once then cleans up on a changed game', async () => {
    const f = fixture()
    f.phase('GameStart')
    f.session(2)
    expect(f.recorder.state).toBe('recording')
    f.session(3)
    const report = await f.recorder.done
    expect(report.reason).toBe('session-changed')
    expect(f.listeners()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(JSON.stringify(report)).not.toContain('gameId')
  })
  it('cleans up immediately on exit even if its single async write fails', async () => {
    const f = fixture()
    f.write.mockRejectedValue(new Error('PRIVATE_DISK_ERROR'))
    f.phase('GameStart')
    f.exit()
    expect(vi.getTimerCount()).toBe(0)
    expect(f.listeners()).toBe(0)
    const report = await f.recorder.done
    expect(report.writeSucceeded).toBe(false)
    expect(f.recorder.state).toBe('failed')
    expect(f.write).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(report)).not.toContain('PRIVATE_')
  })
  it('cleans up prepared subscriptions on exit with no recording or timer', async () => {
    const f = fixture()
    f.exit()
    const report = await f.recorder.done
    expect(report.startedAt).toBeNull()
    expect(report.reason).toBe('app-exit')
    expect(report.events).toHaveLength(0)
    expect(f.listeners()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(f.write).toHaveBeenCalledTimes(1)
  })
  it('keeps native work uninstrumented while its one final write remains pending', async () => {
    const f = fixture()
    let resolve!: () => void
    f.write.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done
        })
    )
    f.phase('GameStart')
    const pending = f.recorder.cancel()
    expect(f.recorder.state).toBe('flushing')
    expect(loadingDiagnosticsRecording()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(f.listeners()).toBe(0)
    expect(measureLoadingNativeCall('getPidsByName', 'other', () => [1])).toEqual([1])
    resolve()
    await pending
    expect(f.write).toHaveBeenCalledTimes(1)
  })
  it('reports event-loop delay and releases resources after a synchronous call crosses the deadline', async () => {
    const f = fixture()
    f.phase('GameStart')
    vi.setSystemTime(2300)
    await vi.advanceTimersByTimeAsync(1000)
    measureLoadingNativeCall('isProcessForeground', 'game-client', () => {
      vi.setSystemTime(23000)
      return true
    })
    const report = await f.recorder.done
    expect(
      report.events.some((event) => event.kind === 'event-loop-delay' && Number(event.delayMs) > 0)
    ).toBe(true)
    expect(report.elapsedMs).toBeGreaterThanOrEqual(20000)
    expect(report.reason).toBe('time-limit')
    expect(vi.getTimerCount()).toBe(0)
    expect(loadingDiagnosticsRecording()).toBe(false)
  })
})
