// Packaged data only: release notes remain available without a network connection.
export const BUNDLED_RELEASE_NOTES = [
  {
    version: '1.5.2-beta.3',
    date: '2026-10-16',
    groups: [
      { kind: 'added', items: ['automaticPosition', 'offlineReleaseNotes', 'homeQuickSettings'] },
      { kind: 'improved', items: ['noFirstPositionStep', 'validatedGeometryCache'] }
    ]
  },
  {
    version: '1.5.2-beta.2-mini-fix.20261015',
    date: '2026-10-15',
    groups: [{ kind: 'fixed', items: ['retiredMiniWindow'] }]
  }
] as const
