/**
 * 本机 Chrome 探测（E1）。
 *
 * 优先级：
 * 1. 显式 CHROME_PATH；
 * 2. Windows / macOS / Linux 的常见安装位置。
 *
 * 本仓库的 E2E 固定使用本机 Chrome，不下载 Playwright 自带 Chromium；
 * 找不到时报出已检查的路径，避免只看到 Playwright 的默认报错。
 */
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

function windowsCandidates () {
  const candidates = []
  const programFiles = process.env.PROGRAMFILES
  const programFilesX86 = process.env['PROGRAMFILES(X86)']
  const localAppData = process.env.LOCALAPPDATA
  if (programFiles) candidates.push(join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'))
  if (programFilesX86) candidates.push(join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'))
  if (localAppData) candidates.push(join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'))
  return candidates
}

/** 返回按优先级排列的候选路径；便于报错与测试复用。 */
export function chromeCandidates () {
  const list = []
  const explicit = process.env.CHROME_PATH?.trim()
  if (explicit !== undefined && explicit !== '') list.push(explicit)
  if (process.platform === 'win32') {
    list.push(...windowsCandidates())
  } else if (process.platform === 'darwin') {
    list.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  } else {
    list.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser')
  }
  return [...new Set(list)]
}

function assertUsableFile (path) {
  if (!existsSync(path)) {
    throw new Error('找不到浏览器可执行文件：' + path)
  }
  if (!statSync(path).isFile()) {
    throw new Error('浏览器路径不是文件：' + path)
  }
}

export function resolveChromeExecutable () {
  const explicit = process.env.CHROME_PATH?.trim()
  if (explicit !== undefined && explicit !== '') {
    try {
      assertUsableFile(explicit)
    } catch (error) {
      throw new Error('CHROME_PATH 指向的浏览器不可用：' + explicit + '\n' + (error instanceof Error ? error.message : String(error)))
    }
    return { executablePath: explicit, source: 'CHROME_PATH' }
  }

  const found = chromeCandidates().find((candidate) => existsSync(candidate))
  if (found === undefined) {
    const checked = chromeCandidates().map((candidate) => '  - ' + candidate).join('\n')
    throw new Error(
      '未找到本机 Chrome；E2E 固定使用本机 Chrome，不下载 Playwright 自带 Chromium。\n' +
      '请安装 Google Chrome，或设置 CHROME_PATH 指向 chrome.exe。\n' +
      '已检查：\n' + checked,
    )
  }
  assertUsableFile(found)
  return { executablePath: found, source: 'auto' }
}
