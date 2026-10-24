<template>
  <NCard size="small" :title="t('title')" class="startup-quick-settings">
    <div class="quick-settings-grid">
      <div class="quick-setting">
        <NText>{{ t('overlay') }}</NText>
        <NSwitch
          size="small"
          :aria-label="t('overlay')"
          :value="ongoingWindow.settings.enabled"
          :loading="pending.overlay"
          :disabled="pending.overlay"
          @update:value="(value) => update('overlay', value)"
        />
      </div>
      <div class="quick-setting">
        <NText>{{ t('autoAccept') }}</NText>
        <NSwitch
          size="small"
          :aria-label="t('autoAccept')"
          :value="gameflow.settings.autoAcceptEnabled"
          :loading="pending.autoAccept"
          :disabled="pending.autoAccept"
          @update:value="(value) => update('autoAccept', value)"
        />
      </div>
      <div class="quick-setting">
        <NText>{{ t('autoMatchmaking') }}</NText>
        <NSwitch
          size="small"
          :aria-label="t('autoMatchmaking')"
          :value="gameflow.settings.autoMatchmakingEnabled"
          :loading="pending.autoMatchmaking"
          :disabled="pending.autoMatchmaking"
          @update:value="(value) => update('autoMatchmaking', value)"
        />
      </div>
    </div>
    <NText depth="3" class="mt-2 block text-xs">{{ t('overlayHint') }}</NText>
  </NCard>
</template>

<script setup lang="ts">
import { useInstance } from '@renderer-shared/shards'
import { AutoGameflowRenderer } from '@renderer-shared/shards/auto-gameflow'
import { useAutoGameflowStore } from '@renderer-shared/shards/auto-gameflow/store'
import { WindowManagerRenderer } from '@renderer-shared/shards/window-manager'
import { useOngoingGameWindowStore } from '@renderer-shared/shards/window-manager/store'
import { useTranslation } from 'i18next-vue'
import { NCard, NSwitch, NText, useMessage } from 'naive-ui'
import { reactive } from 'vue'

const { t } = useTranslation(undefined, { keyPrefix: 'startup.quickSettings' })
const ongoingWindow = useOngoingGameWindowStore()
const gameflow = useAutoGameflowStore()
const windows = useInstance(WindowManagerRenderer)
const autoGameflow = useInstance(AutoGameflowRenderer)
const message = useMessage()
const pending = reactive({ overlay: false, autoAccept: false, autoMatchmaking: false })
const setters = {
  overlay: (value: boolean) => windows.ongoingGameWindow.setEnabled(value),
  autoAccept: (value: boolean) => autoGameflow.setAutoAcceptEnabled(value),
  autoMatchmaking: (value: boolean) => autoGameflow.setAutoMatchmakingEnabled(value)
}

async function update(key: keyof typeof setters, value: boolean) {
  pending[key] = true
  try {
    await setters[key](value)
  } catch {
    message.error(t('saveFailed'))
  } finally {
    pending[key] = false
  }
}
</script>

<style scoped>
.startup-quick-settings {
  width: min(100%, 560px);
  margin-top: 20px;
}
.quick-settings-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.quick-setting {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--la-workspace-border);
  border-radius: 6px;
  white-space: nowrap;
}
</style>
