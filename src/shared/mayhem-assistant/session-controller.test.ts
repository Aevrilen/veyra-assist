import { describe, expect, it } from 'vitest'

import { MayhemSessionController } from './session-controller'

describe('Mayhem game boundaries', () => {
  it('preserves user collapse independently of expired scene evidence', () => {
    const session = new MayhemSessionController()
    session.setSession('player:1', 157)
    const open = () => {
      session.observe(session.revision, true, false, 1000)
      session.observe(session.revision, true, false, 1500)
    }
    open()
    session.collapse('player:1')
    expect(session.equipmentCollapsed).toBe(true)
    expect(session.restore('player:old')).toBe(false)
    expect(session.restore('player:1')).toBe(true)
    expect(session.shopVisible).toBe(true)
    expect(session.collapse('player:1')).toBe(true)
    session.invalidate()
    expect(session.equipmentCollapsed).toBe(true)
    expect(session.restore('player:1')).toBe(true)
    expect(session.shopVisible).toBe(false)
    expect(session.equipmentExpanded).toBe(true)
    session.observe(session.revision, true, false, 1000)
    expect(session.shopVisible).toBe(false)
    open()
    session.collapse('player:1')
    expect(session.equipmentCollapsed).toBe(true)
    expect(session.restore('player:1')).toBe(true)
    expect(session.equipmentCollapsed).toBe(false)
    expect(session.shopVisible).toBe(true)
    session.collapse('player:1')
    session.suppress('player:1')
    expect(session.equipmentCollapsed).toBe(false)
    expect(session.shopVisible).toBe(false)
    session.restore('player:1')
    expect(session.shopVisible).toBe(false)
    session.setSession('player:2', 157)
    open()
    expect(session.shopVisible).toBe(true)
  })
  it('preserves collapse through closed shops and reconnect, clearing it for a new game', () => {
    const session = new MayhemSessionController()
    session.setSession('player:1', 103)
    const open = () => {
      session.observe(session.revision, true, false, 1000)
      session.observe(session.revision, true, false, 1500)
    }
    open()
    expect(session.collapse('player:1')).toBe(true)
    expect(session.collapse('player:1')).toBe(true)
    session.invalidate()
    open()
    expect(session.shopVisible).toBe(false)
    session.setSession(null, null)
    session.setSession('player:1', 103)
    open()
    expect(session.shopVisible).toBe(false)
    session.observe(session.revision, false, false, 2000)
    expect(session.equipmentCollapsed).toBe(true)
    expect(session.restore('player:1')).toBe(true)
    expect(session.equipmentExpanded).toBe(true)
    expect(session.shopVisible).toBe(false)
    open()
    expect(session.shopVisible).toBe(true)
    session.collapse('player:1')
    session.setSession(null, null)
    session.setSession('player:2', 103)
    open()
    expect(session.shopVisible).toBe(true)
    expect(session.collapse('player:1')).toBe(false)
    expect(session.restore('player:1')).toBe(false)
  })
  it('keeps candidate binding separate from confirmed selections and clears confirmation across session boundaries', () => {
    const session = new MayhemSessionController()
    session.setSession('player:1', 157)
    session.pinStandardCore('player:1', 157, [1, 2, 3])
    session.observe(session.revision, false, true, 1000)
    session.observe(session.revision, false, true, 1500)
    session.setCandidates(session.revision, [
      { id: 1048, rarity: 'prismatic', tier: null, pickRate: null, winRate: null },
      null,
      null
    ])
    expect(session.confirmedSelection).toBeNull()
    expect(
      session.acceptConfirmedSelection({
        sessionKey: 'player:1',
        championId: 157,
        ids: [1048],
        source: 'offline-fixture'
      })
    ).toBe(false)
    const ids = [1048]
    expect(
      session.acceptConfirmedSelection({
        sessionKey: 'player:1',
        championId: 157,
        ids,
        source: 'reviewed-user-confirmation'
      })
    ).toBe(true)
    ids.push(2062)
    expect(session.confirmedSelection?.ids).toEqual([1048])
    expect(
      session.acceptConfirmedSelection({
        sessionKey: 'player:2',
        championId: 157,
        ids: [1048],
        source: 'reviewed-user-confirmation'
      })
    ).toBe(false)
    expect(
      session.acceptConfirmedSelection({
        sessionKey: 'player:1',
        championId: 157,
        ids: new Array(1),
        source: 'reviewed-user-confirmation'
      })
    ).toBe(false)
    session.buildView = 'augment'
    session.setSession(null, null)
    expect(session.confirmedSelection).toBeNull()
    expect(session.buildView).toBe('standard')
    session.setSession('player:1', 157)
    expect(session.standardCoreIds).toEqual([1, 2, 3])
    session.setSession('player:2', 157)
    expect(session.standardCoreIds).toBeNull()
  })
  it('preserves same-game preferences through reconnect and resets them across an unknown-state game transition', () => {
    const session = new MayhemSessionController()
    session.setSession('player:1', 157)
    session.category = 'core'
    expect(session.suppress('player:1')).toBe(true)
    session.setSession(null, null)
    session.setSession('player:1', 157)
    expect(session.category).toBe('core')
    expect(session.suppressed).toBe(true)
    expect(session.restore('player:1')).toBe(true)
    expect(session.restore('player:1')).toBe(false)
    expect(session.suppress('player:1')).toBe(true)
    session.setSession(null, null)
    session.setSession('player:2', 157)
    expect(session.category).toBe('items')
    expect(session.suppressed).toBe(false)
    expect(session.suppress('player:1')).toBe(false)
    expect(session.restore('player:1')).toBe(false)
    session.observe(session.revision, true, false, 1000)
    expect(session.shopVisible).toBe(false)
    session.observe(session.revision, true, false, 1500)
    expect(session.shopVisible).toBe(true)
  })
})
