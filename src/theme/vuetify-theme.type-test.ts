/**
 * Vuetify 主题接线的类型测试（编译期，无运行时断言）(#5)。
 *
 * 页面颜色最终由 Vuetify 的 theme 决定；如果 `plugins/vuetify.ts` 里又手写一份十六进制，
 * 规格里的取值就会有两处真源。这个测试把「Vuetify 拿到的颜色」与规格逐字绑在一起，
 * 并断言暗色主色的前景色**不是**白色（白字对 #0A84FF 只有 3.65:1，不达标）。
 */
import type { ThemeDefinition } from 'vuetify'
import type { ThemeName } from '@/theme'
import { vuetifyThemes } from '@/theme/vuetify-theme'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

type Themes = typeof vuetifyThemes

/** 只有两套主题，且 `dark` 标记与主题名一致（Vuetify 靠它切换 color-scheme）。 */
type _Themes = Expect<Equal<keyof Themes, ThemeName>>
type _LightFlag = Expect<Equal<Themes['light']['dark'], false>>
type _DarkFlag = Expect<Equal<Themes['dark']['dark'], true>>

/** Vuetify 的 ThemeDefinition 兼容（`as const satisfies` 的另一半保证）。 */
type _LightIsTheme = Expect<Equal<Themes['light'] extends ThemeDefinition ? true : false, true>>
type _DarkIsTheme = Expect<Equal<Themes['dark'] extends ThemeDefinition ? true : false, true>>

/** 规格取值：主色、前景色、背景、表面。 */
type _LightPrimary = Expect<Equal<Themes['light']['colors']['primary'], '#0071E3'>>
type _LightOnPrimary = Expect<Equal<Themes['light']['colors']['on-primary'], '#FFFFFF'>>
type _LightBackground = Expect<Equal<Themes['light']['colors']['background'], '#F5F5F7'>>
type _LightSurface = Expect<Equal<Themes['light']['colors']['surface'], '#FFFFFF'>>

type _DarkPrimary = Expect<Equal<Themes['dark']['colors']['primary'], '#0A84FF'>>
type _DarkBackground = Expect<Equal<Themes['dark']['colors']['background'], '#000000'>>
type _DarkSurface = Expect<Equal<Themes['dark']['colors']['surface'], '#1D1D1F'>>

/** 暗色前景色不得是白色：这是「白字 3.65:1 不采用」的编译期闸门。 */
type IsWhite<T> = Equal<T, '#FFFFFF'>
type _DarkOnPrimaryIsNotWhite = Expect<Equal<IsWhite<Themes['dark']['colors']['on-primary']>, false>>

export type _Summary =
  | _Themes
  | _LightFlag
  | _DarkFlag
  | _LightIsTheme
  | _DarkIsTheme
  | _LightPrimary
  | _LightOnPrimary
  | _LightBackground
  | _LightSurface
  | _DarkPrimary
  | _DarkBackground
  | _DarkSurface
  | _DarkOnPrimaryIsNotWhite
