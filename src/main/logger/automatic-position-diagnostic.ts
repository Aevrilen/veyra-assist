import {
  type AutomaticPositionDiagnosticRecord,
  sanitizeAutomaticPositionDiagnostic
} from '@shared/champ-select-overlay/automatic-position/diagnostics'

export const AUTOMATIC_POSITION_CATEGORY = 'automatic-position'
export const AUTOMATIC_POSITION_LOG_PREFIX = 'AUTO_POSITION'
export const AUTOMATIC_POSITION_MARKER = '[automatic-position] '
export const AUTOMATIC_POSITION_NAMESPACE = 'champ-select-overlay-main'
const RANDOM_ATTEMPT_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

/** Defense in depth: no free-form fields, exception text, image or source identities. */
export function sanitizeAutomaticPositionRecord(
  value: unknown
): AutomaticPositionDiagnosticRecord | null {
  try {
    const safe = sanitizeAutomaticPositionDiagnostic(value)
    if (!safe || !value || typeof value !== 'object') return null
    const input = value as AutomaticPositionDiagnosticRecord
    const { attemptId, firstAt, lastAt, repeatCount } = input
    if (
      typeof attemptId !== 'string' ||
      !RANDOM_ATTEMPT_ID.test(attemptId) ||
      !Number.isSafeInteger(firstAt) ||
      firstAt < 0 ||
      !Number.isSafeInteger(lastAt) ||
      lastAt < firstAt ||
      lastAt > 8640000000000000 ||
      !Number.isSafeInteger(repeatCount) ||
      repeatCount < 1
    )
      return null
    return {
      ...safe,
      attemptId: attemptId.toLowerCase(),
      firstAt,
      lastAt,
      repeatCount
    }
  } catch {
    return null
  }
}
