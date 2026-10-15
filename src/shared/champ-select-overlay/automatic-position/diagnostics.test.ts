import { describe, expect, it, vi } from 'vitest'

import {
  AutomaticPositionDiagnosticJournal,
  reportAutomaticPositionDiagnostic,
  sanitizeAutomaticPositionDiagnostic
} from './diagnostics'

describe('scalar diagnostic privacy boundary', () => {
  it('allows only fixed reason codes and finite scalar metrics', () => {
    expect(
      sanitizeAutomaticPositionDiagnostic({
        stage: 'provider',
        reason: 'bench-slot-edges',
        imageUrl: 'SECRET',
        sessionKey: 'SECRET',
        metrics: {
          width: 1280,
          height: Infinity,
          candidates: 3,
          foreground: true,
          imageUrl: 'SECRET',
          username: 'SECRET',
          displayId: 'SECRET',
          pixelCount: 'SECRET'
        }
      })
    ).toEqual({
      stage: 'provider',
      reason: 'bench-slot-edges',
      metrics: { width: 1280, candidates: 3, foreground: true }
    })
    expect(
      sanitizeAutomaticPositionDiagnostic({
        stage: 'provider',
        reason: 'SECRET',
        metrics: {}
      })
    ).toBeNull()
    expect(
      sanitizeAutomaticPositionDiagnostic({
        stage: 'toString',
        reason: 'SECRET',
        metrics: {}
      })
    ).toBeNull()
  })
  it('rejects object-valued enum fields and hostile getters without leaking or throwing', () => {
    expect(
      sanitizeAutomaticPositionDiagnostic({
        stage: { toString: () => 'provider', toJSON: () => 'PRIVATE' },
        reason: 'matched',
        metrics: {}
      })
    ).toBeNull()
    const hostile = {
      get stage() {
        throw new Error('PRIVATE')
      }
    }
    expect(sanitizeAutomaticPositionDiagnostic(hostile)).toBeNull()
    expect(
      sanitizeAutomaticPositionDiagnostic({
        stage: 'provider',
        reason: 'matched',
        metrics: new Proxy(
          {},
          {
            get() {
              throw new Error('PRIVATE')
            }
          }
        )
      })
    ).toBeNull()
  })
  it('does not let a broken sink change recognition control flow', () => {
    expect(() =>
      reportAutomaticPositionDiagnostic(
        () => {
          throw new Error('SECRET')
        },
        {
          stage: 'resolver',
          reason: 'no-observation',
          metrics: {}
        }
      )
    ).not.toThrow()
  })
})

describe('complete consecutive-poll aggregation', () => {
  const event = {
    stage: 'controller' as const,
    reason: 'waiting-selection' as const,
    metrics: { candidates: 0 }
  }
  it('emits first state immediately and flushes repeat count/time range before a change', () => {
    const sink = vi.fn(),
      journal = new AutomaticPositionDiagnosticJournal('synthetic-attempt', sink)
    journal.record(event, 100)
    journal.record({ ...event, metrics: { ...event.metrics, elapsedMs: 500 } }, 600)
    journal.record({ ...event, metrics: { ...event.metrics, elapsedMs: 1000 } }, 1100)
    expect(sink).toHaveBeenCalledTimes(1)
    expect(journal.snapshot()).toHaveLength(2)
    journal.record({ stage: 'controller', reason: 'waiting-portraits', metrics: {} }, 1600)
    expect(sink.mock.calls.map(([x]) => [x.reason, x.repeatCount, x.firstAt, x.lastAt])).toEqual([
      ['waiting-selection', 1, 100, 100],
      ['waiting-selection', 2, 600, 1100],
      ['waiting-portraits', 1, 1600, 1600]
    ])
    journal.flush()
    expect(sink).toHaveBeenCalledTimes(3)
  })
  it('retains every distinct transition without a hard event cap and flushes on ending', () => {
    const sink = vi.fn(),
      journal = new AutomaticPositionDiagnosticJournal('synthetic-attempt', sink)
    for (let n = 0; n < 100; n++) journal.record({ ...event, metrics: { candidates: n % 2 } }, n)
    journal.record({ ...event, metrics: { candidates: 1 } }, 100)
    journal.record({ ...event, metrics: { candidates: 1 } }, 101)
    journal.flush()
    expect(journal.snapshot()).toHaveLength(101)
    expect(journal.snapshot().at(-1)?.repeatCount).toBe(2)
  })
  it('copies retained records and survives logging errors', () => {
    const journal = new AutomaticPositionDiagnosticJournal('synthetic-attempt', () => {
      throw new Error('SECRET')
    })
    journal.record(event, 1)
    journal.snapshot()[0].metrics.candidates = 999
    expect(journal.snapshot()[0].metrics.candidates).toBe(0)
  })
})
