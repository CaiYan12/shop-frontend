/**
 * Playwright 本地 E2E 配置（Phase 8 F3 / E1）。
 *
 * - 固定本机 Chrome：CHROME_PATH 优先，缺失时在加载配置阶段就报明确错误；
 * - 单 worker、retries 0、trace retain-on-failure；
 * - 默认 clean build + vite preview；E2E_REUSE_SERVER=1 复用已有服务，
 *   E2E_SKIP_WEBSERVER=1 完全不启动（供 gate 复用已通过预检的服务）。
 * - 每轮写固定 manifest（e2e/support/manifest-reporter.ts）。
 *
 * 配置文件保持 .mjs：仓库 tsconfig.node 只收 playwright.config.* 本身，
 * 无法把 e2e/ 下的 TS 支撑文件纳入同一个 composite project。
 */
import { defineConfig } from '@playwright/test'
import { resolveChromeExecutable } from './e2e/support/chrome.mjs'
import { createRunContext } from './e2e/support/run-context.mjs'

const { runId } = createRunContext()
process.env.E2E_RUN_ID = runId

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['./e2e/support/manifest-reporter.ts'],
  ],
  projects: [
    {
      name: 'chrome',
      use: (() => {
        const chrome = resolveChromeExecutable()
        return {
          baseURL: process.env.E2E_BASE_URL?.trim() || 'http://127.0.0.1:4173',
          browserName: 'chromium',
          trace: 'retain-on-failure',
          screenshot: 'only-on-failure',
          launchOptions: { executablePath: chrome.executablePath },
        }
      })(),
    },
  ],
  webServer: process.env.E2E_SKIP_WEBSERVER === '1'
    ? undefined
    : {
        command: 'pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort',
        url: process.env.E2E_BASE_URL?.trim() || 'http://127.0.0.1:4173',
        timeout: 300_000,
        reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
        stdout: 'pipe',
        stderr: 'pipe',
      },
})
