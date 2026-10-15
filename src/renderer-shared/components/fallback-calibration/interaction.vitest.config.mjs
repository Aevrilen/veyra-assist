import { compileScript, parse } from '@vue/compiler-sfc'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
export default {
  root,
  cacheDir: resolve(root, '.fallback-test-cache'),
  resolve: {
    alias: { '@shared': resolve(root, 'src/shared'), '@main': resolve(root, 'src/main') }
  },
  plugins: [
    {
      name: 'client-sfc-for-host-interaction-test',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('.vue')) return null
        const { descriptor } = parse(code, { filename: id })
        const compiled = compileScript(descriptor, {
          id: 'fallback-interaction-test',
          inlineTemplate: true,
          templateOptions: { ssr: false }
        })
        return {
          code: ts.transpileModule(compiled.content, {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
          }).outputText,
          map: null
        }
      }
    }
  ],
  test: {
    environment: 'node',
    maxWorkers: 1,
    fileParallelism: false,
    include: [
      'src/shared/mayhem-assistant/fallback-calibration/index.test.ts',
      'src/renderer-shared/components/fallback-calibration/FallbackCalibration.interaction.ts'
    ]
  }
}
