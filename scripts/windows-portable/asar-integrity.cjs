const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const asar = require('@electron/asar')
const { NtExecutable, NtExecutableResource } = require('resedit')
const { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses')

const hash = (data) => crypto.createHash('sha256').update(data).digest('hex')
const headerHash = (archive) => hash(asar.getRawHeader(archive).headerString)
const integrityEntries = (resources) =>
  resources.entries.filter((entry) => entry.type === 'INTEGRITY' && entry.id === 'ELECTRONASAR')
const parseRecord = (resources) => {
  const entries = integrityEntries(resources)
  if (entries.length !== 1) throw new Error('Expected exactly one ELECTRONASAR resource')
  const records = JSON.parse(Buffer.from(entries[0].bin).toString('utf8'))
  const matches = records.filter(
    (record) => path.win32.normalize(record.file).toLowerCase() === 'resources\\app.asar'
  )
  if (matches.length !== 1 || matches[0].alg !== 'SHA256')
    throw new Error('Unexpected app.asar integrity record')
  return { entry: entries[0], records, match: matches[0] }
}

async function verifyWindowsAsarIntegrity(executablePath, archivePath) {
  const wire = await getCurrentFuseWire(executablePath)
  if (wire[FuseV1Options.EnableEmbeddedAsarIntegrityValidation] !== 49)
    throw new Error('ASAR integrity validation must remain enabled')
  const executable = NtExecutable.from(fs.readFileSync(executablePath))
  const resources = NtExecutableResource.from(executable)
  const { match } = parseRecord(resources)
  const actual = headerHash(archivePath)
  if (match.value !== actual)
    throw new Error(`ASAR integrity mismatch: embedded=${match.value} actual=${actual}`)
  return {
    enabled: true,
    embeddedHeaderSHA256: match.value,
    actualHeaderSHA256: actual,
    fuseWire: wire
  }
}

async function updateWindowsAsarIntegrity(executablePath, archivePath) {
  const beforeWire = await getCurrentFuseWire(executablePath)
  if (beforeWire[FuseV1Options.EnableEmbeddedAsarIntegrityValidation] !== 49)
    throw new Error('Refusing an executable without ASAR integrity enabled')
  const original = fs.readFileSync(executablePath)
  const executable = NtExecutable.from(original)
  const codeSections = executable
    .getAllSections()
    .filter((section) => section.info.name !== '.rsrc')
    .map((section) => ({
      name: section.info.name,
      hash: hash(Buffer.from(section.data || new ArrayBuffer(0)))
    }))
  const resources = NtExecutableResource.from(executable)
  const otherResources = resources.entries
    .filter((entry) => !(entry.type === 'INTEGRITY' && entry.id === 'ELECTRONASAR'))
    .map((entry) => ({
      type: entry.type,
      id: entry.id,
      lang: entry.lang,
      hash: hash(Buffer.from(entry.bin))
    }))
  const { entry, records, match } = parseRecord(resources)
  const previousHeaderSHA256 = match.value
  match.value = headerHash(archivePath)
  entry.bin = Buffer.from(JSON.stringify(records))
  resources.outputResource(executable)
  fs.writeFileSync(executablePath, Buffer.from(executable.generate()))
  const verified = await verifyWindowsAsarIntegrity(executablePath, archivePath)
  if (JSON.stringify(beforeWire) !== JSON.stringify(verified.fuseWire))
    throw new Error('Fuse settings changed')
  const after = NtExecutable.from(fs.readFileSync(executablePath))
  const afterSections = after.getAllSections()
  for (const section of codeSections) {
    const current = afterSections.find((item) => item.info.name === section.name)
    if (!current || hash(Buffer.from(current.data || new ArrayBuffer(0))) !== section.hash)
      throw new Error(`Executable section drift: ${section.name}`)
  }
  const afterResources = NtExecutableResource.from(after).entries
  for (const entry of otherResources) {
    const current = afterResources.find(
      (item) => item.type === entry.type && item.id === entry.id && item.lang === entry.lang
    )
    if (!current || hash(Buffer.from(current.bin)) !== entry.hash)
      throw new Error('Unrelated executable resource changed')
  }
  return {
    ...verified,
    previousHeaderSHA256,
    previousExecutableSHA256: hash(original),
    executableSHA256: hash(fs.readFileSync(executablePath)),
    unchangedCodeSections: codeSections.length,
    unchangedOtherResources: otherResources.length
  }
}
module.exports = { updateWindowsAsarIntegrity, verifyWindowsAsarIntegrity }
