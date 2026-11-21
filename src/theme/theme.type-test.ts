/**
 * 主题与站点身份的类型测试（编译期，无运行时断言）(#5)。
 *
 * 这个文件由 `pnpm type-check`（vue-tsc）编译：任何一条 `Expect<...>` 不成立，
 * 类型检查就会失败。它把 #5 的主题契约钉在类型上：
 * - 站名唯一来源是 `SITE_NAME`，测试断言它等于「数码优选」；
 * - 首次访问默认浅色（`DEFAULT_THEME` 字面量必须为 `'light'`）；
 * - 只有 light / dark 两套主题，且浅色 / 暗色主色与底色与规格逐字一致。
 *
 * 不覆盖：颜色对比度、页头在某宽度下是否溢出、刷新后是否保留选择。
 * 这三项没有测试运行器可断言（Vitest / Playwright 属 Phase 8），只能浏览器验收。
 */
import type { ThemeName as ThemeNameContract } from '@/theme'
import {
  DEFAULT_THEME,
  SITE_NAME,
  THEME_PALETTE,
  THEME_STORAGE_KEY,
  isThemeName,
  otherTheme,
  readStoredTheme,
  storeTheme,
} from '@/theme'

/** 标准「类型相等」判定：双向条件类型，避免 any / never 的误判。 */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

// 站名与页面 `<title>` 同名，两处都从 SITE_NAME 取值。
export type _SiteName = Expect<Equal<typeof SITE_NAME, '数码优选'>>

// 首次访问默认浅色；主题名只有两支。
export type _ThemeName = Expect<Equal<ThemeNameContract, 'light' | 'dark'>>
export type _DefaultTheme = Expect<Equal<typeof DEFAULT_THEME, 'light'>>

// 存储键是稳定字面量，供 localStorage 读写共用。
export type _StorageKey = Expect<Equal<typeof THEME_STORAGE_KEY, 'shop-frontend:theme'>>

// 两套主题都存在，每套都有主色 / 主色前景 / 背景 / 表面 / 弱化文字 / 警告文字六个槽位。
export type _PaletteThemes = Expect<Equal<keyof typeof THEME_PALETTE, 'light' | 'dark'>>
export type _PaletteKeys = Expect<
  Equal<keyof (typeof THEME_PALETTE)['light'], 'primary' | 'onPrimary' | 'background' | 'surface' | 'muted' | 'warningInk'>
>

// 规格「主题与视觉」逐字取值：浅色 primary #0071E3 / background #F5F5F7 / surface #FFFFFF；
// 暗色 primary #0A84FF / background #000000 / surface #1D1D1F。
export type _LightPrimary = Expect<Equal<(typeof THEME_PALETTE)['light']['primary'], '#0071E3'>>
export type _LightBackground = Expect<Equal<(typeof THEME_PALETTE)['light']['background'], '#F5F5F7'>>
export type _LightSurface = Expect<Equal<(typeof THEME_PALETTE)['light']['surface'], '#FFFFFF'>>
export type _DarkPrimary = Expect<Equal<(typeof THEME_PALETTE)['dark']['primary'], '#0A84FF'>>
export type _DarkBackground = Expect<Equal<(typeof THEME_PALETTE)['dark']['background'], '#000000'>>
export type _DarkSurface = Expect<Equal<(typeof THEME_PALETTE)['dark']['surface'], '#1D1D1F'>>

// 弱化文字色：两套主题各自的取值（暗色不再复用浅色固定色）。
export type _LightMuted = Expect<Equal<(typeof THEME_PALETTE)['light']['muted'], '#475569'>>
export type _DarkMuted = Expect<Equal<(typeof THEME_PALETTE)['dark']['muted'], '#A1A1A6'>>
export type _LightWarningInk = Expect<Equal<(typeof THEME_PALETTE)['light']['warningInk'], '#B45309'>>
export type _DarkWarningInk = Expect<Equal<(typeof THEME_PALETTE)['dark']['warningInk'], '#FFB74D'>>

// 读写与切换函数的外部形状：调用方只依赖这些签名。
export type _IsThemeName = Expect<Equal<ReturnType<typeof isThemeName>, boolean>>
export type _ReadStoredTheme = Expect<Equal<ReturnType<typeof readStoredTheme>, ThemeNameContract>>
export type _StoreTheme = Expect<Equal<ReturnType<typeof storeTheme>, void>>
export type _OtherTheme = Expect<Equal<ReturnType<typeof otherTheme>, ThemeNameContract>>

export type _Summary =
  | _SiteName
  | _ThemeName
  | _DefaultTheme
  | _StorageKey
  | _PaletteThemes
  | _PaletteKeys
  | _LightPrimary
  | _LightBackground
  | _LightSurface
  | _DarkPrimary
  | _DarkBackground
  | _DarkSurface
  | _LightMuted
  | _DarkMuted
  | _LightWarningInk
  | _DarkWarningInk
  | _IsThemeName
  | _ReadStoredTheme
  | _StoreTheme
  | _OtherTheme
