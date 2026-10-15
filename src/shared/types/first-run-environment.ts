export const FIRST_RUN_ENVIRONMENT_STATUS_CALL = 'getFirstRunEnvironmentStatus'
export const GUIDED_CALIBRATION_SAMPLE_CALL = 'startGuidedCalibrationSample'

export type FirstRunResult = 'available' | 'needs-setup' | 'pending-game' | 'unsupported'
export type FirstRunCheckId =
  | 'platform'
  | 'native'
  | 'database'
  | 'data-directory'
  | 'ocr'
  | 'client-connection'
  | 'game-window'
  | 'client-display'
  | 'foreground'
  | 'capture'

export type FirstRunReasonCode =
  | 'platform-supported'
  | 'platform-unsupported'
  | 'native-initialized'
  | 'component-unobserved'
  | 'database-initialized'
  | 'data-directory-unobserved'
  | 'data-directory-writable'
  | 'data-directory-not-writable'
  | 'ocr-ready'
  | 'ocr-failed'
  | 'ocr-starting'
  | 'ocr-unprepared'
  | 'client-connected'
  | 'client-waiting'
  | 'game-not-running'
  | 'game-observation-unreported'
  | 'game-observation-expired'
  | 'game-window-ready'
  | 'game-window-unobserved'
  | 'client-display-ready'
  | 'client-display-needs-setup'
  | 'foreground-ready'
  | 'foreground-needed'
  | 'capture-observed'
  | 'capture-not-observed'
  | 'calibration-unreported'
  | 'calibration-ready'
  | 'fallback-calibration-ready'
  | 'guided-sample-needed'
  | 'calibration-unsupported'
  | 'guided-sampling-unavailable'

export type FirstRunCheck = {
  id: FirstRunCheckId
  reasonCode: FirstRunReasonCode
} & (
  { evaluation: 'not-checked'; result: null } | { evaluation: 'checked'; result: FirstRunResult }
)

export type FirstRunCalibrationRoute =
  'automatic-ready' | 'fallback-ready' | 'guided-sample-needed' | 'unsupported'
export type FirstRunCalibrationPhase =
  'unreported' | 'waiting-game' | 'locating' | 'sampling' | 'validating' | 'idle' | 'failed'

export interface FirstRunCalibrationStatus {
  route: FirstRunCalibrationRoute | null
  phase: FirstRunCalibrationPhase
  verified: boolean
  method: 'automatic' | 'guided-sample' | 'fallback' | null
  reasonCode: FirstRunReasonCode
  supportedClientSizes: ReadonlyArray<{ width: number; height: number }> | null
}

export interface FirstRunEnvironmentStatus {
  schemaVersion: 1
  observedAt: number
  appPrivilege: 'standard' | 'elevated'
  local: FirstRunCheck[]
  game: FirstRunCheck[]
  legacyCalibrationPresent: boolean
  calibration: FirstRunCalibrationStatus
  guidedSampling: {
    available: false
    reasonCode: 'guided-sampling-unavailable'
  }
}

// Contract only. The query and panel never invoke an unimplemented sampling action.
export type StartGuidedCalibrationSample = () => Promise<{
  result: 'not-available'
  reasonCode: 'guided-sampling-unavailable'
}>
