// P7-ES：Elasticsearch 不可用时的降级与恢复实机复验（C39 / C66 / D110）。
// 独立入口，不并入 check:ui；前置：后端已在 127.0.0.1:3001 运行，ES 由本轮 es-dev.mjs 启动。
import { execFileSync, spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findFreePort, launchBrowser, openPage, sleep, waitForHttp } from './lib.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BACKEND_ROOT = resolve(ROOT, '..', 'shop-backend')
const ES_URL = 'http://127.0.0.1:9201/'

const argv = process.argv.slice(2)
const hasFlag = (name) => argv.includes(name)
const valueOf = (name, fallback = null) => {
  const index = argv.indexOf(name)
  if (index >= 0) return argv[index + 1] ?? fallback
  const prefix = name + '='
  const match = argv.find((item) => item.startsWith(prefix))
  return match ? match.slice(prefix.length) : fallback
}

const skipBuild = hasFlag('--skip-build')
const headed = hasFlag('--headed')
const runId = valueOf('--run-id') ?? new Date().toISOString().replace(/[:.]/g, '-')
const artifactRoot = process.env.UI_ARTIFACT_DIR
  ? resolve(process.env.UI_ARTIFACT_DIR)
  : resolve(ROOT, '..', 'session-tmp', 'ui-acceptance')
const runDir = join(artifactRoot, runId + '-p7es')
mkdirSync(runDir, { recursive: true })

const manifest = {
  runId,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  kind: 'p7-es',
  commit: readCommit(),
  mode: { build: skipBuild ? 'skipped' : 'clean-build', browser: headed ? 'headed' : 'headless' },
  baseUrl: null,
  checks: {},
  measurements: {},
  screenshots: [],
  fatalError: null,
}

function readCommit () {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function rel (path) {
  return relative(runDir, path).split(sep).join('/')
}

async function runStep (command, args, logPath, timeoutMs) {
  const fd = openSync(logPath, 'a')
  const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', fd, fd], windowsHide: true })
  closeSync(fd)
  const code = await new Promise((resolveCode) => {
    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      resolveCode('timeout')
    }, timeoutMs)
    child.once('exit', (exitCode) => {
      clearTimeout(timer)
      resolveCode(exitCode)
    })
    child.once('error', () => {
      clearTimeout(timer)
      resolveCode('error')
    })
  })
  if (code !== 0) throw new Error(command + ' ' + args.join(' ') + ' 失败（' + code + '）；日志：' + rel(logPath))
}

async function startPreview (port) {
  const logPath = join(runDir, 'preview.log')
  const viteCli = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  if (!existsSync(viteCli)) throw new Error('找不到 vite CLI；先执行 pnpm install')
  const fd = openSync(logPath, 'a')
  const child = spawn(process.execPath, [viteCli, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  })
  closeSync(fd)
  const baseUrl = 'http://127.0.0.1:' + port
  await waitForHttp(baseUrl + '/', { timeoutMs: 30000 })
  return { child, baseUrl, logPath }
}

async function esReachable () {
  try {
    const response = await fetch(ES_URL, { signal: AbortSignal.timeout(1500) })
    return response.ok
  } catch {
    return false
  }
}

async function waitForEs (up, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await esReachable() === up) return true
    await sleep(500)
  }
  return false
}

async function shot (page, parts) {
  const path = join(runDir, ...parts)
  await page.shot(path)
  manifest.screenshots.push(rel(path))
  return path
}

function mark (key, condition, reason) {
  manifest.checks[key] = Boolean(condition)
  if (!condition) {
    manifest.measurements[key + 'Reason'] = reason
    manifest.failed = true
    console.error('[p7-es] FAIL ' + key + '：' + reason)
  }
}

async function clickByText (page, scopeSelector, text) {
  const box = await page.eval('(() => {\n' +
    '  const scope = document.querySelector(' + JSON.stringify(scopeSelector) + ')\n' +
    '  if (!scope) return null\n' +
    '  const nodes = [...scope.querySelectorAll("button")]\n' +
    '  const target = nodes.find((node) => node.textContent.trim() === ' + JSON.stringify(text) + ')\n' +
    '  if (!target) return null\n' +
    '  const rect = target.getBoundingClientRect()\n' +
    '  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }\n' +
    '})()')
  if (!box) throw new Error('找不到按钮：' + text)
  for (const type of ['mousePressed', 'mouseReleased']) {
    await page.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 })
  }
}

async function cardCount (page) {
  return page.eval('document.querySelectorAll(\'a[href^="/product/"]\').length')
}

let browser = null
let preview = null

try {
  if (skipBuild) {
    if (!existsSync(join(ROOT, 'dist', 'index.html'))) throw new Error('--skip-build 需要已有 dist/index.html')
  } else {
    await runStep(process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm',
      process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm build'] : ['build'],
      join(runDir, 'build.log'), 180000)
  }

  const port = process.env.PREVIEW_PORT ? Number(process.env.PREVIEW_PORT) : await findFreePort(4173)
  preview = await startPreview(port)
  manifest.baseUrl = preview.baseUrl
  console.log('[p7-es] preview ->', preview.baseUrl)

  const baselineResponse = await fetch(preview.baseUrl + '/api/products/suggestions?q=sony', { signal: AbortSignal.timeout(5000) })
  if (!baselineResponse.ok) throw new Error('前置失败：ES 在线时联想接口不是 200；先启动后端与 ES')
  const esOnlineAtStart = await esReachable()
  if (!esOnlineAtStart) throw new Error('前置失败：127.0.0.1:9201 不可达；先由本轮 es-dev.mjs 启动 ES')

  browser = await launchBrowser({ headed })
  const page = await openPage(browser.port, preview.baseUrl + '/?keyword=sony')
  await page.viewport(1365, 900, false)
  await page.waitFor(`document.querySelectorAll('a[href^="/product/"]').length > 0`, 20000)
  const baselineCards = await cardCount(page)
  mark('baselineKeywordWorks', baselineCards > 0, 'ES 在线时关键词搜索没有结果')

  await runStep(process.execPath, [join(BACKEND_ROOT, 'scripts', 'es-stop.mjs')], join(runDir, 'es-stop.log'), 60000)
  const stopped = await waitForEs(false, 30000)
  mark('esStopped', stopped, 'es-stop 之后 9201 仍然可达')

  await page.goto(preview.baseUrl + '/?keyword=sony')
  await page.waitFor(`document.querySelector('[data-state="search-unavailable"]') !== null`, 20000)
  const degraded = await page.eval(`(() => {
    const card = document.querySelector('[data-state="search-unavailable"]')
    const text = card ? card.textContent : ''
    return {
      message: text.includes('搜索服务暂时不可用，请稍后重试。'),
      hasRetry: text.includes('重试'),
      hasClear: text.includes('清除关键词'),
    }
  })()`)
  await shot(page, ['p7-es', 'degraded-1365-light.png'])
  mark('degradedShowsUnavailable', true, '')
  mark('degradedMessage', degraded.message === true, '503 降级文案不匹配 C39 固定文案')
  mark('degradedHasRetry', degraded.hasRetry === true, '503 降级没有重试入口')
  mark('degradedHasClearKeyword', degraded.hasClear === true, '503 降级没有清除关键词入口')

  await clickByText(page, '[data-state="search-unavailable"]', '清除关键词')
  await page.waitFor(`document.querySelectorAll('a[href^="/product/"]').length > 0`, 20000)
  const plainCards = await cardCount(page)
  const plainKeyword = await page.eval('new URLSearchParams(location.search).get("keyword")')
  await shot(page, ['p7-es', 'plain-browsing-1365-light.png'])
  mark('plainBrowsingWorks', plainCards > 0 && plainKeyword === null, 'ES 不可用时普通浏览不可用')

  await page.goto(preview.baseUrl + '/?keyword=sony')
  await page.waitFor(`document.querySelector('[data-state="search-unavailable"]') !== null`, 20000)

  await runStep(process.execPath, [join(BACKEND_ROOT, 'scripts', 'es-dev.mjs')], join(runDir, 'es-dev.log'), 180000)
  const restored = await waitForEs(true, 60000)
  mark('esRestored', restored, 'es-dev 之后 9201 仍不可达')

  await sleep(7000)
  let recoveredCards = 0
  for (let attempt = 0; attempt < 3; attempt++) {
    await clickByText(page, '[data-state="search-unavailable"]', '重试').catch(() => {})
    try {
      await page.waitFor(`document.querySelector('[data-state="search-unavailable"]') === null`, 12000)
      await page.waitFor(`document.querySelectorAll('a[href^="/product/"]').length > 0`, 12000)
      recoveredCards = await cardCount(page)
      break
    } catch {
      await sleep(6000)
    }
  }
  const recoveredKeyword = await page.eval('new URLSearchParams(location.search).get("keyword")')
  await shot(page, ['p7-es', 'recovered-1365-light.png'])
  mark('retryRecovers', recoveredCards > 0, '恢复 ES 并等待冷却后，原页面重试仍未成功')
  mark('retryKeywordPreserved', recoveredKeyword === 'sony', '重试后关键词丢失')

  manifest.measurements = Object.assign(manifest.measurements, {
    baselineCards,
    plainCards,
    recoveredCards,
    recoveredKeyword,
    attempts: 3,
  })
} catch (error) {
  manifest.fatalError = error instanceof Error ? error.message : String(error)
  console.error('[p7-es] FATAL', manifest.fatalError)
} finally {
  if (browser) await browser.close()
  if (preview) {
    try { preview.child.kill() } catch {}
    await sleep(300)
  }
  manifest.finishedAt = new Date().toISOString()
  const failedChecks = Object.entries(manifest.checks).filter(([, value]) => value !== true)
  manifest.summary = {
    total: Object.keys(manifest.checks).length,
    passed: Object.keys(manifest.checks).length - failedChecks.length,
    failed: failedChecks.length,
    fatal: Boolean(manifest.fatalError),
    artifactDir: runDir,
  }
  writeFileSync(join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log('[p7-es] manifest ->', join(runDir, 'manifest.json'))
  console.log('[p7-es] ' + manifest.summary.passed + '/' + manifest.summary.total + ' checks passed' + (manifest.fatalError ? '; fatal' : ''))
  if (manifest.fatalError || failedChecks.length > 0) process.exitCode = 1
}
