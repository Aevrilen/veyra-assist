import { compileScript, parse } from '@vue/compiler-sfc'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

import offline from './offline.vitest.config.mjs'

export default {
  ...offline,
  plugins: [
    {
      name: 'position-panel-client-host',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('.vue')) return null
        const { descriptor } = parse(code, { filename: id })
        const compiled = compileScript(descriptor, {
          id: 'position-panel-interaction',
          inlineTemplate: true,
          templateOptions: { ssr: false }
        })
        return {
          code: ts.transpileModule(compiled.content, {
            compilerOptions: {
              module: ts.ModuleKind.ESNext,
              target: ts.ScriptTarget.ES2022
            }
          }).outputText,
          map: null
        }
      }
    }
  ],
  resolve: {
    alias: {
      ...offline.resolve.alias,
      '@renderer-shared': fileURLToPath(new URL('../../../renderer-shared', import.meta.url)),
      '@main-window': fileURLToPath(new URL('../../../renderer/src-main-window', import.meta.url))
    }
  },
  test: {
    ...offline.test,
    include: [
      ...offline.test.include,
      'src/renderer/src-main-window/components/champ-select-position/ChampSelectPositionPanel.interaction.ts'
    ]
  }
}
