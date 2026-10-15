// Test-only stand-in for app dependencies intentionally absent from the source supplement.
export const Shard =
  () =>
  (target: unknown): any =>
    target
export class SharedGlobalShard {
  global: any
}
export interface IAkariShardInitDispose {
  onInit?(): void | Promise<void>
  onDispose?(): void | Promise<void>
}
