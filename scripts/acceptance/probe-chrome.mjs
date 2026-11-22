#!/usr/bin/env node
/**
 * 最小 Chrome 探测（E1）：不需要后端 / ES / 预览服务。
 *
 * 用法：node scripts/acceptance/probe-chrome.mjs
 * 输出一行 JSON（路径、来源、实际版本）；找不到 Chrome 时以非零码退出并打印明确错误。
 */
import { chromium } from '@playwright/test'
import { resolveChromeExecutable } from '../../e2e/support/chrome.mjs'

const chrome = resolveChromeExecutable()
const browser = await chromium.launch({ executablePath: chrome.executablePath })
try {
  console.log(JSON.stringify({
    name: 'chromium',
    executablePath: chrome.executablePath,
    source: chrome.source,
    version: browser.version(),
    probedAt: new Date().toISOString(),
  }, null, 2))
} finally {
  await browser.close()
}
