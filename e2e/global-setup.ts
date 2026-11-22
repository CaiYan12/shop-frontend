/**
 * 全局前置：解析本机 Chrome，启动一次并记录实际浏览器版本（E1）。
 *
 * 版本写入 <runDir>/browser.json，由 manifest reporter 合并进固定 manifest；
 * 浏览器缺失时这里直接抛出明确错误，不再进入用例。
 */
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveChromeExecutable } from './support/chrome.mjs'
import { resolveRunContext } from './support/run-context.mjs'

export default async function globalSetup (): Promise<void> {
  const { runDir } = resolveRunContext()
  const chrome = resolveChromeExecutable()
  const browser = await chromium.launch({ executablePath: chrome.executablePath })
  try {
    const version = browser.version()
    const info = {
      name: 'chromium',
      executablePath: chrome.executablePath,
      source: chrome.source,
      version,
      probedAt: new Date().toISOString(),
    }
    writeFileSync(join(runDir, 'browser.json'), JSON.stringify(info, null, 2) + '\n', 'utf8')
    console.log('[e2e] Chrome ' + version + '（' + chrome.source + '）：' + chrome.executablePath)
  } finally {
    await browser.close()
  }
}
