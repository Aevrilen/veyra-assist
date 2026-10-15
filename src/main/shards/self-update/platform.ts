export function shouldRunSelfUpdateLifecycle(
  _platform: NodeJS.Platform = process.platform,
  _arch: string = process.arch,
  _portable: boolean = process.argv.includes('--akari-portable')
) {
  // Veyra has no update feed or verified installer. Never apply upstream Akari releases.
  return false
}

export function shouldDownloadUpdateArchive(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
) {
  return shouldRunSelfUpdateLifecycle(platform, arch)
}

export function shouldApplyDownloadedUpdate(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
) {
  return shouldRunSelfUpdateLifecycle(platform, arch)
}

export function shouldLaunchUpdaterOnQuit(
  isPackaged: boolean,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
) {
  return isPackaged && shouldApplyDownloadedUpdate(platform, arch)
}

export function shouldUninstallWithUpdater(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
) {
  return shouldRunSelfUpdateLifecycle(platform, arch)
}
