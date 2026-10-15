import {
  type ClientLaunchConfiguration,
  type ClientLaunchResult,
  type ClientLaunchValidation,
  clientLaunchConfigurationSchema
} from '@shared/shards/client-installation'
import cp from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import util from 'node:util'

import type { ClientInstallationMainContext } from './context'
import { shouldAllowWindowsOnlyLaunch } from './platform'

const execFileAsync = util.promisify(cp.execFile)

export class ClientInstallationLauncher {
  private _launching = false
  private _lastConfiguredLaunch = 0

  constructor(private readonly _context: ClientInstallationMainContext) {}

  async validateLaunchConfiguration(configuration: unknown): Promise<ClientLaunchValidation> {
    return (await this._validateLaunchConfiguration(configuration)).result
  }

  async launchConfiguredClient(configuration: unknown): Promise<ClientLaunchResult> {
    if (this._launching || Date.now() - this._lastConfiguredLaunch < 1500) {
      return 'already-starting'
    }
    this._launching = true
    try {
      const validation = await this._validateLaunchConfiguration(configuration)
      if (validation.result !== 'valid') return validation.result
      const { client, executablePath } = validation.configuration
      if (client === 'tcls') await this.launchTencentTcls(executablePath)
      else if (client === 'wegame') {
        if (path.win32.basename(executablePath).toLowerCase() === 'wegame.exe') {
          await this.launchWeGame(executablePath)
        } else await this.launchWeGameLeagueOfLegends(executablePath)
      } else await this.launchDefaultRiotClient(executablePath)
      this._lastConfiguredLaunch = Date.now()
      return 'started'
    } finally {
      this._launching = false
    }
  }

  private async _validateLaunchConfiguration(
    configuration: unknown
  ): Promise<
    | { result: 'valid'; configuration: ClientLaunchConfiguration }
    | { result: 'invalid-path' | 'unsupported-platform' }
  > {
    const parsed = clientLaunchConfigurationSchema.safeParse(configuration)
    if (!parsed.success || parsed.data.executablePath.includes('\0'))
      return { result: 'invalid-path' }
    const { client } = parsed.data
    if (process.platform !== 'win32' && (process.platform !== 'darwin' || client !== 'riot')) {
      return { result: 'unsupported-platform' }
    }
    const platformPath = process.platform === 'win32' ? path.win32 : path.posix
    const executablePath = platformPath.normalize(parsed.data.executablePath.trim())
    if (!platformPath.isAbsolute(executablePath)) return { result: 'invalid-path' }
    const name = platformPath.basename(executablePath).toLowerCase()
    const directory = platformPath.basename(platformPath.dirname(executablePath)).toLowerCase()
    const accepted =
      process.platform === 'darwin'
        ? name === 'riot client.app'
        : client === 'tcls'
          ? name === 'client.exe' && directory === 'launcher'
          : client === 'wegame'
            ? name === 'wegame.exe' || (name === 'launcher.exe' && directory === 'wegamelauncher')
            : name === 'riotclientservices.exe'
    if (!accepted || (process.platform === 'win32' && !/^[a-z]:\\/i.test(executablePath))) {
      return { result: 'invalid-path' }
    }
    try {
      const stat = await fs.promises.stat(executablePath)
      if (process.platform === 'darwin' ? !stat.isDirectory() : !stat.isFile()) {
        return { result: 'invalid-path' }
      }
      await fs.promises.access(executablePath)
    } catch (cause) {
      if (
        ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'].includes(
          (cause as NodeJS.ErrnoException).code ?? ''
        )
      ) {
        return { result: 'invalid-path' }
      }
      throw cause
    }
    return { result: 'valid', configuration: { client, executablePath } }
  }

  launchTencentTcls(executablePath = this._context.state.tclsExecutablePath) {
    if (!shouldAllowWindowsOnlyLaunch()) {
      this._context.logger.info('Skip TCLS launch on unsupported platform', {
        platform: process.platform
      })
      return
    }

    if (!executablePath) {
      return
    }

    return this._spawnDetachedClient(executablePath, 'TCLS client')
  }

  launchWeGameLeagueOfLegends(executablePath = this._context.state.weGameLauncherExecutablePath) {
    if (!shouldAllowWindowsOnlyLaunch()) {
      this._context.logger.info('Skip WeGame League of Legends launch on unsupported platform', {
        platform: process.platform
      })
      return
    }

    if (!executablePath) {
      return
    }

    return this._spawnDetachedClient(executablePath, 'WeGame (LoL) client')
  }

  launchWeGame(executablePath = this._context.state.weGameExecutablePath) {
    if (!shouldAllowWindowsOnlyLaunch()) {
      this._context.logger.info('Skip WeGame launch on unsupported platform', {
        platform: process.platform
      })
      return
    }

    if (!executablePath) {
      return
    }

    return this._spawnDetachedClient(executablePath, 'WeGame client')
  }

  async launchDefaultRiotClient(
    executablePath = this._context.state.officialRiotClientExecutablePath
  ) {
    if (!executablePath) {
      return
    }

    const args = ['--launch-product=league_of_legends', '--launch-patchline=live']

    if (process.platform === 'win32') {
      return this._spawnDetachedClient(executablePath, 'Riot client', args)
    }

    if (process.platform === 'darwin' && executablePath.toLowerCase().endsWith('.app')) {
      await execFileAsync('open', ['-a', executablePath, '--args', ...args])
      return
    }

    await execFileAsync(executablePath, args)
  }

  private _spawnDetachedClient(executablePath: string, label: string, args: string[] = []) {
    return new Promise<void>((resolve, reject) => {
      const child = cp.spawn(executablePath, args, {
        detached: true,
        stdio: 'ignore',
        shell: false
      })

      child.once('error', (error) => {
        this._context.logger.warn(`Failed to launch ${label}`, executablePath, error)
        reject(error)
      })

      child.once('spawn', () => {
        child.unref()
        resolve()
      })
    })
  }
}
