import {
  FIRST_RUN_ENVIRONMENT_STATUS_CALL,
  type FirstRunCalibrationStatus,
  GUIDED_CALIBRATION_SAMPLE_CALL
} from '@shared/types/first-run-environment'
import { describe, expect, it, vi } from 'vitest'

import { toIpcErrorResponse } from '../ipc/error-response-factory'
import {
  FirstRunEnvironmentController,
  type FirstRunEnvironmentObservation,
  projectFirstRunEnvironmentStatus
} from './first-run-environment-controller'
import { MayhemIpcHandlers } from './ipc-handlers'

function observation(): FirstRunEnvironmentObservation {
  return {
    platform: 'win32',
    arch: 'x64',
    elevated: false,
    nativeInitialized: true,
    databaseInitialized: true,
    ocr: { started: false, ready: false, failed: false },
    clientConnected: false,
    gameActive: false,
    gameObservation: null,
    legacyCalibrationPresent: false
  }
}

function activeObservation(): FirstRunEnvironmentObservation {
  return {
    ...observation(),
    clientConnected: true,
    gameActive: true,
    gameObservation: {
      observedAt: 1000,
      windowStable: true,
      displayCompatible: true,
      foreground: true,
      captureSucceeded: true
    }
  }
}

function verifiedCalibration(): FirstRunCalibrationStatus {
  return {
    route: 'automatic-ready',
    phase: 'idle',
    verified: true,
    method: 'automatic',
    reasonCode: 'calibration-ready',
    supportedClientSizes: [{ width: 1920, height: 1080 }]
  }
}

describe('first-run observation projection', () => {
  it('keeps missing game, warmup, directory and calibration observations pending', () => {
    const status = projectFirstRunEnvironmentStatus(observation(), 1000)
    expect(status.appPrivilege).toBe('standard')
    expect(status.local.filter((row) => row.result === 'needs-setup')).toEqual([])
    expect(status.local.find((row) => row.id === 'data-directory')).toMatchObject({
      evaluation: 'not-checked',
      result: null
    })
    expect(status.local.find((row) => row.id === 'ocr')).toMatchObject({
      result: null,
      reasonCode: 'ocr-unprepared'
    })
    expect(status.game.every((row) => row.result === 'pending-game')).toBe(true)
    expect(status.calibration).toMatchObject({ route: null, phase: 'unreported', verified: false })
    expect(status.guidedSampling.available).toBe(false)
  })

  it('distinguishes OCR starting, ready and observed failure', () => {
    for (const [ocr, result, reasonCode] of [
      [{ started: true, ready: false, failed: false }, null, 'ocr-starting'],
      [{ started: true, ready: true, failed: false }, 'available', 'ocr-ready'],
      [{ started: true, ready: false, failed: true }, 'needs-setup', 'ocr-failed']
    ] as const) {
      const status = projectFirstRunEnvironmentStatus({ ...observation(), ocr }, 1000)
      expect(status.local.find((row) => row.id === 'ocr')).toMatchObject({ result, reasonCode })
    }
  })

  it('does not substitute a legacy calibration or game phase for actual window observations', () => {
    const status = projectFirstRunEnvironmentStatus(
      { ...observation(), clientConnected: true, gameActive: true, legacyCalibrationPresent: true },
      1000
    )
    expect(status.game.find((row) => row.id === 'client-connection')?.result).toBe('available')
    expect(
      status.game
        .filter((row) => row.id !== 'client-connection')
        .every((row) => row.result === null)
    ).toBe(true)
    expect(status.calibration.route).toBeNull()
  })

  it('uses a valid existing observation without inventing automatic readiness', () => {
    const status = projectFirstRunEnvironmentStatus(activeObservation(), 1500)
    expect(status.game.every((row) => row.result === 'available')).toBe(true)
    expect(status.calibration.route).toBeNull()
  })

  it.each([
    { now: 2501, connected: true, active: true, pending: null },
    { now: 900, connected: true, active: true, pending: null },
    { now: 1000, connected: true, active: false, pending: 'pending-game' },
    { now: 1000, connected: false, active: true, pending: 'pending-game' }
  ] as const)(
    'invalidates stale or changed-game success: %j',
    ({ now, connected, active, pending }) => {
      const status = projectFirstRunEnvironmentStatus(
        {
          ...activeObservation(),
          clientConnected: connected,
          gameActive: active,
          calibration: verifiedCalibration()
        },
        now
      )
      expect(
        status.game
          .filter((row) => row.id !== 'client-connection')
          .every((row) => row.result === pending)
      ).toBe(true)
      expect(status.calibration.route).toBeNull()
      expect(status.calibration.verified).toBe(false)
    }
  )

  it('requires current verified location and compatible geometry, and keeps sampling disabled', () => {
    const input = { ...activeObservation(), calibration: verifiedCalibration() }
    expect(projectFirstRunEnvironmentStatus(input, 1000).calibration).toMatchObject({
      route: 'automatic-ready',
      verified: true
    })
    const incompatible = {
      ...input,
      gameObservation: { ...input.gameObservation!, displayCompatible: false }
    }
    expect(projectFirstRunEnvironmentStatus(incompatible, 1000).calibration.route).toBeNull()
    for (const gameObservation of [
      { ...input.gameObservation!, foreground: false },
      { ...input.gameObservation!, foreground: null },
      { ...input.gameObservation!, captureSucceeded: false }
    ]) {
      expect(
        projectFirstRunEnvironmentStatus({ ...input, gameObservation }, 1000).calibration.route
      ).toBeNull()
    }
    expect(projectFirstRunEnvironmentStatus(input, 1000).guidedSampling.available).toBe(false)
  })

  it('does not interpret unknown foreground permission as an administrator requirement', () => {
    const input = activeObservation()
    input.gameObservation!.foreground = null
    const status = projectFirstRunEnvironmentStatus(input, 1000)
    expect(status.game.find((row) => row.id === 'foreground')?.result).toBeNull()
    expect(status.game.find((row) => row.id === 'capture')?.result).toBeNull()
    expect(status.appPrivilege).toBe('standard')
  })
  it('reports fallback readiness only with fresh independent game evidence, never from a saved template', () => {
    const input = {
      ...activeObservation(),
      calibration: {
        ...verifiedCalibration(),
        route: 'fallback-ready' as const,
        method: 'fallback' as const,
        reasonCode: 'fallback-calibration-ready' as const
      }
    }
    expect(projectFirstRunEnvironmentStatus(input, 1000).calibration).toMatchObject({
      route: 'fallback-ready',
      method: 'fallback',
      verified: true
    })
    expect(projectFirstRunEnvironmentStatus(input, 2501).calibration.verified).toBe(false)
    expect(
      projectFirstRunEnvironmentStatus(
        { ...input, calibration: { ...input.calibration, verified: false } },
        1000
      ).calibration.verified
    ).toBe(false)
  })

  it('retains known unsupported architecture while reporting actual directory failure separately', () => {
    const status = projectFirstRunEnvironmentStatus(
      { ...observation(), arch: 'arm64', dataDirectoryWritable: false },
      1000
    )
    expect(status.local.find((row) => row.id === 'platform')?.result).toBe('unsupported')
    expect(status.local.find((row) => row.id === 'data-directory')?.result).toBe('needs-setup')
  })

  it('projects only public fields even when source observations contain private extras', () => {
    const privateValue = 'PRIVATE_PATH_OR_TOKEN_SENTINEL'
    const input = {
      ...activeObservation(),
      execPath: privateValue,
      token: privateValue,
      screenshot: privateValue,
      ocr: { started: true, ready: false, failed: true, error: privateValue },
      calibration: {
        ...verifiedCalibration(),
        screenshot: privateValue,
        supportedClientSizes: [{ width: 1920, height: 1080, privatePath: privateValue }]
      }
    }
    expect(JSON.stringify(projectFirstRunEnvironmentStatus(input, 1000))).not.toContain(
      privateValue
    )
  })
})

describe('owned-main-window environment query', () => {
  function fixture(fail = false) {
    type Handler = (event: { sender: { id: number } }, ...args: unknown[]) => unknown
    const handlers = new Map<string, Handler>()
    const readObservation = vi.fn(() => {
      if (fail) throw new Error('PRIVATE_PATH_OR_TOKEN_SENTINEL')
      return observation()
    })
    const service = new FirstRunEnvironmentController(readObservation)
    const controller = {
      setupInfo: vi.fn(),
      calibrate: vi.fn(),
      windows: { openSetup: vi.fn(), ownsSetup: () => false, owns: () => false }
    }
    const ipc = {
      onCall: (_namespace: string, name: string, fn: Handler) => handlers.set(name, fn)
    }
    new MayhemIpcHandlers(
      ipc as never,
      controller as never,
      (id) => id === 10,
      () => service.getStatus()
    ).register()
    return {
      handlers,
      readObservation,
      controller,
      query: (id: number, ...args: unknown[]) =>
        handlers.get(FIRST_RUN_ENVIRONMENT_STATUS_CALL)!({ sender: { id } }, ...args)
    }
  }

  it('returns the projection only to its owner without opening setup or starting sampling', () => {
    const subject = fixture()
    expect(subject.query(10)).toMatchObject({ schemaVersion: 1, calibration: { route: null } })
    expect(subject.readObservation).toHaveBeenCalledOnce()
    expect(subject.controller.setupInfo).not.toHaveBeenCalled()
    expect(subject.controller.calibrate).not.toHaveBeenCalled()
    expect(subject.controller.windows.openSetup).not.toHaveBeenCalled()
    expect(subject.handlers.has(GUIDED_CALIBRATION_SAMPLE_CALL)).toBe(false)
  })

  it('rejects non-main senders and all arguments before reading any state', () => {
    const subject = fixture()
    for (const id of [1, 2, 3, 4, 999])
      expect(() => subject.query(id)).toThrow('Main window permission denied')
    expect(() => subject.query(10, {})).toThrow('does not accept arguments')
    expect(subject.readObservation).not.toHaveBeenCalled()
    for (const call of [() => subject.query(999), () => subject.query(10, {})]) {
      try {
        call()
      } catch (error) {
        const response = toIpcErrorResponse(error)
        expect(response.success).toBe(false)
        if (!response.success) expect(response.error.stack).toBeUndefined()
      }
    }
  })

  it('surfaces a sanitized query failure without exporting private errors', () => {
    const subject = fixture(true)
    expect(() => subject.query(10)).toThrow('First-run environment status unavailable')
    try {
      subject.query(10)
    } catch (error) {
      expect(String(error)).not.toContain('PRIVATE_PATH_OR_TOKEN_SENTINEL')
      const transportedError = structuredClone(error as Error)
      expect(transportedError.message).toBe('First-run environment status unavailable')
      expect(transportedError.stack).toBeUndefined()
      expect(JSON.stringify(toIpcErrorResponse(error))).not.toContain(
        'PRIVATE_PATH_OR_TOKEN_SENTINEL'
      )
    }
  })
})
