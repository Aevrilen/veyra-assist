import type { Candidate, Category, ConfirmedAugmentSelection, EquipmentBuildView } from './model'

export class MayhemSessionController {
  sessionKey: string | null = null
  championId: number | null = null
  suppressedKey: string | null = null
  category: Category = 'items'
  buildView: EquipmentBuildView = 'standard'
  confirmedSelection: ConfirmedAugmentSelection | null = null
  private _standardCore: { key: string; championId: number; ids: number[] } | null = null
  shopVisible = false
  cardsVisible = false
  candidates: Array<Candidate | null> = [null, null, null]
  revision = 0
  private _shopFrames = 0
  private _temporarilyHiddenKey: string | null = null
  private _expandedEquipmentKey: string | null = null
  private _cardFrames = 0
  private _cardMissFrames = 0
  private _titles: number[][] = []
  private _observedAt: number | null = null
  private _lastSessionKey: string | null = null

  get suppressed() {
    return !!this.sessionKey && this.suppressedKey === this.sessionKey
  }
  get temporarilyHidden() {
    return !!this.sessionKey && this._temporarilyHiddenKey === this.sessionKey
  }
  get equipmentCollapsed() {
    return this.temporarilyHidden && !this.suppressed
  }
  get equipmentExpanded() {
    return (
      !!this.sessionKey &&
      this._expandedEquipmentKey === this.sessionKey &&
      !this.temporarilyHidden &&
      !this.suppressed
    )
  }

  setSession(key: string | null, championId: number | null) {
    if (key === this.sessionKey && championId === this.championId) return
    this.confirmedSelection = null
    this.buildView = 'standard'
    if (key && (key !== this._standardCore?.key || championId !== this._standardCore?.championId))
      this._standardCore = null
    // Unknown session pauses publication but preserves this game's suppression for reconnect.
    if (key && key !== this._lastSessionKey) {
      this.category = 'items'
      if (this.suppressedKey !== key) this.suppressedKey = null
      this._temporarilyHiddenKey = null
      this._expandedEquipmentKey = null
      this._lastSessionKey = key
    }
    this.sessionKey = key
    this.championId = championId
    this.invalidate()
  }

  get standardCoreIds() {
    return this._standardCore?.key === this.sessionKey &&
      this._standardCore.championId === this.championId
      ? [...this._standardCore.ids]
      : null
  }

  pinStandardCore(key: string, championId: number, ids: number[]) {
    if (
      !this.sessionKey ||
      key !== this.sessionKey ||
      championId !== this.championId ||
      !Array.isArray(ids) ||
      ids.length !== 3 ||
      new Set(ids).size !== 3 ||
      !Array.from(ids).every((id) => Number.isSafeInteger(id) && id > 0)
    )
      return false
    if (!this.standardCoreIds) this._standardCore = { key, championId, ids: [...ids] }
    return true
  }

  // Contract for a future reviewed producer. There is deliberately no renderer IPC writer.
  acceptConfirmedSelection(selection: ConfirmedAugmentSelection) {
    if (
      !selection ||
      !this.sessionKey ||
      selection.sessionKey !== this.sessionKey ||
      selection.championId !== this.championId ||
      !['verified-game-state', 'reviewed-user-confirmation'].includes(selection.source) ||
      !Array.isArray(selection.ids) ||
      selection.ids.length > 8 ||
      !Array.from(selection.ids).every((id) => Number.isSafeInteger(id) && id > 0) ||
      new Set(selection.ids).size !== selection.ids.length
    )
      return false
    this.confirmedSelection = { ...selection, ids: [...selection.ids] }
    if (!selection.ids.length) this.buildView = 'standard'
    return true
  }

  invalidate() {
    this.revision++
    this.shopVisible = this.cardsVisible = false
    this._shopFrames = this._cardFrames = 0
    this._cardMissFrames = 0
    this.candidates = [null, null, null]
    this._titles = []
    this._observedAt = null
  }

  observe(
    token: number,
    shop: boolean,
    cards: boolean,
    now: number,
    independentlyConfirmed: Partial<Record<'cards' | 'shop', boolean>> = {}
  ) {
    if (token !== this.revision || !this.sessionKey || !this.championId) return false
    this._observedAt = now
    this._shopFrames =
      shop && !cards ? (independentlyConfirmed.shop === true ? 2 : this._shopFrames + 1) : 0
    this.shopVisible = this._shopFrames >= 2 && !this.suppressed && !this.temporarilyHidden
    if (cards && !shop) {
      this._cardMissFrames = 0
      // Fallback has already checked two distinct source frames at the same pose.
      this._cardFrames = independentlyConfirmed.cards === true ? 2 : this._cardFrames + 1
      if (this._cardFrames >= 2) this.cardsVisible = true
    } else {
      this._cardFrames = 0
      if (independentlyConfirmed.cards === false || shop || ++this._cardMissFrames >= 2) {
        this.cardsVisible = false
        this.candidates = [null, null, null]
        this._titles = []
      }
    }
    return true
  }

  expire(now: number) {
    if (this._observedAt !== null && now - this._observedAt > 1500) {
      this.invalidate()
      return true
    }
    return false
  }

  updateTitles(titles: number[][], differs: (a: number[], b: number[]) => boolean) {
    const changed = titles.map((t, i) => !this._titles[i] || differs(t, this._titles[i]))
    changed.forEach((value, i) => {
      if (value) this.candidates[i] = null
    })
    this._titles = titles
    return changed
  }

  setCandidates(token: number, candidates: Array<Candidate | null>) {
    if (token !== this.revision || !this.cardsVisible || candidates.length !== 3) return false
    this.candidates = candidates
    return true
  }

  collapse(key: string) {
    if (
      !this.sessionKey ||
      key !== this.sessionKey ||
      (this._shopFrames < 2 && !this.equipmentExpanded)
    )
      return false
    this._temporarilyHiddenKey = key
    this.shopVisible = false
    return true
  }
  suppress(key: string) {
    if (!this.sessionKey || key !== this.sessionKey) return false
    this.suppressedKey = key
    this._expandedEquipmentKey = null
    this.shopVisible = false
    return true
  }
  restore(key: string) {
    if (key !== this.sessionKey || (!this.suppressed && !this.temporarilyHidden)) return false
    const visibleShop = this._shopFrames >= 2 && !this.suppressed
    if (this.temporarilyHidden && !this.suppressed) this._expandedEquipmentKey = key
    this.suppressedKey = null
    this._temporarilyHiddenKey = null
    this.shopVisible = visibleShop
    if (!visibleShop) this._shopFrames = 0
    return true
  }
}
