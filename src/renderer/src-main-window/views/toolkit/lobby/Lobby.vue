<template>
  <div :class="embedded ? 'w-full' : 'h-full w-full'">
    <component
      :is="embedded ? 'div' : NScrollbar"
      :class="{ 'relative h-full max-w-full': !embedded }"
    >
      <div :class="embedded ? 'flex flex-col gap-6' : 'mx-auto flex max-w-200 flex-col gap-6 p-6'">
        <LobbyTool />
        <StrawberryTool />
      </div>
    </component>
  </div>
</template>

<script setup lang="ts">
import { NScrollbar } from 'naive-ui'

import LobbyTool from './LobbyTool.vue'
import StrawberryTool from './StrawberryTool.vue'
defineProps<{ embedded?: boolean }>()
</script>
