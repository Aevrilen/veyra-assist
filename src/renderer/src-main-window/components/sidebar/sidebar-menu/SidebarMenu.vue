<template>
  <nav
    class="sidebar-menu"
    :class="{ 'rabi-test': currentActiveItem === 'test' }"
    ref="sidebar-menu"
  >
    <template v-for="item of showItems" :key="item.key">
      <div v-if="item.groupLabel" class="menu-group" :aria-hidden="isCollapsed || undefined">
        {{ item.groupLabel }}
      </div>
      <NTooltip placement="right" :disabled="!isCollapsed">
        <template #trigger>
          <button
            type="button"
            class="menu-item"
            :data-key="item.key"
            :disabled="item.isDisabled"
            :aria-label="item.name"
            :aria-current="currentActiveItem === item.key ? 'page' : undefined"
            @click="handleMenuChange(item.key)"
            :class="{ active: currentActiveItem === item.key, disabled: item.isDisabled }"
          >
            <div class="menu-item__inner">
              <NBadge :show="!!item.inProgress" dot :offset="[-6, 8]">
                <component :is="item.icon" class="menu-item__icon" />
              </NBadge>
              <div class="menu-item__label">{{ item.name }}</div>
            </div>
          </button>
        </template>
        <span class="menu-item-popover">{{ item.name }}</span>
      </NTooltip>
    </template>
    <svg class="indicator-rail" aria-hidden="true" focusable="false">
      <motion.path class="indicator-rail__shape" :d="renderedIndicatorPath" />
    </svg>
  </nav>
</template>

<script setup lang="ts">
import { motion } from 'motion-v'
import { NBadge, NTooltip } from 'naive-ui'
import {
  Component as ComponentC,
  computed,
  onMounted,
  useTemplateRef,
  watch,
  watchEffect
} from 'vue'

import { useSidebarIndicatorMotion } from './use-sidebar-indicator-motion'

const {
  defaultValue,
  items = [],
  isCollapsed = false
} = defineProps<{
  defaultValue?: string
  isCollapsed?: boolean
  items?: {
    key: string
    icon: ComponentC
    name: string
    groupLabel?: string
    show?: boolean
    inProgress?: boolean
    isDisabled?: boolean
  }[]
}>()

const showItems = computed(() => items.filter((item) => item.show !== false))
const currentActiveItem = defineModel<string>('current')

watchEffect(() => {
  currentActiveItem.value = defaultValue
})

const sidebarMenu = useTemplateRef('sidebar-menu')
const { renderedIndicatorPath, setIndicatorTarget } = useSidebarIndicatorMotion()

const updateIndicatorTarget = (key?: string) => {
  if (!sidebarMenu.value) {
    return
  }

  const activeItem = key
    ? Array.from(sidebarMenu.value.querySelectorAll<HTMLElement>('.menu-item')).find(
        (item) => item.dataset.key === key
      )
    : sidebarMenu.value.querySelector<HTMLElement>('.menu-item.active')

  if (activeItem) {
    const { top: itemTop, height } = activeItem.getBoundingClientRect()
    const { top: sidebarTop } = sidebarMenu.value.getBoundingClientRect()

    const thatHeight = 0.5 * height
    setIndicatorTarget(itemTop - sidebarTop + (height - thatHeight) / 2, thatHeight)
  }
}

const handleMenuChange = (key: string) => {
  updateIndicatorTarget(key)
  currentActiveItem.value = key
}

onMounted(updateIndicatorTarget)

watch([() => currentActiveItem.value, showItems], () => updateIndicatorTarget(), {
  flush: 'post'
})
</script>

<style scoped>
.sidebar-menu {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.indicator-rail {
  position: absolute;
  top: 0;
  left: calc(var(--la-sidebar-icon-horizontal-padding) - 2px);
  width: 8px;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
.indicator-rail__shape {
  fill: var(--la-color-link);
  transition: fill 0.2s;
}
.rabi-test .indicator-rail__shape {
  fill: #f94395;
}
.menu-group {
  padding: 16px 22px 6px;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.08em;
  color: var(--la-workspace-muted);

  .collapsed & {
    height: 18px;
    padding: 0;
    overflow: hidden;
    color: transparent;
  }
}
.menu-item {
  width: 100%;
  position: relative;
  padding: 0 var(--la-sidebar-icon-horizontal-padding);
  box-sizing: border-box;
  cursor: pointer;
  border: 0;
  margin: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  appearance: none;

  &:focus-visible {
    outline: 2px solid var(--la-color-link);
    outline-offset: -3px;
    border-radius: 8px;
  }
  &.disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  &:hover:not(.disabled) .menu-item__inner {
    background-color: var(--la-workspace-accent-soft);
  }
  &:hover:not(.disabled) .menu-item__icon,
  &:hover:not(.disabled) .menu-item__label {
    color: var(--la-color-text-primary);
  }
  &.active .menu-item__inner {
    background-color: var(--la-workspace-accent-soft);
  }
  &.active .menu-item__icon,
  &.active .menu-item__label,
  &:active:not(.disabled) .menu-item__icon,
  &:active:not(.disabled) .menu-item__label {
    color: var(--la-color-link);
  }
}
.menu-item__inner {
  display: flex;
  gap: 8px;
  width: 100%;
  position: relative;
  align-items: center;
  border-radius: 7px;
  transition: background-color 0.2s;
  box-sizing: border-box;
}
.menu-item__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--la-sidebar-icon-height);
  width: calc(var(--la-sidebar-width-collapsed) - var(--la-sidebar-icon-horizontal-padding) * 2);
  font-size: 16px;
  flex-shrink: 0;
  color: var(--la-workspace-muted);
  transition: color 0.2s;

  .collapsed & {
    font-size: 20px;
  }
}
.menu-item__label {
  font-size: 13px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  color: var(--la-workspace-muted);
  transition:
    color 0.2s,
    opacity 0.2s;

  .collapsed & {
    opacity: 0;
  }
}
.menu-item-popover {
  font-weight: 500;
  font-size: 13px;
}
</style>
