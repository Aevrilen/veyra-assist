<template>
  <NCard :title="t('title')" size="small" class="first-run-environment">
    <template #header-extra>
      <NButton size="small" :loading="loading" :disabled="loading" @click="emit('refresh')">
        {{ t('refresh') }}
      </NButton>
    </template>
    <NText depth="3">{{ t('description') }}</NText>
    <NAlert v-if="hasLoadError" type="warning" :show-icon="false" class="mt-3">
      {{ t('loadError') }}
    </NAlert>
    <NText v-else-if="!status" depth="3" class="mt-3 block" role="status">
      {{ loading ? t('loading') : t('notChecked') }}
    </NText>
    <template v-if="status">
      <div v-for="section in sections" :key="section.id" class="mt-4">
        <NText strong>{{ t(`sections.${section.id}`) }}</NText>
        <div v-for="row in section.rows" :key="row.id" class="environment-row">
          <div class="min-w-0">
            <NText>{{ t(`checks.${row.id}`, { defaultValue: t('checkItem') }) }}</NText>
            <NText depth="3" class="mt-1 block text-xs">
              {{ t(`reasons.${row.reasonCode}`, { defaultValue: t('notChecked') }) }}
            </NText>
          </div>
          <NTag :type="resultType(row.result)" size="small" :bordered="false">
            {{ row.result ? t(`results.${row.result}`) : t('notChecked') }}
          </NTag>
        </div>
      </div>
      <div class="calibration-status mt-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <NText strong>{{ t('calibration.title') }}</NText>
          <NTag :type="calibrationType" size="small" :bordered="false">
            {{ calibrationLabel }}
          </NTag>
        </div>
        <NText depth="3" class="mt-2 block text-xs">
          {{ t(`reasons.${status.calibration.reasonCode}`, { defaultValue: t('notChecked') }) }}
        </NText>
        <NText
          v-if="status.calibration.route === 'guided-sample-needed'"
          depth="3"
          class="mt-2 block text-xs"
        >
          {{ t('reasons.guided-sampling-unavailable') }}
        </NText>
        <NText v-if="status.legacyCalibrationPresent" depth="3" class="mt-2 block text-xs">
          {{ t('calibration.legacyPresent') }}
        </NText>
      </div>
    </template>
  </NCard>
</template>

<script setup lang="ts">
import type { FirstRunEnvironmentStatus, FirstRunResult } from '@shared/types/first-run-environment'
import { useTranslation } from 'i18next-vue'
import { NAlert, NButton, NCard, NTag, NText } from 'naive-ui'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    status: FirstRunEnvironmentStatus | null
    loading?: boolean
    hasLoadError?: boolean
  }>(),
  { loading: false, hasLoadError: false }
)
const emit = defineEmits<{ refresh: [] }>()
const { t } = useTranslation(undefined, { keyPrefix: 'firstRunEnvironment' })

const sections = computed(() =>
  props.status
    ? [
        { id: 'local', rows: props.status.local },
        { id: 'game', rows: props.status.game }
      ]
    : []
)
const resultType = (result: FirstRunResult | null) =>
  result === 'available' ? 'success' : result === 'needs-setup' ? 'warning' : 'default'
const calibrationType = computed(() =>
  ['automatic-ready', 'fallback-ready'].includes(props.status?.calibration.route ?? '') &&
  props.status?.calibration.verified
    ? 'success'
    : props.status?.calibration.route === 'guided-sample-needed'
      ? 'warning'
      : 'default'
)
const calibrationLabel = computed(() => {
  const calibration = props.status?.calibration
  if (!calibration?.route) return t('notChecked')
  if (['automatic-ready', 'fallback-ready'].includes(calibration.route) && !calibration.verified)
    return t('notChecked')
  return t(`calibration.routes.${calibration.route}`)
})
</script>

<style scoped>
.environment-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--la-workspace-border);
}
.calibration-status {
  padding: 12px;
  border: 1px solid var(--la-workspace-border);
  border-radius: 6px;
}
</style>
