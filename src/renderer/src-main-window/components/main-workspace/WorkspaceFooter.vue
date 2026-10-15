<template>
  <footer class="workspace-footer">
    <NButton
      size="small"
      quaternary
      :type="settingsActive ? 'primary' : 'default'"
      @click="context.openSettingsModal()"
    >
      <template #icon
        ><NIcon><Settings16Filled /></NIcon></template
      >{{ t('navigation.workspace.settings') }}
    </NButton>
    <div class="workspace-footer-status">
      <SidebarFixed :is-collapsed="false" :show-settings="false" />
    </div>
    <NButton size="small" quaternary @click="context.openSearch('settings')">{{
      t('navigation.workspace.functionSearch')
    }}</NButton>
  </footer>
</template>

<script setup lang="ts">
import { Settings16Filled } from '@vicons/fluent'
import { useTranslation } from 'i18next-vue'
import { NButton, NIcon } from 'naive-ui'
import { useMainWindowAppContext } from '@main-window/context'
import SidebarFixed from '../sidebar/SidebarFixed.vue'
defineProps<{ settingsActive: boolean }>()
const { t } = useTranslation()
const context = useMainWindowAppContext()
</script>

<style scoped>
.workspace-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 20px;
  min-height: 42px;
  border-top: 1px solid var(--la-workspace-border);
  background: var(--la-workspace-panel);
  flex-shrink: 0;
}
.workspace-footer-status {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
}
.workspace-footer-status :deep(.sidebar-fixed) {
  display: flex;
  align-items: center;
  gap: 8px;
  width: auto;
}
.workspace-footer-status :deep(.menu-item) {
  width: auto;
  max-width: 220px;
}
.workspace-footer-status :deep(.menu-item__inner) {
  min-height: 30px;
  padding: 4px 8px;
}
.workspace-footer-status :deep(.menu-item__icon) {
  font-size: 18px;
}
.workspace-footer-status :deep(.menu-item__label) {
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (max-width: 760px) {
  .workspace-footer {
    gap: 6px;
    padding-inline: 12px;
  }
  .workspace-footer-status :deep(.menu-item) {
    max-width: 150px;
  }
}
</style>
