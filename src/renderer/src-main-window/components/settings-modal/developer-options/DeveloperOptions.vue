<template>
  <NModal
    v-model:show="show"
    preset="card"
    class="developer-options"
    :title="t('veyraSettings.developer')"
    @after-enter="handleEntered"
  >
    <p class="developer-description">{{ t('veyraSettings.developerDescription') }}</p>
    <NCollapse v-model:expanded-names="expanded" :accordion="false">
      <NCollapseItem
        v-for="group in DEVELOPER_GROUPS"
        :key="group"
        :name="group"
        :title="t(`veyraSettings.groups.${group}`)"
      >
        <template v-if="show && expanded.includes(group)">
          <DeveloperConnection v-if="group === 'connection'" />
          <DebugSettings v-else-if="group === 'debug'" embedded />
          <DeveloperOngoing v-else-if="group === 'position' || group === 'data'" :group="group" />
          <Client v-else embedded advanced />
        </template>
      </NCollapseItem>
    </NCollapse>
  </NModal>
</template>
<script setup lang="ts">
import Client from '@main-window/views/toolkit/client/Client.vue'
import { useAkariNavigationStep } from '@renderer-shared/shards/akari-navigation'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import { useTranslation } from 'i18next-vue'
import { NCollapse, NCollapseItem, NModal } from 'naive-ui'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import DebugSettings from '../DebugSettings.vue'
import DeveloperConnection from './DeveloperConnection.vue'
import DeveloperOngoing from './DeveloperOngoing.vue'
import {
  DEVELOPER_GROUPS,
  DEVELOPER_OPTIONS_NAVIGATION_STEP_KEY,
  getDeveloperGroup,
  type DeveloperGroup
} from './navigation'
const { t } = useTranslation()
const common = useAppCommonStore()
const show = defineModel<boolean>('show', { default: false })
const expanded = ref<DeveloperGroup[]>([])
const entered = ref(false)
let finishEnter: (() => void) | undefined
function handleEntered() {
  entered.value = true
  finishEnter?.()
}
watch(show, (visible) => {
  if (!visible) {
    entered.value = false
    expanded.value = []
    finishEnter?.()
  }
})
onBeforeUnmount(() => finishEnter?.())
useAkariNavigationStep<string>({
  key: DEVELOPER_OPTIONS_NAVIGATION_STEP_KEY,
  activate: async (targetId, { signal }) => {
    if (targetId.startsWith('app.lcu-connection.') && !common.isWindows) {
      show.value = false
      return { status: 'unavailable', reason: 'windows-only-setting' }
    }
    const group = getDeveloperGroup(targetId)!
    show.value = true
    expanded.value = [group]
    await nextTick()
    if (!entered.value && !signal.aborted)
      await new Promise<void>((resolve) => {
        const finish = () => {
          finishEnter = undefined
          signal.removeEventListener('abort', finish)
          resolve()
        }
        finishEnter = finish
        signal.addEventListener('abort', finish, { once: true })
      })
    await nextTick()
    return undefined
  }
})
</script>
<style>
.developer-options.n-card {
  width: min(1000px, calc(100vw - 48px));
  max-height: 84vh;
  overflow: auto;
}
</style>
<style scoped>
.developer-description {
  margin: 0 0 20px;
  color: var(--la-workspace-muted);
  font-size: 13px;
  line-height: 1.7;
}
</style>
