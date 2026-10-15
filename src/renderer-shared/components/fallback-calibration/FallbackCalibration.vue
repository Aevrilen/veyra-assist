<script setup lang="ts">
import { NAlert, NButton, NSpace } from 'naive-ui'
import { computed, ref, watch } from 'vue'

import {
  CALIBRATION_HINT,
  type FallbackCalibration,
  type GameFrame,
  type Scene,
  mapSelection,
  prepareCalibration,
  trustedFrame
} from '@shared/mayhem-assistant/fallback-calibration'
import type { Rect } from '@shared/mayhem-assistant/model'

// Parent supplies a memory-only preview of the existing trusted game capture.
// No capture, IPC, persistence or telemetry is performed by this editor.
const props = defineProps<{
  frame: GameFrame | null
  currentContext: { sessionKey: string; sourceKey: string; width: number; height: number } | null
  imageUrl: string | null
  scene: Scene
}>()
const emit = defineEmits<{
  save: [draft: FallbackCalibration, sourceSequence: number, sessionKey: string]
  cancel: []
}>()
const image = ref<HTMLImageElement | null>(null)
const start = ref<{ x: number; y: number } | null>(null)
const selection = ref<Rect | null>(null)
const draft = ref<FallbackCalibration | null>(null)
const error = ref('')
const previewReceivedAt = ref(0)
const previewTrusted = ref(false)
const valid = computed(() => previewTrusted.value && !!props.imageUrl)
const boxes = computed(() => (draft.value ? [draft.value.rect, ...draft.value.titleRects] : []))
watch(
  () => [props.frame, props.imageUrl, props.scene],
  () => {
    start.value = null
    selection.value = null
    draft.value = null
    error.value = ''
    previewReceivedAt.value = Date.now()
    previewTrusted.value = !!props.frame && trustedFrame(props.frame, previewReceivedAt.value)
  },
  { immediate: true }
)
function point(event: PointerEvent) {
  const bounds = image.value?.getBoundingClientRect()
  if (!bounds) return null
  return {
    x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
    y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top))
  }
}
function begin(event: PointerEvent) {
  if (!props.frame || !previewTrusted.value) {
    error.value = '当前没有可用的游戏截图。请返回游戏后重试。'
    return
  }
  start.value = point(event)
  draft.value = null
  selection.value = null
  error.value = ''
  image.value?.setPointerCapture(event.pointerId)
}
function move(event: PointerEvent) {
  const end = point(event)
  if (!start.value || !end || !props.frame || !image.value) return
  const bounds = image.value.getBoundingClientRect()
  selection.value = mapSelection(
    {
      x: Math.min(start.value.x, end.x),
      y: Math.min(start.value.y, end.y),
      width: Math.abs(start.value.x - end.x),
      height: Math.abs(start.value.y - end.y)
    },
    bounds,
    props.frame
  )
}
function finish(event: PointerEvent) {
  move(event)
  start.value = null
  if (!selection.value || !props.frame) return
  try {
    draft.value = prepareCalibration(
      props.frame,
      props.scene,
      selection.value,
      previewReceivedAt.value
    )
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '请重新框选完整区域。'
  }
}
function clear() {
  start.value = selection.value = draft.value = null
  error.value = ''
}
function cancel() {
  clear()
  emit('cancel')
}
function save() {
  if (!draft.value || !props.frame) return
  const current = props.currentContext
  if (
    !current ||
    current.sessionKey !== props.frame.sessionKey ||
    current.sourceKey !== props.frame.sourceKey ||
    current.width !== props.frame.width ||
    current.height !== props.frame.height
  ) {
    error.value = '当前画面已变化。请返回游戏后重新框选。'
    return
  }
  // Saving learned geometry is not scene-open evidence. Runtime still requires
  // two different fresh foreground game frames before showing an overlay.
  emit('save', draft.value, props.frame.sourceSequence, current.sessionKey)
}
function style(rect: Rect) {
  return {
    left: `${(rect.x / props.frame!.width) * 100}%`,
    top: `${(rect.y / props.frame!.height) * 100}%`,
    width: `${(rect.width / props.frame!.width) * 100}%`,
    height: `${(rect.height / props.frame!.height) * 100}%`
  }
}
</script>

<template>
  <NSpace vertical :size="12">
    <NAlert type="info" :show-icon="false">{{ CALIBRATION_HINT }}</NAlert>
    <NAlert v-if="!valid" type="warning" :show-icon="false"
      >当前没有可用的游戏截图。请返回游戏后重试。</NAlert
    >
    <div v-else class="image-area" @keydown.esc="clear">
      <img
        ref="image"
        class="game-image"
        :src="imageUrl!"
        alt="当前游戏截图，请框选完整三卡或商店区域"
        draggable="false"
        @pointerdown="begin"
        @pointermove="move"
        @pointerup="finish"
        @pointercancel="clear"
      />
      <div v-if="selection && !draft" class="selection" :style="style(selection)" />
      <div
        v-for="(rect, index) in boxes"
        :key="index"
        class="selection"
        :class="{ title: index > 0 }"
        :style="style(rect)"
      />
    </div>
    <NAlert v-if="error" type="warning" :show-icon="false">{{ error }}</NAlert>
    <div v-if="draft">请确认区域正确。保存后仍会检查当前游戏画面。</div>
    <NSpace justify="end">
      <NButton @click="clear">重新框选</NButton>
      <NButton @click="cancel">取消</NButton>
      <NButton type="primary" :disabled="!draft" @click="save">保存</NButton>
    </NSpace>
  </NSpace>
</template>

<style scoped>
.image-area {
  position: relative;
  width: 100%;
  line-height: 0;
}
.game-image {
  display: block;
  width: 100%;
  height: auto;
  cursor: crosshair;
  touch-action: none;
  user-select: none;
}
.selection {
  position: absolute;
  box-sizing: border-box;
  border: 2px solid var(--la-color-link, #d8b56b);
  background: var(--la-workspace-accent-soft, rgba(216, 181, 107, 0.12));
  pointer-events: none;
}
.selection.title {
  border-color: var(--la-color-text-primary, #eee6d2);
  background: color-mix(in srgb, var(--la-color-text-primary, #eee6d2) 10%, transparent);
}
</style>
