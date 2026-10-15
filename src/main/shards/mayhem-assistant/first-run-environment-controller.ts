import type {
  FirstRunCalibrationStatus,
  FirstRunCheck,
  FirstRunCheckId,
  FirstRunEnvironmentStatus,
  FirstRunReasonCode,
  FirstRunResult
} from '@shared/types/first-run-environment'

const MAX_GAME_OBSERVATION_AGE_MS = 1500

export interface FirstRunGameObservation {
  observedAt: number
  windowStable: boolean
  displayCompatible: boolean
  foreground: boolean | null
  captureSucceeded: boolean
}

export interface FirstRunEnvironmentObservation {
  platform: string
  arch: string
  elevated: boolean
  nativeInitialized: boolean
  databaseInitialized: boolean
  dataDirectoryWritable?: boolean
  ocr: { started: boolean; ready: boolean; failed: boolean }
  clientConnected: boolean
  gameActive: boolean
  gameObservation: FirstRunGameObservation | null
  legacyCalibrationPresent: boolean
  calibration?: FirstRunCalibrationStatus
}

function check(
  id: FirstRunCheckId,
  result: FirstRunResult | null,
  reasonCode: FirstRunReasonCode
): FirstRunCheck {
  return result === null
    ? { id, evaluation: 'not-checked', result: null, reasonCode }
    : { id, evaluation: 'checked', result, reasonCode }
}

function unreportedCalibration(): FirstRunCalibrationStatus {
  return {
    route: null,
    phase: 'unreported',
    verified: false,
    method: null,
    reasonCode: 'calibration-unreported',
    supportedClientSizes: null
  }
}

// Reads observations only; it owns no IO, capture, OCR process, timer or hardware probe.
export function projectFirstRunEnvironmentStatus(
  observation: FirstRunEnvironmentObservation,
  now: number = Date.now()
): FirstRunEnvironmentStatus {
  const supported = observation.platform === 'win32' && observation.arch === 'x64'
  const local: FirstRunCheck[] = [
    check(
      'platform',
      supported ? 'available' : 'unsupported',
      supported ? 'platform-supported' : 'platform-unsupported'
    ),
    check(
      'native',
      supported ? (observation.nativeInitialized ? 'available' : null) : 'unsupported',
      supported
        ? observation.nativeInitialized
          ? 'native-initialized'
          : 'component-unobserved'
        : 'platform-unsupported'
    ),
    check(
      'database',
      observation.databaseInitialized ? 'available' : null,
      observation.databaseInitialized ? 'database-initialized' : 'component-unobserved'
    ),
    check(
      'data-directory',
      observation.dataDirectoryWritable === undefined
        ? null
        : observation.dataDirectoryWritable
          ? 'available'
          : 'needs-setup',
      observation.dataDirectoryWritable === undefined
        ? 'data-directory-unobserved'
        : observation.dataDirectoryWritable
          ? 'data-directory-writable'
          : 'data-directory-not-writable'
    ),
    check(
      'ocr',
      observation.ocr.failed ? 'needs-setup' : observation.ocr.ready ? 'available' : null,
      observation.ocr.failed
        ? 'ocr-failed'
        : observation.ocr.ready
          ? 'ocr-ready'
          : observation.ocr.started
            ? 'ocr-starting'
            : 'ocr-unprepared'
    )
  ]

  const game: FirstRunCheck[] = [
    check(
      'client-connection',
      observation.clientConnected ? 'available' : 'pending-game',
      observation.clientConnected ? 'client-connected' : 'client-waiting'
    )
  ]
  const gameObservation = observation.gameObservation
  const fresh =
    observation.clientConnected &&
    observation.gameActive &&
    gameObservation !== null &&
    gameObservation.observedAt > 0 &&
    gameObservation.observedAt <= now &&
    now - gameObservation.observedAt <= MAX_GAME_OBSERVATION_AGE_MS

  const gameCheckIds: FirstRunCheckId[] = ['game-window', 'client-display', 'foreground', 'capture']
  if (!supported) {
    game.push(...gameCheckIds.map((id) => check(id, 'unsupported', 'platform-unsupported')))
  } else if (!observation.clientConnected || !observation.gameActive) {
    game.push(...gameCheckIds.map((id) => check(id, 'pending-game', 'game-not-running')))
  } else if (!fresh || !gameObservation) {
    game.push(
      ...gameCheckIds.map((id) =>
        check(
          id,
          null,
          gameObservation ? 'game-observation-expired' : 'game-observation-unreported'
        )
      )
    )
  } else {
    game.push(
      check(
        'game-window',
        gameObservation.windowStable ? 'available' : null,
        gameObservation.windowStable ? 'game-window-ready' : 'game-window-unobserved'
      ),
      check(
        'client-display',
        gameObservation.displayCompatible ? 'available' : 'needs-setup',
        gameObservation.displayCompatible ? 'client-display-ready' : 'client-display-needs-setup'
      ),
      check(
        'foreground',
        gameObservation.foreground === null
          ? null
          : gameObservation.foreground
            ? 'available'
            : 'needs-setup',
        gameObservation.foreground === null
          ? 'game-observation-unreported'
          : gameObservation.foreground
            ? 'foreground-ready'
            : 'foreground-needed'
      ),
      check(
        'capture',
        gameObservation.captureSucceeded &&
          gameObservation.windowStable &&
          gameObservation.displayCompatible &&
          gameObservation.foreground === true
          ? 'available'
          : null,
        gameObservation.captureSucceeded &&
          gameObservation.windowStable &&
          gameObservation.displayCompatible &&
          gameObservation.foreground === true
          ? 'capture-observed'
          : 'capture-not-observed'
      )
    )
  }

  let calibration = unreportedCalibration()
  const source = observation.calibration
  if (source && source.route !== 'automatic-ready' && source.route !== 'fallback-ready') {
    calibration = {
      route: source.route,
      phase: source.phase,
      verified: false,
      method: null,
      reasonCode: source.reasonCode,
      supportedClientSizes:
        source.supportedClientSizes?.map(({ width, height }) => ({ width, height })) ?? null
    }
  } else if (
    source?.verified &&
    fresh &&
    gameObservation?.windowStable &&
    gameObservation.displayCompatible &&
    gameObservation.foreground === true &&
    gameObservation.captureSucceeded
  ) {
    calibration = {
      route: source.route,
      phase: 'idle',
      verified: true,
      method: source.method,
      reasonCode:
        source.route === 'fallback-ready' ? 'fallback-calibration-ready' : 'calibration-ready',
      supportedClientSizes:
        source.supportedClientSizes?.map(({ width, height }) => ({ width, height })) ?? null
    }
  }

  return {
    schemaVersion: 1,
    observedAt: now,
    appPrivilege: observation.elevated ? 'elevated' : 'standard',
    local,
    game,
    legacyCalibrationPresent: observation.legacyCalibrationPresent,
    calibration,
    guidedSampling: { available: false, reasonCode: 'guided-sampling-unavailable' }
  }
}

export class FirstRunEnvironmentController {
  constructor(private readonly _readObservation: () => FirstRunEnvironmentObservation) {}

  getStatus(): FirstRunEnvironmentStatus {
    try {
      return projectFirstRunEnvironmentStatus(this._readObservation())
    } catch {
      // IPC must not serialize a private path, credential or raw diagnostics error.
      const failure = new Error('First-run environment status unavailable')
      failure.stack = undefined
      throw failure
    }
  }
}
