<template>
  <NAlert v-if="visible" type="warning" :title="t('title')" class="position-notice">
    <div class="position-notice-content">
      <span>{{ t('description') }}</span>
      <NButton size="small" @click="router.push({ name: 'first-run' })">{{ t('open') }}</NButton>
    </div>
  </NAlert>
</template>
<script setup lang="ts">
import { useOngoingGameStore } from '@renderer-shared/shards/ongoing-game/store'
import { useTranslation } from 'i18next-vue'
import { NAlert, NButton } from 'naive-ui'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const ongoingGame = useOngoingGameStore()
const router = useRouter()
const { t } = useTranslation(undefined, { keyPrefix: 'veyraSettings.positionNotice' })
const visible = computed(
  () =>
    ongoingGame.settings.enabled &&
    (ongoingGame.settings.champSelectOverlay.candidateFirstCenterX === null ||
      ongoingGame.settings.champSelectOverlay.teammateFirstCenterY === null)
)
</script>
<style scoped>
.position-notice {
  flex-shrink: 0;
  margin: 8px 24px;
}
.position-notice-content {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
</style>
