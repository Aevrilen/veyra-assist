import type { ChampSelectOverlaySettings } from '@shared/champ-select-overlay'
import type { OngoingGamePanelPlayerCardTagSettings } from '@shared/shards/ongoing-game'
import { z } from 'zod'

export const champSelectOverlaySettingsSchema: z.ZodType<ChampSelectOverlaySettings> = z.object({
  backgroundOpacity: z.number().int().min(30).max(90),
  candidateFirstCenterX: z.number().min(0).max(4096).nullable(),
  teammateFirstCenterY: z.number().min(0).max(4096).nullable(),
  candidateStep: z.number().min(44).max(160),
  teammateStep: z.number().min(64).max(200),
  calibratedClientSize: z
    .object({
      width: z.number().positive().max(4096),
      height: z.number().positive().max(4096)
    })
    .optional()
})

export const ongoingGamePlayerCardTagsSchema: z.ZodType<OngoingGamePanelPlayerCardTagSettings> =
  z.looseObject({
    showPremadeTeamTag: z.boolean(),
    showSuspiciousFlashPositionTag: z.boolean(),
    showWinningStreakTag: z.boolean(),
    showLosingStreakTag: z.boolean(),
    showSoloKillsTag: z.boolean(),
    showEasyGankTag: z.boolean(),
    showGreatPerformanceTag: z.boolean(),
    showAverageTeamDamageTag: z.boolean(),
    showAverageTeamDamageTakenTag: z.boolean(),
    showAverageTeamGoldTag: z.boolean(),
    showAverageCsPerMinuteTag: z.boolean(),
    showAverageDamageGoldEfficiencyTag: z.boolean(),
    showAverageEnemyMissingPingsTag: z.boolean(),
    showAverageVisionScoreTag: z.boolean(),
    showAverageKillDamageEfficiencyTag: z.boolean(),
    showSelfTag: z.boolean(),
    showMetTag: z.boolean(),
    showTaggedTag: z.boolean(),
    showWinRateTeamTag: z.boolean(),
    showPrivacyTag: z.boolean(),
    showAkariScoreTag: z.boolean()
  })
