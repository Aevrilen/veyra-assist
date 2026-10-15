import type { ChampSelectOverlaySettings } from '@shared/champ-select-overlay'
import {
  type AutomaticPositionContext,
  type AutomaticPositionObservation,
  AutomaticPositionResolver,
  automaticPositionContextKey
} from '@shared/champ-select-overlay/automatic-position'
import {
  AutomaticPositionDiagnosticJournal,
  type AutomaticPositionDiagnosticMetrics,
  type AutomaticPositionDiagnosticReason,
  type AutomaticPositionDiagnosticRecord,
  type AutomaticPositionDiagnosticSink
} from '@shared/champ-select-overlay/automatic-position/diagnostics'
import { randomUUID } from 'node:crypto'

export interface AutomaticPositionSnapshot {
  /** Monotonic main-process generation, incremented on connection/phase/session changes. No account ID. */
  epoch: number
  context: AutomaticPositionContext | null
  settings: ChampSelectOverlaySettings
  manualBusy: boolean
  waitingReason?:
    | 'waiting-client'
    | 'waiting-selection'
    | 'waiting-portraits'
    | 'waiting-foreground'
    | 'automatic-disabled'
}
export interface AutomaticPositionFrame<T> {
  payload: T
  context: AutomaticPositionContext
  epoch: number
  /** Explicit HWND-selected Electron window source, never our monitor-crop fallback. Backend atomicity is not asserted. */
  source: 'hwnd-selected-window'
  startedAt: number
  finishedAt: number
}
/** Portable cache contains geometry only, never source/session/account identity or pixels. */
export interface AutomaticPositionCache {
  version: 1
  provider: 'legacy-layout-v1'
  physicalWidth: number
  physicalHeight: number
  dipWidth: number
  dipHeight: number
  candidateFirstCenterX: number
  teammateFirstCenterY: number
  candidateStep: number
  teammateStep: number
}
interface Dependencies<T> {
  snapshot: () => AutomaticPositionSnapshot
  prepare?: (
    snapshot: AutomaticPositionSnapshot,
    diagnostic: AutomaticPositionDiagnosticSink
  ) => Promise<boolean>
  capture: (
    snapshot: AutomaticPositionSnapshot,
    diagnostic: AutomaticPositionDiagnosticSink
  ) => Promise<AutomaticPositionFrame<T> | null>
  observe: (
    frame: AutomaticPositionFrame<T>,
    sequence: number,
    diagnostic: AutomaticPositionDiagnosticSink
  ) => AutomaticPositionObservation | null | Promise<AutomaticPositionObservation | null>
  readCache: () => Promise<unknown>
  writeCache: (cache: AutomaticPositionCache) => Promise<unknown>
  /** Synchronous main-only runtime publication; the consumer must also validate its lease on read. */
  apply: (settings: ChampSelectOverlaySettings | null, lease?: AutomaticPositionSnapshot) => void
  diagnostic?: (record: AutomaticPositionDiagnosticRecord) => void
  now?: () => number
  wait?: (milliseconds: number) => Promise<void>
}
const hasManual = (s: ChampSelectOverlaySettings) =>
  s.candidateFirstCenterX !== null || s.teammateFirstCenterY !== null
const settingsKey = (s: ChampSelectOverlaySettings) => JSON.stringify(s)
const targetKey = (s: AutomaticPositionSnapshot) =>
  s.context ? JSON.stringify([s.epoch, automaticPositionContextKey(s.context)]) : ''
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
export function validAutomaticPositionCache(value: unknown): value is AutomaticPositionCache {
  if (!value || typeof value !== 'object') return false
  const c = value as AutomaticPositionCache
  return (
    c.version === 1 &&
    c.provider === 'legacy-layout-v1' &&
    [
      'physicalWidth',
      'physicalHeight',
      'dipWidth',
      'dipHeight',
      'candidateFirstCenterX',
      'teammateFirstCenterY',
      'candidateStep',
      'teammateStep'
    ].every(
      (key) =>
        Number.isFinite(c[key as keyof AutomaticPositionCache]) &&
        Number(c[key as keyof AutomaticPositionCache]) > 0 &&
        Number(c[key as keyof AutomaticPositionCache]) <= 4096
    )
  )
}
function cacheFor(
  context: AutomaticPositionContext,
  settings: ChampSelectOverlaySettings
): AutomaticPositionCache {
  return {
    version: 1,
    provider: 'legacy-layout-v1',
    physicalWidth: context.physicalClient.width,
    physicalHeight: context.physicalClient.height,
    dipWidth: context.dipClient.width,
    dipHeight: context.dipClient.height,
    candidateFirstCenterX: settings.candidateFirstCenterX!,
    teammateFirstCenterY: settings.teammateFirstCenterY!,
    candidateStep: settings.candidateStep,
    teammateStep: settings.teammateStep
  }
}
function equalCache(a: unknown, b: AutomaticPositionCache) {
  return (
    validAutomaticPositionCache(a) &&
    (Object.keys(b) as (keyof AutomaticPositionCache)[]).every((k) => a[k] === b[k])
  )
}

/** Automatic two-frame acquisition; no IPC capability, renderer images, account binding or game OCR. */
export class AutomaticPositionLifecycle<T> {
  private _timer: ReturnType<typeof setInterval> | null = null
  private _disposed = false
  private _busy = false
  private _key = ''
  private _stableAt = 0
  private _retryAt = 0
  private _failures = 0
  private _appliedKey = ''
  private _journal: AutomaticPositionDiagnosticJournal | null = null
  private _startedAt = 0
  private _cache: unknown = null
  private _cacheLoaded = false
  constructor(private readonly _deps: Dependencies<T>) {}
  private now() {
    return this._deps.now?.() ?? Date.now()
  }
  start() {
    if (this._timer || this._disposed) return
    this._timer = setInterval(() => void this.tick(), 250)
    void this.tick()
  }
  flush() {
    this._journal?.flush()
  }
  dispose() {
    this._disposed = true
    if (this._timer) clearInterval(this._timer)
    this._timer = null
    this.report('automatic-disposed')
    this.flush()
    this._deps.apply(null)
  }
  private report(
    reason: AutomaticPositionDiagnosticReason,
    metrics: AutomaticPositionDiagnosticMetrics = {}
  ) {
    this._journal?.record(
      {
        stage: 'controller',
        reason,
        metrics: { ...metrics, elapsedMs: this.now() - this._startedAt }
      },
      this.now()
    )
  }
  private currentMatches(original: AutomaticPositionSnapshot, requireForeground: boolean) {
    if (this._disposed) return false
    const latest = this._deps.snapshot()
    return (
      !latest.manualBusy &&
      !hasManual(latest.settings) &&
      targetKey(latest) === targetKey(original) &&
      settingsKey(latest.settings) === settingsKey(original.settings) &&
      latest.context?.phase === 'ChampSelect' &&
      (!requireForeground || latest.context.foreground)
    )
  }
  private validFrame(
    frame: AutomaticPositionFrame<T>,
    original: AutomaticPositionSnapshot,
    requestAt: number
  ) {
    return (
      frame.source === 'hwnd-selected-window' &&
      frame.epoch === original.epoch &&
      automaticPositionContextKey(frame.context) ===
        automaticPositionContextKey(original.context!) &&
      frame.context.foreground &&
      frame.context.phase === 'ChampSelect' &&
      Number.isFinite(frame.startedAt) &&
      Number.isFinite(frame.finishedAt) &&
      frame.startedAt >= requestAt &&
      frame.finishedAt >= frame.startedAt &&
      frame.finishedAt <= this.now() &&
      this.now() - frame.startedAt <= 1500
    )
  }
  async tick() {
    if (this._disposed) return
    let snapshot: AutomaticPositionSnapshot
    try {
      snapshot = clone(this._deps.snapshot())
    } catch {
      return
    }
    const key = targetKey(snapshot)
    // Invalidate presentation even while a previous pair is still being analysed/saved.
    if (
      this._appliedKey &&
      (key !== this._appliedKey || snapshot.manualBusy || hasManual(snapshot.settings))
    ) {
      this._deps.apply(null)
      this._appliedKey = ''
    }
    if (this._busy) return
    if (!this._journal || key !== this._key) {
      this.flush()
      this._startedAt = this.now()
      this._journal = new AutomaticPositionDiagnosticJournal(
        randomUUID(),
        this._deps.diagnostic,
        128
      )
      this._key = key
      this._stableAt = this.now()
      this._retryAt = 0
      this._failures = 0
      this.report('automatic-triggered')
    }
    if (snapshot.manualBusy || hasManual(snapshot.settings)) {
      this._stableAt = this.now()
      this.report(snapshot.manualBusy ? 'manual-editor-active' : 'automatic-manual-priority')
      return
    }
    if (
      !snapshot.context ||
      snapshot.context.phase !== 'ChampSelect' ||
      !snapshot.context.foreground
    ) {
      this._stableAt = this.now()
      this.report(snapshot.waitingReason ?? 'waiting-foreground')
      return
    }
    if (this._appliedKey === key) return
    if (this.now() < this._retryAt) {
      this.report('automatic-retry-wait')
      return
    }
    if (this.now() - this._stableAt < 500) {
      this.report('waiting-stable')
      return
    }
    this._busy = true
    let success = false
    let stage: 'prepare' | 'capture' | 'analysis' | 'save' | 'apply' = 'prepare'
    try {
      this.report('automatic-attempt-started')
      // Cache is never trusted as a new window's geometry without this attempt's two fresh checks.
      if (!this._cacheLoaded) {
        try {
          this._cache = await this._deps.readCache()
        } catch {
          this.report('automatic-cache-read-failed')
        }
        this._cacheLoaded = true
      }
      if (!this.currentMatches(snapshot, true)) {
        this.report('automatic-source-changed')
        return
      }
      const frames: AutomaticPositionFrame<T>[] = []
      const diagnostic: AutomaticPositionDiagnosticSink = (entry) =>
        this._journal?.record(entry, this.now())
      if (this._deps.prepare) {
        const started = this.now()
        this.report('automatic-prepare-started')
        const prepared = await this._deps.prepare(snapshot, diagnostic)
        this.report('automatic-prepare-finished', {
          prepareDurationMs: this.now() - started,
          succeeded: prepared
        })
        if (!prepared) return
      }
      stage = 'capture'
      for (let i = 0; i < 2; i++) {
        if (!this.currentMatches(snapshot, true)) {
          this.report('automatic-source-changed')
          return
        }
        const started = this.now()
        this.report('capture-started', { captureOrdinal: i + 1 })
        const frame = await this._deps.capture(snapshot, diagnostic)
        this.report('capture-finished', {
          captureOrdinal: i + 1,
          captureDurationMs: this.now() - started,
          observationPresent: !!frame
        })
        if (!frame || !this.validFrame(frame, snapshot, started)) {
          this.report('automatic-frame-rejected')
          return
        }
        if (!this.currentMatches(snapshot, true)) {
          this.report('automatic-source-changed')
          return
        }
        frames.push(frame)
        if (i === 0)
          await (this._deps.wait?.(250) ?? new Promise<void>((resolve) => setTimeout(resolve, 250)))
      }
      const admittedAt = this.now()
      if (
        frames[1].finishedAt <= frames[0].finishedAt ||
        admittedAt - frames[0].finishedAt > 1500
      ) {
        this.report('automatic-pair-stale')
        return
      }
      // Pair and acquisition-time admission are immutable. Closing the client does not cancel analysis.
      this.report('automatic-pair-sealed', {
        frameGapMs: frames[1].finishedAt - frames[0].finishedAt
      })
      stage = 'analysis'
      const resolver = new AutomaticPositionResolver()
      let proposal: ChampSelectOverlaySettings | null = null
      for (let i = 0; i < 2; i++) {
        const started = this.now()
        const observation = await this._deps.observe(frames[i], i + 1, diagnostic)
        this.report('automatic-analysis-finished', {
          sequence: i + 1,
          analysisDurationMs: this.now() - started,
          observationPresent: !!observation
        })
        // Use the sealed pair's admission time, not CPU completion time. The resolver's 1500ms
        // acquisition age/gap, confidence, ambiguity, independent-anchor and agreement rules remain intact.
        if (
          !observation ||
          observation.capturedAt !== frames[i].finishedAt ||
          observation.sequence !== i + 1
        ) {
          this.report('automatic-observation-rejected')
          return
        }
        const decision = resolver.evaluate({
          enabled: true,
          current: snapshot.context,
          settings: snapshot.settings,
          observation,
          now: admittedAt,
          diagnostic
        })
        if (
          (i === 0 && decision.kind !== 'confirming') ||
          (i === 1 && decision.kind !== 'suggestion')
        ) {
          this.report('automatic-analysis-rejected')
          return
        }
        if (decision.kind === 'suggestion') proposal = decision.settings
      }
      this.report('automatic-analysis-complete')
      if (!proposal || !this.currentMatches(snapshot, false)) {
        this.report('automatic-save-stale')
        return
      }
      stage = 'save'
      const cache = cacheFor(snapshot.context, proposal)
      if (!equalCache(this._cache, cache)) {
        const started = this.now()
        this.report('automatic-save-started')
        await this._deps.writeCache(cache)
        this._cache = cache
        this.report('automatic-save-finished', { saveDurationMs: this.now() - started })
      } else this.report('automatic-cache-reused')
      // A completed stale cache write is inert: reuse always requires a new two-frame verification.
      if (!this.currentMatches(snapshot, false)) {
        this.report('automatic-save-stale')
        return
      }
      stage = 'apply'
      this._deps.apply(proposal, snapshot)
      this._appliedKey = key
      this.report('automatic-applied')
      success = true
    } catch {
      const failures = {
        prepare: 'automatic-prepare-failed',
        capture: 'automatic-capture-failed',
        analysis: 'automatic-observer-failed',
        save: 'automatic-save-failed',
        apply: 'automatic-apply-failed'
      } as const
      this.report(failures[stage])
      this.report('automatic-attempt-failed')
    } finally {
      this._busy = false
      if (!success) {
        this._failures++
        this._retryAt = this.now() + Math.min(30000, 2000 * 2 ** Math.min(this._failures - 1, 4))
      }
      this.report('automatic-attempt-finished', { succeeded: success })
      this.flush()
      // A retry receives a fresh random correlation ID while the complete prior attempt is flushed.
      this._journal = new AutomaticPositionDiagnosticJournal(
        randomUUID(),
        this._deps.diagnostic,
        128
      )
      this._startedAt = this.now()
    }
  }
}
