import type { ReplayDownloadProgress } from '@shared/types/league-client/replays'
import type { TFunction } from 'i18next'
import { useTranslation } from 'i18next-vue'
import { type Ref, computed, watchEffect } from 'vue'

import { useMatchCard } from '../context'

export function getReplayStateTitle(
  t: TFunction,
  replayState: ReplayDownloadProgress | null | undefined
) {
  if (!replayState) {
    return t('matchCard.replay.label')
  }

  switch (replayState.state) {
    case 'download':
      return t('matchCard.replay.download')
    case 'watch':
      return t('matchCard.replay.watch')
    case 'incompatible':
      return t('matchCard.replay.unavailable')
    case 'downloading':
      return t('matchCard.replay.downloading', { progress: replayState.downloadProgress })
    case 'checking':
      return t('matchCard.replay.checking')
    default:
      return t('matchCard.replay.label')
  }
}

/**
 * Capability-driven detail tabs shared by the expanded match card and the match history inspector.
 */
export function useMatchCardTabs(selectedTab: Ref<string>) {
  const { basicInfo, participants } = useMatchCard()
  const { t } = useTranslation()

  const perksAvailable = computed(() => {
    return participants.value.some((p) =>
      p.perks.styles.some((s) => s.selections.some((s) => s.perk !== 0))
    )
  })

  const tabs = computed(() => {
    return [
      {
        label: t('matchCard.tabs.summary'),
        value: 'summary'
      },
      {
        label: t('matchCard.tabs.details'),
        value: 'details'
      },
      {
        label: t('matchCard.tabs.runes'),
        value: 'runes',
        show: perksAvailable.value
      },
      {
        label: t('matchCard.tabs.events'),
        value: 'events'
      },
      {
        label: t('matchCard.tabs.builds'),
        value: 'builds',
        show: basicInfo.value.dataSource === 'sgp'
      },
      {
        label: t('matchCard.tabs.timeline'),
        value: 'timeline'
      }
    ].filter((tab) => tab.show ?? true)
  })

  watchEffect(() => {
    if (basicInfo.value.dataSource !== 'sgp' && selectedTab.value === 'builds') {
      selectedTab.value = 'summary'
    }
  })

  return tabs
}

export function useReplayButtonTitle() {
  const { replayState } = useMatchCard()
  const { t } = useTranslation()

  return computed(() => getReplayStateTitle(t, replayState.value))
}
