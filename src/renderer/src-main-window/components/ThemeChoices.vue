<template>
  <div class="theme-choices" :aria-label="t('settings.app.basic.theme.label')">
    <NButton
      v-for="id in WORKSPACE_THEME_IDS"
      :key="id"
      class="theme-choice"
      :class="{ selected: (themeId === 'dark' ? 'graphite' : themeId) === id }"
      :aria-pressed="(themeId === 'dark' ? 'graphite' : themeId) === id"
      :aria-label="t(`settings.app.basic.theme.options.${id}`)"
      @click="$emit('select', id)"
    >
      <span class="theme-choice-content">
        <span
          class="theme-swatch"
          :style="{
            '--preview-background': WORKSPACE_PALETTES[id].background,
            '--preview-sidebar': WORKSPACE_PALETTES[id].sidebar,
            '--preview-panel': WORKSPACE_PALETTES[id].panel,
            '--preview-border': WORKSPACE_PALETTES[id].border,
            '--preview-accent': WORKSPACE_PALETTES[id].accent
          }"
          aria-hidden="true"
        >
          <span class="swatch-sidebar"></span><span class="swatch-panel"></span>
        </span>
        <span class="theme-name">{{ t(`settings.app.basic.theme.options.${id}`) }}</span>
      </span>
    </NButton>
  </div>
</template>

<script setup lang="ts">
import { WORKSPACE_PALETTES } from '@renderer-shared/theme/naive-ui-overrides/workspace'
import {
  type AppThemeId,
  WORKSPACE_THEME_IDS,
  type WorkspaceThemeId
} from '@shared/types/app-theme'
import { useTranslation } from 'i18next-vue'
import { NButton } from 'naive-ui'

defineProps<{ themeId: AppThemeId }>()
defineEmits<{ select: [id: WorkspaceThemeId] }>()
const { t } = useTranslation()
</script>

<style scoped>
.theme-choices {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
}
.theme-choice {
  height: auto;
  padding: 6px;
  text-align: left;
  border-radius: 7px;
  &.selected {
    box-shadow: 0 0 0 1px var(--la-color-link);
  }
}
.theme-choice :deep(.n-button__content) {
  display: block;
  width: 100%;
}
.theme-swatch {
  height: 55px;
  display: grid;
  grid-template-columns: 23% 1fr;
  border: 1px solid var(--preview-border);
  border-radius: 4px;
  overflow: hidden;
  background: var(--preview-background);
}
.theme-choice-content {
  display: block;
  width: 100%;
}
.swatch-sidebar {
  background: var(--preview-sidebar);
  border-right: 1px solid var(--preview-border);
}
.swatch-panel {
  position: relative;
  margin: 8px;
  border: 1px solid var(--preview-border);
  border-radius: 2px;
  background: var(--preview-panel);
  &::after {
    content: '';
    position: absolute;
    inset: 6px 35% auto 5px;
    height: 3px;
    background: var(--preview-accent);
  }
}
.theme-name {
  display: block;
  margin: 8px 3px 3px;
  font-size: 11px;
  font-weight: 500;
}
</style>
