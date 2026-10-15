import { AppColorTheme, AppThemeId } from '@shared/types/app-theme'
import { MaybeRefOrGetter, toRef, watchEffect } from 'vue'

import { getWorkspaceCssVariables } from '../theme/naive-ui-overrides/workspace'

export function useColorThemeAttr(
  colorTheme: MaybeRefOrGetter<AppColorTheme>,
  themeId: MaybeRefOrGetter<AppThemeId> = colorTheme
) {
  const colorThemeV = toRef(colorTheme)
  const themeIdV = toRef(themeId)

  watchEffect((onCleanup) => {
    document.documentElement.setAttribute('data-theme', colorThemeV.value)
    document.documentElement.setAttribute('data-theme-id', themeIdV.value)
    document.documentElement.style.setProperty('color-scheme', colorThemeV.value)
    const variables = getWorkspaceCssVariables(themeIdV.value)
    document.documentElement.toggleAttribute('data-workspace-theme', Boolean(variables))
    if (variables) {
      for (const [name, value] of Object.entries(variables)) {
        document.documentElement.style.setProperty(name, value)
      }
      onCleanup(() => {
        for (const name of Object.keys(variables))
          document.documentElement.style.removeProperty(name)
        document.documentElement.removeAttribute('data-workspace-theme')
      })
    }
  })
}
