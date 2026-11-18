/**
 * src/theme/vuetify-theme.ts
 *
 * 把 `THEME_PALETTE`（规格真源）落成 Vuetify 的 `ThemeDefinition`。
 *
 * 为什么单独一层：颜色只允许在 `theme/index.ts` 出现一次；这里只做「改名字」，
 * 例如 `onPrimary` → `on-primary`。类型测试（`vuetify-theme.type-test.ts`）
 * 断言 Vuetify 最终拿到的十六进制与规格逐字一致，改错色号 `pnpm type-check` 先失败。
 */
import type { ThemeDefinition } from 'vuetify'
import { THEME_PALETTE, type ThemeName } from '@/theme'

export const vuetifyThemes = {
  light: {
    dark: false,
    colors: {
      primary: THEME_PALETTE.light.primary,
      'on-primary': THEME_PALETTE.light.onPrimary,
      background: THEME_PALETTE.light.background,
      surface: THEME_PALETTE.light.surface,
    },
  },
  dark: {
    dark: true,
    colors: {
      // #0A84FF 配深色前景 #0B1220（5.13:1）；白字只有 3.65:1，不采用。
      primary: THEME_PALETTE.dark.primary,
      'on-primary': THEME_PALETTE.dark.onPrimary,
      background: THEME_PALETTE.dark.background,
      surface: THEME_PALETTE.dark.surface,
    },
  },
} as const satisfies Record<ThemeName, ThemeDefinition>
