#!/usr/bin/env node
/**
 * verify:e2e 的 latest.json 写点（CaiYan12/shop-frontend#33，G5）。
 *
 * 顺序：跑 Playwright →（无论成败）先落固定 e2e manifest → 再按 suite=verify-e2e 更新 latest.json。
 * - 不带参数算全量，写 lastFull + lastRun；带 spec 路径 / --grep / --project 等参数算定向，只写 lastRun。
 * - Playwright 崩溃、配置加载失败或被中止时补一份 wrapper fallback manifest，
 *   保证 <E2E_ARTIFACT_DIR>/<runId>/manifest.json 这个固定证据路径始终存在。
 * - latest.json 更新失败只打印错误、不改写 Playwright 的退出码：指针是调试入口，
 *   不反向阻塞 gate（gate 也不经过本包装器，直接调 playwright test）。
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultLatestPath, recordRun } from './latest.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
export const REPO_ROOT = resolve(HERE, '..', '..')
export const E2E_SUITE = 'verify-e2e'

/** 只有不带任何参数才是全量；任何选择子集（spec / --grep / --project / --last-failed）都算定向。 */
export function classifyE2eArgs (args) {
  return Array.isArray(args) && args.length > 0 ? 'targeted' : 'full'
}

/** 与 e2e/support/run-context.mjs 保持同一证据根；E2E_ARTIFACT_DIR 可覆盖。 */
export function e2eArtifactRoot () {
  const fromEnv = process.env.E2E_ARTIFACT_DIR?.trim()
  return fromEnv ? resolve(fromEnv) : resolve(REPO_ROOT, '..', 'session-tmp', 'e2e-acceptance')
}

/** 默认与 check:ui / check:es 共用同一个 latest.json，四个入口各合并自己的 suite。 */
export function e2eLatestPath () {
  const fromEnv = process.env.E2E_LATEST_PATH?.trim()
  if (fromEnv) return resolve(fromEnv)
  return defaultLatestPath(resolve(REPO_ROOT, '..', 'session-tmp', 'ui-acceptance'))
}

function messageOf (error) {
  return error instanceof Error ? error.message : String(error)
}

function readJson (path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function isPlainObject (value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readCommit () {
  try {
    const { execFileSync } = require('node:child_process')
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
    const branch = execFileSync('git', ['branch', '--show-current'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
    return { sha: sha || null, branch: branch || null }
  } catch {
    return { sha: null, branch: null }
  }
}

function emptySuite () {
  return { total: 0, passed: 0, failed: 0, skipped: 0, tests: [] }
}

/** 由 suites / failures 汇总 summary；status 不是 passed 但没有任何失败用例时记为 fatal。 */
export function summarizeE2eManifest (manifest) {
  const doc = isPlainObject(manifest) ? manifest : {}
  const suites = isPlainObject(doc.suites) ? doc.suites : {}
  const rows = ['business', 'theme', 'other']
    .map((key) => suites[key])
    .filter((row) => isPlainObject(row))
  const total = rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0)
  const passed = rows.reduce((sum, row) => sum + Number(row.passed ?? 0), 0)
  const failedTests = rows.reduce((sum, row) => sum + Number(row.failed ?? 0), 0)
  const failureList = Array.isArray(doc.failures) ? doc.failures.length : 0
  const failed = Math.max(failedTests, failureList)
  const statusOk = doc.status === 'passed'
  const fatal = !statusOk && failed === 0
  return { total, passed, failed, fatal, status: statusOk && failed === 0 ? 'pass' : 'fail' }
}

/** Playwright 没留下 reporter manifest 时的固定 manifest，字段与 reporter 输出保持同构。 */
export function buildFallbackManifest ({ runId, runDir, result = {}, startedAt = null, finishedAt = null }) {
  const started = startedAt ?? new Date().toISOString()
  const finished = finishedAt ?? new Date().toISOString()
  const startedMs = Date.parse(started)
  const finishedMs = Date.parse(finished)
  const browser = readJson(join(runDir, 'browser.json'))
  return {
    schema: 'shop-frontend-e2e-manifest/v1',
    runId,
    startedAt: started,
    finishedAt: finished,
    durationMs: Number.isFinite(startedMs) && Number.isFinite(finishedMs) ? Math.max(0, finishedMs - startedMs) : null,
    status: 'failed',
    command: 'pnpm verify:e2e',
    commit: readCommit(),
    environment: {
      node: process.version,
      platform: process.platform,
      cwd: process.cwd(),
      baseURL: process.env.E2E_BASE_URL?.trim() || null,
    },
    browser: isPlainObject(browser) ? browser : { name: 'chromium', version: null },
    backend: {
      head: process.env.E2E_BACKEND_HEAD?.trim() || null,
      worktree: process.env.E2E_BACKEND_WORKTREE?.trim() || null,
    },
    config: null,
    expectedTests: null,
    suites: { business: emptySuite(), theme: emptySuite(), other: emptySuite() },
    failures: [],
    evidenceSource: 'wrapper-fallback',
    fallback: {
      reason: 'Playwright 未留下 reporter manifest（配置加载失败 / 崩溃 / 被中止）',
      exitCode: result.exitCode ?? null,
      signal: result.signal ?? null,
      timedOut: Boolean(result.timedOut),
      error: result.error ?? null,
    },
    artifacts: { manifest: 'manifest.json', browser: 'browser.json', runDir },
  }
}

/**
 * Playwright 结束后的收尾：读 reporter manifest（或补 fallback）→ 先落固定 manifest → 再更新 latest.json。
 * recordRun 内部保证顺序：manifest 写失败时 latest.json 保持原样。
 */
export async function finishE2eRun ({
  artifactRoot,
  runId,
  latestPath,
  kind = 'full',
  result = {},
  startedAt = null,
  finishedAt = null,
}) {
  if (!runId) throw new Error('finishE2eRun 需要 runId')
  const root = resolve(artifactRoot)
  const runDir = join(root, runId)
  mkdirSync(runDir, { recursive: true })
  const manifestPath = join(runDir, 'manifest.json')
  const targetLatest = resolve(latestPath ?? e2eLatestPath())

  const reported = readJson(manifestPath)
  const evidenceSource = isPlainObject(reported) ? 'playwright-manifest' : 'wrapper-fallback'
  const manifest = evidenceSource === 'playwright-manifest'
    ? { ...reported }
    : buildFallbackManifest({
        runId,
        runDir,
        result,
        startedAt: startedAt ?? result.startedAt ?? null,
        finishedAt: finishedAt ?? result.finishedAt ?? null,
      })

  const summary = summarizeE2eManifest(manifest)
  manifest.evidenceSource = evidenceSource
  manifest.summary = {
    ...(isPlainObject(manifest.summary) ? manifest.summary : {}),
    total: summary.total,
    passed: summary.passed,
    failed: summary.failed,
    fatal: summary.fatal,
    status: summary.status,
  }

  const document = await recordRun({
    suite: E2E_SUITE,
    latestPath: targetLatest,
    manifestPath,
    manifest,
    kind,
    status: summary.status,
  })

  return { manifestPath, manifest, summary, kind, latestPath: targetLatest, latest: document, evidenceSource }
}

function playwrightCliPath () {
  const require = createRequire(import.meta.url)
  try {
    return require.resolve('@playwright/test/cli')
  } catch {
    return join(REPO_ROOT, 'node_modules', '@playwright', 'test', 'cli.js')
  }
}

async function main () {
  const args = process.argv.slice(2)
  const kind = classifyE2eArgs(args)
  const runId = process.env.E2E_RUN_ID?.trim() || new Date().toISOString().replace(/[:.]/g, '-')
  const artifactRoot = e2eArtifactRoot()
  const latestPath = e2eLatestPath()
  mkdirSync(join(artifactRoot, runId), { recursive: true })

  const startedAt = new Date().toISOString()
  const child = spawnSync(process.execPath, [playwrightCliPath(), 'test', ...args], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    // globalSetup / reporter 与 config 在同一轮里必须拿到同一个 runId。
    env: { ...process.env, E2E_RUN_ID: runId },
  })
  const finishedAt = new Date().toISOString()
  const result = {
    exitCode: typeof child.status === 'number' ? child.status : null,
    signal: child.signal ?? null,
    timedOut: false,
    error: child.error ? messageOf(child.error) : null,
    startedAt,
    finishedAt,
  }

  try {
    const finished = await finishE2eRun({ artifactRoot, runId, latestPath, kind, result, startedAt, finishedAt })
    console.log('[e2e] 固定 manifest -> ' + finished.manifestPath)
    console.log('[e2e] latest -> ' + finished.latestPath + '（' + kind + ' / ' + finished.summary.status + '）')
  } catch (error) {
    // 指针失败不改变测试结论；正式证据仍是它前面的固定 manifest。
    console.error('[e2e] latest.json 更新失败：' + messageOf(error))
  }

  process.exitCode = result.exitCode === null ? 1 : result.exitCode
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null
const modulePath = fileURLToPath(import.meta.url)
const isMain = invokedPath !== null && (process.platform === 'win32'
  ? invokedPath.toLowerCase() === modulePath.toLowerCase()
  : invokedPath === modulePath)

if (isMain) {
  main().catch((error) => {
    console.error('[e2e] FATAL ' + messageOf(error))
    process.exitCode = 1
  })
}
