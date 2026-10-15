import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { promisify } from 'node:util'
import { crc32, deflateRaw } from 'node:zlib'

const compress = promisify(deflateRaw)

/** Small bounded ZIP, UTF-8 names, deflate, no ZIP64 or external executable. */
export async function writeFeedbackZip(
  destination: string,
  entries: Array<{ name: string; data: Buffer }>
) {
  const temporary = `${destination}.${randomUUID()}.tmp`
  const file = await fs.open(temporary, 'wx')
  let closed = false
  try {
    const directory: Buffer[] = []
    let offset = 0
    const now = new Date()
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
    for (const entry of entries) {
      const name = Buffer.from(entry.name, 'utf8')
      const data = await compress(entry.data)
      const checksum = crc32(entry.data)
      const local = Buffer.alloc(30)
      local.writeUInt32LE(0x04034b50, 0)
      local.writeUInt16LE(20, 4)
      local.writeUInt16LE(0x800, 6)
      local.writeUInt16LE(8, 8)
      local.writeUInt16LE(time, 10)
      local.writeUInt16LE(date, 12)
      local.writeUInt32LE(checksum, 14)
      local.writeUInt32LE(data.length, 18)
      local.writeUInt32LE(entry.data.length, 22)
      local.writeUInt16LE(name.length, 26)
      await file.writeFile(local)
      await file.writeFile(name)
      await file.writeFile(data)
      const central = Buffer.alloc(46)
      central.writeUInt32LE(0x02014b50, 0)
      central.writeUInt16LE(20, 4)
      central.writeUInt16LE(20, 6)
      central.writeUInt16LE(0x800, 8)
      central.writeUInt16LE(8, 10)
      central.writeUInt16LE(time, 12)
      central.writeUInt16LE(date, 14)
      central.writeUInt32LE(checksum, 16)
      central.writeUInt32LE(data.length, 20)
      central.writeUInt32LE(entry.data.length, 24)
      central.writeUInt16LE(name.length, 28)
      central.writeUInt32LE(offset, 42)
      directory.push(central, name)
      offset += local.length + name.length + data.length
    }
    const centralBytes = Buffer.concat(directory)
    await file.writeFile(centralBytes)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(entries.length, 8)
    end.writeUInt16LE(entries.length, 10)
    end.writeUInt32LE(centralBytes.length, 12)
    end.writeUInt32LE(offset, 16)
    await file.writeFile(end)
    await file.close()
    closed = true
    await fs.rename(temporary, destination)
  } finally {
    if (!closed) await file.close()
    await fs.rm(temporary, { force: true })
  }
}
