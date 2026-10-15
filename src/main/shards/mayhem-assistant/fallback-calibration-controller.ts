import {
  type FallbackCalibration,
  FallbackTracker,
  type GameFrame,
  type Scene,
  fallbackPlacement,
  prepareCalibration,
  readCalibration,
  trustedFrame
} from '@shared/mayhem-assistant/fallback-calibration'
import type { Rect } from '@shared/mayhem-assistant/model'
import type {
  FallbackSelectionContext,
  FallbackSelectionPreview,
  FallbackSelectionStatus
} from '@shared/types/fallback-calibration'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import type { GameUiLocation } from './game-ui-locator'

export class FallbackCalibrationController {
  private _configurations: Record<Scene, FallbackCalibration | null> = { cards: null, shop: null }
  private readonly _trackers = { cards: new FallbackTracker(), shop: new FallbackTracker() }
  private _selection: {
    requestId: string
    scene: Scene
    frame: GameFrame | null
    receivedAt: number
  } | null = null

  constructor(
    private readonly _directory: string,
    private readonly _write: (name: string, value: unknown) => void,
    private readonly _publishPreview: (preview: FallbackSelectionPreview) => void
  ) {}

  load() {
    const file = path.join(this._directory, 'fallback-calibration.json')
    if (!fs.existsSync(file)) return
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (saved?.version !== 1) throw new Error('备用定位配置无效，请重新框选。')
    const next: Record<Scene, FallbackCalibration | null> = { cards: null, shop: null }
    for (const scene of ['cards', 'shop'] as const) {
      if (saved[scene] === null) continue
      const configuration = readCalibration(saved[scene])
      if (!configuration || configuration.scene !== scene)
        throw new Error('备用定位配置无效，请重新框选。')
      next[scene] = configuration
    }
    this._configurations = next
    this.resetRuntime()
  }

  begin(scene: unknown) {
    if (scene !== 'cards' && scene !== 'shop') throw new Error('请选择三卡或商店。')
    this._selection = { requestId: randomUUID(), scene, frame: null, receivedAt: 0 }
  }

  cancel(requestId?: unknown) {
    if (requestId !== undefined && requestId !== this._selection?.requestId) return false
    this._selection = null
    return true
  }

  status(currentContext: FallbackSelectionContext | null): FallbackSelectionStatus {
    return {
      requestId: this._selection?.requestId ?? null,
      scene: this._selection?.scene ?? null,
      state: this._selection ? (this._selection.frame ? 'editing' : 'waiting') : 'idle',
      configured: { cards: !!this._configurations.cards, shop: !!this._configurations.shop },
      currentContext
    }
  }

  /** Called only after the existing final foreground/source/session/TTL gates. */
  receive(frame: GameFrame, imageUrl: () => string) {
    const selection = this._selection
    if (!selection || selection.frame || !trustedFrame(frame, Date.now())) return
    const url = imageUrl()
    const receivedAt = Date.now()
    if (!trustedFrame(frame, receivedAt)) return
    selection.frame = frame
    selection.receivedAt = receivedAt
    this._publishPreview({
      requestId: selection.requestId,
      scene: selection.scene,
      frame,
      imageUrl: url
    })
  }

  /** Renderer submits geometry only; templates always come from the retained main-process frame. */
  save(input: unknown, currentContext: FallbackSelectionContext | null) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error('框选请求无效，请重新框选。')
    const value = input as { requestId?: unknown; rect?: Rect }
    const selection = this._selection
    const frame = selection?.frame
    if (
      !selection ||
      !frame ||
      value.requestId !== selection.requestId ||
      !currentContext ||
      currentContext.sessionKey !== frame.sessionKey ||
      currentContext.sourceKey !== frame.sourceKey ||
      currentContext.width !== frame.width ||
      currentContext.height !== frame.height
    )
      throw new Error('当前画面已变化。请返回游戏后重新框选。')
    if (
      !value.rect ||
      !['x', 'y', 'width', 'height'].every((key) =>
        Number.isInteger(value.rect![key as keyof Rect])
      )
    )
      throw new Error('框选区域无效，请重新框选。')
    const rect = {
      x: value.rect.x,
      y: value.rect.y,
      width: value.rect.width,
      height: value.rect.height
    }
    const configuration = prepareCalibration(frame, selection.scene, rect, selection.receivedAt)
    const next = { ...this._configurations, [selection.scene]: configuration }
    this._write('fallback-calibration.json', { version: 1, ...next })
    // The old effective configuration survives cancellation and every failed write.
    this._configurations = next
    this.cancel()
    this.resetRuntime()
    return true
  }

  resetRuntime() {
    this._trackers.cards.reset()
    this._trackers.shop.reset()
  }

  resolve(frame: GameFrame, automatic: GameUiLocation) {
    let cardRects = automatic.cards?.cardRects ?? []
    let titleRects = automatic.cards?.titleRects ?? []
    let shopRect = automatic.shop
    const confirmed: Partial<Record<Scene, boolean>> = {}
    const methods: Record<Scene, 'automatic' | 'fallback' | null> = {
      cards: automatic.cards ? 'automatic' : null,
      shop: automatic.shop ? 'automatic' : null
    }
    const reasons: Partial<Record<Scene, string>> = {}
    for (const scene of ['cards', 'shop'] as const) {
      const configuration = this._configurations[scene]
      if (methods[scene] || !configuration) {
        this._trackers[scene].reset()
        continue
      }
      const result = this._trackers[scene].evaluate(configuration, frame, Date.now())
      reasons[scene] = result.reason
      if (!result.shouldUpdate) return { shouldUpdate: false as const }
      confirmed[scene] = result.visible
      if (!result.visible || !result.rect) continue
      const placement = fallbackPlacement(configuration, result.rect)
      if (scene === 'cards') {
        cardRects = placement.cardRects
        titleRects = placement.titleRects
      } else shopRect = placement.shopRect
      methods[scene] = 'fallback'
    }
    return {
      shouldUpdate: true as const,
      cardRects,
      titleRects,
      shopRect,
      confirmed,
      methods,
      reasons
    }
  }
}
