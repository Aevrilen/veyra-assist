import dayjs from 'dayjs'
import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { type Logform, transports } from 'winston'
import Transport from 'winston-transport'

export function dailyLogFilename(timestamp?: string) {
  return `LA_${dayjs(timestamp).format('YYYYMMDD')}.log`
}

/** Route each local day to Winston's existing append/size-rotation transport. */
export class DailyFileTransport extends Transport {
  private _day = ''
  private _file: InstanceType<typeof transports.File> | null = null
  private _size = 0

  constructor(
    private readonly _directory: string,
    options: Transport.TransportStreamOptions,
    private readonly _maxsize = 128 * 1024 * 1024
  ) {
    super(options)
  }

  // The base transport batches log callbacks concurrently. Serialize them so a
  // date change or shutdown cannot end a File while it is opening/rotating.
  _writev(
    chunks: Array<{ chunk: Logform.TransformableInfo; encoding: BufferEncoding }>,
    callback: (error?: Error | null) => void
  ) {
    let index = 0
    const next = (error?: Error | null) => {
      if (error || index === chunks.length) return callback(error)
      const entry = chunks[index++]
      this._write(entry.chunk, entry.encoding, next)
    }
    next()
  }

  async log(info: Logform.TransformableInfo, callback: (error?: Error) => void) {
    try {
      const day = dailyLogFilename(info.timestamp as string)
      if (day !== this._day) {
        await this._finishFile()
        this._day = day
        this._file = new transports.File({
          dirname: this._directory,
          filename: day,
          maxsize: this._maxsize,
          options: { flags: 'a' }
        })
        this._file.on('error', (error) => this.emit('error', error))
        await once(this._file, 'open')
        this._size = fs.statSync(path.join(this._directory, this._file.filename)).size
      }
      const file = this._file!
      const bytes = Buffer.byteLength(`${info[Symbol.for('message')]}${os.EOL}`)
      // Winston emits logged before it initiates size rotation. Await the next
      // public open event when this record crosses the existing maxsize limit.
      const rotated = this._size + bytes >= this._maxsize ? once(file, 'open') : null
      const logged = once(file, 'logged')
      file.write(info)
      await logged
      this._size += bytes
      if (rotated) {
        await rotated
        this._size = fs.statSync(path.join(this._directory, file.filename)).size
      }
      this.emit('logged', info)
      callback()
    } catch (error) {
      callback(error as Error)
    }
  }

  private async _finishFile() {
    if (!this._file) return
    const file = this._file
    const finished = once(file, 'finish')
    file.end()
    await finished
    file.close?.()
    this._file = null
  }

  _final(callback: (error?: Error | null) => void) {
    this._finishFile().then(() => callback(), callback)
  }
}
