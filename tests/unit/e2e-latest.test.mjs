// verify:e2e 写点（#33，G5）：Playwright 结束后先落固定 e2e manifest，再按 suite=verify-e2e 更新 latest.json。
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { E2E_SUITE, classifyE2eArgs, finishE2eRun, summarizeE2eManifest } from '../../scripts/acceptance/e2e-latest.mjs'
import { readLatest, recordRun } from '../../scripts/acceptance/latest.mjs'

const tempDirs = []

function makeTempDir () {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-latest-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function reporterManifest ({
  runId,
  status = 'passed',
  businessPassed = 6,
  businessFailed = 0,
  themePassed = 1,
  failures = [],
  startedAt = '2026-11-22T07:00:00.000Z',
  finishedAt = '2026-11-22T07:01:00.000Z',
}) {
  const business = {
    total: businessPassed + businessFailed,
    passed: businessPassed,
    failed: businessFailed,
    skipped: 0,
    tests: [],
  }
  const theme = { total: themePassed, passed: themePassed, failed: 0, skipped: 0, tests: [] }
  const empty = { total: 0, passed: 0, failed: 0, skipped: 0, tests: [] }
  return {
    schema: 'shop-frontend-e2e-manifest/v1',
    runId,
    startedAt,
    finishedAt,
    durationMs: 60000,
    status,
    command: 'pnpm verify:e2e',
    commit: { sha: 'test-sha', branch: 'phase8/F10' },
    environment: { node: process.version, platform: process.platform, cwd: process.cwd(), baseURL: 'http://127.0.0.1:4173' },
    browser: { name: 'chromium', version: 'Chrome/142.0.0.0' },
    backend: { head: null, worktree: null },
    config: { workers: 1, retries: 0, trace: 'retain-on-failure', projects: ['chrome'] },
    expectedTests: business.total + theme.total,
    suites: { business, theme, other: empty },
    failures,
    artifacts: { manifest: 'manifest.json', browser: 'browser.json', runDir: null },
  }
}

function writeReporterManifest (root, manifest) {
  const runDir = join(root, manifest.runId)
  mkdirSync(runDir, { recursive: true })
  const manifestPath = join(runDir, 'manifest.json')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  return manifestPath
}

test('verify:e2e 的 suite 名固定为 verify-e2e', () => {
  assert.equal(E2E_SUITE, 'verify-e2e')
})

test('无参数跑全量；带 spec / grep / project 参数算定向', () => {
  assert.equal(classifyE2eArgs([]), 'full')
  assert.equal(classifyE2eArgs(['e2e/search.spec.ts']), 'targeted')
  assert.equal(classifyE2eArgs(['--grep', '购买']), 'targeted')
  assert.equal(classifyE2eArgs(['--project=chrome']), 'targeted')
})

test('summary 由 suites 汇总；失败用例优先于 status', () => {
  const passed = summarizeE2eManifest(reporterManifest({ runId: 'e2e-summary-pass' }))
  assert.deepEqual([passed.total, passed.passed, passed.failed, passed.fatal, passed.status], [7, 7, 0, false, 'pass'])

  const failed = summarizeE2eManifest(reporterManifest({
    runId: 'e2e-summary-fail',
    status: 'failed',
    businessPassed: 5,
    businessFailed: 1,
    failures: [{ file: 'e2e/purchase.spec.ts', title: '购买', error: 'boom' }],
  }))
  assert.deepEqual([failed.total, failed.passed, failed.failed, failed.fatal, failed.status], [7, 6, 1, false, 'fail'])

  const crashed = summarizeE2eManifest(reporterManifest({ runId: 'e2e-summary-crash', status: 'interrupted', businessPassed: 0, businessFailed: 0, themePassed: 0 }))
  assert.deepEqual([crashed.total, crashed.failed, crashed.fatal, crashed.status], [0, 0, true, 'fail'])
})

test('全量通过：先落固定 manifest，再写 lastFull 与 lastRun', async () => {
  const root = makeTempDir()
  const runId = 'e2e-full-pass'
  writeReporterManifest(root, reporterManifest({ runId }))

  const result = await finishE2eRun({
    artifactRoot: root,
    runId,
    latestPath: join(root, 'latest.json'),
    kind: 'full',
    result: { exitCode: 0, signal: null, timedOut: false, error: null },
  })

  assert.equal(result.manifestPath, join(root, runId, 'manifest.json'))
  const stored = JSON.parse(readFileSync(result.manifestPath, 'utf8'))
  assert.equal(stored.summary.total, 7)
  assert.equal(stored.summary.failed, 0)
  assert.equal(stored.summary.fatal, false)
  assert.equal(stored.evidenceSource, 'playwright-manifest')

  const record = readLatest(join(root, 'latest.json')).suites['verify-e2e']
  assert.equal(record.lastFull.runId, runId)
  assert.equal(record.lastFull.kind, 'full')
  assert.equal(record.lastFull.status, 'pass')
  assert.equal(record.lastFull.manifest, runId + '/manifest.json')
  assert.equal(record.lastRun.runId, runId)
})

test('全量失败仍更新 lastFull：失败用例数进 summary，status=fail', async () => {
  const root = makeTempDir()
  const runId = 'e2e-full-fail'
  writeReporterManifest(root, reporterManifest({
    runId,
    status: 'failed',
    businessPassed: 5,
    businessFailed: 1,
    failures: [{ file: 'e2e/purchase.spec.ts', title: '购买校验', error: 'expect(received).toBe(expected)' }],
  }))

  await finishE2eRun({
    artifactRoot: root,
    runId,
    latestPath: join(root, 'latest.json'),
    kind: 'full',
    result: { exitCode: 1, signal: null, timedOut: false, error: null },
  })

  const record = readLatest(join(root, 'latest.json')).suites['verify-e2e']
  assert.equal(record.lastFull.runId, runId)
  assert.equal(record.lastFull.status, 'fail')
  assert.equal(record.lastFull.summary.failed, 1)
  assert.equal(record.lastFull.summary.fatal, false)
  assert.equal(record.lastRun.status, 'fail')
})

test('Playwright 崩溃没写 manifest 时也落固定 manifest（fatal），并更新 lastFull', async () => {
  const root = makeTempDir()
  const runId = 'e2e-crash'

  const result = await finishE2eRun({
    artifactRoot: root,
    runId,
    latestPath: join(root, 'latest.json'),
    kind: 'full',
    result: {
      exitCode: null,
      signal: 'SIGTERM',
      timedOut: true,
      error: null,
      startedAt: '2026-11-22T07:10:00.000Z',
      finishedAt: '2026-11-22T07:11:00.000Z',
    },
  })

  assert.ok(existsSync(result.manifestPath), '崩溃时也必须落固定 manifest')
  const stored = JSON.parse(readFileSync(result.manifestPath, 'utf8'))
  assert.equal(stored.status, 'failed')
  assert.equal(stored.runId, runId)
  assert.equal(stored.evidenceSource, 'wrapper-fallback')
  assert.equal(stored.fallback.timedOut, true)
  assert.equal(stored.fallback.signal, 'SIGTERM')

  const record = readLatest(join(root, 'latest.json')).suites['verify-e2e']
  assert.equal(record.lastFull.runId, runId)
  assert.equal(record.lastFull.status, 'fail')
  assert.equal(record.lastFull.summary.fatal, true)
})

test('定向（带参数）只更新 lastRun，不动上一次全量', async () => {
  const root = makeTempDir()
  const latestPath = join(root, 'latest.json')
  const fullRunId = 'e2e-full'
  writeReporterManifest(root, reporterManifest({ runId: fullRunId }))
  await finishE2eRun({
    artifactRoot: root,
    runId: fullRunId,
    latestPath,
    kind: 'full',
    result: { exitCode: 0, signal: null, timedOut: false, error: null },
  })

  const targetedRunId = 'e2e-only-search'
  writeReporterManifest(root, reporterManifest({
    runId: targetedRunId,
    businessPassed: 1,
    themePassed: 0,
    failures: [],
  }))
  await finishE2eRun({
    artifactRoot: root,
    runId: targetedRunId,
    latestPath,
    kind: classifyE2eArgs(['e2e/search.spec.ts']),
    result: { exitCode: 0, signal: null, timedOut: false, error: null },
  })

  const record = readLatest(latestPath).suites['verify-e2e']
  assert.equal(record.lastFull.runId, fullRunId)
  assert.equal(record.lastFull.kind, 'full')
  assert.equal(record.lastRun.runId, targetedRunId)
  assert.equal(record.lastRun.kind, 'targeted')
})

test('verify-e2e 与 gate 写同一 latest.json：两 suite 并存，gate 失败仍写 lastFull', async () => {
  const root = makeTempDir()
  const latestPath = join(root, 'latest.json')
  const runId = 'e2e-with-gate'
  writeReporterManifest(root, reporterManifest({ runId }))
  await finishE2eRun({
    artifactRoot: root,
    runId,
    latestPath,
    kind: 'full',
    result: { exitCode: 0, signal: null, timedOut: false, error: null },
  })

  await recordRun({
    suite: 'gate',
    latestPath,
    manifestPath: join(root, 'gate.json'),
    kind: 'full',
    manifest: {
      runId: 'gate-failed',
      startedAt: '2026-11-22T07:20:00.000Z',
      finishedAt: '2026-11-22T07:30:00.000Z',
      commit: 'test-sha',
      mode: {},
      summary: { total: 9, passed: 8, failed: 1, blocked: 0, skipped: 0, fatal: false, green: false },
    },
  })

  const doc = readLatest(latestPath)
  assert.equal(doc.suites['verify-e2e'].lastFull.runId, runId)
  assert.equal(doc.suites.gate.lastFull.runId, 'gate-failed')
  assert.equal(doc.suites.gate.lastFull.status, 'fail')
  assert.equal(doc.suites.gate.lastFull.summary.failed, 1)
})
