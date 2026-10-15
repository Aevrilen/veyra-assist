<template>
  <div class="toolkit-group-page">
    <NScrollbar class="h-full">
      <div class="toolkit-group">
        <FriendTools embedded />
        <Misc embedded />
      </div>
    </NScrollbar>
  </div>
</template>
<script setup lang="ts">
import { NScrollbar } from 'naive-ui'
import FriendTools from '../friend-tools/FriendTools.vue'
import Misc from '../misc/Misc.vue'
</script>
<style scoped>
.toolkit-group-page {
  height: 100%;
  min-width: 0;
  min-height: 0;
}
.toolkit-group {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 1000px;
  margin: 0 auto;
  padding: 24px;
}
</style>
