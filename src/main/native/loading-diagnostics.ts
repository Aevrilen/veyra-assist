import { performance } from 'node:perf_hooks'

export type LoadingNativeApi =
  'getPidsByName' | 'isProcessForeground' | 'getGameClientWindowSnapshot'
export type LoadingNativeSource = 'game-client' | 'league-client' | 'other'
type State = 'prepared' | 'recording' | 'flushing' | 'completed' | 'cancelled' | 'failed'
type Event = Record<string, string | number | boolean | null>
interface Aggregate {
  api: LoadingNativeApi
  source: LoadingNativeSource
  calls: number
  errors: number
  totalMs: number
  maxMs: number
}
export interface LoadingDiagnosticReport {
  preparedAt: number
  startedAt: number | null
  finishedAt: number
  durationLimitMs: 20000
  elapsedMs: number
  reason: string
  actualWorldEntryRecorded: false
  events: Event[]
  droppedEvents: number
  cleanupFailed: boolean
  native: Aggregate[]
}
export interface LoadingDiagnosticOptions {
  getPhase(): unknown
  getGameId(): number | null
  onPhase(listener: (phase: unknown) => void): () => void
  onSessionChange(listener: () => void): () => void
  onExit(listener: () => void): () => void
  write(report: LoadingDiagnosticReport): Promise<void>
}
const phases = new Set([
  'None',
  'Lobby',
  'Matchmaking',
  'ReadyCheck',
  'ChampSelect',
  'GameStart',
  'InProgress',
  'Reconnect',
  'WaitingForStats',
  'EndOfGame',
  'TerminatedInError'
])
const phaseName = (value: unknown) =>
  typeof value === 'string' && phases.has(value) ? value : 'Unknown'
let prepared: LoadingDiagnostic | null = null
let active: LoadingDiagnostic | null = null
export const loadingDiagnosticsRecording = () => active !== null

export function measureLoadingNativeCall<T>(
  api: LoadingNativeApi,
  source: LoadingNativeSource,
  operation: () => T
): T {
  const recorder = active
  if (!recorder) return operation()
  const started = performance.now()
  let failed = false
  try {
    return operation()
  } catch (error) {
    failed = true
    throw error
  } finally {
    recorder.recordNative(api, source, performance.now() - started, failed)
  }
}

export function prepareLoadingDiagnostics(options: LoadingDiagnosticOptions) {
  if (prepared && ['prepared', 'recording', 'flushing'].includes(prepared.state))
    throw new Error('A loading diagnostic is already prepared or active')
  prepared = new LoadingDiagnostic(options)
  return prepared
}

export class LoadingDiagnostic {
  state: State = 'prepared'
  private readonly _preparedAt = Date.now()
  private _startedAt: number | null = null
  private _startMonotonic = 0
  private _phase: string
  private _gameId: number | null = null // Compare only; never include a match/player identity in output.
  private _events: Event[] = []
  private _dropped = 0
  private _native = new Map<string, Aggregate>()
  private _firstCalls = 0
  private _heartbeat: ReturnType<typeof setInterval> | null = null
  private _deadline: ReturnType<typeof setTimeout> | null = null
  private _nextHeartbeat = 0
  private _unsubscribers: Array<() => void> = []
  private _resolve!: (report: LoadingDiagnosticReport & { writeSucceeded: boolean }) => void
  readonly done = new Promise<LoadingDiagnosticReport & { writeSucceeded: boolean }>((resolve) => {
    this._resolve = resolve
  })

  constructor(private readonly _options: LoadingDiagnosticOptions) {
    this._phase = phaseName(_options.getPhase())
    this._unsubscribers.push(_options.onPhase((phase) => this._onPhase(phase)))
    this._unsubscribers.push(
      _options.onSessionChange(() => {
        if (this.state !== 'recording') return
        const value = _options.getGameId()
        const id = Number.isSafeInteger(value) && value! > 0 ? value : null
        if (this._gameId !== null && id !== null && id !== this._gameId)
          void this._finish('session-changed')
        else if (this._gameId === null) this._gameId = id
      })
    )
    this._unsubscribers.push(
      _options.onExit(() => {
        void this._finish('app-exit')
      })
    )
  }
  get status() {
    return {
      state: this.state,
      preparedAt: this._preparedAt,
      startedAt: this._startedAt,
      eventCount: this._events.length,
      droppedEvents: this._dropped
    }
  }
  cancel() {
    return this._finish(this.state === 'prepared' ? 'cancelled-before-start' : 'cancelled')
  }

  private _event(event: Event) {
    if (this._events.length < 128) this._events.push(event)
    else this._dropped++
  }
  private _onPhase(value: unknown) {
    const phase = phaseName(value),
      previous = this._phase
    this._phase = phase
    if (this.state === 'prepared') {
      if (phase === 'GameStart' && previous !== 'GameStart') this._begin()
      return
    }
    if (this.state !== 'recording') return
    this._event({ kind: 'phase', phase, elapsedMs: performance.now() - this._startMonotonic })
    if (
      !['GameStart', 'InProgress', 'Reconnect'].includes(phase) ||
      (phase === 'GameStart' && previous !== 'GameStart')
    )
      void this._finish('phase-context-ended')
  }
  private _begin() {
    this.state = 'recording'
    this._startedAt = Date.now()
    this._startMonotonic = performance.now()
    // Bind the first post-trigger session event; the cached session may still be the previous game.
    this._gameId = null
    active = this
    this._event({ kind: 'phase', phase: 'GameStart', elapsedMs: 0 })
    this._nextHeartbeat = this._startMonotonic + 1000
    this._heartbeat = setInterval(() => {
      const now = performance.now()
      if (now - this._startMonotonic >= 20000) {
        void this._finish('time-limit')
        return
      }
      this._event({
        kind: 'event-loop-delay',
        elapsedMs: now - this._startMonotonic,
        delayMs: Math.max(0, now - this._nextHeartbeat)
      })
      this._nextHeartbeat = now + 1000
    }, 1000)
    this._heartbeat.unref()
    this._deadline = setTimeout(() => {
      void this._finish('time-limit')
    }, 20000)
    this._deadline.unref()
  }
  recordNative(
    api: LoadingNativeApi,
    source: LoadingNativeSource,
    durationMs: number,
    failed: boolean
  ) {
    if (this.state !== 'recording') return
    if (
      !['getPidsByName', 'isProcessForeground', 'getGameClientWindowSnapshot'].includes(api) ||
      !Number.isFinite(durationMs) ||
      durationMs < 0
    )
      return
    const safeSource: LoadingNativeSource =
      source === 'game-client' || source === 'league-client' ? source : 'other'
    const key = api + ':' + safeSource
    let total = this._native.get(key)
    if (!total) {
      total = { api, source: safeSource, calls: 0, errors: 0, totalMs: 0, maxMs: 0 }
      this._native.set(key, total)
    }
    total.calls++
    const error = failed === true
    total.errors += Number(error)
    total.totalMs += durationMs
    total.maxMs = Math.max(total.maxMs, durationMs)
    if (this._firstCalls++ < 5 || durationMs >= 50 || error)
      this._event({
        kind: 'native-call',
        api,
        source: safeSource,
        durationMs,
        failed: error,
        elapsedMs: performance.now() - this._startMonotonic
      })
    if (performance.now() - this._startMonotonic >= 20000) void this._finish('time-limit')
  }
  private async _finish(reason: string) {
    if (
      this.state === 'flushing' ||
      this.state === 'completed' ||
      this.state === 'cancelled' ||
      this.state === 'failed'
    )
      return this.done
    if (active === this) active = null
    if (this._heartbeat) clearInterval(this._heartbeat)
    if (this._deadline) clearTimeout(this._deadline)
    this._heartbeat = this._deadline = null
    this.state = 'flushing'
    let cleanupFailed = false
    for (const unsubscribe of this._unsubscribers.splice(0)) {
      try {
        unsubscribe()
      } catch {
        cleanupFailed = true
      }
    }
    const report: LoadingDiagnosticReport = {
      preparedAt: this._preparedAt,
      startedAt: this._startedAt,
      finishedAt: Date.now(),
      durationLimitMs: 20000,
      elapsedMs: this._startedAt === null ? 0 : performance.now() - this._startMonotonic,
      reason,
      actualWorldEntryRecorded: false,
      events: [...this._events],
      droppedEvents: this._dropped,
      cleanupFailed,
      native: Array.from(this._native.values(), (value) => ({ ...value }))
    }
    try {
      await this._options.write(report)
      this.state = reason.startsWith('cancelled') ? 'cancelled' : 'completed'
      this._resolve({ ...report, writeSucceeded: true })
    } catch {
      this.state = 'failed'
      this._resolve({ ...report, writeSucceeded: false })
    }
    return this.done
  }
}
