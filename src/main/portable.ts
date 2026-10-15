import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

// A portable distribution owns a persistent profile outside its replaceable program folder.
export function configurePortableRuntime() {
  const metadataPath = path.join(process.resourcesPath, 'portable-build.json')
  const portable =
    process.argv.includes('--akari-portable') || (app.isPackaged && fs.existsSync(metadataPath))
  if (!portable) return
  if (app.isPackaged && fs.existsSync(metadataPath)) {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
    if (metadata.displayName) app.setName(metadata.displayName)
  }

  if (!process.argv.includes('--akari-portable')) process.argv.push('--akari-portable')
  const userData = process.env.AKARI_PORTABLE_USER_DATA
    ? path.resolve(process.env.AKARI_PORTABLE_USER_DATA)
    : path.join(app.getPath('appData'), 'LeagueAkari-Portable')
  fs.mkdirSync(userData, { recursive: true })
  app.setPath('userData', userData)
  app.setPath('logs', path.join(userData, 'logs'))
  process.env.AKARI_MAYHEM_OCR_BACKEND ||= 'rapidocr'
}
