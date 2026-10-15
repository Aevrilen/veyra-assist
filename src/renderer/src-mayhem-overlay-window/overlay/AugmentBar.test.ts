import type { Candidate } from '@shared/mayhem-assistant/model'
import { MayhemSessionController } from '@shared/mayhem-assistant/session-controller'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'

import AugmentBar from './AugmentBar.vue'

const candidates: Candidate[] = [
  { id: 1, rarity: 'gold', tier: 'A', winRate: 0.54, pickRate: 0.09 },
  { id: 2, rarity: 'silver', tier: 'B', winRate: 0.51, pickRate: 0.14 },
  { id: 3, rarity: 'prismatic', tier: 'S', winRate: 0.6, pickRate: 0.12 }
]
const render = (candidate: Candidate | null) =>
  renderToString(createSSRApp({ render: () => h(AugmentBar, { candidate }) }))

describe('confirmed augment slot rendering', () => {
  it('renders no score surface, label, question mark or placeholder before confirmation', async () => {
    const html = await render(null)
    expect(html).not.toContain('<div')
    expect(html).not.toContain('<span')
    expect(html).not.toContain('识别')
    expect(html).not.toContain('?')
  })
  it('keeps a recognized ID without current statistics completely transparent', async () => {
    const html = await render({ id: 9, rarity: 'gold', tier: null, winRate: null, pickRate: null })
    expect(html).not.toContain('<div')
    expect(html).not.toContain('<b')
  })
  it('preserves a real zero rate without fabricating a missing ranking', async () => {
    const html = await render({ id: 9, rarity: 'gold', tier: null, winRate: 0, pickRate: 0 })
    expect(html).toContain('0.0%')
    expect(html).not.toContain('<b')
  })
  it('renders the confirmed slot without progress or identification messages', async () => {
    const html = await render(candidates[0])
    expect(html).toContain('54.0%')
    expect(html).toContain('9.0%')
    expect(html).toContain('评级 A')
    expect(html).not.toContain('识别')
  })
  it('hides only the refreshed slot and never applies its previous score to the new card', async () => {
    const session = new MayhemSessionController()
    session.setSession('fixture:1', 157)
    session.observe(session.revision, false, true, 1000)
    session.observe(session.revision, false, true, 1500)
    const differs = (a: number[], b: number[]) => a[0] !== b[0]
    session.updateTitles([[1], [2], [3]], differs)
    session.setCandidates(session.revision, [...candidates])
    session.updateTitles([[1], [4], [3]], differs)
    const slots = await Promise.all(session.candidates.map(render))
    expect(slots[0]).toContain('54.0%')
    expect(slots[1]).not.toContain('<div')
    expect(slots[1]).not.toContain('51.0%')
    expect(slots[2]).toContain('60.0%')
  })
  it('keeps confirmed scores through an existing single-frame miss', async () => {
    const session = new MayhemSessionController()
    session.setSession('fixture:1', 157)
    session.observe(session.revision, false, true, 1000)
    session.observe(session.revision, false, true, 1500)
    session.setCandidates(session.revision, [...candidates])
    session.observe(session.revision, false, false, 2000)
    expect(session.cardsVisible).toBe(true)
    expect(await render(session.candidates[1])).toContain('51.0%')
  })
})
