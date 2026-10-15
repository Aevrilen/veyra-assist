import 'reflect-metadata'

import type { ChampSelectSession } from '@shared/types/league-client/champ-select'
import { observable, runInAction } from 'mobx'
import { describe, expect, it, vi } from 'vitest'

import { OngoingGameSettings, OngoingGameState } from './state'

vi.mock('@main/native', () => ({
  magic: (puuid: string) => (puuid === 'obfuscated-player' ? 'resolved-player' : '')
}))

describe('overlay row identity mapping', () => {
  it('uses the existing identity gate for stable LCU cells and clears missing sessions', () => {
    const data = observable({
      champSelect: {
        session: {
          myTeam: [
            {
              cellId: 4,
              puuid: 'visible-player',
              nameVisibilityType: 'VISIBLE',
              obfuscatedPuuid: ''
            },
            {
              cellId: 1,
              puuid: '',
              nameVisibilityType: 'HIDDEN',
              obfuscatedPuuid: 'obfuscated-player'
            },
            {
              cellId: 7,
              puuid: '',
              nameVisibilityType: 'HIDDEN',
              obfuscatedPuuid: 'unresolved-player'
            }
          ]
        } as unknown as ChampSelectSession | null
      }
    })
    let enabled = true
    const featureGating = { isEnabled: () => enabled }
    const state = new OngoingGameState(
      data as unknown as ConstructorParameters<typeof OngoingGameState>[0],
      {} as ConstructorParameters<typeof OngoingGameState>[1],
      {} as ConstructorParameters<typeof OngoingGameState>[2],
      new OngoingGameSettings(),
      featureGating as unknown as ConstructorParameters<typeof OngoingGameState>[4]
    )
    expect(state.champSelectPlayerPuuids).toEqual({ 4: 'visible-player', 1: 'resolved-player' })
    enabled = false
    expect(state.champSelectPlayerPuuids).toEqual({ 4: 'visible-player' })
    runInAction(() => {
      data.champSelect.session = null
    })
    expect(state.champSelectPlayerPuuids).toEqual({})
  })
})
