import { createDefaultChampSelectOverlaySettings } from '@shared/champ-select-overlay'
import type { Meta, StoryObj } from '@storybook/vue3-vite'

import ChampSelectOverlayStory from './ChampSelectOverlayStory.vue'
import type {
  ChampSelectChampionRates,
  ChampSelectOverlayChampions,
  ChampSelectOverlayData,
  ChampSelectOverlaySession
} from './types'

// Synthetic, development-only inputs. No runtime module imports these values.
const fixtureData: ChampSelectOverlayData = {
  queryStage: { phase: 'champ-select' },
  champSelectPlayerPuuids: {
    4: 'fixture-1',
    1: 'fixture-2',
    7: 'fixture-3',
    2: 'fixture-4',
    9: 'fixture-5'
  },
  summoner: {
    'fixture-1': { gameName: '演示 · 一个很长的队友名字', displayName: '' },
    'fixture-2': { gameName: '演示 · 队友二', displayName: '' },
    'fixture-3': { gameName: 'Sample three', displayName: '' },
    'fixture-4': { gameName: 'Sample four', displayName: '' },
    'fixture-5': { gameName: '演示 · 队友五', displayName: '' }
  },
  analysis: {
    players: {
      'fixture-1': { count: 10, summary: { winRate: 0.6 } },
      'fixture-2': { count: 5, summary: { winRate: 0.4 } },
      'fixture-3': { count: 14, summary: { winRate: 0.5 } },
      'fixture-4': { count: 3, summary: { winRate: 0 } },
      'fixture-5': { count: 50, summary: { winRate: 0.64 } }
    }
  }
}
const fixtureSession: ChampSelectOverlaySession = {
  benchEnabled: true,
  benchChampions: [103, 64, 222, 412, 86, 99, 51].map((championId) => ({
    championId,
    isPriority: false
  })),
  myTeam: [
    { cellId: 4, puuid: 'fixture-1', gameName: '', championId: 103, championPickIntent: 0 },
    { cellId: 1, puuid: 'fixture-2', gameName: '', championId: 64, championPickIntent: 0 },
    { cellId: 7, puuid: 'fixture-3', gameName: '', championId: 222, championPickIntent: 0 },
    { cellId: 2, puuid: 'fixture-4', gameName: '', championId: 412, championPickIntent: 0 },
    { cellId: 9, puuid: 'fixture-5', gameName: '', championId: 0, championPickIntent: 86 }
  ]
}
const fixtureChampions: ChampSelectOverlayChampions = {
  103: { name: '阿狸' },
  64: { name: '李青' },
  222: { name: '金克丝' },
  412: { name: '锤石' },
  86: { name: '盖伦' },
  99: { name: '拉克丝' },
  51: { name: '凯特琳' }
}
const fixtureRates: Record<number, ChampSelectChampionRates> = {
  103: { winRate: 0.528, pickRate: 0.032 },
  64: { winRate: 0.514, pickRate: 0.021 },
  222: { winRate: 0.509, pickRate: 0.028 },
  412: { winRate: 0.531, pickRate: 0.016 },
  86: { winRate: 0.517, pickRate: 0.04 },
  99: { winRate: 0.498, pickRate: 0.019 },
  51: { winRate: 0.506, pickRate: 0.036 }
}
const settings = createDefaultChampSelectOverlaySettings()
const meta = {
  title: 'Renderer Shared/Ongoing Game/Champion Select Overlay',
  component: ChampSelectOverlayStory,
  parameters: { akariStoryPanelMaxWidth: 700 },
  args: {
    data: fixtureData,
    session: fixtureSession,
    champions: fixtureChampions,
    championRates: fixtureRates,
    group: 'both',
    settings,
    teammateWidth: 120,
    desktopBackground: '#268dde',
    maskNames: false
  },
  argTypes: {
    group: { control: 'select', options: ['candidates', 'teammates', 'both'] },
    teammateWidth: { control: { type: 'range', min: 76, max: 120, step: 8 } },
    desktopBackground: { control: 'color' },
    maskNames: { control: 'boolean' },
    data: { control: false },
    session: { control: false },
    champions: { control: false },
    championRates: { control: false },
    settings: { control: 'object' }
  }
} satisfies Meta<typeof ChampSelectOverlayStory>
export default meta
type Story = StoryObj<typeof meta>

export const Candidates: Story = { args: { group: 'candidates' } }
export const Teammates: Story = { args: { group: 'teammates' } }
export const CandidatesMissingData: Story = {
  args: {
    group: 'candidates',
    championRates: {},
    session: {
      ...fixtureSession,
      benchChampions: fixtureSession.benchChampions.map((item, index) =>
        index === 2 ? { ...item, championId: 0 } : item
      )
    }
  }
}
export const TeammatesMissingData: Story = {
  args: {
    group: 'teammates',
    teammateWidth: 76,
    championRates: {},
    data: { ...fixtureData, analysis: null },
    session: {
      ...fixtureSession,
      myTeam: fixtureSession.myTeam.map((row, index) =>
        index === 4 ? { ...row, championId: 0, championPickIntent: 0 } : row
      )
    }
  }
}
export const OpacityLow: Story = { args: { settings: { ...settings, backgroundOpacity: 30 } } }
export const OpacityHigh: Story = { args: { settings: { ...settings, backgroundOpacity: 90 } } }
export const StreamerMode: Story = { args: { maskNames: true } }
export const PhaseEnded: Story = {
  args: { data: { ...fixtureData, queryStage: { phase: 'in-game' } } }
}

export const SampleCountBoundary: Story = {
  args: {
    group: 'teammates',
    teammateWidth: 76,
    data: {
      ...fixtureData,
      analysis: {
        players: Object.fromEntries(
          Object.keys(fixtureData.summoner).map((puuid) => [
            puuid,
            { count: 200, summary: { winRate: 1 } }
          ])
        )
      }
    }
  }
}

export const MinimumRowSpacing: Story = {
  args: { group: 'teammates', settings: { ...settings, teammateStep: 64 } }
}

export const TeammatesCompact: Story = {
  args: { group: 'teammates', teammateWidth: 76 }
}
