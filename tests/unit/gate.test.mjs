// gate 反向 manifest 判定与依赖摘要的单元测试（#32，G1-G3）。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'vitest'
import { cleanupVerdict, evaluateReverseRun, gateRunManifestPath, summarizeSteps } from '../../scripts/acceptance/gate.mjs'

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
