import { toBasicInfo } from '@shared/data-adapter/match-history/match-basic'
import { toParticipants } from '@shared/data-adapter/match-history/participants'
import { toTeams } from '@shared/data-adapter/match-history/teams'
import type { LcuOrSgpGameSummary } from '@shared/data-adapter/wrapper'
import dayjs from 'dayjs'

import { toMatchGameKey } from '../match-inspector/selection'

type BasicInfo = ReturnType<typeof toBasicInfo>
type Participant = ReturnType<typeof toParticipants>[number]
type TeamStat = ReturnType<typeof toTeams>['teamStatMap'][string]

export type LedgerResultStyle = 'win' | 'loss' | 'neutral'

export type LedgerEntry = {
  key: string
  summary: LcuOrSgpGameSummary
  basicInfo: BasicInfo
  participant: Participant | null
  team: TeamStat | null
  resultStyle: LedgerResultStyle
}

export type LedgerDay = {
  dayKey: string
  gameCreation: number
  entries: LedgerEntry[]
  wins: number
  losses: number
}

/** Shared by the ledger header and rows; compact columns first, full columns from 620px */
export const LEDGER_GRID_COLUMNS_CLASS =
  'grid-cols-[4px_36px_minmax(0,1fr)_auto_24px] @min-[620px]:grid-cols-[4px_36px_minmax(110px,1.5fr)_minmax(64px,0.8fr)_82px_46px_46px_48px_28px]'

function toResultStyle(basicInfo: BasicInfo, team: TeamStat | null): LedgerResultStyle {
  if (
    !team ||
    basicInfo.gameMode === 'PRACTICETOOL' ||
    team.winResult === 'remake' ||
    team.winResult === 'abort'
  ) {
    return 'neutral'
  }

  return team.winResult === 'win' ? 'win' : 'loss'
}

export function toLedgerEntry(summary: LcuOrSgpGameSummary, puuid: string): LedgerEntry {
  const basicInfo = toBasicInfo(summary)
  const participants = toParticipants(summary, basicInfo)
  const teams = toTeams(summary, basicInfo, participants)
  const participant = participants.find((p) => p.puuid === puuid) ?? null
  const team = participant ? (teams.teamStatMap[participant.teamIdentifier] ?? null) : null

  return {
    key: toMatchGameKey(summary),
    summary,
    basicInfo,
    participant,
    team,
    resultStyle: toResultStyle(basicInfo, team)
  }
}

export function groupLedgerEntriesByDay(entries: LedgerEntry[]): LedgerDay[] {
  const days: LedgerDay[] = []

  for (const entry of entries) {
    const dayKey = dayjs(entry.basicInfo.gameCreation).format('YYYY-MM-DD')
    let day = days.at(-1)

    if (!day || day.dayKey !== dayKey) {
      day = {
        dayKey,
        gameCreation: entry.basicInfo.gameCreation,
        entries: [],
        wins: 0,
        losses: 0
      }
      days.push(day)
    }

    day.entries.push(entry)

    if (entry.resultStyle === 'win') {
      day.wins++
    } else if (entry.resultStyle === 'loss') {
      day.losses++
    }
  }

  return days
}
