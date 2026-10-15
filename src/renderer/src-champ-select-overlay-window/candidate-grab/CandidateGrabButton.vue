<template>
  <SetupInAppScope />
  <button
    class="grab-button"
    type="button"
    :disabled="!state.identity || state.busy || pending"
    :aria-label="message"
    :title="message"
    @pointerdown.prevent
    @click="grab"
  >
    {{ state.busy || pending ? '…' : result?.state === 'confirmed' ? '✓' : t('grab') }}
  </button>
</template>

<script setup lang="ts">
import { useInstance } from '@renderer-shared/shards'
import { AkariIpcRenderer } from '@renderer-shared/shards/ipc'
import { LoggerRenderer } from '@renderer-shared/shards/logger'
import { SetupInAppScope } from '@renderer-shared/shards/setup-in-app-scope/setup-in-app-scope-component'
import {
  CANDIDATE_GRAB_NAMESPACE,
  type CandidateGrabButtonState,
  type CandidateGrabResult
} from '@shared/champ-select-overlay/candidate-grab'
import { useTranslation } from 'i18next-vue'
import { computed, onMounted, ref } from 'vue'

const { t } = useTranslation(undefined, {
  keyPrefix: 'ongoingGame.champSelectOverlay.candidateGrab'
})
const ipc = useInstance(AkariIpcRenderer)
const logger = useInstance(LoggerRenderer).createLogger('champ-select-grab-button')
const state = ref<CandidateGrabButtonState>({ identity: null, busy: false })
const pending = ref(false)
const result = ref<CandidateGrabResult | null>(null)
const message = computed(() => {
  if (state.value.busy || pending.value) return t('selecting')
  if (result.value?.state === 'confirmed') return t('selected')
  if (result.value?.state === 'failed') return t('failed')
  if (result.value?.state === 'unconfirmed') return t('unconfirmed')
  if (result.value?.state === 'stale' || result.value?.state === 'unavailable')
    return t('unavailable')
  return t(state.value.identity ? 'selectCandidate' : 'unavailable')
})

ipc.onEventVue(
  CANDIDATE_GRAB_NAMESPACE,
  'candidate-grab-state',
  (next: CandidateGrabButtonState) => {
    if (
      next.identity?.sessionId !== state.value.identity?.sessionId ||
      next.identity?.revision !== state.value.identity?.revision ||
      next.identity?.championId !== state.value.identity?.championId
    )
      result.value = null
    state.value = next
  }
)

onMounted(async () => {
  try {
    await ipc.call(CANDIDATE_GRAB_NAMESPACE, 'candidateButtonReady')
  } catch (error) {
    logger.warn('Candidate button readiness failed', error)
  }
})

async function grab() {
  const identity = state.value.identity ? { ...state.value.identity } : null
  if (!identity || state.value.busy || pending.value) return
  pending.value = true
  result.value = null
  try {
    result.value = await ipc.call<CandidateGrabResult>(
      CANDIDATE_GRAB_NAMESPACE,
      'grabCandidate',
      identity
    )
  } catch (error) {
    logger.warn('Candidate selection IPC failed', error)
    result.value = { state: 'failed' }
  } finally {
    pending.value = false
  }
}
</script>

<style scoped>
.grab-button {
  box-sizing: border-box;
  display: block;
  width: 32px;
  height: 22px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid #9c885b;
  border-radius: 3px;
  background: #181b21;
  color: #f2e1b0;
  font:
    500 13px/20px 'Microsoft YaHei',
    system-ui,
    sans-serif;
  text-align: center;
  appearance: none;
  cursor: pointer;
  pointer-events: auto;
  user-select: none;
}

.grab-button:hover:enabled {
  background: #30343d;
}
.grab-button:active:enabled {
  background: #45403a;
}
.grab-button:focus-visible {
  outline: 1px solid #f2e1b0;
  outline-offset: -3px;
}
.grab-button:disabled {
  border-color: #4f5660;
  color: #929aa6;
  background: #181b21;
  cursor: default;
}
</style>
