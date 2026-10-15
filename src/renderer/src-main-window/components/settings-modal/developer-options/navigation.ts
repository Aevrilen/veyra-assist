export const DEVELOPER_OPTIONS_NAVIGATION_STEP_KEY = 'settings-developer-options'
export const DEVELOPER_GROUPS = ['connection', 'debug', 'position', 'data', 'advanced'] as const
export type DeveloperGroup = (typeof DEVELOPER_GROUPS)[number]

export function getDeveloperGroup(targetId: string): DeveloperGroup | undefined {
  if (
    targetId === 'app.lcu-connection.use-wmi' ||
    targetId === 'app.lcu-connection.rebuild-wmi' ||
    targetId === 'app.misc.log-level'
  )
    return 'connection'
  if (targetId.startsWith('debug.') && targetId !== 'debug.files.logs') return 'debug'
  if (
    ['candidate-origin', 'candidate-step', 'teammate-origin', 'teammate-step'].some(
      (key) => targetId === `ongoing-game.champ-select-overlay.${key}`
    )
  )
    return 'position'
  if (
    [
      'concurrency',
      'match-history-load-count',
      'game-details-load-count',
      'premade-threshold'
    ].some((key) => targetId === `ongoing-game.${key}`)
  )
    return 'data'
  if (
    targetId.startsWith('toolkit.client.game-client.terminate-') ||
    targetId.startsWith('toolkit.client.league-client-ux')
  )
    return 'advanced'
  return undefined
}
