/** Internal barrier, never serialized or sent through renderer IPC. */
export const LOG_FLUSH = Symbol('veyra-log-flush')
export type LogFlushBarrier = (error?: Error) => void
