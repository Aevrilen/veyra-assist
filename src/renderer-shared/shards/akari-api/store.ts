import type { AkariFeatureGateSnapshot } from '@shared/shards/akari-api'
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

export const useAkariApiStore = defineStore('shard:akari-api-renderer', () => {
  const featureGates = shallowRef<AkariFeatureGateSnapshot | null>(null)

  return {
    featureGates
  }
})
