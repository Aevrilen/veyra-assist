import type {
  AutomaticOverlayLayout,
  Calibration,
  OverlaySnapshot,
  Rect
} from '@shared/mayhem-assistant/model'
import {
  FALLBACK_PREVIEW_EVENT,
  type FallbackSelectionPreview
} from '@shared/types/fallback-calibration'
import { BrowserWindow, screen } from 'electron'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MayhemWindowController } from './window-controller'

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  screen: { getAllDisplays: vi.fn(), screenToDipRect: vi.fn(), dipToScreenRect: vi.fn() }
}))

let failRole: string | null = null
let windows: NativeWindow[] = []
let controllers: MayhemWindowController[] = []
const logger = { info: vi.fn() }

// These mocks verify window orchestration. Native Windows focus, hit testing and
// compositor behavior still require the packaged application's runtime smoke test.
class NativeWindow extends EventEmitter {
  destroyed = false
  visible = false
  minimized = false
  role = ''
  zoom = 1
  bounds: Electron.Rectangle
  webContents = Object.assign(new EventEmitter(), {
    id: windows.length + 1,
    send: vi.fn(),
    getZoomFactor: vi.fn(() => this.zoom),
    setZoomFactor: vi.fn((zoom: number) => {
      this.zoom = zoom
    })
  })

  constructor(readonly options: Electron.BrowserWindowConstructorOptions) {
    super()
    this.bounds = {
      x: options.x!,
      y: options.y!,
      width: options.width!,
      height: options.height!
    }
  }

  isDestroyed = () => this.destroyed
  isVisible = () => this.visible
  getBounds = () => ({ ...this.bounds })
  isMinimized = () => this.minimized
  restore = vi.fn(() => {
    this.minimized = false
  })
  focus = vi.fn()
  show = vi.fn(() => {
    const changed = !this.visible
    this.visible = true
    if (changed) this.emit('show')
  })
  showInactive = vi.fn(() => {
    const changed = !this.visible
    this.visible = true
    if (changed) this.emit('show')
  })
  hide = vi.fn(() => {
    const changed = this.visible
    this.visible = false
    if (changed) this.emit('hide')
  })
  setAlwaysOnTop = vi.fn()
  setIgnoreMouseEvents = vi.fn()
  setVisibleOnAllWorkspaces = vi.fn()
  setBounds = vi.fn((bounds: Electron.Rectangle) => {
    this.bounds = bounds
  })
  destroy = () => {
    this.destroyed = true
    this.visible = false
    this.emit('closed')
  }
  loadFile = async (_file: string, options: { query: { role: string } }) => {
    this.role = options.query.role
    if (failRole === this.role) {
      failRole = null
      throw new Error('Renderer entry unavailable')
    }
  }
  ready() {
    this.webContents.emit('did-finish-load')
  }
}

const calibration: Calibration = {
  version: 1,
  displayId: '1',
  shop: [],
  cards: [],
  shopRect: { x: 180, y: 180, width: 1300, height: 1060 },
  cardRects: [560, 1069, 1578].map((x) => ({ x, y: 360, width: 421, height: 560 })),
  titleRects: []
}

function snapshot(overrides: Partial<OverlaySnapshot> = {}): OverlaySnapshot {
  return {
    sessionKey: 'player:1',
    championId: 157,
    championName: '亚索',
    shopVisible: true,
    cardsVisible: false,
    suppressed: false,
    category: 'items',
    candidates: [null, null, null],
    equipment: null,
    augmentData: null,
    itemAssets: {},
    diagnostic: '商店可见',
    ...overrides
  }
}

function controller() {
  const result = new MayhemWindowController(logger)
  controllers.push(result)
  return result
}

function windowFor(role: string) {
  const result = windows.find((window) => window.role === role && !window.destroyed)
  if (!result) throw new Error(`Missing ${role} window`)
  return result
}

describe('Mayhem overlay window lifecycle', () => {
  beforeEach(() => {
    windows = []
    controllers = []
    failRole = null
    vi.mocked(screen.screenToDipRect).mockImplementation((_window, rect) => rect)
    vi.mocked(screen.dipToScreenRect).mockImplementation((_window, rect) => rect)
    vi.stubEnv('ELECTRON_RENDERER_URL', '')
    vi.mocked(BrowserWindow).mockImplementation(function (options) {
      const window = new NativeWindow(options!)
      windows.push(window)
      return window as unknown as BrowserWindow
    })
    vi.mocked(screen.getAllDisplays).mockReturnValue([
      {
        id: 1,
        size: { width: 2560, height: 1440 },
        scaleFactor: 1,
        bounds: { x: -2560, y: 0, width: 2560, height: 1440 }
      } as Electron.Display
    ])
  })

  afterEach(() => {
    controllers.forEach((controller) => controller.dispose())
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('prewarms only three hidden equipment roles and reuses them for the later fresh shop', () => {
    const subject = controller()
    subject.prewarmEquipment()
    const warmed = [...windows]
    subject.prewarmEquipment()
    expect(windows.map((window) => window.role)).toEqual([
      'equipment',
      'controls',
      'equipment-actions'
    ])
    warmed.forEach((window) => window.ready())
    subject.prewarmEquipment()
    expect(windows).toEqual(warmed)
    for (const window of warmed) {
      expect(window.visible).toBe(false)
      expect(window.options).toMatchObject({
        show: false,
        focusable: false,
        webPreferences: { backgroundThrottling: true }
      })
      expect(window.showInactive).not.toHaveBeenCalled()
      expect(window.focus).not.toHaveBeenCalled()
    }
    const current = snapshot()
    subject.update(current, calibration, { sequence: 1, capturedAt: Date.now() })
    expect(windows).toEqual(warmed)
    expect(warmed.every((window) => window.visible)).toBe(true)
    expect(windowFor('equipment').bounds.x).not.toBe(0)
    for (const window of warmed) {
      expect(window.webContents.send.mock.calls.at(-1)![1]).toBe(current)
      expect(window.focus).not.toHaveBeenCalled()
    }
  })
  it('sends frozen previews exclusively to Setup and releases retained media on reload and close', () => {
    const release = vi.fn()
    const subject = new MayhemWindowController(logger, release)
    controllers.push(subject)
    subject.prewarmEquipment()
    const preview = { requestId: 'request-a', imageUrl: 'MEMORY_ONLY' } as FallbackSelectionPreview
    subject.sendFallbackPreview(preview)
    expect(windows.every((window) => window.webContents.send.mock.calls.length === 0)).toBe(true)
    subject.openSetup()
    const setup = windowFor('setup')
    subject.sendFallbackPreview(preview)
    expect(setup.webContents.send).toHaveBeenCalledExactlyOnceWith(FALLBACK_PREVIEW_EVENT, preview)
    expect(
      windows
        .filter((window) => window.role !== 'setup')
        .every((window) => window.webContents.send.mock.calls.length === 0)
    ).toBe(true)
    setup.webContents.emit('did-start-loading')
    expect(release).toHaveBeenCalledOnce()
    setup.destroy()
    expect(release).toHaveBeenCalledTimes(2)
    subject.sendFallbackPreview(preview)
    expect(setup.webContents.send).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['shop closed', { shopVisible: false }, calibration],
    ['suppressed', { shopVisible: false, suppressed: true }, calibration],
    ['collapsed', { shopVisible: false, equipmentCollapsed: true }, calibration],
    ['session ended', { shopVisible: false, sessionKey: null, championId: null }, calibration],
    ['calibration unavailable', {}, null]
  ] as const)('keeps pending prewarmed equipment hidden after %s', (_reason, state, calibrated) => {
    const subject = controller()
    subject.prewarmEquipment()
    const warmed = [...windows]
    subject.update(snapshot(), calibration)
    const current = snapshot(state)
    subject.update(current, calibrated)
    windows.forEach((window) => window.ready())
    for (const window of warmed) {
      expect(window.showInactive).not.toHaveBeenCalled()
      expect(window.visible).toBe(false)
      expect(window.webContents.send.mock.calls.at(-1)![1]).toBe(current)
    }
  })

  it('keeps the 1500ms boundary through readiness and reload instead of showing an expired shop', () => {
    vi.useFakeTimers()
    try {
      const subject = controller()
      subject.prewarmEquipment()
      const capturedAt = Date.now()
      // Shop-only frames clear the title capture cache without invalidating the observation.
      const timing = { sequence: 1, capturedAt: 0, observedAt: capturedAt }
      subject.update(snapshot(), calibration, timing)
      vi.setSystemTime(capturedAt + 1500)
      windows.forEach((window) => window.ready())
      expect(windows.every((window) => window.visible)).toBe(true)
      vi.setSystemTime(capturedAt + 1501)
      subject.update(snapshot(), calibration, timing)
      expect(windows.every((window) => !window.visible)).toBe(true)
      const hidden = logger.info.mock.calls
        .map(([, json]) => JSON.parse(json))
        .filter((record) => record.stage === 'window-hide')
      expect(hidden).toHaveLength(3)
      expect(hidden.every((record) => record.reason === 'observation-expired')).toBe(true)
      windows.forEach((window) => {
        window.webContents.emit('did-start-loading')
        window.ready()
      })
      expect(windows.every((window) => !window.visible)).toBe(true)
      subject.update(snapshot(), calibration, { sequence: 2, capturedAt: Date.now() })
      expect(windows.every((window) => window.visible)).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('recovers a failed prewarm through the lazy path and ignores disposed callbacks', async () => {
    const subject = controller()
    failRole = 'controls'
    subject.prewarmEquipment()
    const warmedEquipment = windowFor('equipment')
    const failedControls = windowFor('controls')
    await Promise.resolve()
    expect(failedControls.destroyed).toBe(true)
    subject.update(snapshot(), calibration)
    const replacement = windowFor('controls')
    expect(replacement).not.toBe(failedControls)
    expect(windowFor('equipment')).toBe(warmedEquipment)
    failedControls.ready()
    windows.filter((window) => !window.destroyed).forEach((window) => window.ready())
    expect(windows.filter((window) => !window.destroyed)).toHaveLength(3)
    expect(replacement.visible).toBe(true)
    subject.dispose()
    subject.prewarmEquipment()
    subject.update(snapshot(), calibration)
    windows.forEach((window) => window.ready())
    expect(windows).toHaveLength(4)
    expect(windows.every((window) => window.destroyed)).toBe(true)
  })

  it('follows the located shop, switches sides at the right edge and keeps both surfaces within the calibrated screen', () => {
    const subject = controller()
    subject.update(snapshot(), {
      ...calibration,
      shopRect: { x: 1050, y: 440, width: 1510, height: 1000 }
    })
    const equipment = windowFor('equipment'),
      controls = windowFor('controls')
    expect(equipment.bounds.x).toBe(-2560 + 382)
    expect(controls.bounds.x).toBe(equipment.bounds.x)
    expect(controls.bounds.y).toBe(equipment.bounds.y)
    subject.update(snapshot(), {
      ...calibration,
      shopRect: { x: 500, y: 1100, width: 1510, height: 300 }
    })
    expect(equipment.bounds.x).toBe(-2560)
    expect(equipment.bounds.y + equipment.bounds.height).toBe(1440)
    expect(controls.bounds.y).toBe(equipment.bounds.y)
    const previous = equipment.setBounds.mock.calls.length
    subject.update(snapshot(), {
      ...calibration,
      shopRect: { x: 500, y: 1100, width: 1510, height: 300 }
    })
    expect(equipment.setBounds).toHaveBeenCalledTimes(previous)
  })

  it('keeps the centered-shop left fallback clear of all six cues even with an opaque 880px panel', () => {
    const subject = controller()
    subject.update(snapshot(), {
      ...calibration,
      shopRect: { x: 500, y: 220, width: 1510, height: 1000 }
    })
    const bounds = windowFor('equipment').bounds
    const panel = { ...bounds, x: bounds.x + 2560, height: 880 }
    const cues = [
      { x: 1960, y: 234, width: 34, height: 34 },
      { x: 1489, y: 246, width: 98, height: 30 },
      { x: 1999, y: 228, width: 8, height: 130 },
      { x: 1458, y: 230, width: 8, height: 126 },
      { x: 1819, y: 248, width: 24, height: 24 },
      { x: 502, y: 1122, width: 24, height: 24 }
    ]
    expect(panel.x).toBe(0)
    expect(
      cues.every(
        (cue) =>
          panel.x + panel.width <= cue.x ||
          cue.x + cue.width <= panel.x ||
          panel.y + panel.height <= cue.y ||
          cue.y + cue.height <= panel.y
      )
    ).toBe(true)
    expect(cues[5].y - (panel.y + panel.height)).toBe(22)
  })

  it('records native show and hide transitions with capture timing and no snapshot contents', () => {
    const subject = controller()
    subject.update(snapshot({ shopVisible: false, cardsVisible: true }), calibration, {
      sequence: 8,
      capturedAt: Date.now()
    })
    windows.forEach((window) => window.ready())
    subject.update(snapshot({ shopVisible: false, cardsVisible: true }), calibration, {
      sequence: 9,
      capturedAt: Date.now()
    })
    subject.update(snapshot({ shopVisible: false, cardsVisible: false }), calibration, {
      sequence: 10,
      capturedAt: Date.now()
    })
    const records = logger.info.mock.calls.map(([, json]) => JSON.parse(json))
    const shown = records.filter((record) => record.stage === 'window-show')
    const hidden = records.filter((record) => record.stage === 'window-hide')
    expect(shown).toHaveLength(3)
    expect(hidden).toHaveLength(3)
    expect(shown.every((record) => record.sequence === 8 && record.captureAgeMs >= 0)).toBe(true)
    expect(hidden.every((record) => record.sequence === 10 && record.candidateCount === 0)).toBe(
      true
    )
    expect(hidden.every((record) => record.reason === 'cards-not-visible')).toBe(true)
    for (const role of ['augment-0', 'augment-1', 'augment-2']) {
      const lifecycle = records.filter((record) => record.role === role)
      const created = lifecycle.find((record) => record.stage === 'window-created')
      const requested = lifecycle.find((record) => record.stage === 'window-load-request')
      const ready = lifecycle.find((record) => record.stage === 'window-ready')
      expect(requested.windowId).toBe(created.windowId)
      expect(requested.sinceCreatedMs).toBeGreaterThanOrEqual(0)
      expect(ready.loadRequestMs).toBeGreaterThanOrEqual(0)
      expect(ready.visible).toBe(false)
    }
    const serialized = JSON.stringify(records)
    for (const privateValue of ['亚索', 'player:1', 'championName', 'candidates', 'itemAssets'])
      expect(serialized).not.toContain(privateValue)
  })

  it('sends scalar metadata that joins a received snapshot to its version and capture sequence', () => {
    const subject = controller()
    subject.update(snapshot({ shopVisible: false, cardsVisible: true }), calibration, {
      sequence: 7,
      capturedAt: Date.now()
    })
    windows.forEach((window) => window.ready())
    const first = windowFor('augment-0').webContents.send.mock.calls.at(-1)!
    expect(first[0]).toBe('mayhem-snapshot')
    expect(first[2]).toEqual({ snapshotVersion: 1, captureSequence: 7 })
    subject.update(snapshot({ shopVisible: false, cardsVisible: true }), calibration, {
      sequence: 8,
      capturedAt: Date.now()
    })
    const second = windowFor('augment-0').webContents.send.mock.calls.at(-1)!
    expect(second[2]).toEqual({ snapshotVersion: 2, captureSequence: 8 })
    const dispatched = logger.info.mock.calls
      .map(([, json]) => JSON.parse(json))
      .filter(
        (record) => record.stage === 'window-snapshot-dispatched' && record.role === 'augment-0'
      )
    expect(
      dispatched.some(
        (record) =>
          record.snapshotVersion === second[2].snapshotVersion &&
          record.sequence === second[2].captureSequence
      )
    ).toBe(true)
    expect(Object.keys(second[2]).sort()).toEqual(['captureSequence', 'snapshotVersion'])
  })

  it('avoids repeated native layout/visibility calls while still sending fresh visible snapshots', () => {
    const subject = controller()
    const cards = snapshot({ shopVisible: false, cardsVisible: true })
    subject.update(cards, calibration, { sequence: 1, capturedAt: Date.now() })
    windows.forEach((window) => window.ready())
    const before = windows.map((window) => ({
      bounds: window.setBounds.mock.calls.length,
      show: window.showInactive.mock.calls.length,
      hide: window.hide.mock.calls.length,
      send: window.webContents.send.mock.calls.length
    }))
    for (let sequence = 2; sequence <= 61; sequence++)
      subject.update(cards, calibration, { sequence, capturedAt: Date.now() })
    windows.forEach((window, index) => {
      expect(window.setBounds).toHaveBeenCalledTimes(before[index].bounds)
      expect(window.showInactive).toHaveBeenCalledTimes(before[index].show)
      expect(window.hide).toHaveBeenCalledTimes(before[index].hide)
      expect(window.webContents.send).toHaveBeenCalledTimes(before[index].send + 60)
      expect(window.webContents.send.mock.calls.at(-1)![2]).toMatchObject({ captureSequence: 61 })
    })
    subject.update(snapshot({ shopVisible: false, cardsVisible: false }), calibration)
    const hidden = windows.map((window) => window.hide.mock.calls.length)
    for (let index = 0; index < 20; index++)
      subject.update(snapshot({ shopVisible: false, cardsVisible: false }), calibration)
    windows.forEach((window, index) => expect(window.hide).toHaveBeenCalledTimes(hidden[index]))
  })

  it('restacks visible controls after equipment resizing without repeatedly showing unchanged equipment', () => {
    const subject = controller()
    subject.update(snapshot(), calibration)
    windows.forEach((window) => window.ready())
    const equipment = windowFor('equipment'),
      controls = windowFor('controls')
    const equipmentShows = equipment.showInactive.mock.calls.length
    const controlShows = controls.showInactive.mock.calls.length
    equipment.bounds = { ...equipment.bounds, height: 500 }
    subject.update(snapshot(), calibration)
    expect(equipment.bounds.height).toBe(760)
    expect(equipment.showInactive).toHaveBeenCalledTimes(equipmentShows)
    expect(controls.showInactive).toHaveBeenCalledTimes(controlShows + 1)
    subject.update(snapshot(), calibration)
    expect(controls.showInactive).toHaveBeenCalledTimes(controlShows + 1)
  })
  it('hides on lost foreground and restores every card with the latest capture metadata', () => {
    const subject = controller(),
      cards = snapshot({ shopVisible: false, cardsVisible: true })
    subject.update(cards, calibration, { sequence: 10, capturedAt: Date.now() })
    windows.forEach((window) => window.ready())
    const first = windowFor('augment-0'),
      shows = first.showInactive.mock.calls.length
    subject.update(snapshot({ shopVisible: false, cardsVisible: false }), calibration, {
      sequence: 10,
      capturedAt: Date.now()
    })
    expect(windows.every((window) => !window.visible)).toBe(true)
    subject.update(cards, calibration, { sequence: 11, capturedAt: Date.now() })
    expect(windows.every((window) => window.visible)).toBe(true)
    expect(first.showInactive).toHaveBeenCalledTimes(shows + 1)
    expect(first.webContents.send.mock.calls.at(-1)![2]).toMatchObject({ captureSequence: 11 })
  })
  it('recreates a destroyed card window and sends the current snapshot before showing it', () => {
    const subject = controller(),
      cards = snapshot({ shopVisible: false, cardsVisible: true })
    subject.update(cards, calibration, { sequence: 20, capturedAt: Date.now() })
    windows.forEach((window) => window.ready())
    const old = windowFor('augment-1')
    old.destroy()
    subject.update(cards, calibration, { sequence: 21, capturedAt: Date.now() })
    const replacement = windowFor('augment-1')
    expect(replacement).not.toBe(old)
    expect(replacement.visible).toBe(false)
    replacement.ready()
    expect(replacement.visible).toBe(true)
    expect(replacement.webContents.send.mock.calls.at(-1)![2]).toMatchObject({
      captureSequence: 21
    })
    expect(replacement.webContents.send.mock.invocationCallOrder.at(-1)).toBeLessThan(
      replacement.showInactive.mock.invocationCallOrder.at(-1)!
    )
  })
  it('recreates equipment and re-shows unchanged controls last', () => {
    const subject = controller()
    subject.update(snapshot(), calibration)
    windows.forEach((window) => window.ready())
    const controls = windowFor('controls'),
      old = windowFor('equipment')
    old.destroy()
    expect(controls.visible).toBe(false)
    subject.update(snapshot(), calibration, { sequence: 30, capturedAt: Date.now() })
    const replacement = windowFor('equipment')
    expect(replacement).not.toBe(old)
    replacement.ready()
    expect(controls.visible).toBe(true)
    expect(replacement.visible).toBe(true)
    expect(controls.showInactive.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      replacement.showInactive.mock.invocationCallOrder.at(-1)!
    )
    expect(controls.webContents.send.mock.calls.at(-1)![2]).toMatchObject({ captureSequence: 30 })
  })

  it('hides equipment and controls when the shop closes while card bars remain independent', () => {
    const subject = controller()
    subject.update(snapshot({ cardsVisible: true }), calibration)
    windows.forEach((window) => window.ready())
    expect(windowFor('equipment').visible).toBe(true)
    subject.update(snapshot({ shopVisible: false, cardsVisible: true }), calibration)
    expect(windowFor('equipment').visible).toBe(false)
    expect(windowFor('controls').visible).toBe(false)
    expect(windowFor('augment-0').visible).toBe(true)
    subject.update(snapshot({ shopVisible: true }), calibration)
    expect(windowFor('equipment').visible).toBe(true)
    expect(windowFor('controls').visible).toBe(true)
  })

  it('shows the equipment and its controls together without requesting game focus', () => {
    const subject = controller()
    subject.update(snapshot(), calibration)
    const equipment = windowFor('equipment')
    const controls = windowFor('controls')

    controls.ready()
    expect(controls.visible).toBe(false)
    equipment.ready()
    expect(equipment.visible).toBe(true)
    expect(controls.visible).toBe(true)
    expect(equipment.options.focusable).toBe(false)
    expect(controls.options.focusable).toBe(false)
    expect(equipment.setIgnoreMouseEvents).toHaveBeenCalledWith(true)
    expect(controls.setIgnoreMouseEvents).toHaveBeenCalledWith(false)
    expect(controls.bounds).toEqual({ x: -1052, y: 180, width: 640, height: 88 })
    expect(equipment.bounds.height).toBe(760)
    expect(equipment.focus).not.toHaveBeenCalled()
    expect(controls.focus).not.toHaveBeenCalled()

    subject.update(
      snapshot({
        category: 'core',
        equipment: {
          championId: 157,
          source: '腾讯101',
          date: '2026-10-11',
          categories: {
            items: [],
            shoes: [],
            starting: [],
            core: Array.from({ length: 6 }, () => ({ ids: [1, 2], pickRate: null, winRate: null }))
          }
        }
      }),
      calibration
    )
    expect(equipment.bounds.height).toBe(882)
    expect(controls.bounds.height).toBe(88)
  })

  it('keeps the bottom-right hold button in a small non-focusing interactive window', () => {
    const subject = controller()
    subject.update(snapshot(), calibration)
    windows.forEach((window) => window.ready())
    const equipment = windowFor('equipment')
    const actions = windowFor('equipment-actions')
    expect(actions.bounds).toEqual({
      x: equipment.bounds.x + 640 - 210 - 14,
      y: equipment.bounds.y + equipment.bounds.height - 48 - 10,
      width: 210,
      height: 48
    })
    expect(actions.options.focusable).toBe(false)
    expect(actions.setIgnoreMouseEvents).toHaveBeenCalledWith(false)
    expect(equipment.setIgnoreMouseEvents).toHaveBeenCalledWith(true)
    expect(actions.showInactive.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      equipment.showInactive.mock.invocationCallOrder.at(-1)!
    )
  })

  it('shows only the restore entry when collapsed, hiding it on pause, suppression and restore', () => {
    const subject = controller()
    const lowerShop = { ...calibration, shopRect: { ...calibration.shopRect, y: 1100 } }
    subject.update(snapshot({ category: 'starting' }), lowerShop)
    windows.forEach((window) => window.ready())
    const equipment = windowFor('equipment')
    const original = equipment.getBounds()
    subject.update(snapshot({ shopVisible: false, equipmentCollapsed: true }), lowerShop)
    const restore = windowFor('equipment-restore')
    restore.ready()
    expect(restore.visible).toBe(true)
    expect(restore.getBounds()).toEqual({ x: original.x, y: original.y, width: 168, height: 36 })
    subject.update(
      snapshot({ category: 'shoes', shopVisible: false, equipmentCollapsed: true }),
      lowerShop
    )
    expect(restore.getBounds()).toEqual({ x: original.x, y: original.y, width: 168, height: 36 })
    expect(windows.filter((window) => window.visible)).toEqual([restore])
    expect(restore.options.focusable).toBe(false)
    expect(restore.setIgnoreMouseEvents).toHaveBeenCalledWith(false)
    subject.hide()
    expect(restore.visible).toBe(false)
    subject.update(
      snapshot({ shopVisible: false, equipmentCollapsed: false, suppressed: true }),
      lowerShop
    )
    expect(windows.every((window) => !window.visible)).toBe(true)
    subject.update(snapshot(), lowerShop)
    expect(restore.visible).toBe(false)
    expect(windowFor('equipment').visible).toBe(true)
    expect(windowFor('equipment-actions').visible).toBe(true)
    expect(equipment.getBounds().y).not.toBe(original.y)
  })

  it('keeps a pending renderer hidden until a new observation permits showing', () => {
    const subject = controller()
    subject.update(snapshot(), calibration)
    subject.hide()
    windows.forEach((window) => window.ready())
    expect(windows.every((window) => !window.visible)).toBe(true)
    subject.update(snapshot(), calibration)
    expect(windows.every((window) => window.visible)).toBe(true)
  })

  it('recovers a crashed control renderer and hides its equipment until recovery', () => {
    const subject = controller()
    subject.update(snapshot(), calibration)
    windows.forEach((window) => window.ready())
    const previous = windowFor('controls')
    const equipment = windowFor('equipment')
    previous.webContents.emit('render-process-gone')

    expect(previous.destroyed).toBe(true)
    expect(subject.owns(previous.webContents.id)).toBe(false)
    expect(equipment.visible).toBe(false)
    subject.update(snapshot(), calibration)
    const replacement = windowFor('controls')
    previous.ready()
    expect(replacement.visible).toBe(false)
    replacement.ready()
    expect(replacement.visible).toBe(true)
    expect(equipment.visible).toBe(true)
    expect(subject.owns(replacement.webContents.id)).toBe(true)
  })

  it('retries a failed initial renderer load without leaving a detached control strip', async () => {
    const subject = controller()
    failRole = 'equipment'
    subject.update(snapshot(), calibration)
    const previous = windowFor('equipment')
    windowFor('controls').ready()
    await Promise.resolve()
    expect(previous.destroyed).toBe(true)
    expect(windowFor('controls').visible).toBe(false)

    subject.update(snapshot(), calibration)
    windowFor('equipment').ready()
    expect(windowFor('equipment').visible).toBe(true)
    expect(windowFor('controls').visible).toBe(true)
    expect(windowFor('controls').showInactive.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      windowFor('equipment').showInactive.mock.invocationCallOrder.at(-1)!
    )
  })

  it('hides the equipment pair during reload and recovers from a main-frame load failure', () => {
    const subject = controller()
    subject.update(snapshot(), calibration)
    windows.forEach((window) => window.ready())
    const previous = windowFor('equipment')
    previous.webContents.emit('did-start-loading')
    expect(windows.every((window) => !window.visible)).toBe(true)
    previous.webContents.emit('did-fail-load', {}, -3, 'ERR_ABORTED', '', true)
    expect(previous.destroyed).toBe(false)
    previous.webContents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', '', false)
    expect(previous.destroyed).toBe(false)
    previous.webContents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', '', true)
    expect(previous.destroyed).toBe(true)
    subject.update(snapshot(), calibration)
    windowFor('equipment').ready()
    expect(windowFor('controls').visible).toBe(true)
  })

  it.each(['closed', 'crashed'])(
    'reopens a %s setup window and restores a minimized instance',
    (reason) => {
      const subject = controller()
      subject.openSetup()
      const first = windowFor('setup')
      first.minimized = true
      subject.openSetup()
      expect(first.restore).toHaveBeenCalledOnce()
      expect(windows).toHaveLength(1)
      if (reason === 'closed') first.destroy()
      else first.webContents.emit('render-process-gone')

      expect(subject.ownsSetup(first.webContents.id)).toBe(false)
      subject.openSetup()
      const replacement = windowFor('setup')
      first.emit('closed')
      expect(subject.setupWindow).toBe(replacement)
      expect(replacement.visible).toBe(true)
      expect(subject.ownsSetup(replacement.webContents.id)).toBe(true)
    }
  )

  it('repositions card overlays when the display moves and hides them if scaling changes', () => {
    const subject = controller()
    const cards = snapshot({ shopVisible: false, cardsVisible: true })
    subject.update(cards, calibration)
    windows.forEach((window) => window.ready())
    const first = windowFor('augment-0')
    expect(first.bounds).toEqual({ x: -1968, y: 808, width: 357, height: 72 })
    expect(windows.every((window) => window.visible)).toBe(true)
    expect(first.setIgnoreMouseEvents).toHaveBeenCalledWith(true)
    const display = screen.getAllDisplays()[0]
    display.bounds.x = 0
    subject.update(cards, calibration)
    expect(first.bounds.x).toBe(592)
    display.scaleFactor = 1.25
    subject.update(cards, calibration)
    expect(windows.every((window) => !window.visible)).toBe(true)
  })

  it.each([
    [2560, 1440, 1],
    [1920, 1080, 1],
    [1920, 1080, 1.25]
  ] as const)(
    'maps physical %sx%s overlays through DPI %s and resets zoom when switching to manual',
    (width, height, dpi) => {
      const subject = controller()
      const bounds = { x: -1920, y: 120, width, height }
      const dip = { x: -1920, y: 120, width: width / dpi, height: height / dpi }
      vi.mocked(screen.getAllDisplays).mockReturnValue([
        {
          id: 2,
          size: { width: dip.width, height: dip.height },
          bounds: dip,
          scaleFactor: dpi
        } as Electron.Display
      ])
      const toDip = (rect: Rect) => ({
        x: Math.round(dip.x + (rect.x - bounds.x) / dpi),
        y: Math.round(dip.y + (rect.y - bounds.y) / dpi),
        width: Math.round(rect.width / dpi),
        height: Math.round(rect.height / dpi)
      })
      vi.mocked(screen.screenToDipRect).mockImplementation((_window, rect) => toDip(rect))
      const scale = height / 1440
      const layout: AutomaticOverlayLayout = {
        displayId: '2',
        clientBounds: bounds,
        scaleFactor: dpi,
        shopRect: { x: 400 * scale, y: 220 * scale, width: 1400 * scale, height: 1000 * scale },
        titleRects: [],
        cardRects: [583, 1073, 1563].map((x) => ({
          x: Math.round(x * scale),
          y: 256 * scale,
          width: Math.round(429 * scale),
          height: 704 * scale
        }))
      }
      subject.update(snapshot(), null, { sequence: 1, capturedAt: Date.now() }, layout)
      windows.forEach((w) => w.ready())
      const equipment = windowFor('equipment')
      expect(equipment.bounds.width).toBe(Math.round((640 * scale) / dpi))
      expect(equipment.bounds.x).toBe(dip.x + Math.round((1828 * scale) / dpi))
      expect(equipment.bounds.y).toBe(dip.y + Math.round((220 * scale) / dpi))
      expect(equipment.zoom).toBe(scale / dpi)
      expect(windowFor('controls').zoom).toBe(scale / dpi)
      subject.update(
        snapshot({ shopVisible: false, cardsVisible: true }),
        null,
        { sequence: 2, capturedAt: Date.now() },
        layout
      )
      windows.forEach((w) => w.ready())
      const bar = windowFor('augment-0')
      expect(bar.bounds).toEqual(
        toDip({
          x: bounds.x + layout.cardRects[0].x + 32 * scale,
          y: bounds.y + 256 * scale + 704 * scale - 112 * scale,
          width: layout.cardRects[0].width - 64 * scale,
          height: 72 * scale
        })
      )
      expect(bar.zoom).toBe(scale / dpi)
      vi.mocked(screen.getAllDisplays).mockReturnValue([
        {
          id: 1,
          size: { width: 2560, height: 1440 },
          bounds: { x: 0, y: 0, width: 2560, height: 1440 },
          scaleFactor: 1
        } as Electron.Display
      ])
      subject.update(snapshot({ shopVisible: true, cardsVisible: true }), calibration)
      expect(equipment.zoom).toBe(1)
      expect(bar.zoom).toBe(1)
    }
  )

  it('keeps the restore entry at its prior position without shop geometry or fresh scores, then expands under the same foreground gate', () => {
    const subject = controller()
    const layout: AutomaticOverlayLayout = {
      displayId: '1',
      clientBounds: { x: -2560, y: 0, width: 2560, height: 1440 },
      scaleFactor: 1,
      shopRect: calibration.shopRect,
      cardRects: calibration.cardRects,
      titleRects: []
    }
    subject.update(
      snapshot(),
      null,
      { sequence: 1, capturedAt: Date.now(), equipmentWindowReady: true },
      layout
    )
    windows.forEach((w) => w.ready())
    const position = windowFor('equipment').getBounds()
    const collapsed = snapshot({ shopVisible: false, cardsVisible: true, equipmentCollapsed: true })
    subject.update(
      collapsed,
      null,
      { sequence: 2, capturedAt: Date.now(), equipmentWindowReady: true },
      layout
    )
    windows.forEach((w) => w.ready())
    const restore = windowFor('equipment-restore')
    const old = { sequence: 2, capturedAt: Date.now() - 2000, equipmentWindowReady: true }
    subject.update(collapsed, null, old, { ...layout, shopRect: null, cardRects: [] })
    expect(restore.visible).toBe(true)
    expect(restore.bounds).toEqual({ x: position.x, y: position.y, width: 168, height: 36 })
    expect(windowFor('augment-0').visible).toBe(false)
    subject.update(
      snapshot({ sessionKey: null, championId: null, shopVisible: false }),
      null,
      { ...old, equipmentWindowReady: false },
      null
    )
    expect(windows.every((w) => !w.visible)).toBe(true)
    subject.update(collapsed, null, { ...old, equipmentWindowReady: false }, null)
    expect(windows.every((w) => !w.visible)).toBe(true)
    subject.update(collapsed, null, old, null)
    expect(restore.visible).toBe(true)
    subject.update(snapshot({ shopVisible: false, equipmentExpanded: true }), null, old, null)
    expect(windowFor('equipment').visible).toBe(true)
    expect(windowFor('equipment').bounds.x).toBe(position.x)
    expect(restore.visible).toBe(false)
    expect(windowFor('augment-0').visible).toBe(false)
    subject.update(
      snapshot({ sessionKey: 'player:2', shopVisible: false, equipmentCollapsed: true }),
      null,
      old,
      null
    )
    expect(windows.every((w) => !w.visible)).toBe(true)
  })

  it('does not recreate windows after disposal or late renderer callbacks', () => {
    const subject = controller()
    subject.update(snapshot(), calibration)
    subject.openSetup()
    subject.dispose()
    const count = windows.length
    windows.forEach((window) => window.ready())
    subject.update(snapshot(), calibration)
    subject.openSetup()
    expect(windows).toHaveLength(count)
    expect(windows.every((window) => window.destroyed)).toBe(true)
    expect(subject.setupWindow).toBeNull()
  })
})
