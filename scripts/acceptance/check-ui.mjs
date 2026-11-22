// 最小可重复 UI 验收：F1 搜索按钮 / R26 放大区双轴轨道 / R27 原生滚动条对比度。
// 零依赖 CDP，默认 clean build + preview，真实点击 + 真实截图取样。
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findFreePort, launchBrowser, openPage, sleep, waitForHttp } from './lib.mjs'
import { sampleNativeScrollbar } from './native-scrollbar.mjs'
import { caseP7Motion, caseP7Nav, caseP7Purchase } from './phase7-cases.mjs'
import { classifyRun, recordRun } from './latest.mjs'
import { resolveLatestPath, uiAcceptanceDir } from './paths.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CART_ITEMS = [
  { sku: 'EARPODS-LTN-BOX', slug: 'apple-earpods', name: 'Apple EarPods 有线耳机（Lightning）', unitPriceCents: 14900, quantity: 1, stock: 200 },
  { sku: 'XM3-BK-STD', slug: 'sony-wh-1000xm3', name: 'Sony WH-1000XM3 无线降噪头戴耳机', unitPriceCents: 229900, quantity: 1, stock: 25 },
  { sku: 'CH500-BL-BT', slug: 'sony-wh-ch500', name: 'Sony WH-CH500 无线头戴耳机', unitPriceCents: 49900, quantity: 1, stock: 40 },
  { sku: 'AWS8-41-SPORT', slug: 'apple-watch-series-8', name: 'Apple Watch Series 8 智能手表（Nike 款）', unitPriceCents: 299900, quantity: 1, stock: 14 },
  { sku: 'APM-SG-LTN', slug: 'airpods-max', name: 'Apple AirPods Max 头戴式降噪耳机', unitPriceCents: 399900, quantity: 1, stock: 12 },
  { sku: 'AWU-OCEAN-SM', slug: 'apple-watch-ultra', name: 'Apple Watch Ultra 智能手表', unitPriceCents: 629900, quantity: 1, stock: 6 },
  { sku: 'K8-RED-PBT', slug: 'keychron-k8', name: 'Keychron K8 无线机械键盘（87 键 TKL）', unitPriceCents: 59900, quantity: 1, stock: 35 },
  { sku: 'HW-W1-SV-LEATHER', slug: 'huawei-watch', name: 'Huawei Watch 智能手表（第一代）', unitPriceCents: 129900, quantity: 1, stock: 20 },
]

const argv = process.argv.slice(2)
const hasFlag = (name) => argv.includes(name)
const valueOf = (name, fallback = null) => {
  const index = argv.indexOf(name)
  if (index >= 0) return argv[index + 1] ?? fallback
  const prefix = `${name}=`
  const match = argv.find((item) => item.startsWith(prefix))
  return match ? match.slice(prefix.length) : fallback
}

const skipBuild = hasFlag('--skip-build')
const headed = hasFlag('--headed')
const reverse = valueOf('--reverse')
const onlyRaw = valueOf('--only')
const CASE_IDS = ['F1', 'R26', 'R27', 'P7-NAV', 'P7-PURCHASE', 'P7-MOTION']
const onlySet = onlyRaw === null
  ? null
  : new Set(onlyRaw.split(',').map((item) => item.trim()).filter(Boolean))
if (onlySet !== null) {
  const unknown = [...onlySet].filter((id) => !CASE_IDS.includes(id))
  if (unknown.length > 0) {
    throw new Error(`未知用例：${unknown.join(', ')}；支持 ${CASE_IDS.join('|')}`)
  }
}
const shouldRun = (id) => onlySet === null || onlySet.has(id)
const REVERSE_MODES = new Set(['f1', 'island', 'purchase', 'purchase-price'])
if (reverse && !REVERSE_MODES.has(reverse)) {
  throw new Error(`未知反向验证：${reverse}；支持 --reverse=f1|island|purchase|purchase-price`)
}

const runId = valueOf('--run-id') ?? new Date().toISOString().replace(/[:.]/g, '-')
const artifactRoot = process.env.UI_ARTIFACT_DIR
  ? resolve(process.env.UI_ARTIFACT_DIR)
  : uiAcceptanceDir(ROOT)
const runDir = join(artifactRoot, runId)
mkdirSync(runDir, { recursive: true })

const manifest = {
  runId,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  commit: readCommit(),
  mode: {
    build: skipBuild ? 'skipped' : 'clean-build',
    browser: headed ? 'headed' : 'headless',
    reverse: reverse ?? null,
    only: onlySet === null ? null : [...onlySet],
  },
  baseUrl: null,
  preflight: null,
  cases: [],
  summary: null,
  fatalError: null,
}

function readCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function rel(path) {
  return relative(runDir, path).split(sep).join('/')
}

function pnpmCommand() {
  return process.platform === 'win32'
    ? [process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm build']]
    : ['pnpm', ['build']]
}

async function runBuild() {
  const logPath = join(runDir, 'build.log')
  console.log('[ui] clean build ->', rel(logPath))
  const fd = openSync(logPath, 'a')
  const [executable, args] = pnpmCommand()
  const child = spawn(executable, args, {
    cwd: ROOT,
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  })
  closeSync(fd)
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
  if (code !== 0) {
    throw new Error(`pnpm build 失败（exit ${code}）；日志：${rel(logPath)}\n${tail(logPath, 30)}`)
  }
}

function tail(path, lines = 30) {
  try {
    return readFileSync(path, 'utf8').trimEnd().split(/\r?\n/).slice(-lines).join('\n')
  } catch {
    return ''
  }
}

async function startPreview(port) {
  const logPath = join(runDir, 'preview.log')
  const viteCli = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  if (!existsSync(viteCli)) throw new Error(`找不到 ${viteCli}；先执行 pnpm install`)
  const fd = openSync(logPath, 'a')
  const child = spawn(process.execPath, [viteCli, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  })
  closeSync(fd)
  const earlyExit = new Promise((resolve) => {
    child.once('exit', (code) => resolve(code))
  })
  const baseUrl = `http://127.0.0.1:${port}`
  try {
    await Promise.race([
      waitForHttp(`${baseUrl}/`, { timeoutMs: 30000 }),
      earlyExit.then((code) => {
        throw new Error(`vite preview 提前退出（exit ${code}）；日志：${rel(logPath)}\n${tail(logPath, 20)}`)
      }),
    ])
  } catch (error) {
    try { child.kill() } catch {}
    throw error
  }
  return { child, baseUrl, logPath }
}

async function preflight(baseUrl) {
  const suggestionsUrl = `${baseUrl}/api/products/suggestions?q=sony`
  const detailUrl = `${baseUrl}/api/products/apple-earpods`
  const suggestions = await fetchJson(suggestionsUrl)
  const detail = await fetchJson(detailUrl)
  if (!Array.isArray(suggestions.items) || suggestions.items.length === 0) {
    throw new Error('联想接口未返回条目；确认后端与 Elasticsearch 已启动')
  }
  if (!detail.slug || detail.slug !== 'apple-earpods') {
    throw new Error('详情接口未返回 apple-earpods；确认后端已启动且数据已 seed')
  }
  return {
    suggestions: { url: suggestionsUrl, count: suggestions.items.length },
    detail: { url: detailUrl, slug: detail.slug },
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`预检失败 ${url}：HTTP ${response.status} ${text.slice(0, 200)}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`预检响应不是 JSON：${url}`)
  }
}

function screenshotPath(...parts) {
  return join(runDir, ...parts)
}

async function shot(page, parts, screenshots) {
  const path = screenshotPath(...parts)
  await page.shot(path)
  screenshots.push(rel(path))
  return path
}

function markChecks(checks, failures, key, condition, reason) {
  checks[key] = Boolean(condition)
  if (!condition) failures.push(reason)
}

async function withPage(browser, baseUrl, fn) {
  const page = await openPage(browser.port, `${baseUrl}/`)
  try {
    return await fn(page)
  } finally {
    await page.close()
  }
}

async function runCase(browser, baseUrl, definition, fn) {
  // 证据容器由 runCase 持有并传给用例：用例抛错时，已采集的断言 / 测量 / 截图仍然留在 manifest 里。
  const state = { checks: {}, measurements: {}, screenshots: [], failures: [] }
  const result = {
    id: definition.id,
    title: definition.title,
    viewport: definition.viewport,
    theme: definition.theme,
    status: 'fail',
    checks: state.checks,
    measurements: state.measurements,
    screenshots: state.screenshots,
    failureReason: null,
  }
  let thrown = null
  try {
    await withPage(browser, baseUrl, (page) => fn(page, state))
  } catch (error) {
    thrown = error instanceof Error ? error.message : String(error)
    state.failures.push(thrown)
  }
  const failedChecks = Object.entries(state.checks)
    .filter(([, value]) => value !== true)
    .map(([key]) => key)
  result.status = failedChecks.length === 0 && state.failures.length === 0 ? 'pass' : 'fail'
  if (failedChecks.length > 0) {
    result.failureReason = `失败断言：${failedChecks.join(', ')}`
  } else if (state.failures.length > 0) {
    result.failureReason = state.failures.join('; ')
  }
  manifest.cases.push(result)
  console.log(`[ui] ${result.status.toUpperCase()} ${result.id} ${result.failureReason ?? ''}`.trim())
  return result
}

// ---------- F1：390px 搜索按钮中心与真实点击 ----------
async function caseF1(page, baseUrl, state) {
  const { checks, failures, screenshots, measurements } = state
  await page.viewport(390, 844, true)
  await page.goto(`${baseUrl}/`)
  await page.waitFor(`document.querySelector('input[role="combobox"]') !== null`, 20000)
  await sleep(500)
  await page.eval(`(() => {
    const input = document.querySelector('input[role="combobox"]')
    input.focus()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, 'sony')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await page.waitFor(`document.querySelector('[role="listbox"]') !== null`, 15000)
  await sleep(350)

  if (reverse === 'f1') {
    // 只用于受控反向验证：把联想下拉上移到按钮位置，断言必须变红。
    await page.eval(`(() => {
      const style = document.createElement('style')
      style.textContent = '[role="listbox"] { top: calc(100% + 0.5rem) !important; }'
      document.head.append(style)
      return true
    })()`)
    await sleep(200)
  }

  const before = await page.eval(`(() => {
    const list = document.querySelector('[role="listbox"]')
    const button = [...document.querySelectorAll('button')].find((node) => node.innerText.trim() === '搜索')
    if (!button) return { listboxOpen: Boolean(list), button: null }
    const rect = button.getBoundingClientRect()
    const x = rect.x + rect.width / 2
    const y = rect.y + rect.height / 2
    const top = document.elementFromPoint(x, y)
    return {
      listboxOpen: Boolean(list),
      button: { x, y, tag: button.tagName, text: button.innerText.trim() },
      topElementAtButtonCenter: {
        tag: top?.tagName ?? null,
        className: typeof top?.className === 'string' ? top.className.slice(0, 120) : null,
        isButton: Boolean(top && (top === button || button.contains(top))),
        isListbox: Boolean(top?.closest('[role="listbox"]')),
      },
      listbox: list ? { top: Math.round(list.getBoundingClientRect().top), bottom: Math.round(list.getBoundingClientRect().bottom) } : null,
    }
  })()`)
  await shot(page, ['f1', '390-light', 'search-open.png'], screenshots)

  let after = null
  if (before.button) {
    await page.clickXY(before.button.x, before.button.y)
    try {
      await page.waitFor(
        `new URLSearchParams(location.search).get('keyword') === 'sony' && !document.querySelector('[role="listbox"]')`,
        10000,
      )
    } catch {}
    after = await page.eval(`({
      path: location.pathname,
      keyword: new URLSearchParams(location.search).get('keyword'),
      listbox: Boolean(document.querySelector('[role="listbox"]')),
    })`)
  }
  await shot(page, ['f1', '390-light', 'search-submitted.png'], screenshots)

  markChecks(checks, failures, 'suggestionsOpen', before.listboxOpen === true, '联想列表未展开')
  markChecks(checks, failures, 'buttonFound', Boolean(before.button), '未找到「搜索」按钮')
  markChecks(
    checks,
    failures,
    'buttonCenterHitsButton',
    before.topElementAtButtonCenter?.isButton === true,
    '搜索按钮中心命中的不是按钮或其子元素',
  )
  markChecks(
    checks,
    failures,
    'buttonCenterNotListbox',
    before.topElementAtButtonCenter?.isListbox === false,
    '搜索按钮中心仍被联想列表覆盖',
  )
  markChecks(checks, failures, 'keywordSubmitted', after?.keyword === 'sony', '点击后 URL 未提交 keyword=sony')
  markChecks(checks, failures, 'suggestionsClosed', after?.listbox === false, '点击提交后联想列表未关闭')

  Object.assign(measurements, { before, after })
}

// ---------- R26：放大图双轴实际溢出 + 轨道空白点击 ----------
async function caseR26(page, baseUrl, state) {
  const { checks, failures, screenshots, measurements } = state
  await page.viewport(1365, 900, false)
  await page.goto(`${baseUrl}/product/apple-earpods`)
  await page.waitFor(`document.querySelector('[data-state="detail-ready"]') !== null`, 25000)
  await sleep(600)
  await page.eval(`document.querySelector('[data-state="gallery-slot"] button[aria-label^="放大查看第 1 张"]').click()`)
  await page.waitFor(`document.querySelector('[data-zoom-viewport]') !== null`, 8000)
  await sleep(500)
  await page.eval(`document.querySelector('button[aria-label="2× 放大"]').click()`)
  await sleep(700)
  await page.waitFor(`(() => {
    const viewport = document.querySelector('[data-zoom-viewport]')
    return viewport && viewport.scrollWidth > viewport.clientWidth + 2 && viewport.scrollHeight > viewport.clientHeight + 2
  })()`, 5000).catch(() => {})

  const dimensions = await page.eval(`(() => {
    const viewport = document.querySelector('[data-zoom-viewport]')
    const vertical = document.querySelector('.os-scrollbar-vertical')
    const horizontal = document.querySelector('.os-scrollbar-horizontal')
    const rect = (node) => node ? (() => {
      const r = node.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    })() : null
    return {
      scrollWidth: viewport?.scrollWidth ?? -1,
      clientWidth: viewport?.clientWidth ?? -1,
      scrollHeight: viewport?.scrollHeight ?? -1,
      clientHeight: viewport?.clientHeight ?? -1,
      overflowX: Boolean(viewport && viewport.scrollWidth > viewport.clientWidth + 2),
      overflowY: Boolean(viewport && viewport.scrollHeight > viewport.clientHeight + 2),
      bars: { vertical: rect(vertical), horizontal: rect(horizontal) },
    }
  })()`)
  await shot(page, ['r26', '1365-light', 'zoom-2x.png'], screenshots)

  const vertical = await clickTrack(page, 'vertical')
  if (vertical?.info?.point) await shot(page, ['r26', '1365-light', 'track-vertical.png'], screenshots)
  const horizontal = await clickTrack(page, 'horizontal')
  if (horizontal?.info?.point) await shot(page, ['r26', '1365-light', 'track-horizontal.png'], screenshots)

  markChecks(checks, failures, 'actualTwoAxisOverflow', dimensions.overflowX && dimensions.overflowY,
    `未构造出双轴溢出：x=${dimensions.scrollWidth}/${dimensions.clientWidth}, y=${dimensions.scrollHeight}/${dimensions.clientHeight}`)
  markChecks(checks, failures, 'bothScrollbarsVisible',
    Boolean(dimensions.bars.vertical && dimensions.bars.horizontal && dimensions.bars.vertical.width > 0 && dimensions.bars.horizontal.height > 0),
    '双轴 OverlayScrollbars 不可见')
  markChecks(checks, failures, 'verticalTrackClick',
    Boolean(vertical?.info?.point && vertical.info.top.insideBar && !vertical.info.top.onHandle && vertical.after?.top > vertical.before?.top),
    '纵向轨道点击没有命中轨道或没有向下移动')
  markChecks(checks, failures, 'horizontalTrackClick',
    Boolean(horizontal?.info?.point && horizontal.info.top.insideBar && !horizontal.info.top.onHandle && horizontal.after?.left > horizontal.before?.left),
    '横向轨道点击没有命中轨道或没有向右移动')

  Object.assign(measurements, { dimensions, vertical, horizontal })
}

async function clickTrack(page, axis) {
  const info = await page.eval(`(() => {
    const viewport = document.querySelector('[data-zoom-viewport]')
    const bar = document.querySelector('.os-scrollbar-${axis === 'vertical' ? 'vertical' : 'horizontal'}')
    if (!viewport || !bar) return null
    const handle = bar.querySelector('.os-scrollbar-handle')
    if (!handle) return null
    viewport.scrollTo(0, 0)
    const br = bar.getBoundingClientRect()
    const hr = handle.getBoundingClientRect()
    const candidates = ${axis === 'vertical'
      ? '[[br.left + br.width / 2, br.bottom - 6], [br.left + br.width / 2, br.bottom - 14], [br.left + br.width / 2, br.top + 6], [br.left + br.width / 2, hr.bottom + 8]]'
      : '[[br.right - 6, br.top + br.height / 2], [br.right - 14, br.top + br.height / 2], [br.left + 6, br.top + br.height / 2], [hr.right + 8, br.top + br.height / 2]]'}
    const point = candidates.find(([x, y]) => {
      if (x < br.left + 2 || x > br.right - 2 || y < br.top + 2 || y > br.bottom - 2) return false
      if (x >= hr.left - 2 && x <= hr.right + 2 && y >= hr.top - 2 && y <= hr.bottom + 2) return false
      const top = document.elementFromPoint(x, y)
      return Boolean(top && top.closest('.os-scrollbar') === bar && !top.closest('.os-scrollbar-handle'))
    })
    const top = point ? document.elementFromPoint(point[0], point[1]) : null
    return {
      axis: ${JSON.stringify(axis)},
      bar: { x: br.x, y: br.y, width: br.width, height: br.height },
      handle: { x: hr.x, y: hr.y, width: hr.width, height: hr.height },
      point: point ? { x: point[0], y: point[1] } : null,
      top: top ? {
        tag: top.tagName,
        className: typeof top.className === 'string' ? top.className.slice(0, 120) : null,
        insideBar: top.closest('.os-scrollbar') === bar,
        onHandle: Boolean(top.closest('.os-scrollbar-handle')),
      } : null,
    }
  })()`)
  if (!info?.point) return { info, before: null, after: null }

  const before = await scrollPosition(page)
  await page.clickXY(info.point.x, info.point.y)
  await sleep(500)
  const after = await scrollPosition(page)
  return { info, before, after }
}

async function scrollPosition(page) {
  return page.eval(`(() => {
    const viewport = document.querySelector('[data-zoom-viewport]')
    return { left: Math.round(viewport?.scrollLeft ?? -1), top: Math.round(viewport?.scrollTop ?? -1) }
  })()`)
}

// ---------- R27：购物车 / 筛选实际溢出 + 原生滚动条像素对比度 ----------
async function caseR27(page, baseUrl, state) {
  const { checks, failures, screenshots, measurements } = state
  const samples = {}

  const seedCartAndTheme = async (theme) => {
    await page.eval(`(() => {
      localStorage.setItem('shop-frontend:cart:v1', ${JSON.stringify(JSON.stringify({ version: 1, items: CART_ITEMS }))})
      localStorage.setItem('shop-frontend:theme', ${JSON.stringify(theme)})
    })()`)
    await page.goto(`${baseUrl}/`)
    await page.waitFor(`document.querySelector('#cart-summary-trigger') !== null`, 20000)
    await page.waitFor(`document.querySelector('#cart-summary-trigger').innerText.includes('8 件')`, 25000)
    await page.waitFor(`document.querySelector('.v-application').classList.contains('v-theme--${theme}')`, 5000)
    await sleep(400)
  }

  const openCart = async () => {
    await page.clickSelector('#cart-summary-trigger')
    await page.waitFor(`document.querySelector('[data-state="cart-panel-items"]') !== null`, 6000)
    await sleep(600)
  }

  const closeCart = async () => {
    await page.eval(`document.querySelector('[data-state="cart-panel-close"]')?.click()`)
    await page.waitFor(`!document.querySelector('[data-state="cart-panel"]')`, 5000)
  }

  const openFilter = async () => {
    await page.eval(`document.querySelector('[aria-label^="筛选"]')?.scrollIntoView({ block: 'center' })`)
    await sleep(200)
    await page.clickSelector('[aria-label^="筛选"]')
    await page.waitFor(`document.querySelector('.filter-sheet__body') !== null`, 6000)
    await sleep(600)
  }

  const closeFilter = async () => {
    await page.eval(`[...document.querySelectorAll('button')].find((button) => button.innerText.trim() === '完成')?.click()`)
    await page.waitFor(`!document.querySelector('.filter-sheet__body')`, 5000)
  }

  for (const theme of ['light', 'dark']) {
    await page.viewport(1365, 900, false)
    await seedCartAndTheme(theme)
    await openCart()
    samples[`cart-${theme}`] = await sampleNativeScrollbar(page, {
      selector: '[data-state="cart-panel-items"]',
      expectedTheme: theme,
      parts: ['r27', 'cart', `1365-${theme}`],
      runDir,
      screenshots,
    })
    await closeCart()
  }

  for (const theme of ['light', 'dark']) {
    await page.viewport(390, 360, false)
    await seedCartAndTheme(theme)
    await openFilter()
    samples[`filter-${theme}`] = await sampleNativeScrollbar(page, {
      selector: '.filter-sheet__body',
      expectedTheme: theme,
      parts: ['r27', 'filter', `390x360-${theme}`],
      runDir,
      screenshots,
    })
    await closeFilter()
  }

  for (const [name, sample] of Object.entries(samples)) {
    markChecks(checks, failures, `${name}.themeApplied`, sample.themeApplied === true, `${name}: 主题未应用`)
    markChecks(checks, failures, `${name}.actualOverflow`, sample.overflow === true,
      `${name}: 未产生实际溢出（scrollHeight=${sample.info.scrollHeight}, clientHeight=${sample.info.clientHeight}）`)
    markChecks(checks, failures, `${name}.nativeScrollbarVisible`, sample.info.scrollbarWidth > 0,
      `${name}: 原生滚动条不可见（width=${sample.info.scrollbarWidth}）`)
    markChecks(checks, failures, `${name}.thumbOpaque`, sample.pixels?.thumb?.[3] === 255,
      `${name}: 滑块像素不是不透明色`)
    const ratioText = sample.ratio === null
      ? '未取到'
      : `${sample.ratioDisplay}（原始 ${sample.ratio.toFixed(6)}）`
    markChecks(checks, failures, `${name}.contrastAtLeast3`, sample.ratio !== null && sample.ratio >= 3,
      `${name}: 滑块/轨道对比度 ${ratioText} < 3:1`)
    if (sample.failureReason) failures.push(`${name}: ${sample.failureReason}`)
  }

  Object.assign(measurements, { samples })
}

// ---------- 主流程 ----------
let browser = null
let preview = null
let fatal = null

try {
  const port = process.env.PREVIEW_PORT ? Number(process.env.PREVIEW_PORT) : await findFreePort(4173)
  if (!Number.isInteger(port) || port <= 0) throw new Error(`PREVIEW_PORT 非法：${process.env.PREVIEW_PORT}`)

  if (!skipBuild) {
    await runBuild()
  } else if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
    throw new Error('--skip-build 需要已有 dist/index.html；先执行 pnpm build')
  }

  preview = await startPreview(port)
  manifest.baseUrl = preview.baseUrl
  console.log('[ui] preview ->', preview.baseUrl)

  manifest.preflight = await preflight(preview.baseUrl)
  console.log('[ui] preflight ok:', JSON.stringify(manifest.preflight))

  browser = await launchBrowser({ headed })
  console.log('[ui] browser ->', basename(browser.executable), `port ${browser.port}`)

  if (shouldRun('F1')) await runCase(
    browser,
    preview.baseUrl,
    { id: 'F1', title: '390px 搜索按钮真实点击', viewport: '390x844', theme: 'light' },
    (page, state) => caseF1(page, preview.baseUrl, state),
  )
  if (shouldRun('R26')) await runCase(
    browser,
    preview.baseUrl,
    { id: 'R26', title: '放大区双轴轨道点击', viewport: '1365x900', theme: 'light' },
    (page, state) => caseR26(page, preview.baseUrl, state),
  )
  if (shouldRun('R27')) await runCase(
    browser,
    preview.baseUrl,
    { id: 'R27', title: '购物车/筛选滚动条对比度', viewport: '1365x900 + 390x360', theme: 'light + dark' },
    (page, state) => caseR27(page, preview.baseUrl, state),
  )
  if (shouldRun('P7-NAV')) await runCase(
    browser,
    preview.baseUrl,
    { id: 'P7-NAV', title: '灵动岛职责、避让与可访问性', viewport: '1365x900 + 390x844', theme: 'light + dark' },
    (page, state) => caseP7Nav(page, preview.baseUrl, { shot, reverse, state }),
  )
  if (shouldRun('P7-PURCHASE')) await runCase(
    browser,
    preview.baseUrl,
    { id: 'P7-PURCHASE', title: '购买三分支、价格二次确认与前端拦截', viewport: '1365x900 + 390x844', theme: 'light + dark' },
    (page, state) => caseP7Purchase(page, preview.baseUrl, { shot, reverse, state }),
  )
  if (shouldRun('P7-MOTION')) await runCase(
    browser,
    preview.baseUrl,
    { id: 'P7-MOTION', title: '岛 / 搜索 / 摘要动效与 reduced-motion', viewport: '1365x900', theme: 'light + reduced' },
    (page, state) => caseP7Motion(page, preview.baseUrl, { shot, state }),
  )
} catch (error) {
  fatal = error instanceof Error ? error.message : String(error)
  manifest.fatalError = fatal
  console.error('[ui] FATAL', fatal)
} finally {
  if (browser) await browser.close()
  if (preview) {
    try { preview.child.kill() } catch {}
    if (process.platform === 'win32' && preview.child.pid) {
      spawnSync('taskkill', ['/PID', String(preview.child.pid), '/T', '/F'], { stdio: 'ignore' })
    }
    await sleep(300)
  }

  manifest.finishedAt = new Date().toISOString()
  const failures = manifest.cases.filter((item) => item.status !== 'pass')
  manifest.summary = {
    total: manifest.cases.length,
    passed: manifest.cases.length - failures.length,
    failed: failures.length,
    fatal: Boolean(fatal),
    artifactDir: runDir,
    manifest: join(runDir, 'manifest.json'),
  }
  const manifestPath = join(runDir, 'manifest.json')
  const latestPath = resolveLatestPath({ start: ROOT, override: process.env.UI_LATEST_PATH })
  try {
    await recordRun({
      suite: 'check-ui',
      latestPath,
      manifestPath,
      manifest,
      kind: classifyRun(manifest.mode),
    })
    console.log('[ui] latest ->', latestPath)
  } catch (error) {
    console.error('[ui] latest.json 更新失败：' + (error instanceof Error ? error.message : String(error)))
    process.exitCode = 1
  }
  console.log('[ui] manifest ->', manifestPath)
  console.log(`[ui] ${manifest.summary.passed}/${manifest.summary.total} passed${fatal ? '; fatal' : ''}`)
  if (fatal || failures.length > 0) process.exitCode = 1
}
