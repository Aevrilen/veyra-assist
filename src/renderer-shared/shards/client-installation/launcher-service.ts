import type {
  ClientLaunchConfiguration,
  ClientLaunchResult,
  ClientLaunchValidation
} from '@shared/shards/client-installation'

import {
  CLIENT_INSTALLATION_MAIN_NAMESPACE,
  CLIENT_INSTALLATION_RENDERER_NAMESPACE,
  type ClientInstallationRendererContext
} from './context'

export class ClientInstallationLauncherService {
  constructor(private readonly _context: ClientInstallationRendererContext) {}

  validateLaunchConfiguration(
    configuration: ClientLaunchConfiguration
  ): Promise<ClientLaunchValidation> {
    return this._context.ipc.call(
      CLIENT_INSTALLATION_MAIN_NAMESPACE,
      'validateLaunchConfiguration',
      configuration
    )
  }

  launchConfiguredClient(configuration: ClientLaunchConfiguration): Promise<ClientLaunchResult> {
    return this._context.ipc.call(
      CLIENT_INSTALLATION_MAIN_NAMESPACE,
      'launchConfiguredClient',
      configuration
    )
  }

  launchTencentTcls() {
    this._context.logger.info(CLIENT_INSTALLATION_RENDERER_NAMESPACE, 'Launch TCLS client')
    return this._context.ipc.call(CLIENT_INSTALLATION_MAIN_NAMESPACE, 'launchTencentTcls')
  }

  launchWeGameLeagueOfLegends() {
    this._context.logger.info(CLIENT_INSTALLATION_RENDERER_NAMESPACE, 'Launch WeGame client')
    return this._context.ipc.call(CLIENT_INSTALLATION_MAIN_NAMESPACE, 'launchWeGameLeagueOfLegends')
  }

  launchWeGame() {
    this._context.logger.info(CLIENT_INSTALLATION_RENDERER_NAMESPACE, 'Launch WeGame client')
    return this._context.ipc.call(CLIENT_INSTALLATION_MAIN_NAMESPACE, 'launchWeGame')
  }

  launchDefaultRiotClient() {
    this._context.logger.info(
      CLIENT_INSTALLATION_RENDERER_NAMESPACE,
      'Launch default RiotClient client'
    )
    return this._context.ipc.call(CLIENT_INSTALLATION_MAIN_NAMESPACE, 'launchDefaultRiotClient')
  }
}
