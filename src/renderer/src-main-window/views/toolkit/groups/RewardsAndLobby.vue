<template>
  <div class="toolkit-group-page">
    <NScrollbar class="h-full">
      <div class="toolkit-group">
        <Lobby embedded />
        <ClaimTools embedded />
        <InProcess embedded />
        <LootTools v-if="isDevelopment" embedded />
      </div>
    </NScrollbar>
  </div>
</template>
<script setup lang="ts">
import { NScrollbar } from 'naive-ui'
import ClaimTools from '../claim-tools/ClaimTools.vue'
import InProcess from '../in-process/InProcess.vue'
import Lobby from '../lobby/Lobby.vue'
import LootTools from '../loot-tools/LootTools.vue'
const isDevelopment = import.meta.env.DEV
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
