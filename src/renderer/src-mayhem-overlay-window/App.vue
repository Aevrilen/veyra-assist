<script setup lang="ts">
import { equipmentPresentation } from '@shared/mayhem-assistant/equipment-rules'
import type {
  Category,
  EquipmentBuildView,
  OverlayDispatchMeta,
  OverlaySnapshot
} from '@shared/mayhem-assistant/model'
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'

import Setup from './Setup.vue'
import AugmentBar from './overlay/AugmentBar.vue'
import EquipmentControls from './overlay/EquipmentControls.vue'
import EquipmentPanel from './overlay/EquipmentPanel.vue'
import HoldToSuppress from './overlay/hold-to-suppress/HoldToSuppress.vue'

const query = new URLSearchParams(location.search)
// Fixtures are available only through an explicit browser-only development entry.
const debug = import.meta.env.DEV && query.get('debug') === '1' && !window.electron
const DebugOverlay = debug ? defineAsyncComponent(() => import('./debug/DebugOverlay.vue')) : null
const role = query.get('role') || 'setup'
const busy = ref(false)
const error = ref('')
const snapshot = ref<OverlaySnapshot>({
  sessionKey: null,
  championId: null,
  championName: '等待英雄',
  shopVisible: false,
  cardsVisible: false,
  suppressed: false,
  category: 'items',
  candidates: [null, null, null],
  equipment: null,
  augmentData: null,
  itemAssets: {},
  diagnostic: '等待本局数据'
})
const candidateIndex = /^augment-[0-2]$/.test(role) ? Number(role.at(-1)) : -1
const candidate = computed(() => snapshot.value.candidates[candidateIndex] ?? null)
const equipmentView = computed(() => equipmentPresentation(snapshot.value))

async function call(name: string, ...args: unknown[]) {
  if (!window.electron) throw new Error('未连接桌面应用；离线预览请使用开发调试入口。')
  const result = await window.electron.ipcRenderer.invoke(
    'akariCall',
    'mayhem-assistant-main',
    name,
    ...args
  )
  if (!result.success) throw new Error(result.error?.message || 'Overlay 请求失败')
  return result.data
}

async function action(
  name: 'category' | 'suppress' | 'collapse' | 'restore' | 'buildView',
  value?: Category | EquipmentBuildView
) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await call(name, snapshot.value.sessionKey, ...(value ? [value] : []))
    if (result === false) error.value = '本局已变化，请重试。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}

let mounted = false
const snapshotEvents = ref(0)
const snapshotReceived = ref(false)
const snapshotVersion = ref<number | null>(null)
const captureSequence = ref<number | null>(null)
const receiveSnapshot = (
  _event: unknown,
  value: OverlaySnapshot,
  metadata?: OverlayDispatchMeta
) => {
  snapshotEvents.value++
  snapshotReceived.value = true
  snapshotVersion.value = metadata?.snapshotVersion ?? null
  captureSequence.value = metadata?.captureSequence ?? null
  snapshot.value = value
}
onMounted(async () => {
  mounted = true
  if (!window.electron || role === 'setup') return
  window.electron.ipcRenderer.on('mayhem-snapshot', receiveSnapshot)
  const requestedAt = snapshotEvents.value
  try {
    const initial = await call('snapshot')
    if (mounted && requestedAt === snapshotEvents.value) {
      snapshotReceived.value = true
      snapshot.value = initial
    }
  } catch (cause) {
    if (mounted) error.value = cause instanceof Error ? cause.message : String(cause)
  }
})
onUnmounted(() => {
  mounted = false
  window.electron?.ipcRenderer.removeListener('mayhem-snapshot', receiveSnapshot)
})
</script>

<template>
  <component :is="DebugOverlay" v-if="debug" />
  <Setup v-else-if="role === 'setup'" :call="call" />
  <EquipmentControls
    v-else-if="role === 'controls'"
    :champion-name="snapshot.championName"
    :category="snapshot.category"
    :build-view="snapshot.buildView"
    :adaptation-available="equipmentView.adaptationAvailable"
    :busy="busy"
    :error="error"
    @category="action('category', $event)"
    @build-view="action('buildView', $event)"
    @collapse="action('collapse')"
  />
  <HoldToSuppress
    v-else-if="role === 'equipment-actions'"
    :key="snapshot.sessionKey || ''"
    :disabled="busy"
    :active="
      !!snapshot.sessionKey &&
      (snapshot.shopVisible || !!snapshot.equipmentExpanded) &&
      !snapshot.suppressed
    "
    :error="error"
    @suppress="action('suppress')"
  />
  <button
    v-else-if="role === 'equipment-restore'"
    class="equipment-restore"
    :disabled="busy"
    @click="action('restore')"
  >
    {{ error || '展开装备推荐' }}
  </button>
  <EquipmentPanel v-else-if="role === 'equipment'" :snapshot="snapshot" />
  <AugmentBar
    v-else-if="candidateIndex >= 0"
    :candidate="candidate"
    :background-opacity="snapshot.augmentBackgroundOpacity"
    :data-mayhem-snapshot-received="snapshotReceived"
    :data-mayhem-snapshot-events="snapshotEvents"
    :data-mayhem-cards-visible="snapshot.cardsVisible"
    :data-mayhem-snapshot-version="snapshotVersion"
    :data-mayhem-capture-sequence="captureSequence"
  />
</template>
