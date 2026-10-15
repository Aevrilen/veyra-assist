import { NativeSupport } from '@shared/types/common'
import type {
  GameClientWindowSnapshot,
  LeagueClientWindowSnapshot
} from 'league-akari-native-win32/tools'
import { getuid } from 'node:process'

import { Win32Addons, Win32AddonsInitializationResult, initializeWin32Addons } from './addons-win32'
import { NotSupportedPlatformError } from './errors'
import {
  type LoadingNativeSource,
  loadingDiagnosticsRecording,
  measureLoadingNativeCall
} from './loading-diagnostics'
import {
  getCommandLinePosix,
  getPidsByNamePosix,
  isProcessRunningPosix,
  terminateProcessPosix
} from './process-utils-darwin'
import { getCommandLinePowershell } from './process-utils-win32'

export type { KeyEvent as NativeInputKeyEvent } from 'league-akari-native-win32/input'
export type {
  GameClientWindowSnapshot,
  LeagueClientWindowSnapshot
} from 'league-akari-native-win32/tools'
export { magic } from './magic'

export interface NativeRuntimeInitializationResult {
  isElevated: boolean
  inputInitializationError?: unknown
}

let win32Addons: Win32Addons | undefined
let initializationResult: NativeRuntimeInitializationResult | undefined

export let isElevated = false
export let nativeInput: Win32Addons['input']

export const NATIVE_SUPPORT: NativeSupport = {
  nativeInput: {
    available: false,
    availableOnCurrentPlatform: false,
    requiresElevation: true
  },
  getLeagueClientWindowPlacement: {
    available: false,
    availableOnCurrentPlatform: false,
    requiresElevation: false
  },
  adjustLeagueClientWindowSize: {
    available: false,
    availableOnCurrentPlatform: false,
    requiresElevation: true
  },
  isProcessForeground: {
    available: false,
    availableOnCurrentPlatform: false,
    requiresElevation: false
  }
}

function applyNativeSupport() {
  const isWindows = process.platform === 'win32'

  NATIVE_SUPPORT.nativeInput.available =
    isWindows &&
    isElevated &&
    Boolean(nativeInput?.isLoaded()) &&
    Boolean(nativeInput?.instance.isInstalled)
  NATIVE_SUPPORT.nativeInput.availableOnCurrentPlatform = isWindows

  NATIVE_SUPPORT.getLeagueClientWindowPlacement.available = isWindows
  NATIVE_SUPPORT.getLeagueClientWindowPlacement.availableOnCurrentPlatform = isWindows

  NATIVE_SUPPORT.adjustLeagueClientWindowSize.available = isWindows && isElevated
  NATIVE_SUPPORT.adjustLeagueClientWindowSize.availableOnCurrentPlatform = isWindows

  // The tools addon only reads the foreground HWND's owner PID; it never sends input.
  NATIVE_SUPPORT.isProcessForeground.available = isWindows
  NATIVE_SUPPORT.isProcessForeground.availableOnCurrentPlatform = isWindows
}

function getWin32Addons(): Win32Addons {
  if (!win32Addons) {
    throw new Error('Windows native addons have not been initialized')
  }

  return win32Addons
}

export function initializeNativeRuntime(): NativeRuntimeInitializationResult {
  if (initializationResult) {
    return initializationResult
  }

  if (process.platform === 'win32') {
    const win32Initialization: Win32AddonsInitializationResult = initializeWin32Addons()
    win32Addons = win32Initialization.addons
    nativeInput = win32Initialization.addons.input
    isElevated = win32Initialization.isElevated
    initializationResult = {
      isElevated,
      inputInitializationError: win32Initialization.inputInitializationError
    }
  } else if (process.platform === 'darwin') {
    isElevated = getuid?.() === 0
    initializationResult = { isElevated }
  } else {
    throw new NotSupportedPlatformError('initializeNativeRuntime', process.platform)
  }

  applyNativeSupport()
  return initializationResult
}

/**
 * 通过进程名搜索匹配的 pid 列表
 *
 * @platform win32, darwin
 */
export async function getPidsByName(processName: string, source: LoadingNativeSource = 'other') {
  if (process.platform === 'win32') {
    const tools = getWin32Addons().tools
    if (!loadingDiagnosticsRecording()) return tools.getPidsByName(processName)
    return measureLoadingNativeCall('getPidsByName', source, () => tools.getPidsByName(processName))
  } else if (process.platform === 'darwin') {
    return await getPidsByNamePosix(processName)
  } else {
    throw new NotSupportedPlatformError('getPidsByName', process.platform)
  }
}

/**
 *
 * 获取进程的命令行
 *
 * @param options 查询方式，仅 win32 平台生效，使用 native / shell 查询。注意，shell 方式需要应用以提权权限运行
 * @platform win32, darwin
 */
export async function getCommandLine(
  pid: number,
  options?: { win32QueryType?: 'shell' | 'native' }
) {
  if (process.platform === 'win32') {
    const { win32QueryType = 'native' } = options ?? {}

    if (win32QueryType === 'native') {
      return getWin32Addons().tools.getCommandLine1(pid)
    } else {
      return await getCommandLinePowershell(pid)
    }
  } else if (process.platform === 'darwin') {
    return await getCommandLinePosix(pid)
  } else {
    throw new NotSupportedPlatformError('getCommandLine', process.platform)
  }
}

/**
 * 判断进程是否在前台运行
 *
 * @platform win32
 */
export function isProcessForeground(pid: number, source: LoadingNativeSource = 'other') {
  if (process.platform === 'win32') {
    const tools = getWin32Addons().tools
    if (!loadingDiagnosticsRecording()) return tools.isProcessForeground(pid)
    return measureLoadingNativeCall('isProcessForeground', source, () =>
      tools.isProcessForeground(pid)
    )
  } else {
    throw new NotSupportedPlatformError('isProcessForeground', process.platform)
  }
}

/**
 * 终止进程
 *
 * @platform win32, darwin
 */
export function terminateProcess(pid: number) {
  if (process.platform === 'win32') {
    return getWin32Addons().tools.terminateProcess(pid)
  } else if (process.platform === 'darwin') {
    return terminateProcessPosix(pid)
  } else {
    throw new NotSupportedPlatformError('terminateProcess', process.platform)
  }
}

export function isProcessRunning(pid: number) {
  if (process.platform === 'win32') {
    return getWin32Addons().tools.isProcessRunning(pid)
  } else if (process.platform === 'darwin') {
    return isProcessRunningPosix(pid)
  } else {
    throw new NotSupportedPlatformError('isProcessRunning', process.platform)
  }
}

export function adjustLeagueClientWindowSize(
  clientZoom: number,
  config?: { baseHeight: number; baseWidth: number }
) {
  if (process.platform === 'win32') {
    return getWin32Addons().tools.fixWindowMethodA(clientZoom, config ?? {})
  } else {
    throw new NotSupportedPlatformError('adjustLeagueClient', process.platform)
  }
}

export function getLeagueClientWindowPlacement() {
  if (process.platform === 'win32') {
    return getWin32Addons().tools.getLeagueClientWindowPlacementInfo()
  } else {
    throw new NotSupportedPlatformError('getLeagueClientWindowPlacement', process.platform)
  }
}

/**
 * Read the connected LeagueClientUx window's current client-area bounds in physical screen pixels.
 * Returns null off Windows, when no matching window exists, or with an older native addon.
 */
export function getLeagueClientWindowSnapshot(
  processId: number
): LeagueClientWindowSnapshot | null {
  if (process.platform !== 'win32') {
    return null
  }

  return getWin32Addons().tools.getLeagueClientWindowSnapshot(processId)
}

export function supportsGameClientWindowSnapshot() {
  return process.platform === 'win32' && getWin32Addons().tools.supportsGameClientWindowSnapshot()
}

export function getGameClientWindowSnapshot(
  processId: number,
  source: LoadingNativeSource = 'other'
): GameClientWindowSnapshot | null {
  if (process.platform !== 'win32') return null
  const tools = getWin32Addons().tools
  if (!loadingDiagnosticsRecording()) return tools.getGameClientWindowSnapshot(processId)
  return measureLoadingNativeCall('getGameClientWindowSnapshot', source, () =>
    tools.getGameClientWindowSnapshot(processId)
  )
}
