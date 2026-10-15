<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{ disabled?: boolean; active?: boolean; error?: string }>(),
  {
    disabled: false,
    active: true
  }
)
const emit = defineEmits<{ suppress: [] }>()
const button = ref<HTMLButtonElement>()
const holding = ref(false)
const progress = ref(0)
let pointerId: number | null = null
let heldKey: string | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let frame = 0
let startedAt = 0

function cancel() {
  holding.value = false
  progress.value = 0
  clearTimeout(timer)
  cancelAnimationFrame(frame)
  const captured = pointerId
  pointerId = null
  heldKey = null
  if (captured !== null && button.value?.hasPointerCapture(captured))
    button.value.releasePointerCapture(captured)
}

function updateProgress() {
  progress.value = Math.min((performance.now() - startedAt) / 1000, 1)
  frame = requestAnimationFrame(updateProgress)
}

function start() {
  holding.value = true
  startedAt = performance.now()
  updateProgress()
  timer = setTimeout(() => {
    cancel()
    emit('suppress')
  }, 1000)
}

function pointerDown(event: PointerEvent) {
  if (props.disabled || !props.active || holding.value || event.button !== 0 || !event.isPrimary)
    return
  pointerId = event.pointerId
  button.value!.setPointerCapture(event.pointerId)
  start()
}

function pointerMove(event: PointerEvent) {
  if (event.pointerId !== pointerId) return
  const rect = button.value!.getBoundingClientRect()
  if (
    event.clientX < rect.left ||
    event.clientX >= rect.right ||
    event.clientY < rect.top ||
    event.clientY >= rect.bottom
  )
    cancel()
}

function keyDown(event: KeyboardEvent) {
  if (event.key !== ' ' && event.key !== 'Enter') return
  event.preventDefault()
  if (props.disabled || !props.active || holding.value || event.repeat) return
  heldKey = event.key
  start()
}

function keyUp(event: KeyboardEvent) {
  if (event.key === heldKey) cancel()
}

function visibilityChanged() {
  if (document.hidden) cancel()
}

watch(
  () => [props.disabled, props.active],
  () => {
    if (props.disabled || !props.active) cancel()
  }
)
onMounted(() => {
  window.addEventListener('blur', cancel)
  window.addEventListener('pointerup', cancel)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keyup', keyUp)
  document.addEventListener('visibilitychange', visibilityChanged)
})
onUnmounted(() => {
  cancel()
  window.removeEventListener('blur', cancel)
  window.removeEventListener('pointerup', cancel)
  window.removeEventListener('pointercancel', cancel)
  window.removeEventListener('keyup', keyUp)
  document.removeEventListener('visibilitychange', visibilityChanged)
})
</script>

<template>
  <button
    ref="button"
    class="equipment-suppress"
    :class="{ holding }"
    :disabled="disabled || !active"
    aria-label="本局不再显示（长按1秒）"
    title="长按1秒，本局隐藏，下一局自动恢复"
    @pointerdown="pointerDown"
    @pointermove="pointerMove"
    @pointerup="cancel"
    @pointerleave="cancel"
    @pointercancel="cancel"
    @lostpointercapture="cancel"
    @blur="cancel"
    @keydown="keyDown"
    @contextmenu.prevent
    @click.prevent
  >
    <span class="hold-label">本局不再显示</span>
    <span class="hold-hint" :role="error ? 'alert' : undefined">{{
      error || (holding ? `保持按住 · ${Math.floor(progress * 100)}%` : '长按1秒 · 下局恢复')
    }}</span>
    <span
      class="hold-progress"
      role="progressbar"
      aria-label="长按关闭进度"
      :aria-valuenow="Math.floor(progress * 100)"
      :aria-valuemin="0"
      :aria-valuemax="100"
      :style="{ transform: `scaleX(${progress})` }"
    ></span>
  </button>
</template>
