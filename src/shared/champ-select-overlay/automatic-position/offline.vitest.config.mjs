import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export default {
  root: fileURLToPath(new URL('../../../../', import.meta.url)),
  cacheDir: join(tmpdir(), 'veyra-auto-position-cache'),
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../../', import.meta.url)),
      '@main': fileURLToPath(new URL('../../../main', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: [
      'src/shared/champ-select-overlay/automatic-position/*.test.ts',
      'src/shared/champ-select-overlay/position-calibration.test.ts',
      'src/main/shards/champ-select-overlay/placement.test.ts',
      'src/main/shards/champ-select-overlay/automatic-position-lifecycle.test.ts',
      'src/main/shards/champ-select-overlay/automatic-position-capture.test.ts',
      'src/main/shards/champ-select-overlay/automatic-position-lease.test.ts',
      'src/main/shards/champ-select-overlay/automatic-position-scale.test.ts',
      'src/main/shards/champ-select-overlay/automatic-position-controller.test.ts',
      'src/main/shards/champ-select-overlay/position-calibration-controller.test.ts',
      'src/main/shards/champ-select-overlay/automatic-position-image.test.ts',
      'src/main/shards/champ-select-overlay/position-calibration-ipc.test.ts',
      'src/main/shards/champ-select-overlay/position-sample-executor.test.ts'
    ]
  }
}
