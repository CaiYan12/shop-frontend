/**
 * 主题偏好（O3 / D86）的组件层回归。
 *
 * 为什么需要这一层：e2e/theme.spec.ts 跑的是 verify:e2e 的生产构建，产物里 Vue 的
 * warn 已折叠成 NOOP（dist/assets/index-*.js 里 r=()=>{}、So=r，且全产物没有
 * "[Vue warn]" 字符串），Vuetify 的 deprecate 不会进控制台。实测把
 * useThemePreference 还原成写 theme.global.name.value 后，theme.spec.ts 仍然通过，
 * 所以 e2e 的 console 监听拦不住旧写法。这里在 jsdom + 开发态 Vue 下挂真实
 * createVuetify 实例，console.warn 是活的，旧写入一定会被抓到，因此「无弃用告警」
 * 这条断言能真正失败。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createVuetify } from 'vuetify'
import { useThemePreference } from '@/composables/useThemePreference'
import { THEME_STORAGE_KEY, readStoredTheme } from '@/theme'
import { vuetifyThemes } from '@/theme/vuetify-theme'

let warnings: string[] = []
let wrapper: VueWrapper | null = null
let preference: ReturnType<typeof useThemePreference> | null = null

/** 与 FloatingNav.vue 一样，宿主只依赖 current / toggle。 */
const ThemeHost = defineComponent({
  setup () {
    preference = useThemePreference()
    return () => h('div', { 'data-state': 'theme-host' })
  },
})

/** 与 plugins/vuetify.ts 同一份主题注册：defaultTheme 启动时读 localStorage。 */
function createTestVuetify () {
  return createVuetify({
    theme: {
      defaultTheme: readStoredTheme(),
      themes: vuetifyThemes,
    },
  })
}

/** D86 的旧写入告警：Vuetify 弃用前缀与旧 API 名同时命中才算。 */
function oldThemeWriteWarnings (messages: readonly string[]): string[] {
  return messages.filter((text) =>
    text.includes('[Vuetify UPGRADE]') && text.includes('theme.global.name.value'))
}

async function mountHost () {
  const vuetify = createTestVuetify()
  wrapper = mount(ThemeHost, { global: { plugins: [vuetify] } })
  await nextTick()
  return vuetify
}

beforeEach(() => {
  localStorage.clear()
  warnings = []
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(' '))
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  preference = null
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('useThemePreference（O3 / D86）', () => {
  it('亮 → 暗 → 亮 不产生旧写入弃用告警，theme.name 与 localStorage 同步', async () => {
    const vuetify = await mountHost()
    const { theme } = vuetify

    expect(preference?.current.value).toBe('light')
    expect(theme.name.value).toBe('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()

    preference?.toggle()
    await nextTick()
    expect(preference?.current.value).toBe('dark')
    expect(theme.name.value).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    preference?.toggle()
    await nextTick()
    expect(preference?.current.value).toBe('light')
    expect(theme.name.value).toBe('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')

    expect(oldThemeWriteWarnings(warnings)).toEqual([])
  })

  it('正对照：同环境下显式写 theme.global.name.value 会产生该弃用告警', async () => {
    const vuetify = await mountHost()

    // 故意保留一次旧写法做正对照，证明上一条的「无告警」不是空断言。
    vuetify.theme.global.name.value = 'dark'
    await nextTick()

    const hits = oldThemeWriteWarnings(warnings)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toContain('theme.change')
    expect(vuetify.theme.name.value).toBe('dark')
  })
})
