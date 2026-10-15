<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ id: number | null; name: string; source?: string | null }>()
const failedSource = ref<string | null>(null)
watch(
  () => props.source,
  () => {
    failedSource.value = null
  }
)
function imageError(event: Event) {
  const failed = (event.currentTarget as HTMLImageElement).getAttribute('src')
  if (failed === props.source) failedSource.value = failed
}
</script>

<template>
  <img
    v-if="source && failedSource !== source"
    :key="source"
    :src="source"
    :alt="name"
    draggable="false"
    @error="imageError"
  />
  <span v-else class="icon-placeholder" :aria-label="`${name}，图标暂不可用`">{{ id ?? '?' }}</span>
</template>
