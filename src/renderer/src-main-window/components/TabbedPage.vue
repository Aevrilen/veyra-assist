<template>
  <div class="tabbed-page">
    <header class="page-heading">
      <div class="page-title">
        <NIcon :component="icon" />
        <h1>{{ title }}</h1>
      </div>
      <div v-if="$slots.actions" class="page-actions"><slot name="actions" /></div>
    </header>
    <div class="page-tabs">
      <NTabs
        :value="currentTab"
        :theme-overrides="{ tabGapMediumBar: '18px' }"
        size="medium"
        @update:value="handleUserTabChange"
      >
        <NTab v-for="tab in tabs" :key="tab.key" :name="tab.key" :tab="tab.name">
          <div class="flex items-center gap-1">
            <NIcon class="text-base" :component="tab.icon" />
            <span class="font-bold">{{ tab.name }}</span>
          </div>
        </NTab>
      </NTabs>
    </div>
    <div class="page-content">
      <Transition :name="transitionType" :css="!transitionsDisabled">
        <KeepAlive>
          <component :is="currentTabComponent" :key="currentTab" />
        </KeepAlive>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAkariNavigationStep } from '@renderer-shared/shards/akari-navigation'
import { NIcon, NTab, NTabs } from 'naive-ui'
import {
  Component as ComponentC,
  FunctionalComponent,
  computed,
  nextTick,
  onActivated,
  ref,
  watch
} from 'vue'
import { NavigationFailureType, isNavigationFailure, useRoute, useRouter } from 'vue-router'

import { createMainPageNavigationStepKey } from '@main-window/navigation-steps'

export interface TabConfig {
  key: string
  name: string
  icon: ComponentC | FunctionalComponent
  component: ComponentC
}

const props = defineProps<{
  icon: ComponentC | FunctionalComponent
  title: string
  tabs: TabConfig[]
  disableTransition?: boolean

  /**
   * 暂时强制要求路由必须提供 route name
   */
  routeName: string
  defaultTab?: string
  tabAliases?: Record<string, string>
}>()

const currentTab = ref(props.defaultTab ?? props.tabs[0]?.key ?? '')
const navigationTransitionDisabled = ref(false)
const transitionsDisabled = computed(
  () => Boolean(props.disableTransition) || navigationTransitionDisabled.value
)

const currentTabComponent = computed(() => {
  const tab = props.tabs.find((t) => t.key === currentTab.value)
  return tab?.component
})

const transitionType = ref<'move-from-right-fade' | 'move-from-left-fade'>('move-from-left-fade')
watch(
  () => currentTab.value,
  (cur, prev) => {
    if (transitionsDisabled.value) {
      return
    }

    if (!prev) {
      transitionType.value = 'move-from-right-fade'
      return
    }

    const curIndex = props.tabs.findIndex((tab) => tab.key === cur)
    const prevIndex = props.tabs.findIndex((tab) => tab.key === prev)

    if (curIndex > prevIndex) {
      transitionType.value = 'move-from-right-fade'
    } else {
      transitionType.value = 'move-from-left-fade'
    }
  },
  { immediate: true }
)

const route = useRoute()
const router = useRouter()
let navigationActivationSequence = 0

type TabActivationSource = 'user' | 'route' | 'navigation'

const isKnownTab = (value: string) => props.tabs.some((tab) => tab.key === value)

const activateTab = async (value: string, source: TabActivationSource, signal?: AbortSignal) => {
  value = props.tabAliases?.[value] ?? value
  if (!isKnownTab(value) || signal?.aborted) return false
  const tabChanged = currentTab.value !== value
  const sequence = tabChanged && source !== 'user' ? ++navigationActivationSequence : null
  if (sequence !== null) navigationTransitionDisabled.value = true
  try {
    if (source !== 'route' && (route.name !== props.routeName || route.params.section !== value)) {
      const failure = await router.replace({ name: props.routeName, params: { section: value } })
      if (
        isNavigationFailure(
          failure,
          NavigationFailureType.aborted | NavigationFailureType.cancelled
        ) ||
        signal?.aborted
      )
        return false
    }
    currentTab.value = value
    await nextTick()
    return true
  } finally {
    if (sequence !== null && sequence === navigationActivationSequence) {
      navigationTransitionDisabled.value = false
      await nextTick()
    }
  }
}

const handleUserTabChange = (value: string) => {
  void activateTab(value, 'user')
}

useAkariNavigationStep<string>({
  key: createMainPageNavigationStepKey(props.routeName),
  activate: async (payload, { signal }) => {
    const activated = await activateTab(payload, 'navigation', signal)
    if (!activated) {
      return { status: 'unavailable', reason: 'unknown-page-tab' }
    }
    return undefined
  }
})

onActivated(() => {
  const section = route.params.section
  if (route.name === props.routeName && typeof section === 'string' && isKnownTab(section)) {
    void activateTab(section, 'route')
    return
  }

  void activateTab(currentTab.value, 'navigation')
})

// route to section
watch(
  [() => route.name, () => route.params.section],
  ([name, section]) => {
    if (name !== props.routeName || typeof section !== 'string') {
      return
    }

    void activateTab(section, 'route')
  },
  { immediate: true }
)
</script>

<style scoped>
.tabbed-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.page-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 24px;
  padding: 24px 24px 16px;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--la-color-text-primary);

  .n-icon {
    font-size: 22px;
  }
  h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
    line-height: 1.3;
  }
}

.page-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

.page-tabs {
  min-width: 0;
  padding: 0 24px;
  background: var(--la-workspace-panel);
  border-bottom: 1px solid var(--la-workspace-border);
}

.page-content {
  position: relative;
  flex: 1;
  height: 0;
  min-width: 0;
  min-height: 0;
}

.move-from-left-fade-enter-active {
  position: relative;
  transition:
    opacity 0.3s ease,
    right 0.3s cubic-bezier(0.19, 1, 0.22, 1);
}

.move-from-left-fade-leave-active {
  position: absolute;
  transition:
    opacity 0.3s ease,
    right 0.3s cubic-bezier(0.19, 1, 0.22, 1);
}

.move-from-left-fade-enter-from {
  right: 24px;
  opacity: 0;
}

.move-from-left-fade-leave-to {
  right: -24px;
  opacity: 0;
}

.move-from-left-fade-enter-to,
.move-from-left-fade-leave-from {
  right: 0;
  opacity: 1;
}

.move-from-right-fade-enter-active {
  position: relative;
  transition:
    opacity 0.3s ease,
    left 0.3s cubic-bezier(0.19, 1, 0.22, 1);
}

.move-from-right-fade-leave-active {
  position: absolute;
  transition:
    opacity 0.3s ease,
    left 0.3s cubic-bezier(0.19, 1, 0.22, 1);
}

.move-from-right-fade-enter-from {
  left: 24px;
  opacity: 0;
}

.move-from-right-fade-leave-to {
  left: -24px;
  opacity: 0;
}

.move-from-right-fade-enter-to,
.move-from-right-fade-leave-from {
  left: 0;
  opacity: 1;
}
</style>
