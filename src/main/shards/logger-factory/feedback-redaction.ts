import { createHmac, randomBytes } from 'node:crypto'
import { setImmediate } from 'node:timers/promises'

const DIAGNOSTIC_NAMESPACES = new Set([
  'app',
  'native',
  'akari-shard-manager',
  'logger-factory-main',
  'mayhem-assistant-main',
  'champ-select-overlay-main',
  'game-client-main',
  'client-installation-main',
  'window-manager-main'
])
const RECORD =
  /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}:\d{3}\] \[([^\]\r\n]+)\] \[(?:info|warn|error|debug|verbose|http|silly)\] /gm
const PRIVATE_RECORD =
  /chat|whisper|conversation|payload|headers?|cookies?|authorization|credentials?|password|secret|token|entitlement|puuid|summoner|account|user.?name|login|riot.?id|session.?key|game.?name|tag.?line|private.?key|api.?key|access.?key|command.?line|deep.?link|data:image|-----BEGIN|\bdata["']?\s*:/i

/** Export operational records only. Raw local logs are never modified. */
export async function redactFeedbackLog(input: string, salt = randomBytes(16)) {
  const records = [...input.matchAll(RECORD)]
  let omitted = 0
  let retained = 0
  const output: string[] = []
  for (let i = 0; i < records.length; i++) {
    if (i % 250 === 0) await setImmediate()
    const match = records[i]
    if (!DIAGNOSTIC_NAMESPACES.has(match[1])) {
      omitted++
      continue
    }
    const body = input.slice(match.index! + match[0].length, records[i + 1]?.index ?? input.length)
    // A snapshot can end midway through a write. Never export an unfinished last record.
    if (i === records.length - 1 && !body.endsWith('\n')) {
      omitted++
      continue
    }
    if (PRIVATE_RECORD.test(body)) {
      output.push(`${match[0]}[sensitive record omitted]\n`)
      omitted++
      continue
    }
    const safe = body
      .replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/\bhttps?:\/\/[^\s<>"']+/gi, '[url]')
      .replace(/\b[A-Z]:[\\/][^\r\n]*/gi, '[local-path]')
      .replace(/\\\\[^\r\n]+/g, '[local-path]')
      .replace(/\/(?:home|Users)\/[^\r\n]+/g, '[local-path]')
      .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '[email]')
      .replace(
        /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi,
        (value) => `[id:${createHmac('sha256', salt).update(value).digest('hex').slice(0, 8)}]`
      )
      .replace(/\b(?:Basic|Bearer)\s+\S+/gi, '[credential]')
      .replace(/[A-Za-z0-9_+/=-]{48,}/g, '[long-value]')
    output.push(
      match[0] +
        safe.slice(0, 16384).trimEnd() +
        (safe.length > 16384 ? ' [record truncated]' : '') +
        '\n'
    )
    retained++
  }
  return { text: output.join(''), retained, omitted }
}
