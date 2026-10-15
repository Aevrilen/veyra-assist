import {
  type AppThemeId,
  WORKSPACE_THEME_IDS,
  type WorkspaceThemeId
} from '@shared/types/app-theme'
import type { GlobalThemeOverrides } from 'naive-ui'

interface WorkspacePalette {
  background: string
  sidebar: string
  panel: string
  subtle: string
  border: string
  borderStrong: string
  text: string
  muted: string
  soft: string
  accent: string
  onAccent: string
  accentSoft: string
  accentLine: string
}

// Approved main-window palettes. CSS surfaces, Naive UI, and theme swatches share these values.
export const WORKSPACE_PALETTES: Record<WorkspaceThemeId, WorkspacePalette> = {
  light: {
    background: '#f1f3f6',
    sidebar: '#f8f9fb',
    panel: '#ffffff',
    subtle: '#f6f7f9',
    border: '#e4e7ec',
    borderStrong: '#d6dbe3',
    text: '#282e39',
    muted: '#747e8e',
    soft: '#98a1af',
    accent: '#5669ad',
    onAccent: '#ffffff',
    accentSoft: '#eaf0fb',
    accentLine: '#ced9ef'
  },
  graphite: {
    background: '#17191d',
    sidebar: '#1c1e23',
    panel: '#22252b',
    subtle: '#292c32',
    border: '#33373e',
    borderStrong: '#464b55',
    text: '#e8eaf0',
    muted: '#a4abb8',
    soft: '#828b9b',
    accent: '#a8b7e9',
    onAccent: '#20283b',
    accentSoft: '#2c3446',
    accentLine: '#465577'
  },
  'blue-gray': {
    background: '#eaf0f5',
    sidebar: '#e3eaf1',
    panel: '#f8fbfd',
    subtle: '#edf3f7',
    border: '#d7e1ea',
    borderStrong: '#bdcbd9',
    text: '#2a3b4b',
    muted: '#6f8395',
    soft: '#8b9dad',
    accent: '#557a9d',
    onAccent: '#ffffff',
    accentSoft: '#dce8f2',
    accentLine: '#b9cde0'
  },
  'mist-violet': {
    background: '#f3f2f6',
    sidebar: '#f7f6f9',
    panel: '#ffffff',
    subtle: '#f7f6fa',
    border: '#e5e2eb',
    borderStrong: '#d5cfdf',
    text: '#322e3b',
    muted: '#716a7e',
    soft: '#9790a3',
    accent: '#75628f',
    onAccent: '#ffffff',
    accentSoft: '#eee8f4',
    accentLine: '#d9cce7'
  }
}

export function getWorkspacePalette(themeId: AppThemeId) {
  if (themeId === 'dark') return WORKSPACE_PALETTES.graphite
  return (WORKSPACE_PALETTES as Partial<Record<AppThemeId, WorkspacePalette>>)[themeId]
}

export const WORKSPACE_THEME_OVERRIDES = Object.fromEntries(
  WORKSPACE_THEME_IDS.map((id) => {
    const p = WORKSPACE_PALETTES[id]
    const overrides: GlobalThemeOverrides = {
      common: {
        bodyColor: p.background,
        cardColor: p.panel,
        modalColor: p.panel,
        tableColor: p.panel,
        popoverColor: p.panel,
        primaryColor: p.accent,
        primaryColorHover: p.accent,
        primaryColorPressed: p.accent,
        primaryColorSuppl: p.accentSoft,
        infoColor: p.accent,
        infoColorHover: p.accent,
        infoColorPressed: p.accent,
        infoColorSuppl: p.accentSoft,
        textColorBase: p.text,
        textColor1: p.text,
        textColor2: p.text,
        textColor3: p.muted,
        textColorDisabled: p.soft,
        placeholderColor: p.soft,
        iconColor: p.muted,
        iconColorHover: p.text,
        iconColorPressed: p.accent,
        borderColor: p.border,
        dividerColor: p.border,
        inputColor: p.panel,
        actionColor: p.subtle,
        hoverColor: p.accentSoft,
        pressedColor: p.accentSoft,
        buttonColor2: p.subtle,
        buttonColor2Hover: p.accentSoft,
        buttonColor2Pressed: p.accentSoft,
        borderRadius: '6px',
        fontSize: '13px'
      },
      Card: {
        color: p.panel,
        colorModal: p.panel,
        borderColor: p.border,
        borderColorModal: p.border
      },
      Button: {
        textColorPrimary: p.onAccent,
        textColorHoverPrimary: p.onAccent,
        textColorPressedPrimary: p.onAccent,
        textColorFocusPrimary: p.onAccent
      },
      Switch: {
        railColor: p.borderStrong,
        railColorActive: p.accent,
        buttonColor: p.panel,
        buttonBoxShadow: 'none'
      },
      Input: { color: p.panel, colorFocus: p.panel },
      Tabs: { tabTextColorActiveLine: p.accent, barColor: p.accent },
      Notification: {
        padding: '12px',
        titleFontSize: '13px',
        titleFontWeight: '600',
        descriptionFontSize: '13px',
        avatarSize: '20px'
      },
      Message: { padding: '4px 8px', fontSize: '12px', iconSize: '16px', iconMargin: '0 4px 0 0' },
      Popover: { fontSize: '12px' },
      Checkbox: { fontSizeSmall: '13px' },
      Scrollbar: { width: '6px' }
    }
    return [id, overrides]
  })
) as Record<WorkspaceThemeId, GlobalThemeOverrides>

export function getWorkspaceCssVariables(themeId: AppThemeId) {
  const p = getWorkspacePalette(themeId)
  if (!p) return undefined // Existing optional presets retain their stylesheet values.
  const rgb = p.text
    .match(/\w{2}/g)!
    .map((value) => Number.parseInt(value, 16))
    .join(' ')
  return {
    '--la-color-bg-primary': p.background,
    '--la-color-text-primary': p.text,
    '--la-color-text-themed': p.text,
    '--la-color-link': p.accent,
    '--la-sidebar-bg': p.sidebar,
    '--la-sidebar-border': p.border,
    '--la-color-select-menu-bg': p.panel,
    '--la-color-message-bg': p.panel,
    '--la-color-popconfirm-bg': p.panel,
    '--la-color-popover-border': p.border,
    '--la-color-scrollbar-thumb': p.borderStrong,
    '--la-color-scrollbar-thumb-hover': p.soft,
    '--la-card-tint-rgb': rgb,
    '--la-card-border-rgb': rgb,
    '--la-card-surface-95': p.panel,
    '--la-card-surface-90': p.panel,
    '--la-card-muted-surface': p.subtle,
    '--la-wallpaper-overlay-start': p.background,
    '--la-wallpaper-overlay-mid': p.background,
    '--la-wallpaper-overlay-end': p.background,
    '--la-workspace-panel': p.panel,
    '--la-workspace-subtle': p.subtle,
    '--la-workspace-border': p.border,
    '--la-workspace-muted': p.muted,
    '--la-workspace-accent-soft': p.accentSoft,
    '--la-workspace-accent-line': p.accentLine
  }
}
