/**
 * 页头主题切换 composable 的类型测试（编译期，无运行时断言）(#5)。
 *
 * 页头按钮只依赖 `useThemePreference()` 返回的两样东西：当前主题（只读）与切换。
 * 这里把它们的外部形状钉住，`pnpm type-check` 通过即代表组件与 composable 的契约一致。
 *
 * 不覆盖：点击后是否真的改主题、是否真的写进 localStorage——需要浏览器验收。
 */
import type { ComputedRef } from 'vue'
import type { ThemeName } from '@/theme'
import { useThemePreference } from '@/composables/useThemePreference'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

type _Preference = ReturnType<typeof useThemePreference>

/** 当前主题是只读计算值，组件不能直接改它，只能走 toggle。 */
type _Current = Expect<Equal<_Preference['current'], ComputedRef<ThemeName>>>

/** 切换：无参数、无返回值。 */
type _Toggle = Expect<Equal<_Preference['toggle'], () => void>>

export type _Summary = _Current | _Toggle
