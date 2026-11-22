/**
 * e2e/theme.spec.ts —— O3（D86）主题迁移的独立回归。
 *
 * 只验一件事：页头切换主题不再走 'theme.global.name.value' 这条弃用写入。
 *
 * 判定方式（D86）：Vuetify 4 把 'theme.global.name' 保留成兼容 Proxy，写它的 '.value'
 * 会调用 deprecate("theme.global.name.value = <name>", "theme.change('<name>')")，经 Vue 的
 * warn 输出 "[Vuetify UPGRADE] ... is deprecated ..."。弃用告警可能在应用初始化阶段就
 * 输出，所以 console 监听必须在首次导航之前注册；这里只收「旧写入」这一条，其他控制台
 * 输出一律不参与判定。
 *
 * 同时验亮暗双向切换，以及刷新后「实际渲染主题」与 localStorage 保存值一致：
 * 渲染取 .v-application 的主题 class 与页面计算背景（html/body 的 --v-theme-background，
 * 见 src/styles/tailwind.css）。
 *
 * 本文件单独计入 manifest 的 suites.theme（support/manifest-reporter.ts 按文件名分组），
 * 不计入 E1 的六条业务路径。
 *
 * 构建形态（实测，2026-11-22）：verify:e2e 跑的是生产构建（playwright.config.mjs:
 * pnpm build && vite preview），产物里 Vue 的 warn 已折叠成 NOOP
 * （dist/assets/index-*.js: r=()=>{}, So=r；全产物无 "[Vue warn]" 字符串），
 * 所以 Vuetify 的 deprecate 不会进控制台。这条 console 断言在默认流水线里是
 * 「前向守卫」：真正能拦住旧写法的运行方式是 dev 模式或未来打开告警的构建。
 */
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'

/** 与 src/theme/index.ts 的 THEME_STORAGE_KEY 一致（e2e 不走 @ 别名）。 */
const THEME_STORAGE_KEY = 'shop-frontend:theme'

type ThemeName = 'light' | 'dark'

/**
 * 两套主题的实际渲染结果。
 * - className：Vuetify VApp 按 theme.name 打在 .v-application 上的 v-theme--*；
 * - background：--v-theme-background 指向 THEME_PALETTE 的 background（#F5F5F7 / #000000）。
 */
const RENDERED: Record<ThemeName, { readonly className: string, readonly background: string }> = {
  light: { className: 'v-theme--light', background: 'rgb(245, 245, 247)' },
  dark: { className: 'v-theme--dark', background: 'rgb(0, 0, 0)' },
}

/**
 * D86 的旧写入弃用告警：只认 theme.global.name.value 这一条 deprecate，
 * 不把其他 Vuetify / Vue 告警算进来。
 */
function isOldThemeWriteDeprecation (message: ConsoleMessage): boolean {
  const text = message.text()
  return text.includes('[Vuetify UPGRADE]') &&
    text.includes('theme.global.name.value') &&
    text.includes('is deprecated')
}

/** 返回收集数组；必须在 page.goto 之前调用。 */
function watchOldThemeWriteDeprecations (page: Page): string[] {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (isOldThemeWriteDeprecation(message)) {
      warnings.push(message.text())
    }
  })
  return warnings
}

function appRoot (page: Page) {
  return page.locator('.v-application')
}

/** 实际渲染主题：主题 class + 页面计算背景。 */
async function expectRenderedTheme (page: Page, theme: ThemeName): Promise<void> {
  const rendered = RENDERED[theme]
  await expect(appRoot(page)).toContainClass(rendered.className)
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .toBe(rendered.background)
}

async function readSavedTheme (page: Page): Promise<string | null> {
  return await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY)
}

/** localStorage 保存值：刷新后应与实际渲染主题一致。 */
async function expectSavedTheme (page: Page, theme: ThemeName): Promise<void> {
  expect(await readSavedTheme(page)).toBe(theme)
}

/**
 * 通过真实 UI 切换主题：先展开灵动岛，再点「切换主题」。
 * 切换按钮只在展开态存在，切完不会收起面板，所以第二次切换不必重复展开。
 */
async function toggleThemeThroughUi (page: Page): Promise<void> {
  if (await page.locator('[data-state="nav-panel"]').count() === 0) {
    await page.locator('[data-state="nav-toggle"]').click()
  }
  const toggle = page.locator('[data-state="nav-item-theme"]')
  await expect(toggle).toBeVisible()
  await toggle.click()
}

test.describe('主题（O3 / D86）', () => {
  test('亮暗双向切换走 theme.change，刷新后渲染主题与保存值一致，且无旧写入弃用告警', async ({ page }) => {
    // 先挂监听再导航：应用初始化阶段就可能输出弃用告警。
    const oldWriteWarnings = watchOldThemeWriteDeprecations(page)

    await page.goto('/')
    await expect(page.locator('[data-state="floating-nav"]')).toBeVisible()
    // 首次访问默认浅色（无保存值）。
    await expectRenderedTheme(page, 'light')

    // 浅 → 暗。
    await toggleThemeThroughUi(page)
    await expectRenderedTheme(page, 'dark')
    await expectSavedTheme(page, 'dark')

    // 刷新：保存值在启动时被读回，渲染与保存值一致。
    await page.reload()
    await expect(page.locator('[data-state="floating-nav"]')).toBeVisible()
    await expectRenderedTheme(page, 'dark')
    await expectSavedTheme(page, 'dark')

    // 暗 → 浅（双向）。
    await toggleThemeThroughUi(page)
    await expectRenderedTheme(page, 'light')
    await expectSavedTheme(page, 'light')

    await page.reload()
    await expect(page.locator('[data-state="floating-nav"]')).toBeVisible()
    await expectRenderedTheme(page, 'light')
    await expectSavedTheme(page, 'light')

    expect(oldWriteWarnings, 'D86：不应再出现旧写入弃用告警：\n' + oldWriteWarnings.join('\n')).toEqual([])
  })
})
