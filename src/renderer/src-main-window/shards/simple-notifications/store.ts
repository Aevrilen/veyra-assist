import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSimpleNotificationsStore = defineStore(
  'shard:simple-notifications-renderer',
  () => {
    // need globally shared
    const showDeclarationModal = ref(false)

    return {
      showDeclarationModal
    }
  }
)
