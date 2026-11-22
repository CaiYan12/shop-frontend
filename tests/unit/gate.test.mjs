// gate 反向 manifest 判定与依赖摘要的单元测试（#32，G1-G3）。
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, test } from 'vitest'
import { backendBuildEvidence, cleanupVerdict, evaluateEsOwnership, evaluateReverseRun, externalBackendRecord, gateRunManifestPath, summarizeSteps } from '../../scripts/acceptance/gate.mjs'
import { findSessionTmp, resolveLatestPath, uiAcceptanceDir } from '../../scripts/acceptance/paths.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

function fixture(name) {
  return JSON.parse(readFileSync(join(HERE, '..', 'fixtures', 'gate', name + '.json'), 'utf8'))
}

function evaluate(name, expected = {}) {
  const doc = fixture(name)
  return evaluateReverseRun({
    manifest: doc.manifest,
    reverse: doc.reverse,
    expectedCase: expected.expectedCase ?? 'P7-NAV',
    expectedCheck: expected.expectedCheck ?? 'islandNotOverSummary',
  })
}

test('G1：唯一失败断言命中预期时判绿', () => {
  const result = evaluate('reverse-good')
  assert.equal(result.ok, true)
  assert.equal(result.code, 'ok')
  assert.deepEqual(result.failedChecks, ['islandNotOverSummary'])
})

test('G3：缺 manifest 判非绿', () => {
  const result = evaluateReverseRun({ manifest: null, reverse: 'island', expectedCase: 'P7-NAV', expectedCheck: 'islandNotOverSummary' })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'missing-manifest')
})

test('G3：运行崩溃（fatalError）判非绿', () => {
  const result = evaluate('reverse-fatal')
  assert.equal(result.ok, false)
  assert.equal(result.code, 'fatal')
})

test('G3：目标断言没有失败判非绿', () => {
  const result = evaluate('reverse-target-pass')
  assert.equal(result.ok, false)
  assert.equal(result.code, 'target-not-failed')
})

test('G3：出现额外失败断言判非绿', () => {
  const result = evaluate('reverse-extra-failure')
  assert.equal(result.ok, false)
  assert.equal(result.code, 'extra-failures')
  assert.deepEqual(result.failedChecks, ['islandNotOverSummary', 'summaryCenterNotIsland'])
})

test('G3：其他用例也失败判非绿', () => {
  const result = evaluate('reverse-extra-case')
  assert.equal(result.ok, false)
  assert.equal(result.code, 'extra-cases')
})

test('G3：反向模式与目标用例不符判非绿', () => {
  const result = evaluate('reverse-mode-mismatch')
  assert.equal(result.ok, false)
  assert.equal(result.code, 'mode-mismatch')
})

test('G3：目标断言根本没执行（缺 key 或抛错）判非绿', () => {
  const result = evaluate('reverse-missing-check')
  assert.equal(result.ok, false)
  assert.equal(result.code, 'target-not-run')
})

test('G2：依赖 blocked 时 gate 非绿且退出码非零', () => {
  const summary = summarizeSteps([
    { id: 'verify', status: 'fail' },
    { id: 'backend', status: 'pass' },
    { id: 'e2e', status: 'blocked' },
    { id: 'check-ui', status: 'blocked' },
    { id: 'check-es', status: 'blocked' },
  ])
  assert.equal(summary.green, false)
  assert.equal(summary.exitCode, 1)
  assert.equal(summary.passed, 1)
  assert.equal(summary.failed, 1)
  assert.equal(summary.blocked, 3)
})

test('G1：全部 pass 时 gate 判绿且退出码为 0', () => {
  const summary = summarizeSteps([{ id: 'verify', status: 'pass' }, { id: 'check-es', status: 'pass' }])
  assert.equal(summary.green, true)
  assert.equal(summary.exitCode, 0)
  assert.equal(summary.total, 2)
  assert.equal(summary.failed, 0)
  assert.equal(summary.blocked, 0)
})

test('P0：gate latest 的固定 manifest 指向 runs/<runId>/gate.json', () => {
  const runDir = join('D:', 'evidence', 'runs', 'g1')
  assert.equal(gateRunManifestPath(runDir), join(runDir, 'gate.json'))
})

test('P0：收尾失败或端口未释放判非绿', () => {
  assert.equal(cleanupVerdict({
    preview: { killed: true, portReleased: false },
    backend: { killed: true, portReleased: true },
    es: { stopped: true },
  }).ok, false)
  assert.equal(cleanupVerdict({
    preview: { killed: true, portReleased: true },
    backend: { killed: true, portReleased: false },
    es: { stopped: true },
  }).ok, false)
  assert.equal(cleanupVerdict({
    preview: { killed: true, portReleased: true },
    backend: { killed: true, portReleased: true },
    es: { stopped: false },
  }).ok, false)
  assert.equal(cleanupVerdict({
    preview: { killed: true, portReleased: true },
    backend: { killed: false, external: true },
    es: { stopped: false, external: true },
  }).ok, true)
  assert.equal(cleanupVerdict({
    preview: { killed: true, portReleased: true },
    backend: { killed: true, portReleased: true },
    es: { stopped: true },
  }).ok, true)
})

// ---------- #32：ES 归属（ES_PROVENANCE_FILE） ----------

const createdProvenance = { schema: 'es-provenance/v1', created: true, pid: 4242, httpPort: 9201 }
const reusedProvenance = { schema: 'es-provenance/v1', created: false, reused: true, pid: 4242, httpPort: 9201 }

test('ES 归属：created=true 且 pid 与 9201 监听者/快照一致、进程存活时登记 owned', () => {
  const verdict = evaluateEsOwnership({ provenance: createdProvenance, listenerPid: 4242, snapshotPid: 4242, exitCode: 0, alive: true })
  assert.equal(verdict.ownership, 'owned')
  assert.equal(verdict.code, 'ok')
  assert.equal(verdict.created, true)
  assert.equal(verdict.pid, 4242)
})

test('ES 归属：created=false（复用已有实例）判 external，check:es 不得执行', () => {
  const verdict = evaluateEsOwnership({ provenance: reusedProvenance, listenerPid: 4242, snapshotPid: 4242, exitCode: 0, alive: true })
  assert.equal(verdict.ownership, 'external')
  assert.equal(verdict.code, 'not-created')
  assert.match(verdict.reason, /复用已有 ES 实例/)
})

test('ES 归属：缺 provenance 文件判 external', () => {
  const verdict = evaluateEsOwnership({ provenance: null, listenerPid: 4242, exitCode: 0, alive: true })
  assert.equal(verdict.ownership, 'external')
  assert.equal(verdict.code, 'missing-provenance')
})

test('ES 归属：pid 与监听者或启动后快照不一致判 external', () => {
  const listener = evaluateEsOwnership({ provenance: createdProvenance, listenerPid: 5555, snapshotPid: 4242, exitCode: 0, alive: true })
  assert.equal(listener.ownership, 'external')
  assert.equal(listener.code, 'listener-pid-mismatch')
  const snapshot = evaluateEsOwnership({ provenance: createdProvenance, listenerPid: 4242, snapshotPid: 5555, exitCode: 0, alive: true })
  assert.equal(snapshot.ownership, 'external')
  assert.equal(snapshot.code, 'snapshot-pid-mismatch')
  const missingPid = evaluateEsOwnership({ provenance: { created: true }, listenerPid: 4242, exitCode: 0, alive: true })
  assert.equal(missingPid.ownership, 'external')
  assert.equal(missingPid.code, 'missing-pid')
})

test('ES 归属：pid 进程不存活判 external', () => {
  const verdict = evaluateEsOwnership({ provenance: createdProvenance, listenerPid: 4242, snapshotPid: 4242, exitCode: 0, alive: false })
  assert.equal(verdict.ownership, 'external')
  assert.equal(verdict.code, 'not-alive')
})

test('ES 归属：es-dev 启动失败但 created=true 仍登记 owned 供 cleanup', () => {
  const verdict = evaluateEsOwnership({ provenance: createdProvenance, exitCode: 1, timedOut: false, alive: false })
  assert.equal(verdict.ownership, 'owned')
  assert.equal(verdict.code, 'created-on-failure')
  assert.match(verdict.reason, /cleanup/)
  // 退出码缺失（spawn 失败 / 被信号终止）也按启动失败处理。
  const noExitCode = evaluateEsOwnership({ provenance: createdProvenance, exitCode: null, timedOut: false, alive: true })
  assert.equal(noExitCode.ownership, 'owned')
  assert.equal(noExitCode.code, 'created-on-failure')
})

test('ES 归属：启动失败且 created=false（含超时）不登记 owned', () => {
  const failed = evaluateEsOwnership({ provenance: { created: false, failed: true, reason: 'boom' }, exitCode: 1, timedOut: false })
  assert.equal(failed.ownership, 'external')
  assert.equal(failed.code, 'failure-not-created')
  const timeout = evaluateEsOwnership({ provenance: reusedProvenance, exitCode: null, timedOut: true })
  assert.equal(timeout.ownership, 'external')
  assert.equal(timeout.code, 'failure-not-created')
  const missing = evaluateEsOwnership({ provenance: null, exitCode: 1 })
  assert.equal(missing.ownership, 'external')
  assert.equal(missing.code, 'missing-provenance')
})

// ---------- #32：后端构建证据 ----------

const builtAt = '2026-11-22T08:00:00.000Z'
const builtServer = {
  path: 'D:/repo/shop-backend/dist/server.js',
  sha256: 'a'.repeat(64),
  mtime: '2026-11-22T08:00:30.000Z',
  mtimeMs: Date.parse('2026-11-22T08:00:30.000Z'),
  size: 2474,
}

test('后端构建证据：自己启动时记录 head/build exit/log/sha256/mtime/builtAt', () => {
  const evidence = backendBuildEvidence({
    head: 'abc1234',
    startedAt: builtAt,
    finishedAt: '2026-11-22T08:00:40.000Z',
    exitCode: 0,
    log: 'runs/g1/backend-build.log',
    server: builtServer,
  })
  assert.equal(evidence.ok, true)
  assert.equal(evidence.head, 'abc1234')
  assert.equal(evidence.exitCode, 0)
  assert.equal(evidence.log, 'runs/g1/backend-build.log')
  assert.equal(evidence.serverSha256, builtServer.sha256)
  assert.equal(evidence.serverMtime, builtServer.mtime)
  assert.equal(evidence.builtAt, builtAt)
  assert.equal(evidence.serverFresh, true)
  for (const key of ['head', 'exitCode', 'log', 'serverSha256', 'serverMtime', 'builtAt']) {
    assert.ok(key in evidence, '构建证据缺字段 ' + key)
  }
})

test('后端构建证据：pnpm build 失败仍保留 exit 与日志，但判失败', () => {
  const evidence = backendBuildEvidence({ head: 'abc1234', startedAt: builtAt, exitCode: 2, log: 'runs/g1/backend-build.log', server: builtServer })
  assert.equal(evidence.ok, false)
  assert.equal(evidence.exitCode, 2)
  assert.match(evidence.reason, /exit 2/)
})

test('后端构建证据：server.js 缺失或 mtime 早于本轮构建都不算通过', () => {
  const missing = backendBuildEvidence({ head: 'abc1234', startedAt: builtAt, exitCode: 0, server: null })
  assert.equal(missing.ok, false)
  assert.match(missing.reason, /不存在/)
  const stale = backendBuildEvidence({
    head: 'abc1234',
    startedAt: builtAt,
    exitCode: 0,
    server: { ...builtServer, mtimeMs: Date.parse('2026-11-22T07:00:00.000Z') },
  })
  assert.equal(stale.ok, false)
  assert.equal(stale.serverFresh, false)
  assert.match(stale.reason, /mtime/)
})

test('外部后端：只记 external，不构建也不声称产物', () => {
  const record = externalBackendRecord({ pid: 1234, health: { ok: true } })
  assert.equal(record.ownership, 'external')
  assert.equal(record.build, null)
  assert.equal(record.buildClaimed, false)
  assert.equal(record.startedThisRun, false)
  assert.match(record.reason, /外部后端/)
})

// ---------- #33：latest.json 默认路径（worktree 布局） ----------

const tempDirs = []

function makeTempDir () {
  const dir = mkdtempSync(join(tmpdir(), 'gate-paths-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function makeMainLayout () {
  const main = makeTempDir()
  mkdirSync(join(main, 'session-tmp'), { recursive: true })
  writeFileSync(join(main, 'session-tmp', 'phase8-spec.md'), '# phase8 spec\n')
  const wt = join(main, 'wt')
  mkdirSync(join(wt, 'session-tmp'), { recursive: true })
  const worktree = join(wt, 'fe-r2')
  mkdirSync(worktree, { recursive: true })
  return { main, wt, worktree }
}

test('paths：worktree 布局优先含 phase8-spec.md 的 session-tmp', () => {
  const { main, worktree } = makeMainLayout()
  assert.equal(findSessionTmp(worktree), join(main, 'session-tmp'))
})

test('paths：没有 marker 时退回最近的已存在 session-tmp', () => {
  const { wt, worktree } = makeMainLayout()
  rmSync(join(wt, '..', 'session-tmp'), { recursive: true, force: true })
  assert.equal(findSessionTmp(worktree), join(wt, 'session-tmp'))
})

test('paths：都不存在时 fallback 到父目录 session-tmp，不返回 worktree 内的空目录', () => {
  const main = makeTempDir()
  const worktree = join(main, 'a', 'b')
  mkdirSync(worktree, { recursive: true })
  assert.equal(findSessionTmp(worktree), join(main, 'a', 'session-tmp'))
})

test('paths：四个入口默认写同一份 <main session-tmp>/ui-acceptance/latest.json', () => {
  const { main, worktree } = makeMainLayout()
  const expected = join(main, 'session-tmp', 'ui-acceptance', 'latest.json')
  const entries = ['UI_LATEST_PATH', 'E2E_LATEST_PATH', 'GATE_LATEST_PATH'].map(() => resolveLatestPath({ start: worktree }))
  assert.deepEqual([...new Set(entries)], [expected])
  assert.equal(uiAcceptanceDir(worktree), join(main, 'session-tmp', 'ui-acceptance'))
  assert.notEqual(expected, join(worktree, '..', 'session-tmp', 'ui-acceptance', 'latest.json'))
})

test('paths：显式覆盖变量优先于默认路径，空白覆盖按未设置处理', () => {
  const { main } = makeMainLayout()
  const override = join(main, 'custom', 'latest.json')
  assert.equal(resolveLatestPath({ start: main, override }), override)
  assert.equal(resolveLatestPath({ start: main, override: '   ' }), join(main, 'session-tmp', 'ui-acceptance', 'latest.json'))
  assert.equal(resolveLatestPath({ start: main, override: null }), join(main, 'session-tmp', 'ui-acceptance', 'latest.json'))
})
