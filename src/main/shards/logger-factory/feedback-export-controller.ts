import type { FeedbackExportResult } from '@shared/types/feedback-export'
import { type BrowserWindow, app, dialog, screen, shell } from 'electron'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { type FeedbackEnvironment, createFeedbackBundle } from './feedback-bundle'

interface FeedbackExportDependencies {
  chooseDestination(parent: BrowserWindow): Promise<string | null>
  environment(): Promise<FeedbackEnvironment>
  createBundle: typeof createFeedbackBundle
  reveal(destination: string): void
}

const runtimeDependencies: FeedbackExportDependencies = {
  async chooseDestination(parent) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
    const result = await dialog.showSaveDialog(parent, {
      title: 'Veyra Assist — Export feedback ZIP',
      defaultPath: path.join(app.getPath('downloads'), `Veyra-feedback-${stamp}.zip`),
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
      properties: ['showOverwriteConfirmation', 'createDirectory']
    })
    return result.canceled || !result.filePath ? null : result.filePath
  },
  async environment() {
    let sourceCommit: string | null = null
    try {
      const metadata = JSON.parse(
        await fs.readFile(path.join(process.resourcesPath, 'portable-build.json'), 'utf8')
      )
      if (
        typeof metadata.compiledFromCommit === 'string' &&
        /^[a-f0-9]{40}$/i.test(metadata.compiledFromCommit)
      ) {
        sourceCommit = metadata.compiledFromCommit
      }
    } catch {
      /* Development / older packages may have no build metadata. */
    }
    const primary = screen.getPrimaryDisplay().id
    return {
      appVersion: app.getVersion(),
      sourceCommit,
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      displays: screen.getAllDisplays().map((display) => ({
        primary: display.id === primary,
        ...display.bounds,
        scaleFactor: display.scaleFactor,
        rotation: display.rotation
      }))
    }
  },
  createBundle: createFeedbackBundle,
  reveal: (destination) => shell.showItemInFolder(destination)
}

export class FeedbackExportController {
  private _busy = false

  constructor(
    private readonly _directory: string,
    private readonly _dependencies = runtimeDependencies
  ) {}

  async export(parent: BrowserWindow): Promise<FeedbackExportResult> {
    if (this._busy) return { status: 'busy' }
    this._busy = true
    try {
      const destination = await this._dependencies.chooseDestination(parent)
      if (!destination) return { status: 'cancelled' }
      const environment = await this._dependencies.environment()
      const summary = await this._dependencies.createBundle(
        this._directory,
        destination,
        environment
      )
      let revealed = true
      try {
        this._dependencies.reveal(destination)
      } catch {
        revealed = false
      }
      return {
        status: 'saved',
        logFiles: summary.logFiles,
        revealed,
        limited:
          summary.olderFilesOmitted > 0 || summary.truncatedFiles > 0 || summary.unreadableFiles > 0
      }
    } finally {
      this._busy = false
    }
  }
}
