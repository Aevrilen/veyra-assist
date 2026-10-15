<script setup lang="ts">
import {
  EQUIPMENT_CONTROLS_HEIGHT,
  type Category,
  type EquipmentBuildView
} from '@shared/mayhem-assistant/model'

defineProps<{
  championName: string
  category: Category
  buildView?: EquipmentBuildView
  adaptationAvailable?: boolean
  busy?: boolean
  error?: string
}>()
defineEmits<{
  category: [category: Category]
  buildView: [view: EquipmentBuildView]
  collapse: []
}>()
const categories: Array<{ id: Category; name: string }> = [
  { id: 'items', name: '热门装备' },
  { id: 'shoes', name: '鞋子' },
  { id: 'core', name: '核心组合' },
  { id: 'starting', name: '出门装' }
]
</script>

<template>
  <header class="equipment-controls" :style="{ height: EQUIPMENT_CONTROLS_HEIGHT + 'px' }">
    <div class="equipment-title">
      <button
        class="equipment-collapse"
        :disabled="busy"
        aria-label="暂时收起装备推荐"
        title="暂时收起；点击原位置的展开按钮恢复当前内容"
        @click="$emit('collapse')"
      >
        −
      </button>
      <strong>{{ championName }} · 装备推荐</strong>
    </div>
    <span v-if="error" class="controls-error" role="alert">{{ error }}</span>
    <nav class="equipment-tabs" aria-label="装备分类">
      <button
        v-for="tab in categories"
        :key="tab.id"
        :class="{ active: category === tab.id && (tab.id !== 'items' || buildView !== 'augment') }"
        :aria-current="
          category === tab.id && (tab.id !== 'items' || buildView !== 'augment')
            ? 'page'
            : undefined
        "
        :disabled="busy"
        @click="$emit('category', tab.id)"
      >
        {{ tab.name }}
      </button>
      <button
        v-if="adaptationAvailable"
        :class="{ active: category === 'items' && buildView === 'augment' }"
        :aria-current="category === 'items' && buildView === 'augment' ? 'page' : undefined"
        :disabled="busy"
        @click="$emit('buildView', 'augment')"
      >
        海克斯适配
      </button>
    </nav>
  </header>
</template>
