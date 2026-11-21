// 零依赖 CDP 驱动：Node 26 自带 fetch + WebSocket。
// 只服务 scripts/acceptance/check-ui.mjs；不引入 Playwright 等新依赖。
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const BROWSER_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

export { sleep }

const CDP_COMMAND_TIMEOUT_MS = 15000

export function resolveBrowserPath() {
  const found = BROWSER_CANDIDATES.find((path) => existsSync(path))
  if (!found) {
    throw new Error('未找到 Chrome / Edge；设置 CHROME_PATH 指向浏览器可执行文件')
  }
  return found
}

export async function findFreePort(start = 4173) {
  for (let port = start; port < start + 80; port++) {
    if (await isPortFree(port)) return port
  }
  throw new Error(`找不到空闲端口（从 ${start} 起）`)
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })
}

export async function waitForHttp(url, { timeoutMs = 30000, intervalMs = 200 } = {}) {
  const start = Date.now()
  let last = null
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (response.ok) return response
      last = `HTTP ${response.status}`
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    await sleep(intervalMs)
  }
  throw new Error(`等待 ${url} 超时（${last ?? '无响应'}）`)
}

export async function launchBrowser({ headed = false } = {}) {
  const executable = resolveBrowserPath()
  const profileDir = mkdtempSync(join(tmpdir(), 'shop-frontend-ui-'))
  const args = [
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--window-size=1365,900',
    'about:blank',
  ]
  if (!headed) args.unshift('--headless=new')
  if (process.platform === 'linux') args.unshift('--no-sandbox', '--disable-dev-shm-usage')

  let proc
  try {
    proc = spawn(executable, args, { stdio: 'ignore', windowsHide: true })
  } catch (error) {
    await removeProfileDir(profileDir)
    throw new Error(`浏览器启动失败：${error instanceof Error ? error.message : String(error)}`)
  }

  let exitCode = null
  let launchError = null
  proc.once('exit', (code) => { exitCode = code })
  proc.once('error', (error) => { launchError = error })

  const portFile = join(profileDir, 'DevToolsActivePort')
  let port = null
  for (let i = 0; i < 120; i++) {
    if (launchError !== null) break
    if (existsSync(portFile)) {
      const [line] = readFileSync(portFile, 'utf8').split(/\r?\n/)
      const candidate = Number(line)
      if (Number.isInteger(candidate) && candidate > 0) {
        port = candidate
        break
      }
    }
    if (exitCode !== null) break
    await sleep(250)
  }

  if (port === null) {
    await cleanupBrowser(proc, profileDir)
    const reason = launchError
      ? (launchError instanceof Error ? launchError.message : String(launchError))
      : `exit=${exitCode ?? 'running'}`
    throw new Error(`浏览器未提供 CDP 端口（${reason}）`)
  }

  return {
    proc,
    port,
    executable,
    profileDir,
    async close() {
      await cleanupBrowser(proc, profileDir)
    },
  }
}

async function cleanupBrowser(proc, profileDir) {
  try { proc?.kill() } catch {}
  if (process.platform === 'win32' && proc?.pid) {
    spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
  }
  await sleep(300)
  await removeProfileDir(profileDir)
}

async function removeProfileDir(profileDir) {
  for (let i = 0; i < 8; i++) {
    try {
      rmSync(profileDir, { recursive: true, force: true })
      return
    } catch {
      await sleep(200)
    }
  }
}

export async function openPage(port, url) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  if (!response.ok) throw new Error(`创建页面失败：HTTP ${response.status}`)
  const info = await response.json()
  const ws = new WebSocket(info.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { ws.close() } catch {}
      reject(new Error('CDP 连接超时'))
    }, 5000)
    ws.onopen = () => {
      clearTimeout(timer)
      resolve()
    }
    ws.onerror = (event) => {
      clearTimeout(timer)
      reject(new Error('CDP 连接失败' + (event?.message ? `：${event.message}` : '')))
    }
  })

  let id = 0
  let closed = false
  const pending = new Map()
  const listeners = []
  const subscriptions = []

  const rejectPending = (error) => {
    for (const [messageId, entry] of pending) {
      clearTimeout(entry.timer)
      entry.reject(error)
      pending.delete(messageId)
    }
  }

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id)
      pending.delete(message.id)
      clearTimeout(entry.timer)
      message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result)
      return
    }
    if (message.method) {
      for (const listener of listeners) listener(message)
      for (const subscription of subscriptions) {
        if (subscription.method !== message.method) continue
        Promise.resolve()
          .then(() => subscription.handler(message.params))
          .catch(() => {})
      }
    }
  }

  ws.onclose = () => {
    if (closed) return
    closed = true
    rejectPending(new Error('CDP 连接已关闭'))
  }
  ws.onerror = (event) => {
    if (closed) return
    closed = true
    rejectPending(new Error('CDP 连接错误' + (event?.message ? `：${event.message}` : '')))
  }

  const send = (method, params = {}) => {
    if (closed) return Promise.reject(new Error('CDP 连接已关闭'))
    return new Promise((resolve, reject) => {
      const messageId = ++id
      const timer = setTimeout(() => {
        pending.delete(messageId)
        reject(new Error(`CDP 命令超时：${method}`))
      }, CDP_COMMAND_TIMEOUT_MS)
      pending.set(messageId, { resolve, reject, timer })
      try {
        ws.send(JSON.stringify({ id: messageId, method, params }))
      } catch (error) {
        clearTimeout(timer)
        pending.delete(messageId)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  const consoleErrors = []
  listeners.push((message) => {
    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
      consoleErrors.push(message.params.type + ': ' + message.params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(' '))
    }
    if (message.method === 'Runtime.exceptionThrown') {
      consoleErrors.push('exception: ' + (message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text))
    }
  })

  const page = {
    send,
    consoleErrors,
    /** 订阅一个 CDP 事件；返回取消订阅函数（验收脚本用于 Fetch 拦截）。 */
    on (method, handler) {
      const entry = { method, handler }
      subscriptions.push(entry)
      return () => {
        const index = subscriptions.indexOf(entry)
        if (index >= 0) subscriptions.splice(index, 1)
      }
    },
    async eval(expression) {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      })
      if (result.exceptionDetails) {
        throw new Error('eval error: ' + (result.exceptionDetails.exception?.description || result.exceptionDetails.text))
      }
      return result.result.value
    },
    async goto(nextUrl) {
      await send('Page.navigate', { url: nextUrl })
      await page.waitFor('document.readyState === "complete"', 20000)
    },
    async waitFor(condition, timeoutMs = 10000) {
      const start = Date.now()
      while (Date.now() - start < timeoutMs) {
        try {
          if (await page.eval(condition)) return true
        } catch (error) {
          if (closed) throw error
        }
        await sleep(200)
      }
      throw new Error('waitFor timeout: ' + condition)
    },
    async viewport(width, height = 900, mobile = width < 600) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile,
      })
    },
    async capture(path, clip) {
      const result = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
        ...(clip ? { clip } : {}),
      })
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, Buffer.from(result.data, 'base64'))
      return result.data
    },
    async shot(path) {
      return page.capture(path)
    },
    async clickXY(x, y) {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
      }
      await sleep(120)
    },
    async clickSelector(selector) {
      const box = await page.eval(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)})
        if (!element) return null
        const rect = element.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return null
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
      })()`)
      if (!box) throw new Error('找不到可点击元素：' + selector)
      await page.clickXY(box.x, box.y)
      return box
    },
    async key(key, code, windowsVirtualKeyCode, text) {
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key,
        code,
        windowsVirtualKeyCode,
        ...(text ? { text } : {}),
      })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode })
    },
    async close() {
      if (!closed) {
        closed = true
        rejectPending(new Error('CDP 连接已关闭'))
      }
      try { ws.close() } catch {}
    },
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Log.enable')
  return page
}
