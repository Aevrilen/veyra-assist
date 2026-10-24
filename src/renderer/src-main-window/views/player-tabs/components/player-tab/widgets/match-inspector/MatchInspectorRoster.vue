<template>
  <div>
    <p class="m-0 mb-2 text-xs text-black/60 dark:text-white/60">
      {{ t('playerTabs.matchHistory.inspector.participantHint') }}
    </p>

    <div class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
      <div v-for="group of rosterTeams" :key="group.team.teamIdentifier" class="min-w-0">
        <div
          class="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 text-xs font-medium"
          :class="teamResultClass(group.team.winResult)"
        >
          <span>{{ teamName(group.team.teamIdentifier) }} · {{ teamResultName(group.team) }}</span>
          <span class="font-normal text-black/60 tabular-nums dark:text-white/60">
            {{ t('playerTabs.matchHistory.inspector.teamKills', { count: group.kills }) }} ·
            {{
              t('playerTabs.matchHistory.inspector.teamGold', {
                value: formatExtremeNumber(group.team.totalGoldEarned)
              })
            }}
          </span>
        </div>

        <div role="list">
          <div
            v-for="player of group.players"
            :key="player.participantId"
            role="listitem"
            class="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1.5 py-1"
            :class="{ 'bg-black/8 dark:bg-white/10': player.puuid === puuid }"
          >
            <ChampionIcon :champion-id="player.championId" class="size-5.5 rounded-full" />

            <div class="flex min-w-0 flex-col">
              <span
                v-if="player.puuid === puuid"
                class="truncate text-sm text-black dark:text-white"
              >
                {{ displayName(player) }}
                <span class="text-xs text-black/60 dark:text-white/60">
                  · {{ t('playerTabs.matchHistory.inspector.currentPlayer') }}
                </span>
              </span>
              <span
                v-else-if="!player.puuid || player.puuid === EMPTY_PUUID"
                class="truncate text-sm text-black/60 dark:text-white/60"
              >
                {{ displayName(player) }}
              </span>
              <button
                v-else
                type="button"
                class="roster-link m-0 cursor-pointer truncate border-0 bg-transparent p-0 text-left text-sm text-blue-700 outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-300"
                :title="openPlayerLabel(player)"
                :aria-label="openPlayerLabel(player)"
                @click="navigateToSummonerByPuuid(player.puuid)"
                @mousedown="handleMouseDown"
                @mouseup="handleMouseUp($event, player.puuid)"
              >
                {{ displayName(player) }} <span aria-hidden="true">↗</span>
              </button>

              <span class="truncate text-xs text-black/60 dark:text-white/60">
                {{ resources.champions.name(player.championId)
                }}<template v-if="positionName(player.position)">
                  · {{ positionName(player.position) }}</template
                >
              </span>
            </div>

            <span class="text-sm text-black/90 tabular-nums dark:text-white/90">
              {{ player.kills }}/{{ player.deaths }}/{{ player.assists }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMatchCard } from '@renderer-shared/components/match-card/context'
import {
  useGameResultName,
  usePosition,
  useTeamName
} from '@renderer-shared/components/match-card/utils/text'
import ChampionIcon from '@renderer-shared/components/widgets/ChampionIcon.vue'
import { useNumberFormatter } from '@renderer-shared/composables/useNumberFormatter'
import { useAkariResourceProvider } from '@renderer-shared/providers/akari-resource'
import { EMPTY_PUUID } from '@shared/constants/common'
import { useTranslation } from 'i18next-vue'
import { computed } from 'vue'

const { t } = useTranslation()
const resources = useAkariResourceProvider()
const { formatExtremeNumber } = useNumberFormatter()
const gameResultName = useGameResultName()
const teamName = useTeamName()
const position = usePosition()

const {
  puuid,
  basicInfo,
  participants,
  participant,
  teams,
  hidePrivacy,
  navigateToSummonerByPuuid
} = useMatchCard()

type Participant = (typeof participants.value)[number]
type TeamStat = (typeof teams.value.teamStatsArr)[number]

const rosterTeams = computed(() => {
  const selfTeamIdentifier = participant.value?.teamIdentifier

  return teams.value.teamStatsArr
    .toSorted((a, b) => {
      if (a.teamIdentifier === selfTeamIdentifier) return -1
      if (b.teamIdentifier === selfTeamIdentifier) return 1

      if (basicInfo.value.isCherrySubteam) {
        return a.subteamPlacement - b.subteamPlacement
      }

      return a.teamIdentifier.localeCompare(b.teamIdentifier)
    })
    .map((team) => {
      const players = participants.value.filter((p) => p.teamIdentifier === team.teamIdentifier)

      return {
        team,
        players,
        kills: players.reduce((sum, p) => sum + p.kills, 0)
      }
    })
})

// streamer mode: champion name replaces player name in text, title and aria label
const displayName = (player: Participant) => {
  return hidePrivacy.value ? resources.champions.name(player.championId) : player.gameName
}

const openPlayerLabel = (player: Participant) => {
  const name = hidePrivacy.value
    ? resources.champions.name(player.championId)
    : player.tagLine
      ? `${player.gameName}#${player.tagLine}`
      : player.gameName

  return t('playerTabs.matchHistory.inspector.openPlayer', { name })
}

const positionName = (value: string | null | undefined) => {
  if (!value || ['invalid', 'none'].includes(value.toLowerCase())) {
    return ''
  }

  return position(value)
}

const teamResultName = (team: TeamStat) => {
  return gameResultName(
    team.subteamPlacement,
    team.winResult,
    team.isSurrender,
    resources.runtime.locale
  )
}

const teamResultClass = (winResult: string) => {
  if (
    basicInfo.value.gameMode === 'PRACTICETOOL' ||
    winResult === 'remake' ||
    winResult === 'abort'
  ) {
    return 'text-black/80 dark:text-white/80'
  }

  return winResult === 'win' ? 'text-blue-600 dark:text-blue-300' : 'text-red-700 dark:text-red-300'
}

const handleMouseDown = (event: MouseEvent) => {
  if (event.button === 1) {
    event.preventDefault()
  }
}

const handleMouseUp = (event: MouseEvent, targetPuuid: string) => {
  if (event.button === 1) {
    navigateToSummonerByPuuid(targetPuuid, false)
  }
}
</script>

<style scoped>
.roster-link {
  font-family: inherit;
}
</style>
