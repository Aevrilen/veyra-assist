<template>
  <div class="first-run-guide">
    <ChampSelectPositionPanel />
    <NText depth="3">{{ t('guide.description') }}</NText>
    <FirstRunEnvironmentPanel
      :status="status"
      :loading="loading"
      :has-load-error="hasLoadError"
      @refresh="refresh"
    />
    <div class="flex items-center gap-3">
      <NButton :loading="opening" :disabled="opening || unsupported" @click="openGuide">
        {{ t('guide.open') }}
      </NButton>
      <NText depth="3">{{ t('guide.hint') }}</NText>
    </div>
    <NAlert v-if="openFailed" type="warning" :show-icon="false">{{ t('guide.openFailed') }}</NAlert>
  </div>
</template>

<script setup lang="ts">
import { useInstance } from '@renderer-shared/shards'
import { useTranslation } from 'i18next-vue'
import { NAlert, NButton, NText } from 'naive-ui'
import { computed, ref } from 'vue'

import { MainWindowUiRenderer } from '@main-window/shards/main-window-ui'

import FirstRunEnvironmentPanel from './FirstRunEnvironmentPanel.vue'
import ChampSelectPositionPanel from '../champ-select-position/ChampSelectPositionPanel.vue'
import { useFirstRunEnvironmentStatus } from './first-run-environment-controller'

const mainWindowUi = useInstance(MainWindowUiRenderer)
const { t } = useTranslation(undefined, { keyPrefix: 'firstRunEnvironment' })
const { status, loading, hasLoadError, refresh } = useFirstRunEnvironmentStatus(() =>
  mainWindowUi.getFirstRunEnvironmentStatus()
)
const opening = ref(false)
const openFailed = ref(false)
const unsupported = computed(
  () =>
    status.value?.local.some((row) => row.id === 'platform' && row.result === 'unsupported') ??
    false
)
const openGuide = async () => {
  if (opening.value) return
  opening.value = true
  openFailed.value = false
  try {
    await mainWindowUi.openMayhemSetup()
  } catch {
    openFailed.value = true
  } finally {
    opening.value = false
  }
}
</script>

<style scoped>
.first-run-guide {
  box-sizing: border-box;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
}
.first-run-guide > * {
  flex-shrink: 0;
}
</style>
