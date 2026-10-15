import { NativeAddonBinding } from '../addon-binding'
import type {
  AkariToolsBinding,
  FixLeagueClientWindowConfig,
  GameClientWindowSnapshot,
  LeagueClientWindowPlacementInfo,
  LeagueClientWindowSnapshot
} from '../bindings'

export type {
  FixLeagueClientWindowConfig,
  GameClientWindowSnapshot,
  LeagueClientWindowPlacementInfo,
  LeagueClientWindowSnapshot
}

const addon = new NativeAddonBinding<AkariToolsBinding>('tools', () =>
  require('../../addons/akari-tools-win64.node')
)

export class AkariNativeTools implements AkariToolsBinding {
  load(): void {
    addon.load()
  }

  isLoaded(): boolean {
    return addon.isLoaded()
  }

  fixWindowMethodA(clientZoom: number, config: FixLeagueClientWindowConfig) {
    return addon.get().fixWindowMethodA(clientZoom, config)
  }

  isElevated(): boolean {
    return addon.get().isElevated()
  }

  getLeagueClientWindowPlacementInfo(): LeagueClientWindowPlacementInfo | null {
    return addon.get().getLeagueClientWindowPlacementInfo()
  }

  getLeagueClientWindowSnapshot(processId: number): LeagueClientWindowSnapshot | null {
    const binding = addon.get()
    // Checked-in addons from an older build do not have this read-only capability yet.
    return typeof binding.getLeagueClientWindowSnapshot === 'function'
      ? binding.getLeagueClientWindowSnapshot(processId)
      : null
  }

  /** Check after load() so callers can report an older binary as unsupported. */
  supportsGameClientWindowSnapshot(): boolean {
    return typeof addon.get().getGameClientWindowSnapshot === 'function'
  }

  getGameClientWindowSnapshot(processId: number): GameClientWindowSnapshot | null {
    const binding = addon.get()
    return typeof binding.getGameClientWindowSnapshot === 'function'
      ? binding.getGameClientWindowSnapshot(processId)
      : null
  }

  getCommandLine1(pid: number): string {
    return addon.get().getCommandLine1(pid)
  }

  getPidsByName(processName: string): number[] {
    return addon.get().getPidsByName(processName)
  }

  terminateProcess(pid: number): boolean {
    return addon.get().terminateProcess(pid)
  }

  isProcessForeground(pid: number): boolean {
    return addon.get().isProcessForeground(pid)
  }

  isProcessRunning(pid: number): boolean {
    return addon.get().isProcessRunning(pid)
  }
}

const tools = new AkariNativeTools()

export default tools
