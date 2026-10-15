import dayjs from 'dayjs'
import { once } from 'node:events'
import fs from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { type Logform, transports } from 'winston'
import Transport from 'winston-transport'

import { LOG_FLUSH, type LogFlushBarrier } from './log-flush'

export function dailyLogFilename(timestamp?: string, prefix = 'LA') {
  return `${prefix}_${dayjs(timestamp).format('YYYYMMDD')}.log`
}

/** Route each local day to Winston's existing append/size-rotation transport. */
export class DailyFileTransport extends Transport {
  private _day = ''
  private _file: InstanceType<typeof transports.File> | null = null
  private _size = 0
  private _failed = false
  private _optionalFile: FileHandle | null = null
  private _optionalVolume = 0

  constructor(
    private readonly _directory: string,
    options: Transport.TransportStreamOptions,
    private readonly _maxsize = 128 * 1024 * 1024,
    private readonly _prefix = 'LA',
    private readonly _onOptionalFailure?: () => void
  ) {
    super(options)
    if (!/^[A-Z][A-Z_]*$/.test(_prefix)) throw new Error('Invalid log category')
  }

  // The base transport batches log callbacks concurrently. Serialize them so a
  // date change or shutdown cannot end a File while it is opening/rotating.
  _writev(
    chunks: Array<{
      chunk: Logform.TransformableInfo
      encoding: BufferEncoding
    }>,
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
    const barrier = info[LOG_FLUSH] as LogFlushBarrier | undefined
    try {
      if (this._failed) {
        barrier?.(new Error('Optional diagnostic log unavailable'))
        callback()
        return
      }
      if (barrier) {
        await this._finishFile()
        this._day = ''
        barrier()
        callback()
        return
      }
      if (this._onOptionalFailure) {
        await this._appendOptional(info)
        this.emit('logged', info)
        callback()
        return
      }
      const day = dailyLogFilename(info.timestamp as string, this._prefix)
      if (day !== this._day) {
        await this._finishFile()
        this._day = day
        this._file = new transports.File({
          dirname: this._directory,
          filename: day,
          maxsize: this._maxsize,
          options: { flags: 'a' }
        })
        this._file.on('error', (error) => {
          if (this._onOptionalFailure) this._markOptionalFailure()
          else this.emit('error', error)
        })
        await once(this._file, 'open')
        this._size = fs.statSync(path.join(this._directory, this._file.filename)).size
      }
      const file = this._file!
      const bytes = Buffer.byteLength(`${info[Symbol.for('message')]}${os.EOL}`)
      // Winston emits logged before it initiates size rotation. Await the next
      // public open event when this record crosses the existing maxsize limit.
      const rotated = this._size + bytes >= this._maxsize ? once(file, 'open') : null
      // Rotation can fail before the logged promise settles. Attach a handler
      // immediately; awaiting below still surfaces the error.
      void rotated?.catch(() => {})
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
      if (this._onOptionalFailure) {
        this._markOptionalFailure()
        this._file?.close?.()
        this._file = null
        await this._optionalFile?.close().catch(() => {})
        this._optionalFile = null
        barrier?.(new Error('Optional diagnostic log unavailable'))
        callback()
      } else {
        barrier?.(error as Error)
        callback(error as Error)
      }
    }
  }

  // Winston File suppresses some underlying fs.WriteStream errors. The optional
  // evidence channel uses awaited Node file operations so failure cannot hang a
  // feedback flush or escape through an unhandled logger error. Daily naming,
  // serialization and append-only volume policy remain in this transport.
  private async _appendOptional(info: Logform.TransformableInfo) {
    const day = dailyLogFilename(info.timestamp as string, this._prefix)
    if (day !== this._day) {
      await this._finishFile()
      this._day = day
      this._optionalVolume = 0
      const stem = day.slice(0, -4)
      for (const name of await fs.promises.readdir(this._directory)) {
        if (!name.startsWith(stem) || !name.endsWith('.log')) continue
        const suffix = name.slice(stem.length, -4)
        if (/^\d*$/.test(suffix))
          this._optionalVolume = Math.max(this._optionalVolume, Number(suffix || 0))
      }
    }
    const open = async () => {
      const filename = day.slice(0, -4) + (this._optionalVolume || '') + '.log'
      this._optionalFile = await fs.promises.open(path.join(this._directory, filename), 'a')
      const stat = await this._optionalFile.stat()
      if (!stat.isFile()) throw new Error('Invalid diagnostic log target')
      this._size = stat.size
    }
    if (!this._optionalFile) await open()
    if (this._size >= this._maxsize) {
      await this._optionalFile!.close()
      this._optionalFile = null
      this._optionalVolume++
      await open()
    }
    const data = Buffer.from(`${info[Symbol.for('message')]}${os.EOL}`)
    let written = 0
    while (written < data.length) {
      const result = await this._optionalFile!.write(data, written, data.length - written)
      if (!result.bytesWritten) throw new Error('Diagnostic append made no progress')
      written += result.bytesWritten
    }
    this._size += written
  }

  private _markOptionalFailure() {
    if (this._failed) return
    this._failed = true
    this._onOptionalFailure?.()
  }

  private async _finishFile() {
    if (this._optionalFile) {
      const file = this._optionalFile
      this._optionalFile = null
      await file.close()
    }
    if (!this._file) return
    const file = this._file
    const finished = once(file, 'finish')
    file.end()
    await finished
    file.close?.()
    this._file = null
  }

  _final(callback: (error?: Error | null) => void) {
    if (this._failed) {
      this._file?.close?.()
      this._file = null
      const file = this._optionalFile
      this._optionalFile = null
      void (file?.close() ?? Promise.resolve()).then(
        () => callback(),
        () => callback()
      )
      return
    }
    this._finishFile().then(
      () => callback(),
      (error) => {
        if (this._onOptionalFailure) {
          this._markOptionalFailure()
          callback()
        } else callback(error)
      }
    )
  }
}
