import { createManager } from '@renderer-shared/shards'
import { AkariProtocolRenderer } from '@renderer-shared/shards/akari-protocol'
import { AppCommonRenderer } from '@renderer-shared/shards/app-common'
import { ChampionDataRenderer } from '@renderer-shared/shards/champion-data'
import { AkariIpcRenderer } from '@renderer-shared/shards/ipc'
import { LeagueClientRenderer } from '@renderer-shared/shards/league-client'
import { LoggerRenderer } from '@renderer-shared/shards/logger'
import { OngoingGameRenderer } from '@renderer-shared/shards/ongoing-game'
import { PiniaMobxUtilsRenderer } from '@renderer-shared/shards/pinia-mobx-utils'
import { SettingUtilsRenderer } from '@renderer-shared/shards/setting-utils'
import { SetupInAppScopeRenderer } from '@renderer-shared/shards/setup-in-app-scope'

const manager = createManager()
const isCandidateButtonWindow =
  new URLSearchParams(window.location.search).get('mode') === 'bench-button'

manager.use(AkariIpcRenderer)
manager.use(AkariProtocolRenderer)
manager.use(AppCommonRenderer)
if (!isCandidateButtonWindow)
  manager.use(LeagueClientRenderer, {
    subscribeState: {
      gameData: true,
      gameflow: true,
      honor: false,
      champSelect: true,
      chat: false,
      matchmaking: false,
      lobby: false,
      login: false,
      summoner: false,
      lobbyTeamBuilder: false
    }
  })
manager.use(LoggerRenderer)
if (!isCandidateButtonWindow) {
  manager.use(OngoingGameRenderer)
  manager.use(ChampionDataRenderer)
}
manager.use(PiniaMobxUtilsRenderer)
manager.use(SettingUtilsRenderer)
manager.use(SetupInAppScopeRenderer)

export { manager, isCandidateButtonWindow }
