import {
  type ItemRow,
  type OverlaySnapshot,
  emptyEquipmentBindings
} from '@shared/mayhem-assistant/model'

export type FixtureRole = 'fighter' | 'assassin' | 'marksman' | 'mage' | 'tank' | 'twisted' | 'gwen'
const heroes = {
  fighter: { id: 157, name: '亚索', roles: ['Fighter', 'Assassin'] },
  assassin: { id: 238, name: '劫', roles: ['Assassin'] },
  marksman: { id: 236, name: '卢锡安', roles: ['Marksman'] },
  mage: { id: 103, name: '阿狸', roles: ['Mage'] },
  tank: { id: 12, name: '阿利斯塔', roles: ['Tank'] },
  twisted: { id: 4, name: '崔斯特', roles: ['Mage'] },
  gwen: { id: 887, name: '格温', roles: [] }
}

const row = (ids: number[], pickRate: number | null, winRate: number | null): ItemRow => ({
  ids,
  pickRate,
  winRate
})

// Local official artwork is only a visual fixture, not a production KIWI ID mapping.
const icons = import.meta.glob<string>('./ui-review/item-icons/*.png', {
  eager: true,
  query: '?inline',
  import: 'default'
})
const icon = (id: number) =>
  icons[`./ui-review/item-icons/${id}.png`] ??
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="4" fill="#1d2938"/><text x="32" y="28" fill="#bab49f" font-size="12" text-anchor="middle" font-family="sans-serif">演示占位</text><text x="32" y="46" fill="#bab49f" font-size="10" text-anchor="middle" font-family="sans-serif">${id}</text></svg>`)}`

export function createFixture(session = 1, role: FixtureRole = 'fighter'): OverlaySnapshot {
  const hero = heroes[role]
  const names: Array<[number, string]> = [
    [3153, '破败王者之刃'],
    [3031, '无尽之刃'],
    [6333, '死亡之舞'],
    [3032, '育恩塔尔荒野箭'],
    [3084, '心之钢'],
    [3006, '狂战士胫甲'],
    [3111, '水银之靴'],
    [3047, '铁板靴'],
    [1018, '灵巧披风'],
    [1052, '增幅典籍'],
    [1036, '长剑'],
    [2003, '生命药水'],
    [3071, '黑色切割者'],
    [3074, '贪欲九头蛇'],
    [3139, '水银弯刀'],
    [3091, '智慧末刃'],
    [3177, '守护者之刃'],
    [2051, '守护者号角'],
    [1028, '红水晶'],
    [900001, '火炬（离线示例）'],
    [900002, '卢登（离线示例）']
  ]
  const snapshot: OverlaySnapshot = {
    sessionKey: `offline-fixture-${session}`,
    championId: hero.id,
    championName: hero.name,
    shopVisible: true,
    cardsVisible: true,
    suppressed: false,
    category: 'items',
    buildView: 'standard',
    confirmedSelection: null,
    equipmentContext: {
      sessionKey: `offline-fixture-${session}`,
      championId: hero.id,
      roles: hero.roles,
      inventory: { ids: [], observedAt: Date.now() },
      teams: {
        allies: [
          { championId: hero.id, name: hero.name, roles: hero.roles },
          { championId: 103, name: '阿狸', roles: ['Mage'] }
        ],
        enemies: [
          { championId: 236, name: '卢锡安', roles: ['Marksman'] },
          { championId: 103, name: '阿狸', roles: ['Mage'] }
        ]
      },
      bindings: {
        ...emptyEquipmentBindings(),
        guardianBlade: { id: 3177, mode: 'KIWI', provenance: 'offline-fixture' },
        guardianHorn: { id: 2051, mode: 'KIWI', provenance: 'offline-fixture' },
        infinityEdge: { id: 3031, mode: 'KIWI', provenance: 'offline-fixture' },
        torch: { id: 900001, mode: 'KIWI', provenance: 'offline-fixture' },
        luden: { id: 900002, mode: 'KIWI', provenance: 'offline-fixture' },
        // Synthetic fixture numbers, deliberately unrelated to unverified game mappings.
        recallAugment: { id: 900003, mode: 'KIWI', provenance: 'offline-fixture' },
        armor: [{ id: 3047, mode: 'KIWI', provenance: 'offline-fixture' }],
        magicResist: [{ id: 3091, mode: 'KIWI', provenance: 'offline-fixture' }],
        health: [{ id: 3084, mode: 'KIWI', provenance: 'offline-fixture' }]
      },
      debugFixture: true
    },
    candidates: [
      { id: 1077, rarity: 'gold', tier: 'S', winRate: 0.6052, pickRate: 0.2389 },
      { id: 1206, rarity: 'silver', tier: 'A', winRate: 0.6273, pickRate: 0.0466 },
      { id: 1048, rarity: 'prismatic', tier: 'B', winRate: null, pickRate: 0.0343 }
    ],
    equipment: {
      championId: hero.id,
      date: '离线夹具 · 非实战统计',
      source: '腾讯101',
      categories: {
        items: [
          row([3153], 0.6228, 0.5498),
          row([3031], 0.4297, 0.5468),
          row([6333], 0.4215, 0.5968),
          row([3032], 0.2011, 0.5678),
          row([3084], 0.1774, 0.4727),
          row([3047], 0.16, 0.55),
          row([3071], 0.15, 0.52),
          row([3074], 0.13, 0.54),
          row([3139], 0.12, 0.5),
          row([3091], 0.11, 0.51)
        ],
        shoes: [row([3006], 0.5546, 0.5734), row([3111], 0.1368, null), row([3047], null, 0.5102)],
        core: [
          row([3031, 3153, 6333], 0.0699, 0.6172),
          row([3032, 3153, 3031], 0.0376, 0.5976),
          row([3153, 3032, 6333], 0.0351, 0.6011),
          row([3032, 3153, 6333], 0.0302, 0.5618),
          row([3031, 6333, 3084], 0.0181, 0.5824),
          row([3153, 3032, 3084], 0.0104, null)
        ],
        starting: [row([1018, 1052], 0.038, 0.6207), row([1036, 2003], 0.021, 0.5702)]
      }
    },
    augmentData: null,
    itemAssets: Object.fromEntries(names.map(([id, name]) => [id, { name, icon: icon(id) }])),
    diagnostic: '离线 UI 夹具；未连接游戏'
  }
  if (role === 'twisted') {
    snapshot.equipment!.categories.core = [row([900001, 3153, 6333], 0.1, 0.55)]
    snapshot.equipment!.categories.items.unshift(row([900002], 0.9, 0.6), row([900001], 0.8, 0.6))
  }
  return snapshot
}

export function createUnknownItemFixture(
  session = 1,
  role: FixtureRole = 'fighter'
): OverlaySnapshot {
  const snapshot = createFixture(session, role)
  snapshot.equipment!.categories.items.unshift(row([123430], 0.6758, 0.6033))
  snapshot.equipment!.categories.core[0] = row([123430, 3153, 6333], 0.0699, 0.6172)
  return snapshot
}

export function createEmptyFixture(): OverlaySnapshot {
  return {
    sessionKey: null,
    championId: null,
    championName: '等待载入',
    shopVisible: false,
    cardsVisible: false,
    suppressed: false,
    category: 'items',
    candidates: [null, null, null],
    equipment: null,
    augmentData: null,
    itemAssets: {},
    diagnostic: '请显式载入离线演示夹具'
  }
}
