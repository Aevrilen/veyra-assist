import leagueIco from '@renderer-shared/assets/ico/league.ico'
import riotIco from '@renderer-shared/assets/ico/riotclient.ico'
import weGameIco from '@renderer-shared/assets/ico/wegame.ico'
import { useInstance } from '@renderer-shared/shards'
import { ClientInstallationRenderer } from '@renderer-shared/shards/client-installation'
import { useClientInstallationStore } from '@renderer-shared/shards/client-installation/store'
import type { ClientLaunchConfiguration } from '@shared/shards/client-installation'
import { useTranslation } from 'i18next-vue'
import { computed } from 'vue'

export function useDetectedClientLaunchItems() {
  const store = useClientInstallationStore()
  const installation = useInstance(ClientInstallationRenderer)
  const { t } = useTranslation()
  return computed(() => {
    const items: {
      client: ClientLaunchConfiguration['client']
      name: string
      imgUrl: string
      path: string
      launch: () => Promise<any>
    }[] = []
    if (store.tclsExecutablePath)
      items.push({
        client: 'tcls',
        name: t('startup.launcher.tcls'),
        imgUrl: leagueIco,
        path: store.tclsExecutablePath,
        launch: () => installation.launchTencentTcls()
      })
    if (store.weGameLauncherExecutablePath)
      items.push({
        client: 'wegame',
        name: t('startup.launcher.weGame'),
        imgUrl: weGameIco,
        path: store.weGameLauncherExecutablePath,
        launch: () => installation.launchWeGameLeagueOfLegends()
      })
    if (store.officialRiotClientExecutablePath)
      items.push({
        client: 'riot',
        name: t('startup.launcher.riotClient'),
        imgUrl: riotIco,
        path: store.officialRiotClientExecutablePath,
        launch: () => installation.launchDefaultRiotClient()
      })
    return items
  })
}
