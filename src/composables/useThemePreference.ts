/**
 * src/composables/useThemePreference.ts
 *
 * 页头主题切换的唯一入口（#5）。
 *
 * 分工：Vuetify 负责把主题色板落成 CSS（`theme.global.name`），localStorage 负责
 * 「下次打开保持一致」。组件只跟这个 composable 打交道，不直接碰 `useTheme()` 或
 * `localStorage`，这样以后换成 Pinia / 跟随系统时只改一处。
 */
import { computed } from 'vue'
import { useTheme } from 'vuetify'
import {
  DEFAULT_THEME,
  browserStorage,
  isThemeName,
  otherTheme,
  storeTheme,
  type ThemeName,
} from '@/theme'

/**
 * 读取并切换主题。
 *
 * - `current` 只读：任何写入都经过 `setTheme`，保证「改主题」与「记住主题」不会分叉。
 * - 初始值来自 `plugins/vuetify.ts` 的 `defaultTheme`（启动时已读过 localStorage），
 *   这里不重复读，避免两处判断不一致。
 */
export function useThemePreference() {
  const theme = useTheme()

  const current = computed<ThemeName>(() => {
    const name = theme.global.name.value
    return isThemeName(name) ? name : DEFAULT_THEME
  })

  function setTheme(name: ThemeName): void {
    theme.global.name.value = name
    storeTheme(browserStorage(), name)
  }

  function toggle(): void {
    setTheme(otherTheme(current.value))
  }

  return { current, toggle }
}
