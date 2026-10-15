import { describe, expect, test } from 'vitest'

import {
  APP_SETTINGS_NAVIGATION_STEP_KEY,
  SETTINGS_MODAL_NAVIGATION_STEP_KEY,
  getSettingsGroup
} from '@main-window/components/settings-modal/navigation'
import { STORAGE_SETTINGS_NAVIGATION_STEP_KEY } from '@main-window/components/settings-modal/storage-settings/navigation'
import {
  MAIN_WINDOW_NAVIGATION_STEP_KEY,
  createMainPageNavigationStepKey
} from '@main-window/navigation-steps'
import { AUTO_SELECT_NAVIGATION_STEP_KEY } from '@main-window/views/automation/auto-select-navigation'

import {
  type SettingsNavigationTargetDefinition,
  createSettingsNavigationPath,
  createSettingsNavigationRegistry,
  getSettingsNavigationTarget,
  searchableSettingsNavigationTargets,
  settingsNavigationRegistry,
  settingsNavigationTargets
} from './registry'
import { createSettingsNavigationTargetStepKey } from './useSettingsNavigationTarget'

describe('Settings navigation registry', () => {
  test('removes retired OP.GG from search and redirects old window-setting links to Mini settings', () => {
    expect(
      searchableSettingsNavigationTargets.some((target) =>
        target.id.startsWith('multi-window.opgg')
      )
    ).toBe(false)
    for (const id of [
      'multi-window.opgg',
      'multi-window.opgg.enabled',
      'multi-window.opgg.shortcut'
    ]) {
      const target = getSettingsNavigationTarget(id)!
      expect(target.id).toBe(id)
      expect(target.terminalId).toBe('multi-window.aux')
      expect(target.route).toEqual({ tab: 'multi-window' })
      expect(createSettingsNavigationPath(target).at(-1)?.key).toBe(
        createSettingsNavigationTargetStepKey('multi-window.aux')
      )
    }
  })
  test('keeps every target id unique and resolvable', () => {
    expect(settingsNavigationRegistry.size).toBe(settingsNavigationTargets.length)

    for (const target of settingsNavigationTargets) {
      expect(getSettingsNavigationTarget(target.id)).toEqual(target)
    }
  })

  test('keeps searchable rows connected to a navigation route', () => {
    expect(searchableSettingsNavigationTargets.length).toBeGreaterThan(0)

    for (const target of searchableSettingsNavigationTargets) {
      expect('tab' in target.route ? target.route.tab : target.route.name).toBeTruthy()
    }
  })

  test('describes deep links that cross top-level and nested tabs', () => {
    expect(getSettingsNavigationTarget('ongoing-game.player-card.tags')?.route).toEqual({
      tab: 'ongoing-game'
    })
    expect(getSettingsNavigationTarget('storage.saved-settings.import')?.route).toEqual({
      tab: 'storage',
      subTab: 'settings'
    })
    expect(getSettingsNavigationTarget('storage.tagged-players')?.route).toEqual({
      tab: 'storage',
      subTab: 'tagged-players'
    })
    expect(getSettingsNavigationTarget('automation.champ-select.ban.delay')?.route).toEqual({
      name: 'automation',
      section: 'auto-select'
    })
    expect(
      getSettingsNavigationTarget('toolkit.in-game-send.settings.send-interval')?.route
    ).toEqual({
      name: 'toolkit',
      section: 'in-game-send'
    })
    expect(
      getSettingsNavigationTarget('toolkit.client.league-client-ux.adjust-window-size')?.route
    ).toEqual({
      name: 'toolkit',
      section: 'client'
    })
    expect(
      getSettingsNavigationTarget('toolkit.misc.chat-availability.availability')?.route
    ).toEqual({
      name: 'toolkit',
      section: 'misc'
    })
  })

  test('builds canonical paths for each supported P0 navigation surface', () => {
    const settingsTarget = getSettingsNavigationTarget('ongoing-game.player-card.tags')!
    const taggedPlayersTarget = getSettingsNavigationTarget('storage.tagged-players')!
    const storageTarget = getSettingsNavigationTarget('storage.saved-settings.import')!
    const autoSelectTarget = getSettingsNavigationTarget('automation.champ-select.ban.delay')!
    const toolkitTarget = getSettingsNavigationTarget(
      'toolkit.in-game-send.settings.send-interval'
    )!

    expect(createSettingsNavigationPath(settingsTarget)).toEqual([
      {
        key: MAIN_WINDOW_NAVIGATION_STEP_KEY,
        payload: { surface: 'settings-modal' }
      },
      {
        key: SETTINGS_MODAL_NAVIGATION_STEP_KEY,
        payload: { tab: 'ongoing-game', targetId: settingsTarget.id }
      },
      {
        key: createSettingsNavigationTargetStepKey(settingsTarget.id)
      }
    ])
    expect(createSettingsNavigationPath(storageTarget).map((step) => step.key)).toEqual([
      MAIN_WINDOW_NAVIGATION_STEP_KEY,
      SETTINGS_MODAL_NAVIGATION_STEP_KEY,
      createSettingsNavigationTargetStepKey(storageTarget.id)
    ])
    expect(createSettingsNavigationPath(taggedPlayersTarget).map((step) => step.key)).toEqual([
      MAIN_WINDOW_NAVIGATION_STEP_KEY,
      SETTINGS_MODAL_NAVIGATION_STEP_KEY,
      STORAGE_SETTINGS_NAVIGATION_STEP_KEY,
      createSettingsNavigationTargetStepKey(taggedPlayersTarget.id)
    ])
    expect(createSettingsNavigationPath(autoSelectTarget)).toContainEqual({
      key: AUTO_SELECT_NAVIGATION_STEP_KEY,
      payload: { tab: 'ban' }
    })
    expect(
      createSettingsNavigationPath(autoSelectTarget, { autoSelectGroupId: 'aram' })
    ).toContainEqual({
      key: AUTO_SELECT_NAVIGATION_STEP_KEY,
      payload: { tab: 'ban', groupId: 'aram' }
    })
    expect(createSettingsNavigationPath(toolkitTarget).map((step) => step.key)).toEqual([
      MAIN_WINDOW_NAVIGATION_STEP_KEY,
      createMainPageNavigationStepKey('toolkit'),
      createSettingsNavigationTargetStepKey(toolkitTarget.id)
    ])
  })

  test('keeps conditional preparation and virtual target fallback in the business path', () => {
    const conditionalTarget = getSettingsNavigationTarget('app.misc.http-proxy.host')!
    const virtualTarget = getSettingsNavigationTarget(
      'automation.gameflow.aram-team-side.visible-to-team'
    )!

    expect(createSettingsNavigationPath(conditionalTarget)).toContainEqual({
      key: APP_SETTINGS_NAVIGATION_STEP_KEY,
      payload: 'forced-http-proxy'
    })
    expect(createSettingsNavigationPath(virtualTarget).at(-1)).toEqual({
      key: createSettingsNavigationTargetStepKey('automation.gameflow.aram-team-side.enabled')
    })
  })

  test('gives every registered target a root-to-terminal canonical path', () => {
    for (const target of settingsNavigationTargets) {
      const path = createSettingsNavigationPath(target)
      expect(path[0]?.key).toBe(MAIN_WINDOW_NAVIGATION_STEP_KEY)
      expect(path.at(-1)).toEqual({
        key: createSettingsNavigationTargetStepKey(target.terminalId ?? target.id)
      })
    }
  })

  test.each([
    ['app.basic.locale', 'data'],
    ['app.misc.http-proxy.host', 'data'],
    ['app.self-update.auto-download', 'maintenance'],
    ['app.basic.close-action', 'window'],
    ['app.misc.disable-hardware-acceleration', 'window'],
    ['app.basic.theme', 'appearance'],
    ['app.main-window-ui.custom-background', 'appearance']
  ] as const)('locates %s in the correct workspace group', (id, group) => {
    const target = getSettingsNavigationTarget(id)!
    const path = createSettingsNavigationPath(target)
    const step = path.find((step) => step.key === SETTINGS_MODAL_NAVIGATION_STEP_KEY)!
    const payload = step.payload as {
      tab: Parameters<typeof getSettingsGroup>[0]
      targetId: string
    }
    expect(getSettingsGroup(payload.tab, payload.targetId)).toBe(group)
    expect(path.at(-1)?.key).toBe(createSettingsNavigationTargetStepKey(id))
  })

  test('opens the existing background editor before focusing its controls', () => {
    const path = createSettingsNavigationPath(
      getSettingsNavigationTarget('app.main-window-ui.background')!
    )
    expect(path.at(-2)).toEqual({ key: APP_SETTINGS_NAVIGATION_STEP_KEY, payload: 'background' })
  })

  test('keeps legacy tab payloads compatible with the single settings level', () => {
    expect(getSettingsGroup('storage')).toBe('data')
    expect(getSettingsGroup('ongoing-game')).toBe('window')
    expect(getSettingsGroup('about')).toBe('maintenance')
  })

  test('rejects duplicate ids', () => {
    const duplicateTargets: SettingsNavigationTargetDefinition[] = [
      {
        id: 'duplicate',
        route: { tab: 'basic' },
        labelKey: 'first'
      },
      {
        id: 'duplicate',
        route: { tab: 'misc' },
        labelKey: 'second'
      }
    ]

    expect(() => createSettingsNavigationRegistry(duplicateTargets)).toThrow(
      'Duplicate settings navigation target: duplicate'
    )
  })

  test('rejects missing parent and fallback targets', () => {
    const target: SettingsNavigationTargetDefinition = {
      id: 'child',
      route: { tab: 'basic' },
      labelKey: 'child',
      parentId: 'missing-parent'
    }

    expect(() => createSettingsNavigationRegistry([target])).toThrow(
      'Unknown settings navigation target missing-parent referenced by child'
    )
  })

  test('rejects fallback cycles', () => {
    const cyclicTargets: SettingsNavigationTargetDefinition[] = [
      {
        id: 'first',
        route: { tab: 'basic' },
        labelKey: 'first',
        fallbackId: 'second'
      },
      {
        id: 'second',
        route: { tab: 'basic' },
        labelKey: 'second',
        fallbackId: 'first'
      }
    ]

    expect(() => createSettingsNavigationRegistry(cyclicTargets)).toThrow(
      'Settings navigation fallback cycle detected from first'
    )
  })
})
