<template>
  <div :class="embedded ? 'w-full' : 'h-full w-full'">
    <component
      :is="embedded ? 'div' : NScrollbar"
      :class="{ 'relative h-full max-w-full': !embedded }"
    >
      <div :class="embedded ? 'flex flex-col gap-6' : 'mx-auto flex max-w-200 flex-col gap-6 p-6'">
        <RewardClaimTool />
        <MissionClaimTool />
        <!-- 和 Rewards 里面重叠, 因此只需要一个就行了 -->
        <EventHubClaimTool />
      </div>
    </component>
  </div>
</template>

<script setup lang="ts">
import { NScrollbar } from 'naive-ui'

import EventHubClaimTool from './EventHubClaimTool.vue'
import MissionClaimTool from './MissionClaimTool.vue'
import RewardClaimTool from './RewardClaimTool.vue'
defineProps<{ embedded?: boolean }>()
</script>
