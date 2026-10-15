import type { AkariIpcMain } from '../ipc'
import type { CandidateButtonWindowController } from './candidate-button-window-controller'
import type { CandidateGrabController } from './candidate-grab-controller'

export class ChampSelectOverlayIpcHandlers {
  constructor(
    private readonly _ipc: AkariIpcMain,
    private readonly _namespace: string,
    private readonly _candidateGrabController: CandidateGrabController,
    private readonly _candidateButtonWindowController?: CandidateButtonWindowController
  ) {}

  register() {
    this._ipc.onCall(this._namespace, 'grabCandidate', (event, ...args: unknown[]) => {
      if (args.length !== 1) return { state: 'unavailable' }
      return this._candidateGrabController.grabCandidate(event, args[0])
    })
    this._ipc.onCall(this._namespace, 'candidateButtonReady', (event, ...args: unknown[]) => {
      if (args.length !== 0) return false
      return this._candidateButtonWindowController?.rendererReady(event) ?? false
    })
  }
}
