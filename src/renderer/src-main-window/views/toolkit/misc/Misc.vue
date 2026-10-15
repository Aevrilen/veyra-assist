<template>
  <div :class="embedded ? 'w-full' : 'h-full w-full'">
    <component
      :is="embedded ? 'div' : NScrollbar"
      :class="{ 'relative h-full max-w-full': !embedded }"
    >
      <div :class="embedded ? 'flex flex-col gap-6' : 'mx-auto flex max-w-200 flex-col gap-6 p-6'">
        <SummonerProfile />
        <ChatAvailability />
        <FakeRanked />
        <ChatStatusMessage />
        <GameView />
      </div>
    </component>
  </div>
</template>

<script setup lang="ts">
import { NScrollbar } from 'naive-ui'

import ChatAvailability from './ChatAvailability.vue'
import ChatStatusMessage from './ChatStatusMessage.vue'
import FakeRanked from './FakeRanked.vue'
import GameView from './GameView.vue'
import SummonerProfile from './SummonerProfile.vue'
defineProps<{ embedded?: boolean }>()
</script>
