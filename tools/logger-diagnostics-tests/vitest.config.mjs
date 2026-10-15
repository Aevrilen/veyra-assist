import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const local = (name) => fileURLToPath(new URL(name, import.meta.url))
const root = fileURLToPath(new URL('../..', import.meta.url))
export default {
  root,
  cacheDir: fileURLToPath(new URL('.cache/vite', import.meta.url)),
  oxc: { decorator: { legacy: true } },
  resolve: {
    alias: [
      { find: '@shared/akari-shard', replacement: local('shard-stub.ts') },
      { find: /^\.\.\/(?:shards\/)?ipc$/, replacement: local('ipc-stub.ts') },
      { find: /^\.\.\/(?:shards\/)?mobx-utils$/, replacement: local('mobx-stub.ts') },
      { find: '@main', replacement: `${root}/src/main` },
      { find: '@shared', replacement: `${root}/src/shared` },
      ...['winston', 'winston-transport', 'axios', 'dayjs', 'mobx', 'safe-stable-stringify'].map(
        (name) => ({ find: new RegExp(`^${name}$`), replacement: require.resolve(name) })
      )
    ]
  },
  test: {
    environment: 'node',
    include: ['src/main/logger/*.test.ts', 'src/main/shards/logger-factory/*.test.ts'],
    testTimeout: 20000
  }
}
