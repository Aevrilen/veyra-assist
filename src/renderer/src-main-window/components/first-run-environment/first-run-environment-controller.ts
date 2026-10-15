import type { FirstRunEnvironmentStatus } from '@shared/types/first-run-environment'
import { onMounted, onScopeDispose, ref, shallowRef } from 'vue'

export function useFirstRunEnvironmentStatus(readStatus: () => Promise<FirstRunEnvironmentStatus>) {
  const status = shallowRef<FirstRunEnvironmentStatus | null>(null)
  const loading = ref(false)
  const hasLoadError = ref(false)
  let disposed = false
  let inFlight: Promise<void> | null = null

  const refresh = (): Promise<void> => {
    if (disposed) return Promise.resolve()
    if (inFlight) return inFlight
    loading.value = true
    hasLoadError.value = false
    inFlight = Promise.resolve()
      .then(readStatus)
      .then((result) => {
        if (!disposed) status.value = result
      })
      .catch(() => {
        if (!disposed) {
          status.value = null
          hasLoadError.value = true
        }
      })
      .finally(() => {
        if (!disposed) loading.value = false
        inFlight = null
      })
    return inFlight
  }

  onMounted(() => void refresh())
  onScopeDispose(() => {
    disposed = true
  })
  return { status, loading, hasLoadError, refresh }
}
