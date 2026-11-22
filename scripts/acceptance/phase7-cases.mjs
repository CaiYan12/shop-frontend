// Phase 7 验收用例（P7-NAV / P7-PURCHASE / P7-MOTION）。
// 只服务 check-ui.mjs：零依赖 CDP，真实按钮操作 + 可控响应模拟购买三分支。
import { sleep } from './lib.mjs'
import { formatCents, resolvePurchaseFixture } from './fixtures.mjs'

function mark (checks, failures, key, condition, reason) {
  checks[key] = Boolean(condition)
  if (!condition) failures.push(reason)
}

function isIdentity (transform) {
  return transform === 'none' || /^matrix\(1,\s*0,\s*0,\s*1,\s*0,\s*0\)$/.test(transform)
}

function hasIntermediate (samples) {
  return samples.some((sample) => {
    const opacity = Number(sample.opacity)
    const moving = opacity > 0.02 && opacity < 0.98
    return moving || !isIdentity(sample.transform)
  })
}

async function resetPage (page, baseUrl, { width, height, dark = false } = {}) {
  await page.viewport(width, height, width < 600)
  await page.goto(baseUrl + '/')
  await page.eval('(() => { localStorage.clear(); return true })()')
  if (dark) {
    await page.eval('(() => { localStorage.setItem("shop-frontend:theme", "dark"); return true })()')
  }
  await page.goto(baseUrl + '/')
  await page.waitFor(`document.querySelector('[data-state="floating-nav"]') !== null`, 20000)
  if (dark) {
    await page.waitFor(`document.querySelector('.v-theme--dark') !== null`, 10000)
  }
  await sleep(350)
}

async function clickPoint (page, selector) {
  let box = null
  for (let attempt = 0; attempt < 30; attempt++) {
    box = await page.eval('(() => {\n' +
      '  const element = document.querySelector(' + JSON.stringify(selector) + ')\n' +
      '  if (!element) return null\n' +
      '  element.scrollIntoView({ block: "center", inline: "center" })\n' +
      '  const rect = element.getBoundingClientRect()\n' +
      '  if (rect.width === 0 || rect.height === 0) return null\n' +
      '  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }\n' +
      '})()')
    if (box) break
    await sleep(100)
  }
  if (!box) throw new Error('找不到可点击元素：' + selector)
  for (const type of ['mousePressed', 'mouseReleased']) {
    await page.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 })
  }
}

async function clickText (page, selector, text) {
  const box = await page.eval('(() => {\n' +
    '  const nodes = [...document.querySelectorAll(' + JSON.stringify(selector) + ')]\n' +
    '  const target = nodes.find((node) => node.textContent.trim() === ' + JSON.stringify(text) + ')\n' +
    '  if (!target) return null\n' +
    '  target.scrollIntoView({ block: "center", inline: "center" })\n' +
    '  const rect = target.getBoundingClientRect()\n' +
    '  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }\n' +
    '})()')
  if (!box) throw new Error('找不到按钮：' + text)
  for (const type of ['mousePressed', 'mouseReleased']) {
    await page.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 })
  }
}

async function setNativeValue (page, selector, value) {
  const ok = await page.eval('(() => {\n' +
    '  const input = document.querySelector(' + JSON.stringify(selector) + ')\n' +
    '  if (!input) return false\n' +
    '  input.focus()\n' +
    '  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set\n' +
    '  setter.call(input, ' + JSON.stringify(value) + ')\n' +
    '  input.dispatchEvent(new Event("input", { bubbles: true }))\n' +
    '  return true\n' +
    '})()')
  if (!ok) throw new Error('找不到输入框：' + selector)
}

async function sampleStyles (page, selector, durationMs) {
  const expression = 'new Promise((resolve) => {\n' +
    '  const selector = ' + JSON.stringify(selector) + '\n' +
    '  const duration = ' + Number(durationMs) + '\n' +
    '  const samples = []\n' +
    '  const start = performance.now()\n' +
    '  const tick = () => {\n' +
    '    const target = document.querySelector(selector)\n' +
    '    if (target) {\n' +
    '      const style = getComputedStyle(target)\n' +
    '      samples.push({ t: Math.round(performance.now() - start), opacity: style.opacity, transform: style.transform })\n' +
    '    }\n' +
    '    if (performance.now() - start < duration) requestAnimationFrame(tick)\n' +
    '    else resolve(samples)\n' +
    '  }\n' +
    '  requestAnimationFrame(tick)\n' +
    '})'
  return page.eval(expression)
}

async function installPurchaseMock (page, scenario) {
  if (page.__p7Cleanup) {
    page.__p7Cleanup()
    page.__p7Cleanup = null
  }
  const mock = { requests: [], appRequests: 0, sequence: scenario.sequence, prices: scenario.prices, stock: scenario.stock }
  const delayMs = Number(scenario.delayMs ?? 0)
  const buildPayload = (body, index) => {
    const mode = mock.sequence[Math.min(index, mock.sequence.length - 1)]
    const unitPriceCents = mock.prices[Math.min(index + 1, mock.prices.length - 1)]
    const base = {
      product: { slug: body.slug, name: '测试商品' },
      variant: { sku: body.sku, option1Value: 'Lightning', option2Value: '盒装' },
      quantity: body.quantity,
      unitPriceCents,
      subtotalCents: unitPriceCents * body.quantity,
      stock: mock.stock,
      priceChanged: mode !== 'purchasable',
    }
    if (mode === 'insufficient') return { result: 'blocked', reason: 'INSUFFICIENT_STOCK', ...base }
    if (mode === 'price-changed') return { result: 'blocked', reason: 'PRICE_CHANGED', ...base, requestedUnitPriceCents: body.expectedUnitPriceCents }
    return { result: 'purchasable', ...base, priceChanged: false }
  }
  const off = page.on('Fetch.requestPaused', async (params) => {
    try {
      if (!params.request.url.includes('/api/purchase-check') || params.request.method !== 'POST') {
        await page.send('Fetch.continueRequest', { requestId: params.requestId })
        return
      }
      let body = {}
      try { body = JSON.parse(params.request.postData ?? '{}') } catch {}
      // `x-p7-injected` 的请求只用于模拟「页面提前发第二次校验」，不推进应用的响应序列。
      const injected = Boolean(params.request.headers && params.request.headers['x-p7-injected'])
      mock.requests.push(body)
      const appIndex = injected ? mock.appRequests : mock.appRequests++
      if (scenario.rewriteExpectedFromIndex !== undefined &&
        mock.requests.length - 1 === scenario.rewriteExpectedFromIndex &&
        scenario.rewriteExpectedTo !== undefined) {
        body.expectedUnitPriceCents = scenario.rewriteExpectedTo
      }
      if (delayMs > 0) await sleep(delayMs)
      if (Array.isArray(scenario.failAtIndices) && scenario.failAtIndices.includes(mock.requests.length - 1)) {
        await page.send('Fetch.fulfillRequest', {
          requestId: params.requestId,
          responseCode: 500,
          responseHeaders: [{ name: 'content-type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: '服务器错误' } }), 'utf8').toString('base64'),
        })
        return
      }
      const payload = buildPayload(body, appIndex)
      await page.send('Fetch.fulfillRequest', {
        requestId: params.requestId,
        responseCode: 200,
        responseHeaders: [
          { name: 'content-type', value: 'application/json' },
          { name: 'cache-control', value: 'no-store' },
        ],
        body: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'),
      })
    } catch {
      try { await page.send('Fetch.continueRequest', { requestId: params.requestId }) } catch {}
    }
  })
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/purchase-check*', requestStage: 'Request' }] })
  page.__p7Cleanup = () => {
    off()
    page.send('Fetch.disable').catch(() => {})
  }
  return mock
}

/** 轮询 Node 侧记录的购买校验请求条数（Fetch 拦截不写页面全局）。 */
async function waitForRequests (mock, count, timeoutMs = 8000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (mock.requests.length >= count) return true
    await sleep(100)
  }
  throw new Error('等待购买校验请求超时：预期 ' + count + ' 次，实际 ' + mock.requests.length + ' 次')
}
/** 等对话框离开「校验中」，避免在相位切换中途读快照。 */
async function closeDialogIfOpen (page) {
  const box = await page.eval(`(() => {
    const dialog = document.querySelector('[data-state="purchase-dialog"]')
    if (!dialog) return null
    const button = dialog.querySelector('[data-state="purchase-close"], [data-state="purchase-done"], [data-state="purchase-dismiss"]')
    if (!button) return null
    const rect = button.getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  })()`)
  if (box) {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await page.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 })
    }
  }
  await page.waitFor(`document.querySelector('[data-state="purchase-dialog"]') === null`, 5000).catch(() => {})
  await sleep(300)
}

async function requireConfirmButton (page, mock) {
  const state = await page.eval(`(() => {
    const dialog = document.querySelector('[data-state="purchase-dialog"]')
    const button = dialog ? dialog.querySelector('[data-state="purchase-confirm-price"]') : null
    return {
      phase: dialog ? dialog.getAttribute('data-phase') : null,
      hasButton: Boolean(button),
      text: dialog ? dialog.innerText.slice(0, 140) : null,
    }
  })()`)
  if (state.hasButton !== true) {
    throw new Error('confirm missing: ' + JSON.stringify(state) + ' requests=' + mock.requests.length)
  }
}

async function waitForSettledPhase (page) {
  await page.waitFor(`(() => {
    const dialog = document.querySelector('[data-state="purchase-dialog"]')
    if (!dialog) return false
    return dialog.getAttribute('data-phase') !== 'checking'
  })()`, 8000)
  await sleep(200)
}

async function dialogSnapshot (page, mock) {
  const snapshot = await page.eval('(() => {\n' +
    '  const dialog = document.querySelector(\'[data-state="purchase-dialog"]\')\n' +
    '  const text = (selector) => {\n' +
    '    if (!dialog) return null\n' +
    '    const node = dialog.querySelector(selector)\n' +
    '    return node ? node.textContent.trim() : null\n' +
    '  }\n' +
    '  return {\n' +
    '    phase: dialog ? dialog.getAttribute("data-phase") : null,\n' +
    '    oldPrice: text(\'[data-state="purchase-old-price"]\'),\n' +
    '    newPrice: text(\'[data-state="purchase-new-price"]\'),\n' +
    '    stock: text(\'[data-state="purchase-stock"]\'),\n' +
    '    subtotal: text(\'[data-state="purchase-subtotal"]\'),\n' +
    '    notice: text(\'[data-state="purchase-notice"]\'),\n' +
    '    confirmVisible: Boolean(dialog && dialog.querySelector(\'[data-state="purchase-confirm-price"]\')),\n' +
    '    adjustVisible: Boolean(dialog && dialog.querySelector(\'[data-state="purchase-adjust-quantity"]\')),\n' +
    '  }\n' +
    '})()')
  const requests = mock && Array.isArray(mock.requests) ? mock.requests : []
  snapshot.requestCount = requests.length
  snapshot.lastExpected = requests.length > 0 ? requests[requests.length - 1].expectedUnitPriceCents : null
  return snapshot
}

// ---------- P7-NAV：灵动岛职责、避让与可访问性 ----------
export async function caseP7Nav (page, baseUrl, { shot, reverse, state }) {
  const { checks, failures, screenshots, measurements } = state

  await resetPage(page, baseUrl, { width: 1365, height: 900 })
  const collapsed = await page.eval(`(() => {
    const nav = document.querySelector('[data-state="floating-nav"]')
    const toggle = nav.querySelector('[data-state="nav-toggle"]')
    const rect = nav.getBoundingClientRect()
    return {
      visible: true,
      hasPanel: Boolean(nav.querySelector('[data-state="nav-panel"]')),
      pageLabel: nav.querySelector('[data-state="nav-page"]')?.textContent?.trim() ?? null,
      ariaExpanded: toggle?.getAttribute('aria-expanded') ?? null,
      height: Math.round(rect.height),
      top: Math.round(rect.top),
    }
  })()`)
  measurements.collapsed = collapsed
  await shot(page, ['p7-nav', '1365-light', 'collapsed.png'], screenshots)

  await clickPoint(page, '[data-state="nav-toggle"]')
  await page.waitFor(`document.querySelector('[data-state="nav-panel"]') !== null`, 6000)
  await sleep(350)
  const expanded = await page.eval(`(() => {
    const nav = document.querySelector('[data-state="floating-nav"]')
    const panel = nav.querySelector('[data-state="nav-panel"]')
    const toggle = nav.querySelector('[data-state="nav-toggle"]')
    const rect = nav.getBoundingClientRect()
    return {
      items: panel ? panel.querySelectorAll('.floating-nav__item').length : 0,
      homeCurrent: nav.querySelector('[data-state="nav-item-home"]')?.getAttribute('aria-current') ?? null,
      ariaExpanded: toggle?.getAttribute('aria-expanded') ?? null,
      ariaControls: toggle?.getAttribute('aria-controls') ?? null,
      panelId: panel ? panel.id : null,
      height: Math.round(rect.height),
      activeIsHome: document.activeElement === nav.querySelector('[data-state="nav-item-home"]'),
      activeText: document.activeElement ? document.activeElement.textContent.trim().slice(0, 20) : null,
      backdrop: getComputedStyle(nav).backdropFilter || '',
    }
  })()`)

  const geometry = await page.eval(`(() => {
    const rectOf = (selector) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
    }
    const intersects = (a, b) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)
    const nav = rectOf('[data-state="floating-nav"]')
    const input = rectOf('input[role="combobox"]')
    const summary = rectOf('#cart-summary-trigger')
    const inputNode = document.querySelector('input[role="combobox"]')
    const center = input ? { x: input.left + input.width / 2, y: input.top + input.height / 2 } : null
    const hit = center ? document.elementFromPoint(center.x, center.y) : null
    return {
      navInputOverlap: intersects(nav, input),
      navSummaryOverlap: intersects(nav, summary),
      inputCenterHitsInput: Boolean(hit && inputNode && (hit === inputNode || inputNode.contains(hit))),
    }
  })()`)
  measurements.expanded = expanded
  measurements.geometry = geometry
  await shot(page, ['p7-nav', '1365-light', 'expanded.png'], screenshots)

  await setNativeValue(page, 'input[role="combobox"]', 'sony')
  let suggestionsOpen = false
  try {
    await page.waitFor(`document.querySelector('[role="listbox"]') !== null`, 15000)
    suggestionsOpen = true
  } catch {}
  await sleep(250)
  await shot(page, ['p7-nav', '1365-light', 'expanded-search.png'], screenshots)

  // 搜索框内 Esc：只收起联想，不收起岛，焦点留在输入框（独立复审 Spec 2）。
  await page.key('Escape', 'Escape', 27)
  await sleep(320)
  const searchEsc = await page.eval(`(() => {
    const nav = document.querySelector('[data-state="floating-nav"]')
    const input = document.querySelector('input[role="combobox"]')
    return {
      listbox: Boolean(document.querySelector('[role="listbox"]')),
      navPanel: Boolean(nav && nav.querySelector('[data-state="nav-panel"]')),
      focusInInput: document.activeElement === input,
    }
  })()`)

  measurements.searchEsc = searchEsc

  let cartPanelOpened = false
  try {
    await clickPoint(page, '#cart-summary-trigger')
    await page.waitFor(`document.querySelector('[data-state="cart-panel"]') !== null`, 8000)
    cartPanelOpened = true
    await sleep(250)
  } catch {}
  await page.key('Escape', 'Escape', 27)
  await sleep(400)

  await clickPoint(page, '[data-state="nav-toggle"]')
  await sleep(250)
  await page.key('Escape', 'Escape', 27)
  await sleep(320)
  const afterEsc = await page.eval(`(() => {
    const nav = document.querySelector('[data-state="floating-nav"]')
    const active = document.activeElement
    return {
      hasPanel: Boolean(nav.querySelector('[data-state="nav-panel"]')),
      activeIsToggle: active === nav.querySelector('[data-state="nav-toggle"]'),
    }
  })()`)

  measurements.afterEsc = afterEsc

  if (reverse === 'island') {
    await page.eval(`(() => {
      const style = document.createElement('style')
      style.textContent = '[data-state="floating-nav"] { top: auto !important; right: 16px !important; bottom: 16px !important; left: auto !important; transform: none !important; }'
      document.head.append(style)
      return true
    })()`)
    await clickPoint(page, '[data-state="nav-toggle"]')
    await sleep(320)
  }
  const reversed = await page.eval(`(() => {
    const nav = document.querySelector('[data-state="floating-nav"]').getBoundingClientRect()
    const summary = document.querySelector('#cart-summary-trigger').getBoundingClientRect()
    const overlaps = nav.left < summary.right && nav.right > summary.left && nav.top < summary.bottom && nav.bottom > summary.top
    const x = summary.left + summary.width / 2
    const y = summary.top + summary.height / 2
    const hit = document.elementFromPoint(x, y)
    return { overlaps, summaryCenterHitsNav: Boolean(hit && hit.closest('[data-state="floating-nav"]')) }
  })()`)

  measurements.reversed = reversed

  await resetPage(page, baseUrl, { width: 390, height: 844 })
  await clickPoint(page, '[data-state="nav-toggle"]')
  await page.waitFor(`document.querySelector('[data-state="nav-panel"]') !== null`, 6000)
  await sleep(400)
  const narrow = await page.eval(`(() => {
    const nav = document.querySelector('[data-state="floating-nav"]').getBoundingClientRect()
    const input = document.querySelector('input[role="combobox"]').getBoundingClientRect()
    const summary = document.querySelector('#cart-summary-trigger').getBoundingClientRect()
    const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    return {
      withinViewport: nav.left >= 0 && nav.right <= window.innerWidth,
      navInputOverlap: intersects(nav, input),
      navSummaryOverlap: intersects(nav, summary),
      items: document.querySelectorAll('[data-state="nav-panel"] .floating-nav__item').length,
    }
  })()`)
  await shot(page, ['p7-nav', '390-light', 'expanded.png'], screenshots)

  measurements.narrow = narrow

  await resetPage(page, baseUrl, { width: 1365, height: 900, dark: true })
  await clickPoint(page, '[data-state="nav-toggle"]')
  await sleep(350)
  const dark = await page.eval(`(() => {
    const nav = document.querySelector('[data-state="floating-nav"]')
    const style = getComputedStyle(nav)
    const item = nav.querySelector('[data-state="nav-item-home"]')
    const declared = [...document.styleSheets].some((sheet) => {
      try {
        return [...sheet.cssRules].some((rule) => rule.cssText && rule.cssText.includes('backdrop-filter'))
      } catch {
        return false
      }
    })
    return {
      themeDark: Boolean(document.querySelector('.v-theme--dark')),
      backdrop: style.backdropFilter || style.webkitBackdropFilter || 'none',
      backdropDeclared: declared,
      background: style.backgroundColor,
      itemColor: item ? getComputedStyle(item).color : null,
    }
  })()`)
  await shot(page, ['p7-nav', '1365-dark', 'expanded.png'], screenshots)

  measurements.dark = dark

  const fallback = await page.eval(`(() => {
    const style = document.createElement('style')
    style.id = 'p7-fallback'
    style.textContent = '[data-state="floating-nav"] { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; background: rgba(var(--v-theme-surface), 0.96) !important; }'
    document.head.append(style)
    const nav = document.querySelector('[data-state="floating-nav"]')
    const computed = getComputedStyle(nav)
    return { blur: computed.backdropFilter || computed.webkitBackdropFilter || 'none', background: computed.backgroundColor }
  })()`)
  await shot(page, ['p7-nav', '1365-dark', 'fallback.png'], screenshots)
  await page.eval('(() => { const style = document.getElementById("p7-fallback"); if (style) style.remove(); return true })()')
  mark(checks, failures, 'fallbackReadable', fallback.blur === 'none' && /0\.96/.test(fallback.background), '无模糊回退未生效')

  await page.viewport(390, 844, true)
  await page.goto(baseUrl + '/')
  await page.waitFor(`document.querySelector('[data-state="floating-nav"]') !== null`, 20000)
  await clickPoint(page, '[data-state="nav-toggle"]')
  await sleep(350)
  await shot(page, ['p7-nav', '390-dark', 'expanded.png'], screenshots)

  mark(checks, failures, 'collapsedVisible', collapsed.visible === true, '收起态灵动岛不可见')
  mark(checks, failures, 'collapsedNoPanel', collapsed.hasPanel === false, '收起态不应渲染展开面板')
  mark(checks, failures, 'collapsedPageLabel', collapsed.pageLabel === '商品列表', '收起态当前页文案不是「商品列表」')
  mark(checks, failures, 'collapsedAria', collapsed.ariaExpanded === 'false', '收起态 aria-expanded 不是 false')
  mark(checks, failures, 'expandedItems', expanded.items === 3, '展开项不是 3 个')
  mark(checks, failures, 'homeAriaCurrent', expanded.homeCurrent === 'page', '商品列表项缺少 aria-current=page')
  mark(checks, failures, 'expandedAria', expanded.ariaExpanded === 'true', '展开态 aria-expanded 不是 true')
  mark(checks, failures, 'controlsMatchesPanel', Boolean(expanded.panelId) && expanded.ariaControls === expanded.panelId, 'aria-controls 未指向展开面板')
  mark(checks, failures, 'heightStable', Math.abs(expanded.height - collapsed.height) <= 8, '展开后岛高度变化超过 8px')
  mark(checks, failures, 'navInputNoOverlap', geometry.navInputOverlap === false, '展开态岛与搜索输入框重叠')
  mark(checks, failures, 'navSummaryNoOverlap', geometry.navSummaryOverlap === false, '展开态岛与购物车摘要重叠')
  mark(checks, failures, 'inputCenterHitsInput', geometry.inputCenterHitsInput === true, '搜索输入框中心被岛或弹层挡住')
  mark(checks, failures, 'suggestionsOpen', suggestionsOpen === true, '展开态下搜索联想无法打开')
  mark(checks, failures, 'cartPanelOpened', cartPanelOpened === true, '展开态下点击购物车摘要未打开面板')
  mark(checks, failures, 'escClosesPanel', afterEsc.hasPanel === false, 'Esc 未收起导航')
  mark(checks, failures, 'escReturnsFocus', afterEsc.activeIsToggle === true, 'Esc 收起后焦点未回到展开按钮')
  mark(checks, failures, 'islandNotOverSummary', reversed.overlaps === false, '岛遮住了购物车摘要')
  mark(checks, failures, 'summaryCenterNotIsland', reversed.summaryCenterHitsNav === false, '摘要中心命中岛而非摘要')
  mark(checks, failures, 'narrowWithinViewport', narrow.withinViewport === true, '390 下岛超出视口')
  mark(checks, failures, 'narrowNoInputOverlap', narrow.navInputOverlap === false, '390 展开态遮挡搜索输入框')
  mark(checks, failures, 'narrowNoSummaryOverlap', narrow.navSummaryOverlap === false, '390 展开态遮挡购物车摘要')
  mark(checks, failures, 'narrowItems', narrow.items === 3, '390 展开项不是 3 个')
  mark(checks, failures, 'darkTheme', dark.themeDark === true, '暗色主题未生效')
  mark(checks, failures, 'darkBackdrop', /blur\(/.test(dark.backdrop), '玻璃模糊未生效（computed backdropFilter 不是 blur）')
  mark(checks, failures, 'expandFocusesFirstItem', expanded.activeIsHome === true, '展开后焦点没有落在第一个导航项')
  mark(checks, failures, 'lightBackdrop', /blur\(/.test(expanded.backdrop ?? ''), '浅色下玻璃模糊未生效')
  mark(checks, failures, 'searchEscClosesListbox', searchEsc.listbox === false, '搜索框 Esc 未收起联想')
  mark(checks, failures, 'searchEscKeepsNavOpen', searchEsc.navPanel === true, '搜索框 Esc 把导航一起收起了')
  mark(checks, failures, 'searchEscKeepsFocus', searchEsc.focusInInput === true, '搜索框 Esc 后焦点离开了输入框')
  mark(checks, failures, 'darkBackgroundOpaque', /rgba?\(/.test(dark.background) && !/, 0\)$/.test(dark.background), '暗色下岛背景完全透明')

}

// ---------- P7-PURCHASE：购买三分支、二次确认与前端拦截 ----------
export async function caseP7Purchase (page, baseUrl, { shot, reverse, state }) {
  const { checks, failures, screenshots, measurements } = state
  const fixture = await resolvePurchaseFixture(baseUrl)

  await resetPage(page, baseUrl, { width: 1365, height: 900 })
  await page.goto(baseUrl + '/product/apple-earpods')
  await page.waitFor(`document.querySelector('[data-state="purchase"]') !== null`, 20000)
  await sleep(400)
  await clickText(page, '[data-state="option"]', fixture.option1Value)
  await sleep(150)
  await clickText(page, '[data-state="option"]', fixture.option2Value)
  await sleep(200)
  await page.eval('(() => { const input = document.querySelector(\'[data-state="quantity-input"]\'); if (!input) return false; input.scrollIntoView({ block: "center" }); return true })()')
  await sleep(200)
  await setNativeValue(page, '[data-state="quantity-input"]', String(fixture.quantity))
  await sleep(150)
  const archiveBefore = await page.eval('localStorage.getItem("shop-frontend:cart:v1")')
  measurements.archiveBefore = archiveBefore

  let mock = await installPurchaseMock(page, {
    sequence: ['price-changed', 'price-changed', 'purchasable'],
    prices: [fixture.pagePriceCents, fixture.newPriceCents, fixture.finalPriceCents],
    stock: 200,
    // `purchase-price`：保留真实变价流程，只把第二次请求记录的期望价改回旧价，
    // 用来验证 `secondRequestCarriesConfirmedPrice` 能抓到「重发旧价」这类缺陷。
    ...(reverse === 'purchase-price' ? { rewriteExpectedFromIndex: 1, rewriteExpectedTo: fixture.pagePriceCents } : {}),
  })

  await page.eval(`(() => { const button = document.querySelector('[data-state="buy-now"]'); if (button) button.scrollIntoView({ block: 'center' }); return true })()`)
  await sleep(250)
  await clickPoint(page, '[data-state="buy-now"]')
  await page.waitFor(`document.querySelector('[data-state="purchase-dialog"]') !== null`, 8000)
  await waitForSettledPhase(page)
  // 首次请求完成后立刻快照：后面的反向注入与截图场景会替换 `mock`，
  // 末尾断言不能再去读 `mock.requests[0]`（独立复审 P3）。
  const firstRequestPrice = mock.requests.length > 0 ? mock.requests[0].expectedUnitPriceCents : null
  if (reverse === 'purchase') {
    // 反向：首次 PRICE_CHANGED 仍保留，但模拟页面在用户确认前就发出第二次校验请求
    // （期望价直接带新价），让 `confirmationRequired` 抓到「未确认即放行」。
    await page.eval(`fetch('/api/purchase-check', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-p7-injected': '1' },
      body: JSON.stringify({ slug: ${JSON.stringify(fixture.slug)}, sku: ${JSON.stringify(fixture.sku)}, quantity: ${JSON.stringify(fixture.quantity)}, expectedUnitPriceCents: ${JSON.stringify(fixture.newPriceCents)} }),
    }).then((response) => response.status)`)
    await sleep(250)
  }
  const first = await dialogSnapshot(page, mock)
  measurements.first = first
  measurements.firstRequestPrice = firstRequestPrice
  await shot(page, ['p7-purchase', '1365-light', 'price-changed-1.png'], screenshots)
  const dialogA11y = await page.eval(`(() => {
    const dialog = document.querySelector('[role="dialog"]')
    const id = dialog ? dialog.getAttribute('aria-labelledby') : null
    const title = id ? document.getElementById(id) : null
    return {
      hasLabelledBy: Boolean(id),
      titleText: title ? title.textContent.trim() : null,
      sameDialog: dialog === document.querySelector('.v-dialog .purchase-dialog') ? true : Boolean(dialog),
    }
  })()`)
  const islandHit = await page.eval(`(() => {
    const nav = document.querySelector('[data-state="floating-nav"]')
    if (!nav) return null
    const rect = nav.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return {
      blocked: !Boolean(hit && hit.closest('[data-state="floating-nav"]')),
      hitClass: hit && typeof hit.className === 'string' ? hit.className.slice(0, 80) : null,
    }
  })()`)
  // 反向模式或非价格分支：量完遮罩后先关掉对话框，后续步骤才能继续（失败由断言记录，不靠抛错）。
  if (first.confirmVisible === false) {
    await closeDialogIfOpen(page)
  }

  let second = null
  let third = null
  let flowDebug = null
  if (first.confirmVisible) {
    const beforeSecond = mock.requests.length
    await requireConfirmButton(page, mock)
    await clickPoint(page, '[data-state="purchase-confirm-price"]')
    await waitForRequests(mock, beforeSecond + 1)
    await waitForSettledPhase(page)
    second = await dialogSnapshot(page, mock)
    measurements.second = second
    await shot(page, ['p7-purchase', '1365-light', 'price-changed-2.png'], screenshots)

    if (second.confirmVisible) {
      try {
        const beforeThird = mock.requests.length
        await requireConfirmButton(page, mock)
        await clickPoint(page, '[data-state="purchase-confirm-price"]')
        await waitForRequests(mock, beforeThird + 1)
        await page.waitFor(`document.querySelector('[data-phase="purchasable"]') !== null`, 8000)
        await sleep(200)
        third = await dialogSnapshot(page, mock)
        measurements.third = third
        await shot(page, ['p7-purchase', '1365-light', 'purchasable.png'], screenshots)
        await clickPoint(page, '[data-state="purchase-done"]')
        await page.waitFor(`document.querySelector('[data-state="purchase-dialog"]') === null`, 8000)
        await sleep(400)
      } catch (error) {
        flowDebug = await page.eval(`(() => {
          const dialog = document.querySelector('[data-state="purchase-dialog"]')
          return {
            phase: dialog ? dialog.getAttribute('data-phase') : null,
            dialogText: dialog ? dialog.innerText.slice(0, 400) : null,
              }
        })()`)
        flowDebug.error = error instanceof Error ? error.message : String(error)
        await shot(page, ['p7-purchase', '1365-light', 'purchasable-fail.png'], screenshots)
      }
    }
  }

  measurements.flowDebug = flowDebug

  // 已确认新价 → 500 → 重试必须重发新价（复审 Spec 1 回归）。
  await closeDialogIfOpen(page)
  mock = await installPurchaseMock(page, { sequence: ['price-changed', 'price-changed', 'purchasable'], prices: [fixture.pagePriceCents, fixture.newPriceCents, fixture.finalPriceCents], stock: 200, failAtIndices: [1] })
  await clickPoint(page, '[data-state="buy-now"]')
  await waitForSettledPhase(page)
  await requireConfirmButton(page, mock)
  await clickPoint(page, '[data-state="purchase-confirm-price"]')
  await waitForRequests(mock, 2)
  await waitForSettledPhase(page)
  const errorPhase = await page.eval(`(() => { const dialog = document.querySelector('[data-state="purchase-dialog"]'); return dialog ? dialog.getAttribute('data-phase') : null })()`)
  await clickPoint(page, '[data-state="purchase-retry"]')
  await waitForRequests(mock, 3)
  await waitForSettledPhase(page)
  const retry = {
    errorPhase,
    secondExpected: mock.requests[1] ? mock.requests[1].expectedUnitPriceCents : null,
    retryExpected: mock.requests[2] ? mock.requests[2].expectedUnitPriceCents : null,
    phase: await page.eval(`(() => { const dialog = document.querySelector('[data-state="purchase-dialog"]'); return dialog ? dialog.getAttribute('data-phase') : null })()`),
  }
  await closeDialogIfOpen(page)

  measurements.retry = retry

  // 校验中与关闭后迟到响应（D103 / D110）：响应延迟 900ms，先看禁用主操作，再关闭。
  await closeDialogIfOpen(page)
  const purchaseNet = { ids: new Set(), failed: [] }
  await page.send('Network.enable').catch(() => {})
  page.on('Network.requestWillBeSent', (params) => {
    if (params.request && params.request.url && params.request.url.includes('/api/purchase-check')) {
      purchaseNet.ids.add(params.requestId)
    }
  })
  page.on('Network.loadingFailed', (params) => {
    if (purchaseNet.ids.has(params.requestId)) {
      purchaseNet.failed.push({ canceled: params.canceled === true, errorText: params.errorText ?? null })
    }
  })
  mock = await installPurchaseMock(page, { sequence: ['purchasable'], prices: [fixture.pagePriceCents, fixture.pagePriceCents], stock: 200, delayMs: 900 })
  const beforeChecking = mock.requests.length
  await clickPoint(page, '[data-state="buy-now"]')
  await page.waitFor(`document.querySelector('[data-phase="checking"]') !== null`, 5000)
  const checking = await page.eval(`(() => {
    const dialog = document.querySelector('[data-state="purchase-dialog"]')
    const action = dialog ? dialog.querySelector('[data-state="purchase-checking-action"]') : null
    return { phase: dialog ? dialog.getAttribute('data-phase') : null, actionDisabled: action ? action.disabled : false }
  })()`)
  await shot(page, ['p7-purchase', '1365-light', 'checking.png'], screenshots)
  await clickPoint(page, '[data-state="purchase-close"]')
  await page.waitFor(`document.querySelector('[data-state="purchase-dialog"]') === null`, 5000)
  await sleep(1400)
  const afterLate = await page.eval(`(() => ({
    dialogOpen: Boolean(document.querySelector('[data-state="purchase-dialog"]')),
    phase: document.querySelector('[data-phase]') ? document.querySelector('[data-phase]').getAttribute('data-phase') : null,
  }))()`)
  checking.lateRequestCount = mock.requests.length - beforeChecking
  checking.dialogClosedAfterLate = afterLate.dialogOpen === false
  checking.canceled = purchaseNet.failed.some((item) => item.canceled === true)

  // 关闭后立即开始新一轮：上一轮的响应不得改写新对话框。
  mock = await installPurchaseMock(page, { sequence: ['purchasable'], prices: [fixture.finalPriceCents, fixture.finalPriceCents], stock: 200, delayMs: 300 })
  await clickPoint(page, '[data-state="buy-now"]')
  await page.waitFor(`document.querySelector('[data-phase="purchasable"]') !== null`, 8000)
  await sleep(700)
  checking.reopenPhase = await page.eval(`(() => {
    const dialog = document.querySelector('[data-state="purchase-dialog"]')
    return dialog ? dialog.getAttribute('data-phase') : null
  })()`)
  checking.reopenSubtotal = await page.eval(`(() => {
    const node = document.querySelector('[data-state="purchase-subtotal"]')
    return node ? node.textContent.trim() : null
  })()`)
  await closeDialogIfOpen(page)

  const beforeInsufficient = mock.requests.length
  await page.eval(`(() => { const button = document.querySelector('[data-state="buy-now"]'); if (button) button.scrollIntoView({ block: 'center' }); return true })()`)
  await sleep(250)
  measurements.checking = checking

  mock = await installPurchaseMock(page, { sequence: ['insufficient'], prices: [fixture.pagePriceCents], stock: 2 })
  await setNativeValue(page, '[data-state="quantity-input"]', '5')
  await sleep(150)
  const clickInfo = await page.eval(`(() => {
    const button = document.querySelector('[data-state="buy-now"]')
    const rect = button.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return {
      disabled: button.disabled,
      hitIsButton: Boolean(hit && (hit === button || button.contains(hit))),
      hitTag: hit ? hit.tagName : null,
      hitClass: hit && typeof hit.className === 'string' ? hit.className.slice(0, 100) : null,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      dialogPresent: Boolean(document.querySelector('[data-state="purchase-dialog"]')),
    }
  })()`)
  await clickPoint(page, '[data-state="buy-now"]')
  const captureInsufficientState = () => page.eval(`(() => {
    const dialog = document.querySelector('[data-state="purchase-dialog"]')
    const input = document.querySelector('[data-state="quantity-input"]')
    return {
      dialogOpen: Boolean(dialog),
      phase: dialog ? dialog.getAttribute('data-phase') : null,
      dialogText: dialog ? dialog.innerText.slice(0, 300) : null,
      quantityValue: input ? input.value : null,
      activeTag: document.activeElement ? document.activeElement.tagName : null,
    }
  })()`)
  let insufficient = null
  const insufficientDebug = { clickInfo, beforeInsufficient }
  try {
    await page.waitFor(`document.querySelector('[data-phase="insufficient"]') !== null`, 8000)
    await sleep(250)
    insufficient = await dialogSnapshot(page, mock)
    await shot(page, ['p7-purchase', '1365-light', 'insufficient.png'], screenshots)
  } catch {
    insufficientDebug.state1 = { ...(await captureInsufficientState()), requests: mock.requests.length, lastRequest: mock.requests[mock.requests.length - 1] ?? null }
    await sleep(800)
    await clickPoint(page, '[data-state="buy-now"]')
    try {
      await page.waitFor(`document.querySelector('[data-phase="insufficient"]') !== null`, 6000)
      await sleep(250)
      insufficient = await dialogSnapshot(page, mock)
      await shot(page, ['p7-purchase', '1365-light', 'insufficient-retry.png'], screenshots)
    } catch (error2) {
      insufficientDebug.state2 = { ...(await captureInsufficientState()), requests: mock.requests.length, lastRequest: mock.requests[mock.requests.length - 1] ?? null }
      insufficientDebug.error = error2 instanceof Error ? error2.message : String(error2)
      await shot(page, ['p7-purchase', '1365-light', 'insufficient-fail.png'], screenshots)
    }
  }

  measurements.insufficientDebug = insufficientDebug

  let adjusted = null
  if (insufficient !== null) {
    measurements.insufficient = insufficient
    measurements.dialogA11y = dialogA11y
    measurements.islandHit = islandHit

    await clickPoint(page, '[data-state="purchase-adjust-quantity"]')
    await page.waitFor(`document.querySelector('[data-state="purchase-dialog"]') === null`, 8000)
    await sleep(300)
    adjusted = await page.eval(`(() => {
      const input = document.querySelector('[data-state="quantity-input"]')
      return {
        dialogOpen: Boolean(document.querySelector('[data-state="purchase-dialog"]')),
        inputValue: input ? input.value : null,
        focused: document.activeElement === input,
      }
    })()`)
  }

  measurements.adjusted = adjusted

  const beforeOversize = mock.requests.length
  await page.eval(`(() => { const button = document.querySelector('[data-state="buy-now"]'); if (button) button.scrollIntoView({ block: 'center' }); return true })()`)
  await setNativeValue(page, '[data-state="quantity-input"]', '99999')
  await sleep(150)
  await clickPoint(page, '[data-state="buy-now"]')
  await sleep(500)
  const oversize = await page.eval(`(() => ({
    errorVisible: Boolean(document.querySelector('[data-state="quantity-error"]')),
    dialogOpen: Boolean(document.querySelector('[data-state="purchase-dialog"]')),
  }))()`)
  oversize.requestCount = mock.requests.length
  measurements.oversize = oversize

  await page.viewport(390, 844, true)
  await page.eval('(() => { localStorage.setItem("shop-frontend:theme", "dark"); return true })()')
  await page.goto(baseUrl + '/product/apple-earpods')
  await page.waitFor(`document.querySelector('[data-state="purchase"]') !== null`, 20000)
  await sleep(400)
  await clickText(page, '[data-state="option"]', fixture.option1Value)
  await sleep(120)
  await clickText(page, '[data-state="option"]', fixture.option2Value)
  await sleep(150)
  mock = await installPurchaseMock(page, { sequence: ['purchasable'], prices: [fixture.pagePriceCents, fixture.pagePriceCents], stock: 200 })
  await page.eval(`(() => { const button = document.querySelector('[data-state="buy-now"]'); if (button) button.scrollIntoView({ block: 'center' }); return true })()`)
  await sleep(250)
  let narrowDark = null
  const narrowClickInfo = await page.eval(`(() => {
    const button = document.querySelector('[data-state="buy-now"]')
    if (!button) return null
    const rect = button.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return {
      disabled: button.disabled,
      hitIsButton: Boolean(hit && (hit === button || button.contains(hit))),
      hitTag: hit ? hit.tagName : null,
      hitClass: hit && typeof hit.className === 'string' ? hit.className.slice(0, 100) : null,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
    }
  })()`)
  try {
    await clickPoint(page, '[data-state="buy-now"]')
    await page.waitFor(`document.querySelector('[data-phase="purchasable"]') !== null`, 8000)
    await sleep(250)
    narrowDark = await page.eval(`(() => {
    const dialog = document.querySelector('[data-state="purchase-dialog"]')
    if (!dialog) return { visible: false }
    const rect = dialog.getBoundingClientRect()
    return {
      visible: true,
      themeDark: Boolean(document.querySelector('.v-theme--dark')),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      width: Math.round(rect.width),
      withinViewport: rect.left >= 0 && rect.right <= window.innerWidth,
      dialogClass: dialog.className,
      computedMargin: getComputedStyle(dialog).marginLeft,
      hasMatch: document.querySelectorAll('.v-dialog:has(.purchase-dialog)').length,
    }
  })()`)
    await shot(page, ['p7-purchase', '390-dark', 'purchasable.png'], screenshots)
  } catch (error) {
    narrowDark = {
      visible: false,
      error: error instanceof Error ? error.message : String(error),
      clickInfo: narrowClickInfo,
      state: {
        ...(await page.eval(`(() => {
          const dialog = document.querySelector('[data-state="purchase-dialog"]')
          return {
            dialogOpen: Boolean(dialog),
            phase: dialog ? dialog.getAttribute('data-phase') : null,
            dialogText: dialog ? dialog.innerText.slice(0, 300) : null,
          }
        })()`)),
        requests: mock.requests.length,
      },
    }
    await shot(page, ['p7-purchase', '390-dark', 'purchasable-fail.png'], screenshots)
  }

  // 补齐购买关键状态的四组截图：390 浅色可购买、1365 暗色价格变化（D110）。
  let extra390Light = false
  let extra1365Dark = false
  try {
    await page.viewport(390, 844, true)
    await page.eval('(() => { localStorage.removeItem("shop-frontend:theme"); return true })()')
    await page.goto(baseUrl + '/product/apple-earpods')
    await page.waitFor(`document.querySelector('[data-state="purchase"]') !== null`, 20000)
    await sleep(350)
    await clickText(page, '[data-state="option"]', fixture.option1Value)
    await sleep(120)
    await clickText(page, '[data-state="option"]', fixture.option2Value)
    await sleep(150)
    mock = await installPurchaseMock(page, { sequence: ['purchasable'], prices: [fixture.pagePriceCents, fixture.pagePriceCents], stock: 200 })
    await clickPoint(page, '[data-state="buy-now"]')
    await page.waitFor(`document.querySelector('[data-phase="purchasable"]') !== null`, 8000)
    await sleep(200)
    extra390Light = true
    await shot(page, ['p7-purchase', '390-light', 'purchasable.png'], screenshots)
  } catch {}
  try {
    await page.viewport(1365, 900, false)
    await page.eval('(() => { localStorage.setItem("shop-frontend:theme", "dark"); return true })()')
    await page.goto(baseUrl + '/product/apple-earpods')
    await page.waitFor(`document.querySelector('[data-state="purchase"]') !== null`, 20000)
    await sleep(350)
    await clickText(page, '[data-state="option"]', fixture.option1Value)
    await sleep(120)
    await clickText(page, '[data-state="option"]', fixture.option2Value)
    await sleep(150)
    mock = await installPurchaseMock(page, { sequence: ['price-changed'], prices: [fixture.pagePriceCents, fixture.newPriceCents], stock: 200 })
    await clickPoint(page, '[data-state="buy-now"]')
    await page.waitFor(`document.querySelector('[data-phase="price-changed"]') !== null`, 8000)
    await sleep(200)
    extra1365Dark = true
    await shot(page, ['p7-purchase', '1365-dark', 'price-changed.png'], screenshots)
  } catch {}

  measurements.narrowDark = narrowDark
  measurements.extra390Light = extra390Light
  measurements.extra1365Dark = extra1365Dark

  const archiveAfter = await page.eval('localStorage.getItem("shop-frontend:cart:v1")')
  measurements.archiveAfter = archiveAfter

  mark(checks, failures, 'firstResponseIsPriceChanged', first.phase === 'price-changed', '首次校验未停在价格变化分支')
  mark(checks, failures, 'firstRequestCarriesPagePrice', firstRequestPrice === fixture.pagePriceCents, '首次请求的 expectedUnitPriceCents 不是页面展示价')
  mark(checks, failures, 'firstShowsOldAndNewPrice', first.oldPrice === formatCents(fixture.pagePriceCents) && first.newPrice === formatCents(fixture.newPriceCents), '价格变化未并列展示原价与当前价')
  mark(checks, failures, 'confirmationRequired', first.requestCount === 1 && first.confirmVisible === true, '价格变化后未经确认就发出了第二次请求')
  mark(checks, failures, 'secondRequestCarriesConfirmedPrice', second !== null && second.lastExpected === fixture.newPriceCents, '确认后未按用户确认的新价重新校验')
  mark(checks, failures, 'secondStillPriceChanged', second !== null && second.phase === 'price-changed' && second.newPrice === formatCents(fixture.finalPriceCents), '连续变价未再次停在确认分支')
  mark(checks, failures, 'thirdRequestCarriesNewPrice', third !== null && third.lastExpected === fixture.finalPriceCents, '第三次请求未携带刚确认的价格')
  mark(checks, failures, 'successSubtotal', third !== null && third.subtotal === formatCents(fixture.finalPriceCents * fixture.quantity), '成功态小计不是 ¥278.00')
  mark(checks, failures, 'successNotice', Boolean(third && third.notice && third.notice.includes('不会生成订单')), '成功态未说明不会生成订单')
  mark(checks, failures, 'insufficientShowsStock', insufficient !== null && insufficient.phase === 'insufficient' && insufficient.stock === '2', '库存不足未按响应库存展示')
  mark(checks, failures, 'insufficientOffersAdjust', insufficient !== null && insufficient.adjustVisible === true, '库存不足未提供调整数量入口')
  mark(checks, failures, 'adjustReturnsFocus', adjusted !== null && adjusted.dialogOpen === false && adjusted.inputValue === '5' && adjusted.focused === true, '调整数量未关闭对话框 / 保留原输入 / 回焦数量输入')
  mark(checks, failures, 'oversizeBlockedNoRequest', oversize.requestCount === beforeOversize, '页面已知超库存数量仍发出了购买校验请求')
  mark(checks, failures, 'oversizeInlineError', oversize.errorVisible === true && oversize.dialogOpen === false, '超库存数量未给行内提示或仍打开了对话框')
  mark(checks, failures, 'narrowDarkVisible', narrowDark !== null && narrowDark.visible === true && narrowDark.withinViewport === true, '390 暗色下购买对话框超出视口')
  mark(checks, failures, 'narrowDarkTheme', narrowDark !== null && narrowDark.themeDark === true, '390 暗色主题未生效')
  mark(checks, failures, 'narrowDarkMargin', narrowDark !== null && narrowDark.left >= 16 && narrowDark.right <= 390 - 16 + 1, '390 下购买对话框左右不足 16px')
  mark(checks, failures, 'checkingDisabledAction', checking.phase === 'checking' && checking.actionDisabled === true, '校验中未显示禁用的主操作')
  mark(checks, failures, 'lateResponseDropped', checking.dialogClosedAfterLate === true && checking.lateRequestCount === 1, '关闭后迟到响应仍改写了界面')
  mark(checks, failures, 'islandBlockedByDialog', islandHit !== null && islandHit.blocked === true, '购买对话框打开时背景灵动岛仍可交互')
  mark(checks, failures, 'cartArchiveUnchanged', archiveAfter === archiveBefore, '购买校验改动了购物车存档')
  mark(checks, failures, 'fourScreenshotGroups', extra390Light === true && extra1365Dark === true, '购买关键状态截图不足四组')
  mark(checks, failures, 'retryKeepsConfirmedPrice', retry.errorPhase === 'error' && retry.secondExpected === fixture.newPriceCents && retry.retryExpected === fixture.newPriceCents, '重试没有复用刚确认的新价')
  mark(checks, failures, 'retryRecovers', retry.phase === 'purchasable', '重试后未回到可购买')
  mark(checks, failures, 'dialogAccessibleName', dialogA11y.hasLabelledBy === true && dialogA11y.titleText === '模拟购买校验', '购买对话框缺少可访问名称')
  mark(checks, failures, 'lateResponseCanceled', checking.canceled === true, '关闭在途校验后没有观察到请求取消')
  mark(checks, failures, 'reopenIsolation', checking.reopenPhase === 'purchasable' && checking.reopenSubtotal === formatCents(fixture.finalPriceCents * fixture.quantity), '关闭后立即重开时旧响应改写了新对话框')

  measurements.consoleErrors = page.consoleErrors.slice(-5)
}

// ---------- P7-MOTION：三处动效与 reduced-motion ----------
export async function caseP7Motion (page, baseUrl, { shot, state }) {
  const { checks, failures, screenshots, measurements } = state
  const fixture = await resolvePurchaseFixture(baseUrl)

  await page.send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  await resetPage(page, baseUrl, { width: 1365, height: 900 })
  await page.goto(baseUrl + '/')
  await page.waitFor(`document.querySelector('[data-state="floating-nav"]') !== null`, 20000)
  await sleep(300)

  await clickPoint(page, '[data-state="nav-toggle"]')
  const enterShot = shot(page, ['p7-motion', '1365-light', 'nav-enter-mid.png'], screenshots)
  const enterSamples = await sampleStyles(page, '[data-state="nav-panel"]', 420)
  const enterIntermediate = hasIntermediate(enterSamples)
  measurements.enterSamples = enterSamples.length
  await enterShot
  await sleep(250)
  await shot(page, ['p7-motion', '1365-light', 'nav-enter-final.png'], screenshots)

  await clickPoint(page, '[data-state="nav-toggle"]')
  const leaveShot = shot(page, ['p7-motion', '1365-light', 'nav-leave-mid.png'], screenshots)
  const leaveSamples = await sampleStyles(page, '[data-state="nav-panel"]', 260)
  const leaveIntermediate = hasIntermediate(leaveSamples)
  measurements.leaveSamples = leaveSamples.length
  await leaveShot

  const listSamplesPromise = sampleStyles(page, '[role="listbox"]', 900)
  await setNativeValue(page, 'input[role="combobox"]', 'sony')
  await page.eval(`new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (document.querySelector('[role="listbox"]')) {
        observer.disconnect()
        resolve(true)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => resolve(false), 4000)
  })`)
  const searchShot = shot(page, ['p7-motion', '1365-light', 'search-enter-mid.png'], screenshots)
  const listSamples = await listSamplesPromise
  const listIntermediate = hasIntermediate(listSamples)
  measurements.listSamples = listSamples.length
  await searchShot
  await shot(page, ['p7-motion', '1365-light', 'search-enter.png'], screenshots)

  await clearCartThenAdd(page, baseUrl, fixture)
  const pulseShot = shot(page, ['p7-motion', '1365-light', 'summary-pulse-mid.png'], screenshots)
  const pulseSamples = await sampleStyles(page, '[data-state="cart-summary-figures"]', 320)
  const pulseSeen = pulseSamples.some((sample) => !isIdentity(sample.transform))
  measurements.pulseSamples = pulseSamples.length
  await pulseShot
  await shot(page, ['p7-motion', '1365-light', 'summary-pulse.png'], screenshots)

  await page.send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await resetPage(page, baseUrl, { width: 1365, height: 900 })
  await page.goto(baseUrl + '/')
  await page.waitFor(`document.querySelector('[data-state="floating-nav"]') !== null`, 20000)
  await sleep(250)
  await clickPoint(page, '[data-state="nav-toggle"]')
  const reducedFocus = await page.eval(`(() => {
    const nav = document.querySelector('[data-state="floating-nav"]')
    return { activeIsHome: Boolean(nav) && document.activeElement === nav.querySelector('[data-state="nav-item-home"]') }
  })()`)
  const reducedEnter = await sampleStyles(page, '[data-state="nav-panel"]', 260)
  const reducedInstant = reducedEnter.length > 0 && reducedEnter.every((sample) => sample.opacity === '1' && isIdentity(sample.transform))
  measurements.reducedEnter = reducedEnter.length
  await shot(page, ['p7-motion', '1365-reduced', 'nav-enter.png'], screenshots)

  await setNativeValue(page, 'input[role="combobox"]', 'sony')
  const reducedList = await sampleStyles(page, '[role="listbox"]', 900)
  const reducedListInstant = reducedList.length > 0 && reducedList.every((sample) => sample.opacity === '1' && isIdentity(sample.transform))

  await clearCartThenAdd(page, baseUrl, fixture)
  const reducedPulse = await sampleStyles(page, '[data-state="cart-summary-figures"]', 320)
  const reducedPulseSeen = reducedPulse.some((sample) => !isIdentity(sample.transform))
  const reducedFunctional = await page.eval(`(() => ({
    cartQuantity: document.querySelector('[data-state="cart-summary-figures"]')?.textContent?.trim() ?? '',
    snackbar: Boolean(document.querySelector('[data-state="add-success"]')),
  }))()`)

  await page.send('Emulation.setEmulatedMedia', { media: '', features: [] })

  mark(checks, failures, 'navEnterAnimates', enterIntermediate, '岛展开没有可观察的中间帧')
  mark(checks, failures, 'navLeaveAnimates', leaveIntermediate, '岛收起没有可观察的中间帧')
  mark(checks, failures, 'searchAnimates', listIntermediate, '搜索联想显隐没有可观察的中间帧')
  mark(checks, failures, 'summaryPulse', pulseSeen, '成功加购后摘要数字没有强调动画')
  mark(checks, failures, 'reducedNavInstant', reducedInstant, 'reduced-motion 下岛展开仍有中间帧')
  mark(checks, failures, 'reducedSearchInstant', reducedListInstant, 'reduced-motion 下搜索联想仍有动画')
  mark(checks, failures, 'reducedNoPulse', reducedPulseSeen === false, 'reduced-motion 下摘要仍有强调动画')
  mark(checks, failures, 'reducedFunctional', /1 件/.test(reducedFunctional.cartQuantity), 'reduced-motion 下加购功能未照常生效')
  mark(checks, failures, 'reducedFocusFirstItem', reducedFocus.activeIsHome === true, 'reduced-motion 下展开后焦点没有落在第一个导航项')

  measurements.reducedList = reducedList.length
  measurements.reducedPulse = reducedPulse.length
  measurements.reducedFunctional = reducedFunctional
}

/** 在详情页选规格并加购一次，用于摘要强调测量。 */
async function clearCartThenAdd (page, baseUrl, fixture) {
  await page.goto(baseUrl + '/product/apple-earpods')
  await page.waitFor(`document.querySelector('[data-state="add-to-cart"]') !== null`, 20000)
  await sleep(400)
  await clickText(page, '[data-state="option"]', fixture.option1Value)
  await sleep(150)
  await clickText(page, '[data-state="option"]', fixture.option2Value)
  await sleep(200)
  await clickPoint(page, '[data-state="add-to-cart"]')
}