// latest.json 指针的并发回归：四入口并发写、失败 / only / reverse 语义、固定 manifest 先落盘。
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, test } from 'vitest'
import { classifyRun, readLatest, recordRun } from '../../scripts/acceptance/latest.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const LATEST_MODULE = pathToFileURL(join(HERE, '..', '..', 'scripts', 'acceptance', 'latest.mjs')).href
const tempDirs = []

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'latest-json-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function manifestFor({ runId, failed = 0, fatal = false, startedAt, finishedAt, mode = {} }) {
  const total = failed > 0 ? failed : 1
  return {
    runId,
    startedAt,
    finishedAt,
    commit: 'test-commit',
    mode,
    summary: {
      total,
      passed: total - failed,
      failed,
      fatal,
      artifactDir: null,
      manifest: null,
    },
    fatalError: fatal ? '受控失败' : null,
  }
}

async function recordFullRun({ dir, suite, runId, failed = 0, fatal = false, finishedAt, kind = 'full', mode = {} }) {
  const latestPath = join(dir, 'latest.json')
  const manifestPath = join(dir, 'runs', runId, 'manifest.json')
  const startedAt = new Date(Date.parse(finishedAt) - 1000).toISOString()
  const doc = await recordRun({
    suite,
    latestPath,
    manifestPath,
    kind,
    manifest: manifestFor({ runId, failed, fatal, startedAt, finishedAt, mode }),
  })
  return { doc, latestPath, manifestPath }
}

function spawnRecord({ dir, suite, runId, finishedAt }) {
  const latestPath = join(dir, 'latest.json')
  const manifestPath = join(dir, 'runs', runId, 'manifest.json')
  const startedAt = new Date(Date.parse(finishedAt) - 1000).toISOString()
  const payload = {
    suite,
    latestPath,
    manifestPath,
    kind: 'full',
    manifest: manifestFor({ runId, startedAt, finishedAt }),
  }
  const script = 'import { recordRun } from ' + JSON.stringify(LATEST_MODULE) + '\n' +
    'await recordRun(' + JSON.stringify(payload) + ')\n'
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(suite + ' 子进程退出 ' + code + '：' + stderr + stdout))
    })
  })
}

test('仅全量运行判为 full；only 或 reverse 判为 targeted', () => {
  assert.equal(classifyRun({ only: null, reverse: null }), 'full')
  assert.equal(classifyRun({}), 'full')
  assert.equal(classifyRun({ only: ['F1'] }), 'targeted')
  assert.equal(classifyRun({ only: ['F1', 'R26'] }), 'targeted')
  assert.equal(classifyRun({ only: [] }), 'targeted')
  assert.equal(classifyRun({ reverse: 'f1' }), 'targeted')
  assert.equal(classifyRun({ only: ['F1'], reverse: 'f1' }), 'targeted')
})

test('全量运行同时更新 lastFull 与 lastRun', async () => {
  const dir = makeTempDir()
  const { doc } = await recordFullRun({
    dir,
    suite: 'check-ui',
    runId: 'ui-full',
    finishedAt: '2026-11-22T05:00:00.000Z',
  })
  const record = doc.suites['check-ui']
  assert.equal(record.lastFull.runId, 'ui-full')
  assert.equal(record.lastFull.kind, 'full')
  assert.equal(record.lastFull.status, 'pass')
  assert.equal(record.lastRun.runId, 'ui-full')
})

test('全量失败仍更新 lastFull，状态记为 fail', async () => {
  const dir = makeTempDir()
  const { doc, latestPath } = await recordFullRun({
    dir,
    suite: 'check-ui',
    runId: 'ui-failed',
    failed: 2,
    finishedAt: '2026-11-22T05:01:00.000Z',
  })
  const record = doc.suites['check-ui']
  assert.equal(record.lastFull.runId, 'ui-failed')
  assert.equal(record.lastFull.status, 'fail')
  assert.equal(record.lastFull.summary.failed, 2)
  assert.equal(record.lastRun.status, 'fail')
  assert.equal(readLatest(latestPath).suites['check-ui'].lastFull.runId, 'ui-failed')
})

test('崩溃的全量运行同样写入 lastFull', async () => {
  const dir = makeTempDir()
  const { doc } = await recordFullRun({
    dir,
    suite: 'check-es',
    runId: 'es-fatal',
    fatal: true,
    finishedAt: '2026-11-22T05:02:00.000Z',
  })
  const record = doc.suites['check-es']
  assert.equal(record.lastFull.status, 'fail')
  assert.equal(record.lastFull.summary.fatal, true)
})

test('only 定向运行只更新 lastRun，lastFull 保持上一次全量', async () => {
  const dir = makeTempDir()
  const first = await recordFullRun({
    dir,
    suite: 'check-ui',
    runId: 'ui-full',
    finishedAt: '2026-11-22T05:10:00.000Z',
  })
  const targeted = await recordFullRun({
    dir,
    suite: 'check-ui',
    runId: 'ui-only-f1',
    kind: classifyRun({ only: ['F1'] }),
    finishedAt: '2026-11-22T05:11:00.000Z',
  })
  const record = targeted.doc.suites['check-ui']
  assert.equal(record.lastFull.runId, 'ui-full')
  assert.equal(record.lastFull.runId, first.doc.suites['check-ui'].lastFull.runId)
  assert.equal(record.lastRun.runId, 'ui-only-f1')
  assert.equal(record.lastRun.kind, 'targeted')
})

test('reverse 定向运行只更新 lastRun，lastFull 不受影响', async () => {
  const dir = makeTempDir()
  const first = await recordFullRun({
    dir,
    suite: 'check-ui',
    runId: 'ui-full',
    finishedAt: '2026-11-22T05:20:00.000Z',
  })
  const reverse = await recordFullRun({
    dir,
    suite: 'check-ui',
    runId: 'ui-reverse-f1',
    kind: classifyRun({ reverse: 'f1' }),
    finishedAt: '2026-11-22T05:21:00.000Z',
  })
  const record = reverse.doc.suites['check-ui']
  assert.equal(record.lastFull.runId, first.doc.suites['check-ui'].lastFull.runId)
  assert.equal(record.lastRun.runId, 'ui-reverse-f1')
})

test('固定 manifest 先落盘；落盘失败时不写 latest.json', async () => {
  const dir = makeTempDir()
  const latestPath = join(dir, 'latest.json')
  const blocker = join(dir, 'blocked')
  writeFileSync(blocker, 'not a directory')
  await assert.rejects(
    recordRun({
      suite: 'check-ui',
      latestPath,
      manifestPath: join(blocker, 'manifest.json'),
      manifest: manifestFor({
        runId: 'ui-blocked',
        startedAt: '2026-11-22T05:30:00.000Z',
        finishedAt: '2026-11-22T05:30:01.000Z',
      }),
    }),
  )
  assert.equal(existsSync(latestPath), false)

  const ok = join(dir, 'runs', 'ui-ok', 'manifest.json')
  const doc = await recordRun({
    suite: 'check-ui',
    latestPath,
    manifestPath: ok,
    manifest: manifestFor({
      runId: 'ui-ok',
      startedAt: '2026-11-22T05:31:00.000Z',
      finishedAt: '2026-11-22T05:31:01.000Z',
    }),
  })
  const entry = doc.suites['check-ui'].lastFull
  assert.ok(existsSync(ok))
  assert.equal(entry.manifest, 'runs/ui-ok/manifest.json')
  assert.ok(existsSync(join(dir, entry.manifest)))
})

test('四入口并发写同一 latest.json，四份 suite 记录都保留', async () => {
  const dir = makeTempDir()
  const runs = [
    { suite: 'check-ui', runId: 'ui-concurrent', finishedAt: '2026-11-22T05:40:00.000Z' },
    { suite: 'check-es', runId: 'es-concurrent', finishedAt: '2026-11-22T05:40:01.000Z' },
    { suite: 'verify-e2e', runId: 'e2e-concurrent', finishedAt: '2026-11-22T05:40:02.000Z' },
    { suite: 'gate', runId: 'gate-concurrent', finishedAt: '2026-11-22T05:40:03.000Z' },
  ]
  await Promise.all(runs.map((run) => spawnRecord({ dir, ...run })))
  const doc = readLatest(join(dir, 'latest.json'))
  for (const run of runs) {
    const record = doc.suites[run.suite]
    assert.ok(record, run.suite + ' 的记录丢失')
    assert.equal(record.lastFull.runId, run.runId)
    assert.equal(record.lastRun.runId, run.runId)
    assert.ok(existsSync(join(dir, record.lastFull.manifest)), run.suite + ' 的固定 manifest 不存在')
  }
  assert.deepEqual(Object.keys(doc.suites).sort(), ['check-es', 'check-ui', 'gate', 'verify-e2e'])
})
