<template>
  <section class="position-panel" aria-labelledby="position-title">
    <h2 id="position-title">{{ t('title') }}</h2>
    <p>{{ t('description') }}</p>
    <NAlert type="info" :show-icon="false">{{ t('timing') }}</NAlert>
    <p>{{ configured ? t('configured') : t('missing') }}</p>
    <NAlert v-if="status?.geometryMismatch" type="warning">{{
      t('reasons.geometry-changed')
    }}</NAlert>
    <p v-if="status" role="status">{{ t(`reasons.${status.reason}`) }}</p>
    <NAlert v-if="failed" type="warning" :show-icon="false">{{ t('failed') }}</NAlert>
    <div class="position-actions">
      <NButton
        type="primary"
        :disabled="busy || status?.state === 'saving'"
        @click="run(() => mainUi.beginChampSelectPosition(), true)"
        >{{ status?.preview ? t('retake') : t('prepare') }}</NButton
      >
      <NButton
        :disabled="busy || status?.state === 'saving'"
        @click="run(() => mainUi.beginAutomaticChampSelectPosition(), true)"
        >{{ t('autoPrepare') }}</NButton
      >
      <NButton
        v-if="status?.state === 'waiting' || status?.preview"
        :disabled="busy"
        @click="run(() => mainUi.cancelChampSelectPosition(), true)"
        >{{ t('cancel') }}</NButton
      >
      <NButton quaternary :disabled="busy" @click="openAdvanced">{{ t('advanced') }}</NButton>
    </div>
    <p class="position-note">{{ t('autoHint') }}</p>
    <template v-if="status?.preview && imageUrl">
      <NAlert
        v-if="status.preview.automatic"
        :show-icon="false"
        :type="status.preview.automatic.reason === 'suggested' ? 'info' : 'warning'"
        >{{ t(`automatic.${status.preview.automatic.reason}`) }}</NAlert
      >
      <div class="position-steps">
        <NButton
          v-for="key in pointKeys"
          :key="key"
          :type="active === key ? 'primary' : 'default'"
          :disabled="busy"
          @click="active = key"
          >{{ t(`points.${key}`) }}{{ selection[key] ? ' ✓' : '' }}</NButton
        >
      </div>
      <p>{{ t('clickHint') }} {{ t(`points.${active}`) }}</p>
      <div class="position-image">
        <img
          ref="previewImage"
          :src="imageUrl"
          :alt="t('imageAlt')"
          draggable="false"
          @click="choosePoint"
        />
        <span
          v-for="marker in markers"
          :key="marker.id"
          class="position-marker"
          :class="marker.group"
          :style="{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }"
          >{{ marker.label }}</span
        >
      </div>
      <p>{{ t('spacingHint') }}</p>
      <NAlert v-if="validationError" type="warning" :show-icon="false">{{
        t(`validation.${validationError}`)
      }}</NAlert>
      <NAlert v-if="spaceTight" type="warning" :show-icon="false">{{ t('spaceTight') }}</NAlert>
      <p class="position-note">{{ t('space') }}</p>
      <div class="position-actions">
        <NButton :disabled="busy" @click="resetPoints">{{ t('reset') }}</NButton>
        <NButton type="primary" :disabled="busy || !draft" :loading="busy" @click="save">{{
          t('save')
        }}</NButton>
        <NButton
          :disabled="busy"
          @click="run(() => mainUi.exportChampSelectPositionSample(status!.preview!.requestId))"
          >{{ t('exportSample') }}</NButton
        >
      </div>
      <p class="position-note">{{ t('exportHint') }}</p>
    </template>
    <p class="position-note">{{ t('privacy') }}</p>
  </section>
</template>

<script setup lang="ts">
import { useInstance } from '@renderer-shared/shards'
import { useAkariNavigation } from '@renderer-shared/shards/akari-navigation'
import { useOngoingGameStore } from '@renderer-shared/shards/ongoing-game/store'
import {
  emptyPositionSelection,
  positionSettingsFromSelection,
  type PositionCalibrationStatus,
  type PositionSelection
} from '@shared/champ-select-overlay/position-calibration'
import { useTranslation } from 'i18next-vue'
import { NAlert, NButton } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { navigateToSetting } from '@main-window/settings-navigation'
import { MainWindowUiRenderer } from '@main-window/shards/main-window-ui'

const { t } = useTranslation(undefined, { keyPrefix: 'veyraSettings.positionCalibration' })
const mainUi = useInstance(MainWindowUiRenderer)
const navigation = useAkariNavigation()
const ongoing = useOngoingGameStore()
const status = ref<PositionCalibrationStatus | null>(null)
const imageUrl = ref<string | null>(null)
const previewImage = ref<HTMLImageElement | null>(null)
const busy = ref(false)
const failed = ref(false)
const pointKeys = ['candidateFirst', 'teammateFirst', 'candidateNext', 'teammateNext'] as const
const active = ref<keyof PositionSelection>('candidateFirst')
const selection = ref(emptyPositionSelection())
const configured = computed(
  () =>
    ongoing.settings.champSelectOverlay.candidateFirstCenterX !== null &&
    ongoing.settings.champSelectOverlay.teammateFirstCenterY !== null
)
let timer: ReturnType<typeof setInterval> | undefined
let alive = true
let refreshGeneration = 0
let refreshing: number | null = null
let imageRequest: string | null = null

function resetPoints() {
  selection.value = emptyPositionSelection()
  active.value = 'candidateFirst'
}
async function refresh() {
  if (busy.value) return
  const generation = refreshGeneration
  if (refreshing === generation) return
  refreshing = generation
  try {
    const next = await mainUi.getChampSelectPositionStatus()
    if (!alive || generation !== refreshGeneration) return
    status.value = next
    const requestId = next.preview?.requestId ?? null
    if (requestId !== imageRequest) {
      imageRequest = requestId
      imageUrl.value = null
      resetPoints()
      if (next.preview?.automatic?.selection)
        selection.value = JSON.parse(JSON.stringify(next.preview.automatic.selection))
      if (requestId) {
        const image = await mainUi.getChampSelectPositionPreview(requestId)
        if (alive && generation === refreshGeneration && imageRequest === requestId)
          imageUrl.value = image
      }
    }
  } catch {
    if (alive && generation === refreshGeneration) failed.value = true
  } finally {
    if (refreshing === generation) refreshing = null
  }
}
async function run(action: () => Promise<unknown>, clearPreview = false) {
  if (busy.value) return
  busy.value = true
  failed.value = false
  refreshGeneration++
  if (clearPreview) {
    status.value = null
    imageRequest = null
    imageUrl.value = null
    resetPoints()
  }
  try {
    await action()
  } catch {
    failed.value = true
  } finally {
    busy.value = false
    await refresh()
  }
}
function choosePoint(event: MouseEvent) {
  const box = previewImage.value?.getBoundingClientRect()
  if (!box || !box.width || !box.height || busy.value) return
  selection.value = {
    ...selection.value,
    [active.value]: {
      x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height))
    }
  }
  if (active.value === 'candidateFirst' && !selection.value.teammateFirst)
    active.value = 'teammateFirst'
}
const result = computed(() => {
  if (!status.value?.preview) return { draft: null, error: '' }
  try {
    const draft = positionSettingsFromSelection(
      ongoing.settings.champSelectOverlay,
      status.value.preview.client,
      selection.value
    )
    const { client, counts } = status.value.preview
    if (
      draft.candidateFirstCenterX! + (counts.candidates - 1) * draft.candidateStep > client.width ||
      draft.teammateFirstCenterY! + (counts.teammates - 1) * draft.teammateStep > client.height
    )
      return { draft: null, error: 'outside' }
    return { draft, error: '' }
  } catch (error) {
    return { draft: null, error: error instanceof Error ? error.message : 'invalid-points' }
  }
})
const draft = computed(() => result.value.draft)
const validationError = computed(() => result.value.error)
const markers = computed(() => {
  const preview = status.value?.preview
  if (!preview) return []
  const settings = draft.value ?? ongoing.settings.champSelectOverlay
  return (['candidate', 'teammate'] as const).flatMap((group) => {
    const first = selection.value[group === 'candidate' ? 'candidateFirst' : 'teammateFirst']
    if (!first) return []
    const count = group === 'candidate' ? preview.counts.candidates : preview.counts.teammates
    return Array.from({ length: Math.min(count, 20) }, (_, i) => ({
      id: `${group}-${i}`,
      group,
      label: t(group === 'candidate' ? 'candidateMarker' : 'teammateMarker', { index: i + 1 }),
      x:
        first.x + (group === 'candidate' ? (i * settings.candidateStep) / preview.client.width : 0),
      y: first.y + (group === 'teammate' ? (i * settings.teammateStep) / preview.client.height : 0)
    })).filter((p) => p.x <= 1 && p.y <= 1)
  })
})
const spaceTight = computed(() => {
  const preview = status.value?.preview
  return (
    preview &&
    (preview.client.y - preview.workArea.y < 71 || preview.client.x - preview.workArea.x < 80)
  )
})
async function save() {
  const requestId = status.value?.preview?.requestId
  if (requestId && draft.value)
    await run(() => mainUi.saveChampSelectPosition(requestId, selection.value))
}
async function openAdvanced() {
  await navigateToSetting(navigation, 'ongoing-game.champ-select-overlay.candidate-origin')
}
onMounted(() => {
  void refresh()
  timer = setInterval(() => void refresh(), 1000)
})
onBeforeUnmount(() => {
  alive = false
  if (timer) clearInterval(timer)
  imageUrl.value = null
})
</script>

<style scoped>
.position-panel {
  padding: 20px;
  border: 1px solid var(--la-color-border, #d8dce4);
  border-radius: 8px;
}
.position-panel h2 {
  margin: 0 0 10px;
  font-size: 18px;
}
.position-panel p {
  margin: 10px 0;
  line-height: 1.6;
}
.position-actions,
.position-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
}
.position-image {
  position: relative;
  line-height: 0;
  max-width: 1100px;
}
.position-image img {
  display: block;
  width: 100%;
  height: auto;
  cursor: crosshair;
  user-select: none;
}
.position-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: none;
  min-width: 22px;
  height: 22px;
  padding: 2px;
  border-radius: 50%;
  border: 2px solid white;
  color: white;
  background: #245bcc;
  line-height: 22px;
  text-align: center;
  font-size: 11px;
  box-shadow: 0 0 0 1px #245bcc;
}
.position-marker.teammate {
  background: #8246b3;
  box-shadow: 0 0 0 1px #8246b3;
}
.position-note {
  color: var(--la-color-text-secondary, #697487);
  font-size: 12px;
}
</style>
