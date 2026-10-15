export interface NativeKeyState {
  vkCode: number
  pressed: boolean
  scanCode: number
}

export type NativeKeyEventCallback = (rawEvent: string) => void

export interface AkariInputBinding {
  install(): void
  uninstall(): void
  onKeyEvent(callback: NativeKeyEventCallback): void
  sendString(text: string): Promise<void>
  sendKey(virtualKeyCode: number, pressed: boolean): Promise<void>
  getKeyStates(): NativeKeyState[]
}

export interface FixLeagueClientWindowConfig {
  baseWidth?: number
  baseHeight?: number
}

export interface LeagueClientWindowPlacementInfo {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
  shownState: number
  isMinimized: boolean
  isMaximized: boolean
  isNormal: boolean
}

export interface LeagueClientWindowSnapshot {
  ownerProcessId?: number
  windowHandle?: string
  /** Client-area bounds in physical screen pixels, including negative monitor coordinates. */
  bounds: { x: number; y: number; width: number; height: number }
  isForeground: boolean
  isMinimized: boolean
  isVisible: boolean
}

export interface GameClientWindowSnapshot {
  ownerProcessId: number
  /** Decimal HWND string. Resolve again on every read; windows can be recreated. */
  windowHandle: string
  /** Client-area bounds in physical screen pixels, including negative monitor coordinates. */
  bounds: { x: number; y: number; width: number; height: number }
  isForeground: boolean
  isMinimized: boolean
  isVisible: boolean
}

export interface AkariToolsBinding {
  fixWindowMethodA(clientZoom: number, config: FixLeagueClientWindowConfig): boolean | null
  isElevated(): boolean
  getLeagueClientWindowPlacementInfo(): LeagueClientWindowPlacementInfo | null
  getLeagueClientWindowSnapshot(processId: number): LeagueClientWindowSnapshot | null
  getGameClientWindowSnapshot(processId: number): GameClientWindowSnapshot | null
  getCommandLine1(pid: number): string
  getPidsByName(processName: string): number[]
  terminateProcess(pid: number): boolean
  isProcessForeground(pid: number): boolean
  isProcessRunning(pid: number): boolean
}
