import 'reflect-metadata'

import { app } from 'electron'
import path from 'node:path'

import { bootstrap } from './bootstrap'
import { configurePortableRuntime } from './portable'
import { runPortablePackageCheck } from './portable-check'

configurePortableRuntime()

// Keep this local test build's database and single-instance lock apart from the installed app.
if (process.argv.includes('--mayhem-test') && !process.argv.includes('--akari-portable')) {
  app.setPath('userData', path.join(app.getPath('appData'), 'LeagueAkari-Mayhem-Test'))
}

if (process.platform === 'win32') {
  app.setAppUserModelId('sugar.cocoa.league-akari')
}

const gotTheLock = app.requestSingleInstanceLock()

if (gotTheLock) {
  if (process.argv.includes('--akari-package-check')) void runPortablePackageCheck()
  else bootstrap()
} else {
  app.quit()
}
