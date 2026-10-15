<script setup lang="ts">
import {
  trustedFrame,
  type FallbackCalibration,
  type Scene
} from '@shared/mayhem-assistant/fallback-calibration'
import {
  FALLBACK_PREVIEW_EVENT,
  type FallbackSelectionPreview,
  type FallbackSelectionStatus
} from '@shared/types/fallback-calibration'
import { NAlert, NButton, NConfigProvider, NSpace, darkTheme } from 'naive-ui'
import { onMounted, onUnmounted, ref, shallowRef } from 'vue'

import FallbackCalibrationEditor from './FallbackCalibration.vue'

const props = defineProps<{ call: (name: string, ...args: unknown[]) => Promise<any> }>()
const status = shallowRef<FallbackSelectionStatus | null>(null)
const preview = shallowRef<FallbackSelectionPreview | null>(null)
const busy = ref(false)
const message = ref('')
const error = ref('')
let disposed = false
let reading = false
let timer: ReturnType<typeof setInterval> | null = null

async function refresh() {
  if (disposed || reading || busy.value) return
  reading = true
  try {
    const current = (await props.call('fallbackSelectionStatus')) as FallbackSelectionStatus
    if (disposed) return
    status.value = current
    if (preview.value?.requestId !== current.requestId) preview.value = null
  } catch {
    if (!disposed) error.value = '暂时无法读取框选状态，请稍后重试。'
  } finally {
    reading = false
  }
}

async function run(action: () => Promise<void>) {
  if (disposed || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (cause) {
    if (!disposed) error.value = cause instanceof Error ? cause.message : '框选操作未完成，请重试。'
  } finally {
    if (!disposed) {
      busy.value = false
      await refresh()
    }
  }
}

async function begin(scene: Scene) {
  await run(async () => {
    const next = (await props.call('beginFallbackSelection', scene)) as FallbackSelectionStatus
    if (disposed) return
    preview.value = null
    status.value = next
    message.value = '请回到游戏打开所选界面，保持几秒，再返回本窗口框选。'
  })
}

const receivePreview = (_event: unknown, next: FallbackSelectionPreview) => {
  if (disposed || next.requestId !== status.value?.requestId) return
  if (!trustedFrame(next.frame, Date.now())) {
    // A delayed IPC delivery is never accepted as a fresh preview. Wait for the next capture.
    void begin(next.scene)
    return
  }
  preview.value = next
  message.value = '已收到当前游戏截图。请框选完整外框，核对预览后保存。'
  void refresh()
}

async function save(draft: FallbackCalibration) {
  const current = preview.value
  if (!current) return
  await run(async () => {
    const saved = await props.call('saveFallbackSelection', {
      requestId: current.requestId,
      rect: draft.rect
    })
    if (saved !== true) throw new Error('备用位置未保存，请重试。')
    if (disposed) return
    preview.value = null
    message.value = '备用位置已保存。请回到游戏，程序会用两张新的游戏画面确认后显示。'
  })
}

async function cancel() {
  const requestId = status.value?.requestId
  if (!requestId) return
  await run(async () => {
    await props.call('cancelFallbackSelection', requestId)
    if (disposed) return
    preview.value = null
    message.value = '已取消框选，原有备用位置保留。'
  })
}

onMounted(() => {
  window.electron?.ipcRenderer.on(FALLBACK_PREVIEW_EVENT, receivePreview)
  void refresh()
  timer = setInterval(() => void refresh(), 1000)
})
onUnmounted(() => {
  disposed = true
  if (timer) clearInterval(timer)
  window.electron?.ipcRenderer.removeListener(FALLBACK_PREVIEW_EVENT, receivePreview)
  preview.value = null
})
</script>

<template>
  <NConfigProvider :theme="darkTheme">
    <NSpace vertical :size="12" :aria-busy="busy">
      <NAlert type="info" :show-icon="false">
        默认先自动定位。自动定位未找到界面时，可用一张当前游戏截图框选三卡或商店，无需填写坐标和名称。
        截图仅在本机内存中用于框选，保存内容只有位置与少量边框特征。
      </NAlert>
      <div>
        {{ status?.configured.cards ? '三卡备用位置已保存' : '三卡备用位置未设置' }} ·
        {{ status?.configured.shop ? '商店备用位置已保存' : '商店备用位置未设置' }}
      </div>
      <NSpace>
        <NButton :disabled="busy || !status" @click="begin('cards')">框选三卡</NButton>
        <NButton :disabled="busy || !status" @click="begin('shop')">框选商店</NButton>
        <NButton v-if="status?.requestId && !preview" :disabled="busy" @click="cancel"
          >取消等待</NButton
        >
      </NSpace>
      <div v-if="status?.state === 'waiting'" role="status">
        正在等待可信游戏画面。请先切回游戏打开对应界面，再返回这里。
      </div>
      <FallbackCalibrationEditor
        v-if="preview"
        :key="preview.requestId"
        :frame="preview.frame"
        :image-url="preview.imageUrl"
        :scene="preview.scene"
        :current-context="status?.currentContext ?? null"
        @save="save"
        @cancel="cancel"
      />
      <NAlert v-if="error" type="warning" :show-icon="false">{{ error }}</NAlert>
      <div role="status" aria-live="polite">{{ busy ? '正在处理…' : message }}</div>
      <div class="fallback-hint">
        商店可跟随小幅拖动；大幅移动或游戏分辨率改变后请重新框选。银色、金色、彩色卡片外观变化时也可能需要重选。
        关闭界面或本局隐藏装备时，浮窗会按原有规则收起。
      </div>
    </NSpace>
  </NConfigProvider>
</template>

<style scoped>
.fallback-hint {
  color: var(--la-workspace-muted, #a9b3c2);
  font-size: 13px;
  line-height: 1.6;
}
</style>
