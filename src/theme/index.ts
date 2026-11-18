/**
 * src/theme/index.ts
 *
 * 站点身份与两套主题色板的唯一来源（#5）。
 *
 * 为什么集中在这里：页头文案、`<title>`、Vuetify 主题、Tailwind 颜色令牌都要用同一份
 * 站名与颜色，散在组件里迟早漂移。这个模块不依赖 Vue / Vuetify，类型测试
 * （`theme.type-test.ts`）直接断言它的字面量，规格改色时 `pnpm type-check` 先失败。
 */

/** 站名：页头与页面 `<title>` 共用同一份文案。 */
export const SITE_NAME = '数码优选'

/** 主题名。只有浅色 / 暗色两支，规格里没有「跟随系统」。 */
export type ThemeName = 'light' | 'dark'

/** 首次访问默认浅色（规格「主题与视觉」）。 */
export const DEFAULT_THEME = 'light'

/** localStorage 键。改动等于让所有人的主题选择失效，故固定为字面量。 */
export const THEME_STORAGE_KEY = 'shop-frontend:theme'

/**
 * 一套主题的四个槽位。
 *
 * `onPrimary` 是主色上的前景色：暗色主色 `#0A84FF` 与白色只有 3.65:1，
 * 达不到 4.5:1，因此暗色的 `onPrimary` 必须是深色（取值与对比度见
 * `plugins/vuetify.ts` 的注释）。
 */
export interface ThemePalette {
  /** 主色：主要操作、强调文字。 */
  primary: string
  /** 主色上的前景色（按钮文字、图标）。 */
  onPrimary: string
  /** 页面底色。 */
  background: string
  /** 卡片、页头等表面色。 */
  surface: string
}

/**
 * 规格「主题与视觉」逐字取值。
 *
 * `as const satisfies` 同时做到两件事：保留十六进制字面量类型供类型测试断言，
 * 又保证键名不越出 `ThemePalette`。
 */
export const THEME_PALETTE = {
  light: {
    primary: '#0071E3',
    onPrimary: '#FFFFFF',
    background: '#F5F5F7',
    surface: '#FFFFFF',
  },
  dark: {
    // 主色 #0A84FF 配深色文字：白字 3.65:1 不达标，深色 5.13:1 达标（见 vuetify.ts）。
    primary: '#0A84FF',
    onPrimary: '#0B1220',
    background: '#000000',
    surface: '#1D1D1F',
  },
} as const satisfies Record<ThemeName, ThemePalette>

/** 判定任意值是否是合法主题名（供 localStorage 与 URL 参数复用）。 */
export function isThemeName (value: unknown): value is ThemeName {
  return value === 'light' || value === 'dark'
}

/** 另一套主题。用于页头按钮的「切换」语义，避免调用方自己写三元。 */
export function otherTheme (name: ThemeName): ThemeName {
  return name === 'dark' ? 'light' : 'dark'
}

/**
 * 浏览器 localStorage。隐私模式或服务端渲染下拿不到，返回 null，
 * 调用方据此退回默认主题而不是抛错。
 */
export function browserStorage (): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/**
 * 读取已保存的主题。存储缺失、取值非法或访问被拒时一律退回默认浅色，
 * 保证「首次访问默认浅色」在脏数据下也成立。
 */
export function readStoredTheme (storage: Storage | null = browserStorage()): ThemeName {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY)
    return isThemeName(stored) ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

/** 写入主题选择。写入失败（隐私模式、配额）只影响「下次记住」，不影响本次切换。 */
export function storeTheme (storage: Storage | null | undefined, name: ThemeName): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, name)
  } catch {
    // 故意吞掉：切换本身已经生效，记忆失败不该让交互报错。
  }
}
