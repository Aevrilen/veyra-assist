import { describe, expect, it } from 'vitest'

import {
  equipmentPresentation,
  equipmentPresentationHeight,
  resolveEquipmentRoles,
  resolveEquipmentTeams
} from './equipment-rules'
import { type ItemRow, type OverlaySnapshot, emptyEquipmentBindings } from './model'
import { MayhemSessionController } from './session-controller'
import { resolveStartingEquipmentPreferences } from './starting-equipment'

const row = (ids: number[], pickRate = 0.1): ItemRow => ({ ids, pickRate, winRate: 0.5 })
describe('starting equipment layout height', () => {
  it('stays compact for short starting groups and grows to fit up to six website rows', () => {
    const snapshot = fixture()
    snapshot.category = 'starting'
    const emptyHeight = equipmentPresentationHeight(snapshot)
    snapshot.equipment!.categories.starting = [row([1036, 2003]), row([1018, 1052])]
    const twoRowsHeight = equipmentPresentationHeight(snapshot)
    expect(emptyHeight).toBeLessThan(twoRowsHeight)
    expect(twoRowsHeight).toBeLessThan(760)
    snapshot.equipment!.categories.starting = Array.from({ length: 6 }, () => row([1036, 2003]))
    const sixRowsHeight = equipmentPresentationHeight(snapshot)
    expect(sixRowsHeight).toBeGreaterThan(twoRowsHeight)
    expect(sixRowsHeight).toBeLessThanOrEqual(900)
  })
})

describe('configured starting templates and independent website recommendations', () => {
  it.each([['Fighter'], ['Marksman'], ['Assassin']])(
    'publishes both physical starter items for %j',
    (role) => {
      const snapshot = fixture([role])
      snapshot.equipment = null
      const template = equipmentPresentation(snapshot).startingTemplate
      expect(template.map((item) => item.id)).toEqual([3177, 1036])
      expect(template.map((item) => item.name)).toEqual(['守护者之刃', '长剑'])
      expect(template.every((item) => item.row === undefined)).toBe(true)
    }
  )
  it('uses Horn plus Ruby Crystal for tanks and does not force mage or uncertain mixed roles', () => {
    expect(
      equipmentPresentation(fixture(['Tank'])).startingTemplate.map((item) => item.id)
    ).toEqual([2051, 1028])
    expect(equipmentPresentation(fixture(['Mage'])).startingTemplate).toEqual([])
    expect(equipmentPresentation(fixture(['Mage', 'Assassin'])).startingTemplate).toEqual([])
  })
  it('leaves Gwen guardian pending and preserves explicit champion overrides including opt-out', () => {
    const snapshot = fixture(['Fighter'])
    snapshot.championId = snapshot.equipmentContext!.championId = 887
    const builtin = equipmentPresentation(snapshot).startingTemplate
    expect(builtin.map((item) => item.id)).toEqual([null, 1052])
    expect(builtin[1].name).toBe('增幅典籍')
    snapshot.equipmentContext!.startingEquipment = resolveStartingEquipmentPreferences({
      championOverrides: { '887': [null, 1036] }
    })
    expect(equipmentPresentation(snapshot).startingTemplate.map((item) => item.id)).toEqual([
      null,
      1036
    ])
    snapshot.equipmentContext!.startingEquipment = resolveStartingEquipmentPreferences({
      championOverrides: { '887': [] }
    })
    expect(equipmentPresentation(snapshot).startingTemplate).toEqual([])
  })
  it('does not alter website starter rows or put their statistics on user templates', () => {
    const snapshot = fixture()
    const website = [row([1018, 1052], 0.3), row([1036, 2003], 0.2)]
    snapshot.equipment!.categories.starting = website
    const view = equipmentPresentation(snapshot)
    expect(view.startingTemplate.map((item) => item.id)).toEqual([3177, 1036])
    expect(view.startingTemplate.every((item) => item.row === undefined)).toBe(true)
    expect(snapshot.equipment!.categories.starting).toEqual(website)
  })
})

function fixture(roles = ['Fighter']): OverlaySnapshot {
  return {
    sessionKey: 'player:1',
    championId: 122,
    championName: '英雄',
    shopVisible: true,
    cardsVisible: false,
    suppressed: false,
    category: 'items',
    candidates: [null, null, null],
    augmentData: null,
    equipment: {
      championId: 122,
      date: '20261010',
      source: '腾讯101',
      categories: {
        items: [
          row([1], 0.9),
          row([1], 0.8),
          row([2], 0.7),
          row([3], 0.6),
          row([4], 0.5),
          row([5], 0.4),
          row([6], 0.3),
          row([7], 0.2),
          row([8], 0.1),
          row([9], 0.05)
        ],
        core: [row([1, 2, 3], 0.4), row([3, 2, 1], 0.3), row([4, 5, 6], 0.2)],
        shoes: [],
        starting: []
      }
    },
    itemAssets: {},
    diagnostic: 'unit fixture',
    equipmentContext: {
      sessionKey: 'player:1',
      championId: 122,
      roles,
      teams: null,
      inventory: { ids: [4], observedAt: 1 },
      bindings: emptyEquipmentBindings()
    }
  }
}
function confirm(snapshot: OverlaySnapshot, ids = [1048]) {
  snapshot.confirmedSelection = {
    sessionKey: snapshot.sessionKey!,
    championId: snapshot.championId!,
    ids,
    source: 'reviewed-user-confirmation'
  }
}

describe('equipment build boundaries', () => {
  it('pins the ordered standard combination and filters five follow-ups after core, owned and duplicate exclusions', () => {
    const snapshot = fixture(),
      session = new MayhemSessionController()
    session.setSession(snapshot.sessionKey, snapshot.championId)
    const initial = equipmentPresentation(snapshot)
    expect(initial.core?.ids).toEqual([1, 2, 3])
    expect(initial.later.map((item) => item.ids)).toEqual([[5], [6], [7], [8], [9]])
    session.pinStandardCore(snapshot.sessionKey!, snapshot.championId!, initial.core!.ids)
    snapshot.standardCoreIds = session.standardCoreIds
    snapshot.equipment!.categories.core.reverse()
    snapshot.equipment!.categories.core[0].pickRate = 0.99
    confirm(snapshot)
    const adapted = equipmentPresentation(snapshot)
    expect(adapted.core).toEqual(initial.core)
    expect(adapted.later).toEqual(initial.later)
    expect(snapshot.buildView).toBeUndefined()
    expect(adapted.adapted[0]).toMatchObject({ id: null, name: '无尽之刃' })
    expect(adapted.adapted[0].row).toBeUndefined()
    snapshot.equipment!.categories.core = []
    expect(equipmentPresentation(snapshot).core).toEqual({
      ids: [1, 2, 3],
      pickRate: null,
      winRate: null
    })
  })

  it.each([
    ['candidate only', false, 'player:1', 'reviewed-user-confirmation'],
    ['wrong game', true, 'player:2', 'reviewed-user-confirmation'],
    ['fixture outside debug', true, 'player:1', 'offline-fixture']
  ])('does not unlock adaptation for %s', (_, hasSelection, key, source) => {
    const snapshot = fixture()
    snapshot.candidates[0] = {
      id: 1048,
      rarity: 'prismatic',
      tier: null,
      pickRate: null,
      winRate: null
    }
    if (hasSelection)
      snapshot.confirmedSelection = {
        sessionKey: key,
        championId: 122,
        ids: [1048],
        source: source as never
      }
    expect(equipmentPresentation(snapshot).adaptationAvailable).toBe(false)
    expect(equipmentPresentation(snapshot).adapted).toEqual([])
  })

  it.each([
    [['Fighter', 'Assassin'], 'guardian-blade', 'physical'],
    [['Marksman'], 'guardian-blade', null],
    [['Tank'], 'guardian-horn', null],
    [['Mage'], null, 'mage'],
    [['Mage', 'Assassin'], null, null],
    [['Fighter', 'unverified'], null, null],
    [[], null, null]
  ])(
    'uses role consensus without choosing an arbitrary first tag: %j',
    (roles, starting, adaptation) => {
      expect(resolveEquipmentRoles(roles as string[])).toMatchObject({ starting, adaptation })
      const snapshot = fixture(roles as string[])
      expect(equipmentPresentation(snapshot).starting?.key ?? null).toBe(starting)
    }
  )

  it('keeps fixture mappings out of production and excludes owned conditional candidates', () => {
    const snapshot = fixture(['Mage'])
    snapshot.equipmentContext!.bindings.infinityEdge = {
      id: 4,
      mode: 'KIWI',
      provenance: 'offline-fixture'
    }
    confirm(snapshot)
    expect(equipmentPresentation(snapshot).adapted[0].id).toBeNull()
    snapshot.equipmentContext!.debugFixture = true
    expect(equipmentPresentation(snapshot).adapted).toEqual([])
    snapshot.equipmentContext!.inventory = null
    expect(equipmentPresentation(snapshot).adapted[0]).toMatchObject({ id: 4 })
    expect(equipmentPresentation(snapshot).inventoryAvailable).toBe(false)
  })

  it('blocks unknown TF mappings and never treats dictionary 2062 as the recall condition', () => {
    const snapshot = fixture(['Mage'])
    snapshot.championId = snapshot.equipment!.championId = snapshot.equipmentContext!.championId = 4
    snapshot.equipment!.categories.core = [row([2, 3, 4]), row([1, 2, 3], 0.05)]
    confirm(snapshot, [1048, 2062])
    expect(equipmentPresentation(snapshot)).toMatchObject({
      core: null,
      later: [],
      adaptationAvailable: false
    })
    snapshot.equipmentContext!.bindings.torch = { id: 1, mode: 'KIWI', provenance: 'reviewed' }
    snapshot.equipmentContext!.bindings.luden = { id: 4, mode: 'KIWI', provenance: 'reviewed' }
    const standard = equipmentPresentation(snapshot)
    expect(standard.core?.ids).toEqual([1, 2, 3])
    expect(standard.adapted.map((item) => item.key)).toEqual(['infinity-edge'])
    snapshot.equipmentContext!.bindings.recallAugment = {
      id: 900003,
      mode: 'KIWI',
      provenance: 'reviewed'
    }
    snapshot.equipmentContext!.inventory = { ids: [1], observedAt: 2 }
    confirm(snapshot, [1048, 900003])
    expect(equipmentPresentation(snapshot).adapted.map((item) => item.key)).toEqual([
      'infinity-edge',
      'luden'
    ])
    expect(equipmentPresentation(snapshot).core?.ids).toEqual([1, 2, 3])
  })

  it('shows actual tank rosters and reviewed optional defense candidates without forcing a core', () => {
    const snapshot = fixture(['Tank'])
    snapshot.equipmentContext!.teams = {
      allies: [{ championId: 122, name: '我方', roles: ['Tank'] }],
      enemies: [
        { championId: 236, name: '射手', roles: ['Marksman'] },
        { championId: 103, name: '法师', roles: ['Mage'] }
      ]
    }
    expect(equipmentPresentation(snapshot)).toMatchObject({
      core: null,
      tankCandidates: [],
      tankMappingPending: true
    })
    const bindings = snapshot.equipmentContext!.bindings
    bindings.armor = [{ id: 1, mode: 'KIWI', provenance: 'reviewed' }]
    bindings.magicResist = [{ id: 2, mode: 'KIWI', provenance: 'reviewed' }]
    bindings.health = [{ id: 3, mode: 'KIWI', provenance: 'reviewed' }]
    const view = equipmentPresentation(snapshot)
    expect(view.tankCandidates.map((candidate) => candidate.id)).toEqual([1, 2, 3])
    expect(view.later.map((item) => item.ids)).toEqual([[5], [6], [7]])
    expect(view.tankCandidates.every((candidate) => candidate.row?.winRate === 0.5)).toBe(true)
    expect(equipmentPresentationHeight(snapshot)).toBeGreaterThanOrEqual(760)
    expect(equipmentPresentationHeight(snapshot)).toBeLessThanOrEqual(880)
  })

  it('leaves missing or mismatched statistics empty and rejects stale context', () => {
    const snapshot = fixture()
    snapshot.equipment = null
    confirm(snapshot)
    expect(equipmentPresentation(snapshot)).toMatchObject({
      core: null,
      later: [],
      adaptationAvailable: false
    })
    expect(equipmentPresentation(snapshot).startingTemplate.map((item) => item.id)).toEqual([
      3177, 1036
    ])
    snapshot.equipment = fixture().equipment
    snapshot.equipment!.championId = 103
    expect(equipmentPresentation(snapshot).later).toEqual([])
    snapshot.equipmentContext!.sessionKey = 'old:game'
    expect(equipmentPresentation(snapshot)).toMatchObject({
      context: null,
      teams: null,
      inventoryAvailable: false,
      adapted: []
    })
  })
})

describe('existing ongoing-game roster input', () => {
  const teams = { blue: ['enemy'], red: ['self', 'ally'] }
  const selections = { self: 122, ally: 103, enemy: 236 }
  const catalog = {
    122: { name: '战士', roles: ['Fighter'] },
    103: { name: '法师', roles: ['Mage'] },
    236: { name: '射手', roles: ['Marksman'] }
  }
  it('derives the own team from PUUID and copies the existing champion selections', () => {
    expect(resolveEquipmentTeams(teams, selections, 'self', 122, catalog)).toEqual({
      allies: [
        { championId: 122, name: '战士', roles: ['Fighter'] },
        { championId: 103, name: '法师', roles: ['Mage'] }
      ],
      enemies: [{ championId: 236, name: '射手', roles: ['Marksman'] }]
    })
  })
  it('rejects ambiguous, incomplete and wrong-hero rosters', () => {
    expect(
      resolveEquipmentTeams(
        { blue: ['enemy'], red: ['self'], third: ['ally'] },
        selections,
        'self',
        122,
        catalog
      )
    ).toBeNull()
    expect(
      resolveEquipmentTeams({ blue: ['self'], red: ['self'] }, selections, 'self', 122, catalog)
    ).toBeNull()
    expect(resolveEquipmentTeams(teams, { self: 122, enemy: 236 }, 'self', 122, catalog)).toBeNull()
    expect(resolveEquipmentTeams(teams, selections, 'self', 103, catalog)).toBeNull()
  })
})
