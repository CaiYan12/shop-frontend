import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { finishE2eRun, REQUIRED_E1_ATTACHMENTS } from '../../scripts/acceptance/e2e-latest.mjs'
import { updateRunPointer } from '../../scripts/acceptance/latest.mjs'

const tempDirs = []
function tempDir () {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-evidence-'))
  tempDirs.push(dir)
  return dir
}
afterEach(() => { for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function manifestWithAttachment (attachmentPath) {
  return {
    schema: 'shop-frontend-e2e-manifest/v1',
    runId: 'run-1',
    startedAt: '2026-11-22T00:00:00.000Z',
    finishedAt: '2026-11-22T00:00:01.000Z',
    status: 'passed',
    command: 'pnpm verify:e2e',
    commit: { sha: 'test', branch: 'test' },
    browser: { name: 'chromium', version: '157.0.0' },
    backend: { head: 'test', worktree: 'test' },
    suites: {
      business: {
        total: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        tests: [{
          file: 'e2e/purchase.spec.ts',
          title: '正常购买',
          status: 'passed',
          durationMs: 1,
          retry: 0,
          error: null,
          attachments: [{ name: 'purchase-check-request.json', contentType: 'application/json', path: attachmentPath }],
        }],
      },
      theme: { total: 1, passed: 1, failed: 0, skipped: 0, tests: [{ file: 'e2e/theme.spec.ts', title: 'theme', status: 'passed', durationMs: 1, retry: 0, error: null, attachments: [] }] },
    },
    failures: [],
    artifacts: { manifest: 'manifest.json', browser: 'browser.json' },
  }
}

function prepareRun ({ attachments = true } = {}) {
  const root = tempDir()
  const runId = 'run-1'
  const runDir = join(root, runId)
  mkdirSync(runDir, { recursive: true })
  const source = join(runDir, 'source-request.json')
  if (attachments) writeFileSync(source, '{"ok":true}\n')
  const manifest = manifestWithAttachment(attachments ? source : join(runDir, 'missing-request.json'))
  if (attachments) manifest.suites.business.tests[0].attachments.push({ name: 'purchase-check-response.json', contentType: 'application/json', path: source })
  writeFileSync(join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  return { root, runId, runDir, source, latestPath: join(root, 'latest.json') }
}

test('附件归档：复制进 runDir、相对路径、sha256、移走原文件仍可读', async () => {
  const { root, runId, runDir, source, latestPath } = prepareRun()
  const finished = await finishE2eRun({ artifactRoot: root, runId, latestPath, kind: 'full', result: { exitCode: 0 } })
  const attachment = finished.manifest.suites.business.tests[0].attachments[0]
  assert.equal(finished.evidenceErrors.length, 0)
  assert.equal(attachment.archived, true)
  assert.match(attachment.path, /^attachments\//)
  const archived = join(runDir, attachment.path)
  assert.equal(existsSync(archived), true)
  assert.equal(attachment.sha256, createHash('sha256').update(readFileSync(source)).digest('hex'))
  rmSync(source)
  assert.deepEqual(JSON.parse(readFileSync(archived, 'utf8')), { ok: true })
  assert.equal(finished.latest.suites['verify-e2e'].lastFull.status, 'pass')
  assert.equal(join(root, finished.latest.suites['verify-e2e'].lastFull.manifest), finished.manifestPath)
})

test('同名附件：同 retry 中文标题/长文件名仍按用例序号独立归档', async () => {
  const root = tempDir()
  const runId = 'collision'
  const runDir = join(root, runId)
  mkdirSync(runDir, { recursive: true })
  const first = join(runDir, 'first.json')
  const second = join(runDir, 'second.json')
  writeFileSync(first, '{"case":"A"}\n')
  writeFileSync(second, '{"case":"B"}\n')
  const manifest = {
    schema: 'shop-frontend-e2e-manifest/v1',
    runId,
    startedAt: '2026-11-22T00:00:00.000Z',
    finishedAt: '2026-11-22T00:00:01.000Z',
    status: 'passed',
    command: 'pnpm verify:e2e',
    commit: { sha: 'test', branch: 'test' },
    browser: { name: 'chromium', version: '157.0.0' },
    backend: { head: 'test', worktree: 'test' },
    suites: {
      business: {
        total: 2,
        passed: 2,
        failed: 0,
        skipped: 0,
        tests: [
          { file: 'e2e/retry.spec.ts', title: '搜索', status: 'passed', durationMs: 1, retry: 0, error: null, attachments: [{ name: '同名附件-'.repeat(20) + 'trace.json', contentType: 'application/json', path: first }] },
          { file: 'e2e/retry.spec.ts', title: '结算', status: 'passed', durationMs: 1, retry: 0, error: null, attachments: [{ name: '同名附件-'.repeat(20) + 'trace.json', contentType: 'application/json', path: second }] },
        ],
      },
      theme: { total: 0, passed: 0, failed: 0, skipped: 0, tests: [] },
    },
    failures: [],
  }
  writeFileSync(join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  const finished = await finishE2eRun({ artifactRoot: root, runId, latestPath: join(root, 'latest.json'), result: { exitCode: 0 } })
  const rows = finished.manifest.suites.business.tests
  const archivedA = rows[0].attachments[0]
  const archivedB = rows[1].attachments[0]
  assert.notEqual(archivedA.path, archivedB.path)
  assert.match(archivedA.path, /^attachments\/test-0000-retry-0-att-000-/)
  assert.match(archivedB.path, /^attachments\/test-0001-retry-0-att-000-/)
  assert.ok(archivedA.path.length <= 220)
  assert.equal(archivedA.sha256, createHash('sha256').update(readFileSync(first)).digest('hex'))
  assert.equal(archivedB.sha256, createHash('sha256').update(readFileSync(second)).digest('hex'))
  assert.deepEqual(JSON.parse(readFileSync(join(runDir, archivedA.path), 'utf8')), { case: 'A' })
  assert.deepEqual(JSON.parse(readFileSync(join(runDir, archivedB.path), 'utf8')), { case: 'B' })
})

test('指针更新不写固定 manifest', async () => {
  const root = tempDir()
  const manifestPath = join(root, 'not-written.json')
  const latestPath = join(root, 'latest.json')
  const manifest = {
    runId: 'pointer-only',
    status: 'passed',
    startedAt: '2026-11-22T00:00:00.000Z',
    finishedAt: '2026-11-22T00:00:01.000Z',
    commit: { sha: 'test', branch: 'test' },
    summary: { total: 1, passed: 1, failed: 0, fatal: false, status: 'pass' },
  }
  await updateRunPointer({ suite: 'verify-e2e', latestPath, manifestPath, manifest, kind: 'full' })
  assert.equal(existsSync(manifestPath), false)
  assert.equal(existsSync(latestPath), true)
})

test('固定 manifest 缺失：fallback + 证据失败，仍写固定 manifest 与 latest', async () => {
  const root = tempDir()
  const runId = 'missing-manifest'
  const latestPath = join(root, 'latest.json')
  const finished = await finishE2eRun({ artifactRoot: root, runId, latestPath, result: { exitCode: 1 } })
  assert.equal(finished.evidenceSource, 'wrapper-fallback')
  assert.ok(finished.evidenceErrors.some((error) => error.includes('Playwright reporter manifest 缺失')))
  assert.equal(existsSync(finished.manifestPath), true)
  assert.equal(finished.latest.suites['verify-e2e'].lastFull.status, 'fail')
})

test('E1 附件缺失：summary 仍按实际 pass，但 evidenceErrors 明确报告', async () => {
  const { root, runId, latestPath } = prepareRun({ attachments: false })
  const finished = await finishE2eRun({ artifactRoot: root, runId, latestPath, result: { exitCode: 0 } })
  assert.equal(finished.summary.status, 'pass')
  for (const name of REQUIRED_E1_ATTACHMENTS) {
    assert.ok(finished.evidenceErrors.some((error) => error.includes(name)), '缺少 ' + name)
  }
})

test('latest 写入失败：单独记录 latestError，固定 manifest 保留', async () => {
  const { root, runId, runDir, latestPath } = prepareRun()
  const finished = await finishE2eRun({ artifactRoot: root, runId, latestPath: runDir, result: { exitCode: 0 } })
  assert.equal(finished.latestError !== null, true)
  assert.equal(finished.evidenceErrors.length, 0)
  assert.equal(existsSync(join(runDir, 'manifest.json')), true)
  assert.equal(existsSync(latestPath), false)
})
