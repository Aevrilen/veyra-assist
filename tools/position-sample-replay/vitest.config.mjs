import { fileURLToPath } from 'node:url'

export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: { environment: 'node', include: ['*.test.ts'], testTimeout: 20000 }
}
