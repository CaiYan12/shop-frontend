#!/usr/bin/env node
/**
 * Phase 8 F8 本地总门禁（CaiYan12/shop-frontend#32，G1-G4）。
 *
 * 顺序：verify -> 后端预检 / 启动 -> ES 预检 / 启动 -> Playwright -> check:ui
 *       -> 三条反向（island / purchase / purchase-price）-> check:es。
 *
 * 约定：
 * - 只复用本轮 verify 成功生成的 dist；gate 启动前先删除旧 dist 并留时间戳证据（G2）。
 * - 前置失败时依赖步骤 blocked，独立步骤（后端 / ES）继续；汇总 gate.json 并非零退出。
 * - 三条反向读各自 check:ui manifest，唯一失败断言必须命中预期（G1 / G3）。
 * - 9201 被外部实例占用时 check:es blocked，gate 非绿，并留 PID / 启动时间 / HTTP 响应前后证据（G4）；
 *   gate 只关闭本轮启动的后端与 ES。
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { findFreePort, waitForHttp } from './lib.mjs'
import { finishE2eRun } from './e2e-latest.mjs'
import { recordRun, writeManifest } from './latest.mjs'
import { findSessionTmp, resolveLatestPath } from './paths.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const GATE_ROOT = resolve(HERE, '..', '..')

const DEFAULT_BACKEND_ROOT = resolve(GATE_ROOT, '..', 'shop-backend')
const WORKTREE_BACKEND_ROOT = resolve(GATE_ROOT, '..', 'be-int')
const BACKEND_ROOT = process.env.SHOP_BACKEND_ROOT
  ? resolve(process.env.SHOP_BACKEND_ROOT)
  : (existsSync(join(DEFAULT_BACKEND_ROOT, 'package.json')) ? DEFAULT_BACKEND_ROOT : WORKTREE_BACKEND_ROOT)
export const BACKEND_ROOT_FALLBACK = !process.env.SHOP_BACKEND_ROOT && BACKEND_ROOT === WORKTREE_BACKEND_ROOT
const SESSION_TMP = findSessionTmp(GATE_ROOT)
export const ARTIFACT_ROOT = resolve(process.env.GATE_ARTIFACT_DIR ?? join(SESSION_TMP, 'phase8-evidence', 'F8'))
const GATE_MANIFEST = process.env.GATE_MANIFEST ? resolve(process.env.GATE_MANIFEST) : join(ARTIFACT_ROOT, 'gate.json')
const LATEST_PATH = resolveLatestPath({ start: GATE_ROOT, override: process.env.GATE_LATEST_PATH })
const BACKEND_PORT = 3001
const ES_PORT = 9201
const ES_URL = 'http://127.0.0.1:' + ES_PORT + '/'
const BACKEND_BASE = 'http://127.0.0.1:' + BACKEND_PORT

const STEP_DEFS = [
  { id: 'verify', title: 'pnpm verify（docs → unit → lint → build）', deps: [] },
  { id: 'backend', title: '后端预检 / 启动（3001）', deps: [] },
  { id: 'es', title: 'Elasticsearch 预检 / 启动（9201）', deps: [] },
  { id: 'e2e', title: 'Playwright 六条业务 + theme.spec', deps: ['verify', 'backend', 'es'] },
  { id: 'check-ui', title: 'check:ui 全量正向', deps: ['verify', 'backend', 'es'] },
  { id: 'reverse-island', title: '反向 island（islandNotOverSummary）', deps: ['verify', 'backend', 'es'] },
  { id: 'reverse-purchase', title: '反向 purchase（confirmationRequired）', deps: ['verify', 'backend', 'es'] },
  { id: 'reverse-purchase-price', title: '反向 purchase-price（secondRequestCarriesConfirmedPrice）', deps: ['verify', 'backend', 'es'] },
  { id: 'check-es', title: 'check:es ES 降级与恢复', deps: ['verify', 'backend', 'es'] },
]

const REVERSE_CASES = [
  { id: 'reverse-island', mode: 'island', caseId: 'P7-NAV', expectedCheck: 'islandNotOverSummary' },
  { id: 'reverse-purchase', mode: 'purchase', caseId: 'P7-PURCHASE', expectedCheck: 'confirmationRequired' },
  { id: 'reverse-purchase-price', mode: 'purchase-price', caseId: 'P7-PURCHASE', expectedCheck: 'secondRequestCarriesConfirmedPrice' },
]

// ---------- 纯函数：供单元测试（G1 / G2 / G3） ----------

/**
 * 判定一次反向 check:ui 运行是否符合契约：唯一失败断言必须是指定 key。
 * 缺 manifest、fatal、模式不符、目标未失败、目标未执行、额外失败、额外失败用例均判非绿。
 */
export function evaluateReverseRun ({ manifest, reverse, expectedCase, expectedCheck }) {
  const context = { reverse, expectedCase, expectedCheck, failedChecks: [], failedCases: [] }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ...context, ok: false, code: 'missing-manifest', reason: 'manifest 不存在或不是对象' }
  }
  if (manifest.fatalError) {
    return { ...context, ok: false, code: 'fatal', reason: 'manifest.fatalError：' + String(manifest.fatalError) }
  }
  if (manifest.summary && manifest.summary.fatal) {
    return { ...context, ok: false, code: 'fatal', reason: 'manifest.summary.fatal 为 true' }
  }
  if (!manifest.mode || manifest.mode.reverse !== reverse) {
    return { ...context, ok: false, code: 'mode-mismatch', reason: 'manifest.mode.reverse=' + String(manifest.mode && manifest.mode.reverse) + '，期望 ' + reverse }
  }
  if (!Array.isArray(manifest.cases)) {
    return { ...context, ok: false, code: 'missing-cases', reason: 'manifest.cases 缺失' }
  }
  const target = manifest.cases.find((item) => item && item.id === expectedCase)
  if (!target) {
    return { ...context, ok: false, code: 'target-case-missing', reason: 'manifest 中没有用例 ' + expectedCase }
  }
  const failedCases = manifest.cases
    .filter((item) => item && item.status !== 'pass')
    .map((item) => item.id)
  const failedChecks = []
  for (const item of manifest.cases) {
    if (!item || !item.checks || typeof item.checks !== 'object') continue
    for (const [key, value] of Object.entries(item.checks)) {
      if (value !== true) failedChecks.push(key)
    }
  }
  const targetChecks = target.checks && typeof target.checks === 'object' ? target.checks : {}
  const withFailures = { ...context, failedChecks, failedCases }
  if (!(expectedCheck in targetChecks)) {
    return { ...withFailures, ok: false, code: 'target-not-run', reason: '目标断言未执行：' + expectedCheck }
  }
  if (targetChecks[expectedCheck] !== false) {
    return { ...withFailures, ok: false, code: 'target-not-failed', reason: '目标断言没有失败：' + expectedCheck }
  }
  if (Array.isArray(target.failures) && target.failures.length > 0) {
    return { ...withFailures, ok: false, code: 'target-runtime-error', reason: '目标用例运行崩溃：' + target.failures.join('; ') }
  }
  if (failedChecks.length !== 1 || failedChecks[0] !== expectedCheck) {
    return { ...withFailures, ok: false, code: 'extra-failures', reason: '失败断言不止预期一条：' + (failedChecks.join(', ') || '(无)') }
  }
  if (failedCases.length !== 1 || failedCases[0] !== expectedCase) {
    return { ...withFailures, ok: false, code: 'extra-cases', reason: '失败用例不止 ' + expectedCase + '：' + failedCases.join(', ') }
  }
  return { ...withFailures, ok: true, code: 'ok', reason: null }
}

/** 汇总各步状态：只有全部 pass 才判绿。 */
export function summarizeSteps (steps) {
  const list = Array.isArray(steps) ? steps : []
  const count = (status) => list.filter((step) => step && step.status === status).length
  const passed = count('pass')
  const failed = count('fail')
  const blocked = count('blocked')
  const skipped = count('skipped')
  const green = list.length > 0 && passed === list.length
  return {
    total: list.length,
    passed,
    failed,
    blocked,
    skipped,
    green,
    exitCode: green ? 0 : 1,
  }
}

// ---------- 纯函数：服务归属与构建证据（#32 / R2） ----------

/**
 * 判定 es-dev 之后 9201 的归属（#32）。
 *
 * es-dev 复用已有实例同样 exit 0，退出码不能证明「本轮创建」。只有同时满足
 * provenance.created===true、provenance.pid 与 9201 监听者/启动后快照 pid 一致、
 * 进程仍存活，才登记 owned 并允许 check:es；created:false / 缺证据 / pid 不符一律
 * external：check:es blocked、收尾不停。
 * es-dev 非零退出但已写 created:true 时仍登记 owned，交给 cleanup 停止本轮拉起的进程。
 *
 * @param {{ provenance?: object|null, listenerPid?: number|null, snapshotPid?: number|null, exitCode?: number|null, timedOut?: boolean, alive?: boolean }} input
 * @returns {{ ownership: 'owned'|'external', code: string, reason: string|null, created: boolean, pid: number|null }}
 */
export function evaluateEsOwnership ({ provenance, listenerPid = null, snapshotPid = null, exitCode = 0, timedOut = false, alive = false } = {}) {
  const record = provenance && typeof provenance === 'object' && !Array.isArray(provenance) ? provenance : null
  const created = Boolean(record && record.created === true)
  const pid = record && Number.isInteger(record.pid) && record.pid > 0 ? record.pid : null
  // 退出码缺失（spawn 失败 / 被信号终止）同样算启动失败，不能当成成功。
  const failed = timedOut === true || exitCode === null || exitCode === undefined || Number(exitCode) !== 0
  const parsedExit = Number(exitCode)
  const base = {
    created,
    pid,
    listenerPid: listenerPid ?? null,
    snapshotPid: snapshotPid ?? null,
    exitCode: Number.isFinite(parsedExit) ? parsedExit : null,
    timedOut: timedOut === true,
    alive: alive === true,
  }
  if (record === null) {
    return { ...base, ownership: 'external', code: 'missing-provenance', reason: 'es-dev 未写 ES_PROVENANCE_FILE，无法证明本轮创建' }
  }
  if (failed) {
    if (created) {
      return { ...base, ownership: 'owned', code: 'created-on-failure', reason: 'es-dev 非零退出，但 provenance.created=true；仍登记 owned 供 cleanup 停止' }
    }
    return { ...base, ownership: 'external', code: 'failure-not-created', reason: 'es-dev 非零退出且 provenance.created!==true，不登记 owned' }
  }
  if (!created) {
    return { ...base, ownership: 'external', code: 'not-created', reason: record.reused === true ? 'es-dev 复用已有 ES 实例（provenance.reused=true）' : 'provenance.created !== true' }
  }
  if (pid === null) {
    return { ...base, ownership: 'external', code: 'missing-pid', reason: 'provenance.created=true 但 pid 缺失或非法' }
  }
  if (base.listenerPid !== null && pid !== base.listenerPid) {
    return { ...base, ownership: 'external', code: 'listener-pid-mismatch', reason: 'provenance.pid=' + pid + ' 与 9201 监听者 ' + base.listenerPid + ' 不一致' }
  }
  if (base.snapshotPid !== null && pid !== base.snapshotPid) {
    return { ...base, ownership: 'external', code: 'snapshot-pid-mismatch', reason: 'provenance.pid=' + pid + ' 与启动后快照 pid ' + base.snapshotPid + ' 不一致' }
  }
  if (alive !== true) {
    return { ...base, ownership: 'external', code: 'not-alive', reason: 'provenance.pid=' + pid + ' 进程已不存活' }
  }
  return { ...base, ownership: 'owned', code: 'ok', reason: null }
}

/**
 * 后端构建证据（#32）：把本轮 pnpm build 的结论与 dist/server.js 的 sha256/mtime 绑在一起。
 * 只记录事实：构建失败时也保留 exitCode 与日志，由调用方决定 fail。
 *
 * @param {{ head?: string|null, startedAt?: string|null, finishedAt?: string|null, exitCode?: number|null, timedOut?: boolean, log?: string|null, server?: { path?: string, sha256?: string, mtime?: string, mtimeMs?: number, size?: number }|null }} input
 */
export function backendBuildEvidence ({ head = null, startedAt = null, finishedAt = null, exitCode = null, timedOut = false, log = null, server = null } = {}) {
  const sha = server && typeof server.sha256 === 'string' ? server.sha256 : null
  const mtime = server && typeof server.mtime === 'string' ? server.mtime : null
  const mtimeMs = server && Number.isFinite(server.mtimeMs) ? server.mtimeMs : null
  const startedMs = Date.parse(startedAt ?? '')
  const serverFresh = mtimeMs !== null && Number.isFinite(startedMs) ? mtimeMs >= startedMs : false
  let reason = null
  if (timedOut === true) reason = 'pnpm build 超时'
  else if (exitCode !== 0) reason = 'pnpm build 失败（exit ' + String(exitCode) + '）'
  else if (sha === null || mtime === null) reason = 'dist/server.js 不存在或无法读取'
  else if (!serverFresh) reason = 'dist/server.js mtime 早于本轮构建开始，运行产物不是本轮构建结果'
  return {
    head,
    exitCode: exitCode === null ? null : Number(exitCode),
    timedOut: timedOut === true,
    log,
    serverSha256: sha,
    serverMtime: mtime,
    serverPath: server && server.path ? server.path : null,
    serverSize: server && Number.isFinite(server.size) ? server.size : null,
    serverFresh,
    builtAt: startedAt,
    finishedAt,
    ok: reason === null,
    reason,
  }
}

/** 外部后端：不声称构建，不登记 owned（#32）。 */
export function externalBackendRecord ({ pid = null, health = null } = {}) {
  return {
    ownership: 'external',
    pid,
    health,
    startedThisRun: false,
    build: null,
    buildClaimed: false,
    reason: '3001 已被外部后端占用：本轮未构建，也不声称运行产物对应本仓库 HEAD',
  }
}

// ---------- 运行态 ----------

let runId = null
let runDir = null
let backendChild = null
let preview = null
let gate = null

function nowIso () { return new Date().toISOString() }

function messageOf (error) { return error instanceof Error ? error.message : String(error) }

function sha256 (value) { return createHash('sha256').update(value).digest('hex') }

function readJson (path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

function relPath (target) {
  if (!target || !runDir) return target
  const rel = relative(runDir, target)
  return rel.startsWith('..') ? target : rel.split(sep).join('/')
}

function appendLog (logPath, text) {
  mkdirSync(dirname(logPath), { recursive: true })
  writeFileSync(logPath, text, { flag: 'a' })
}

function persist () {
  if (!gate) return
  writeManifest(GATE_MANIFEST, gate)
  writeManifest(join(runDir, 'gate.json'), gate)
}

function headInfo (root) {
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    const branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim()
    const status = execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }).trim()
    return { head: head || null, branch: branch || null, dirty: status.length > 0, dirtyFiles: status === '' ? 0 : status.split(/\r?\n/).length }
  } catch (error) {
    return { head: null, branch: null, dirty: null, error: messageOf(error) }
  }
}

function pidOnPort (port) {
  const out = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout ?? ''
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes('LISTENING')) continue
    const cols = line.trim().split(/\s+/)
    const local = cols[1] ?? ''
    if (!local.endsWith(':' + port)) continue
    const pid = Number(cols[cols.length - 1])
    if (Number.isInteger(pid)) return pid
  }
  return null
}

function processInfo (pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null
  if (process.platform !== 'win32') return { pid }
  const script = [
    "$ErrorActionPreference='Stop';",
    '$p = Get-CimInstance Win32_Process -Filter "ProcessId = ' + pid + '";',
    'if ($null -eq $p) { exit 3 };',
    '$start = $null; try { $start = $p.CreationDate.ToUniversalTime().ToString("o") } catch {}',
    '[pscustomobject]@{ pid = [int]$p.ProcessId; parentPid = [int]$p.ParentProcessId; startTime = $start; execPath = $p.ExecutablePath; commandLine = $p.CommandLine } | ConvertTo-Json -Compress',
  ].join(' ')
  const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' })
  if (result.status !== 0 || !result.stdout) return null
  try {
    const info = JSON.parse(result.stdout.replace(/^\uFEFF/, ''))
    return { pid: Number(info.pid), parentPid: Number(info.parentPid), startTime: info.startTime ?? null, execPath: info.execPath ?? null, commandLine: info.commandLine ?? null }
  } catch { return null }
}

async function fetchText (url, timeoutMs = 5000) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    const text = await response.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    return { ok: response.ok, status: response.status, text, json, error: null }
  } catch (error) {
    return { ok: false, status: 0, text: '', json: null, error: messageOf(error) }
  }
}

function killTree (child) {
  if (!child || child.exitCode !== null) return
  try { child.kill() } catch {}
  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  }
}

async function runLogged (command, args, logPath, { cwd = GATE_ROOT, env = process.env, timeoutMs = 600000 } = {}) {
  appendLog(logPath, '\n$ ' + [command, ...args].join(' ') + '\n[' + nowIso() + ']\n')
  const fd = openSync(logPath, 'a')
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', fd, fd], windowsHide: true })
  closeSync(fd)
  const result = await new Promise((resolvePromise) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      killTree(child)
      resolvePromise({ code: null, timedOut: true, error: 'timeout' })
    }, timeoutMs)
    child.once('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise({ code, timedOut: false, error: null })
    })
    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise({ code: null, timedOut: false, error: messageOf(error) })
    })
  })
  appendLog(logPath, '[' + nowIso() + '] exit=' + (result.code === null ? (result.error ?? 'null') : result.code) + '\n')
  return result
}

function pnpmInvocation (script) {
  return process.platform === 'win32'
    ? [process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm ' + script]]
    : ['pnpm', [script]]
}

function runPnpm (script, logPath, options = {}) {
  const [command, args] = pnpmInvocation(script)
  return runLogged(command, args, logPath, options)
}

function snapshotDist () {
  const indexPath = join(GATE_ROOT, 'dist', 'index.html')
  if (!existsSync(indexPath)) return { existed: false, indexPath }
  try {
    const stat = statSync(indexPath)
    return {
      existed: true,
      indexPath,
      mtime: stat.mtime.toISOString(),
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      sha256: sha256(readFileSync(indexPath)),
    }
  } catch (error) {
    return { existed: true, indexPath, error: messageOf(error) }
  }
}

/** 读取本轮要运行的 dist/server.js：sha256 + mtime 是「运行产物对应所报 HEAD」的证据。 */
function serverArtifact () {
  const target = join(BACKEND_ROOT, 'dist', 'server.js')
  if (!existsSync(target)) return null
  try {
    const stat = statSync(target)
    return { path: target, sha256: sha256(readFileSync(target)), mtime: stat.mtime.toISOString(), mtimeMs: stat.mtimeMs, size: stat.size }
  } catch (error) {
    return { path: target, error: messageOf(error) }
  }
}

/** 进程存活；Windows 上 EPERM 表示进程存在但无权限查询，仍算存活。 */
function isAlive (pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return Boolean(error && error.code === 'EPERM')
  }
}

async function esSnapshot (label) {
  const pid = pidOnPort(ES_PORT)
  const info = pid === null ? null : processInfo(pid)
  const http = await fetchText(ES_URL, 2000)
  const json = http.json
  const reachable = Boolean(http.ok && json && json.version && typeof json.version.number === 'string')
  return {
    label,
    capturedAt: nowIso(),
    port: ES_PORT,
    pid,
    startTime: info && info.startTime ? info.startTime : null,
    execPath: info && info.execPath ? info.execPath : null,
    commandLine: info && info.commandLine ? info.commandLine : null,
    reachable,
    http: {
      ok: Boolean(http.ok),
      status: http.status,
      error: http.error,
      clusterName: json && json.cluster_name ? json.cluster_name : null,
      version: json && json.version && json.version.number ? json.version.number : null,
      clusterUuid: json && json.cluster_uuid ? json.cluster_uuid : null,
      bodySha256: http.text ? sha256(http.text) : null,
      bodySnippet: http.text ? http.text.slice(0, 400) : '',
    },
  }
}

function compareEsSnapshots (before, after) {
  const checks = {
    pidSame: Boolean(before && after) && before.pid !== null && before.pid === after.pid,
    startTimeSame: Boolean(before && after) && before.startTime !== null && before.startTime === after.startTime,
    stillReachable: Boolean(after && after.reachable),
    clusterUuidSame: Boolean(before && after) && before.http.clusterUuid !== null && before.http.clusterUuid === after.http.clusterUuid,
    httpStatusSame: Boolean(before && after) && before.http.status !== 0 && before.http.status === after.http.status,
  }
  const unchanged = Object.values(checks).every(Boolean)
  return { checks, unchanged, reason: unchanged ? null : '外部 ES 前后快照不一致：' + Object.entries(checks).filter(([, value]) => !value).map(([key]) => key).join(', ') }
}

// ---------- 步骤实现 ----------

const handlers = {}

handlers.verify = async (step) => {
  const logPath = join(runDir, 'verify.log')
  step.log = relPath(logPath)
  const result = await runPnpm('verify', logPath, { timeoutMs: 900000 })
  step.exitCode = result.code
  step.timedOut = result.timedOut
  gate.distAfterVerify = snapshotDist()
  writeManifest(join(runDir, 'dist-after-verify.json'), gate.distAfterVerify)
  if (result.timedOut) return { status: 'fail', reason: 'pnpm verify 超时' }
  if (result.error) return { status: 'fail', reason: 'pnpm verify 无法执行：' + result.error }
  if (result.code !== 0) return { status: 'fail', reason: 'pnpm verify 失败（exit ' + result.code + '）' }
  if (!gate.distAfterVerify.existed) return { status: 'fail', reason: 'verify 通过但 dist/index.html 不存在' }
  return { status: 'pass' }
}

async function waitBackendHealthy (child, timeoutMs) {
  const started = Date.now()
  let last = null
  let exited = child && child.exitCode !== null ? child.exitCode : null
  let childError = null
  if (child) {
    child.once('exit', (code) => { exited = code })
    child.once('error', (error) => { childError = messageOf(error) })
  }
  while (Date.now() - started < timeoutMs) {
    if (childError) return { ok: false, reason: '后端进程启动失败：' + childError, last }
    if (exited !== null) return { ok: false, reason: '后端进程提前退出（exit ' + exited + '）', last }
    const products = await fetchText(BACKEND_BASE + '/api/products?page=1&pageSize=1', 4000)
    const detail = await fetchText(BACKEND_BASE + '/api/products/apple-earpods', 4000)
    last = {
      products: { status: products.status, items: products.json && Array.isArray(products.json.items) ? products.json.items.length : null },
      detail: { status: detail.status, slug: detail.json && detail.json.slug ? detail.json.slug : null },
    }
    const productsOk = products.ok && last.products.items !== null && last.products.items > 0
    const detailOk = detail.ok && last.detail.slug === 'apple-earpods'
    if (productsOk && detailOk) return { ok: true, checks: last }
    await sleep(500)
  }
  return { ok: false, reason: '等待 3001 后端预检超时', last }
}

handlers.backend = async (step) => {
  const serverPath = join(BACKEND_ROOT, 'dist', 'server.js')
  const preflight = {
    backendRoot: BACKEND_ROOT,
    packageJson: existsSync(join(BACKEND_ROOT, 'package.json')),
    envFile: existsSync(join(BACKEND_ROOT, '.env')),
    dist: existsSync(serverPath),
  }
  step.preflight = preflight
  if (!preflight.backendRoot || !preflight.packageJson) return { status: 'fail', reason: 'SHOP_BACKEND_ROOT 无效：' + BACKEND_ROOT }
  if (!preflight.envFile) return { status: 'fail', reason: '后端 .env 缺失：' + join(BACKEND_ROOT, '.env') }

  // 3001 已有健康实例：记为 external，不构建、不声称运行产物（#32）。
  const occupied = pidOnPort(BACKEND_PORT)
  if (occupied !== null) {
    const health = await waitBackendHealthy(null, 15000)
    if (!health.ok) return { status: 'fail', reason: '3001 已被进程 ' + occupied + ' 占用，但后端预检不通过' }
    const external = externalBackendRecord({ pid: occupied, health })
    gate.services.backend = { ...external, process: processInfo(occupied) }
    step.ownership = 'external'
    step.pid = occupied
    step.health = health.checks
    step.backendBuild = null
    writeManifest(join(runDir, 'backend-build.json'), { ownership: 'external', pid: occupied, build: null, reason: external.reason })
    return { status: 'pass' }
  }

  // 自己启动后端：总是先在本轮跑 pnpm build，把 dist/server.js 的 sha256/mtime 与所报 HEAD 绑在一起（#32）。
  const buildLog = join(runDir, 'backend-build.log')
  const builtAt = nowIso()
  const build = await runPnpm('build', buildLog, { cwd: BACKEND_ROOT, timeoutMs: 300000 })
  const evidence = backendBuildEvidence({
    head: headInfo(BACKEND_ROOT).head,
    startedAt: builtAt,
    finishedAt: nowIso(),
    exitCode: build.code,
    timedOut: build.timedOut,
    log: relPath(buildLog),
    server: serverArtifact(),
  })
  step.backendBuild = evidence
  gate.services.backend = { ownership: 'none', pid: null, startedThisRun: false, build: evidence, buildClaimed: false }
  writeManifest(join(runDir, 'backend-build.json'), evidence)
  if (!evidence.ok) return { status: 'fail', reason: evidence.reason }

  const logPath = join(runDir, 'backend.log')
  appendLog(logPath, '\n$ node dist/server.js (PORT=' + BACKEND_PORT + ')\n[' + nowIso() + ']\n')
  const fd = openSync(logPath, 'a')
  backendChild = spawn(process.execPath, [serverPath], {
    cwd: BACKEND_ROOT,
    env: { ...process.env, PORT: String(BACKEND_PORT) },
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  })
  closeSync(fd)
  // P0：spawn 后立即登记 ownership；后续健康检查失败也必须走 cleanup。
  gate.services.backend = { ownership: 'owned', pid: backendChild.pid, startedThisRun: true, status: 'starting', build: evidence, buildClaimed: true }
  const health = await waitBackendHealthy(backendChild, 60000)
  if (!health.ok) {
    killTree(backendChild)
    gate.services.backend = { ...gate.services.backend, health, failed: true }
    return { status: 'fail', reason: health.reason }
  }
  gate.services.backend = { ownership: 'owned', pid: backendChild.pid, process: processInfo(backendChild.pid), health, startedThisRun: true, build: evidence, buildClaimed: true }
  step.ownership = 'owned'
  step.pid = backendChild.pid
  step.health = health.checks
  step.log = relPath(logPath)
  return { status: 'pass' }
}

handlers.es = async (step) => {
  const before = gate.externalEs.before
  if (before && before.reachable) {
    gate.services.es = { ownership: 'external', snapshot: before, startedThisRun: false, reason: 'gate 启动前 9201 已有可用实例' }
    step.ownership = 'external'
    step.ownershipReason = gate.services.es.reason
    step.pid = before.pid
    step.version = before.http.version
    return { status: 'pass' }
  }
  if (before && before.pid !== null) {
    return { status: 'fail', reason: '端口 ' + ES_PORT + ' 被非 Elasticsearch 进程 ' + before.pid + ' 占用' }
  }
  const logPath = join(runDir, 'es-start.log')
  const provenancePath = join(runDir, 'es-provenance.json')
  step.startLog = relPath(logPath)
  step.provenance = relPath(provenancePath)
  // 清掉上一轮残留：没有本轮证据时只能判 external，不能被旧文件冒充。
  try { rmSync(provenancePath, { force: true }) } catch {}
  const result = await runLogged(process.execPath, [join(BACKEND_ROOT, 'scripts', 'es-dev.mjs')], logPath, {
    cwd: BACKEND_ROOT,
    timeoutMs: 240000,
    env: { ...process.env, ES_PROVENANCE_FILE: provenancePath },
  })
  step.startExitCode = result.code
  const provenance = readJson(provenancePath)
  if (provenance) {
    step.provenanceRecord = {
      created: provenance.created === true,
      reused: provenance.reused === true,
      failed: provenance.failed === true,
      pid: Number.isInteger(provenance.pid) ? provenance.pid : null,
      reason: typeof provenance.reason === 'string' ? provenance.reason : null,
      at: typeof provenance.at === 'string' ? provenance.at : null,
    }
  }
  if (result.timedOut || result.code !== 0) {
    const verdict = evaluateEsOwnership({ provenance, exitCode: result.code, timedOut: result.timedOut, alive: isAlive(provenance && provenance.pid) })
    step.ownership = verdict.ownership
    step.ownershipReason = verdict.reason
    if (verdict.ownership === 'owned') {
      gate.services.es = { ownership: 'owned', pid: verdict.pid, startedThisRun: true, status: 'failed', provenance, provenanceFile: step.provenance, reason: verdict.reason }
    } else {
      gate.services.es = { ownership: 'none', pid: null, startedThisRun: false, provenance, provenanceFile: step.provenance, reason: verdict.reason }
    }
    return { status: 'fail', reason: 'es-dev.mjs 启动失败（exit ' + String(result.code) + (result.timedOut ? '，超时' : '') + '）：' + verdict.reason }
  }
  // exit 0 也可能是复用已有实例：先按监听者登记临时 owned，快照抛错时仍能收尾。
  const listenerPid = pidOnPort(ES_PORT)
  const provisional = evaluateEsOwnership({ provenance, listenerPid, alive: isAlive(provenance && provenance.pid) })
  if (provisional.ownership === 'owned') {
    gate.services.es = { ownership: 'owned', pid: provisional.pid, startedThisRun: true, status: 'starting', provenance, provenanceFile: step.provenance }
  }
  const snapshot = await esSnapshot('started')
  if (!snapshot.reachable) {
    if (provisional.ownership !== 'owned') {
      gate.services.es = { ownership: 'none', pid: null, startedThisRun: false, provenance, provenanceFile: step.provenance, reason: 'es-dev 退出后 9201 不可达' }
    }
    return { status: 'fail', reason: 'es-dev 退出后 9201 仍不可达' }
  }
  const verdict = evaluateEsOwnership({
    provenance,
    listenerPid: snapshot.pid,
    snapshotPid: snapshot.pid,
    alive: isAlive(provenance && provenance.pid),
  })
  step.ownership = verdict.ownership
  step.ownershipReason = verdict.reason
  step.pid = verdict.pid ?? snapshot.pid
  step.version = snapshot.http.version
  if (verdict.ownership === 'owned') {
    gate.services.es = { ownership: 'owned', pid: verdict.pid, startedThisRun: true, provenance, provenanceFile: step.provenance, snapshot }
    return { status: 'pass' }
  }
  // created:false / 缺证据 / pid 不符：一律 external，check:es blocked，收尾不停。
  gate.services.es = { ownership: 'external', pid: snapshot.pid, startedThisRun: false, provenance, provenanceFile: step.provenance, snapshot, reason: verdict.reason }
  step.externalReason = verdict.reason
  return { status: 'pass' }
}

async function startPreview () {
  if (preview) return preview
  const port = await findFreePort(4173)
  const logPath = join(runDir, 'preview.log')
  appendLog(logPath, '\n$ vite preview --port ' + port + '\n[' + nowIso() + ']\n')
  const fd = openSync(logPath, 'a')
  const child = spawn(process.execPath, [join(GATE_ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: GATE_ROOT,
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  })
  closeSync(fd)
  const baseUrl = 'http://127.0.0.1:' + port
  try {
    await waitForHttp(baseUrl + '/', { timeoutMs: 30000 })
  } catch (error) {
    killTree(child)
    throw error
  }
  preview = { child, port, baseUrl, log: relPath(logPath) }
  gate.services.preview = { pid: child.pid, port, baseUrl, log: preview.log }
  return preview
}

function inspectE2eManifest (manifest) {
  if (!manifest) return { ok: false, reason: 'e2e manifest 缺失' }
  const business = manifest.suites && manifest.suites.business
  const theme = manifest.suites && manifest.suites.theme
  if (manifest.status !== 'passed') return { ok: false, reason: 'e2e status=' + String(manifest.status) }
  if (!business || business.total !== 6 || business.passed !== 6 || business.failed !== 0) {
    return { ok: false, reason: '业务 E2E 不是 6/6：' + JSON.stringify(business ? { total: business.total, passed: business.passed, failed: business.failed } : null) }
  }
  if (!theme || theme.total !== 1 || theme.passed !== 1 || theme.failed !== 0) {
    return { ok: false, reason: 'theme.spec 不是 1/1：' + JSON.stringify(theme ? { total: theme.total, passed: theme.passed, failed: theme.failed } : null) }
  }
  if (Array.isArray(manifest.failures) && manifest.failures.length > 0) return { ok: false, reason: 'e2e failures 非空' }
  if (!manifest.browser || !manifest.browser.version) return { ok: false, reason: 'e2e 未记录浏览器版本' }
  return { ok: true, summary: { business: business.passed + '/' + business.total, theme: theme.passed + '/' + theme.total, browser: manifest.browser.version, backendHead: manifest.backend && manifest.backend.head ? manifest.backend.head : null } }
}

handlers.e2e = async (step) => {
  const server = await startPreview()
  const e2eRoot = join(runDir, 'e2e')
  const e2eRunId = runId + '-e2e'
  const e2eDir = join(e2eRoot, e2eRunId)
  mkdirSync(e2eDir, { recursive: true })
  const logPath = join(runDir, 'e2e.log')
  step.log = relPath(logPath)
  step.baseUrl = server.baseUrl
  const startedAt = new Date().toISOString()
  const result = await runPnpm('exec playwright test', logPath, {
    timeoutMs: 900000,
    env: {
      ...process.env,
      E2E_SKIP_WEBSERVER: '1',
      E2E_BASE_URL: server.baseUrl,
      E2E_ARTIFACT_DIR: e2eRoot,
      E2E_RUN_ID: e2eRunId,
      E2E_BACKEND_HEAD: gate.backend.head ?? '',
      E2E_BACKEND_WORKTREE: BACKEND_ROOT,
    },
  })
  const finishedAt = new Date().toISOString()
  step.exitCode = result.code

  let finished
  try {
    finished = await finishE2eRun({
      artifactRoot: e2eRoot,
      runId: e2eRunId,
      latestPath: LATEST_PATH,
      kind: 'full',
      result: { exitCode: result.code, timedOut: result.timedOut, signal: null },
      startedAt,
      finishedAt,
    })
  } catch (error) {
    return { status: 'fail', reason: 'E2E 收尾失败：' + messageOf(error) }
  }

  step.manifest = relPath(finished.manifestPath)
  step.latest = {
    suite: 'verify-e2e',
    path: relPath(finished.latestPath),
    runId: e2eRunId,
    status: finished.summary.status,
  }
  if (finished.latestError) step.latestError = finished.latestError
  if (finished.manifestWriteError) step.manifestWriteError = finished.manifestWriteError
  step.evidenceErrors = finished.evidenceErrors
  const verdict = inspectE2eManifest(finished.manifest)
  step.verdict = verdict.ok ? 'ok' : verdict.reason
  if (verdict.summary) step.summary = verdict.summary
  if (result.timedOut) return { status: 'fail', reason: 'Playwright 超时' }
  if (result.code !== 0) return { status: 'fail', reason: 'Playwright 失败（exit ' + result.code + '）' }
  if (finished.evidenceErrors.length > 0) return { status: 'fail', reason: '证据失败：' + finished.evidenceErrors.join('；') }
  if (finished.latestError) return { status: 'fail', reason: 'latest.json 指针写入失败：' + finished.latestError }
  if (!verdict.ok) return { status: 'fail', reason: verdict.reason }
  return { status: 'pass' }
}

function inspectCheckUiManifest (manifest) {
  if (!manifest) return { ok: false, reason: 'check:ui manifest 缺失' }
  if (manifest.fatalError) return { ok: false, reason: 'check:ui fatalError：' + manifest.fatalError }
  if (!Array.isArray(manifest.cases) || manifest.cases.length !== 6) {
    return { ok: false, reason: 'check:ui 用例数不是 6：' + (Array.isArray(manifest.cases) ? manifest.cases.length : 'missing') }
  }
  const bad = manifest.cases.filter((item) => item.status !== 'pass').map((item) => item.id)
  if (bad.length > 0) return { ok: false, reason: 'check:ui 未通过：' + bad.join(', ') }
  if (manifest.summary && manifest.summary.failed !== 0) return { ok: false, reason: 'check:ui summary.failed=' + manifest.summary.failed }
  return { ok: true, summary: { total: manifest.cases.length, checks: manifest.cases.reduce((sum, item) => sum + Object.keys(item.checks ?? {}).length, 0), browser: manifest.mode && manifest.mode.browser ? manifest.mode.browser : null } }
}

handlers['check-ui'] = async (step) => {
  const artifactRoot = join(runDir, 'check-ui')
  const uiRunId = runId + '-ui'
  const logPath = join(runDir, 'check-ui.log')
  step.log = relPath(logPath)
  step.runId = uiRunId
  const result = await runLogged(process.execPath, [join(GATE_ROOT, 'scripts', 'acceptance', 'check-ui.mjs'), '--skip-build', '--run-id', uiRunId], logPath, {
    timeoutMs: 900000,
    env: { ...process.env, UI_ARTIFACT_DIR: artifactRoot, UI_LATEST_PATH: LATEST_PATH },
  })
  step.exitCode = result.code
  const manifestPath = join(artifactRoot, uiRunId, 'manifest.json')
  step.manifest = relPath(manifestPath)
  const verdict = inspectCheckUiManifest(readJson(manifestPath))
  if (verdict.summary) step.summary = verdict.summary
  if (result.timedOut) return { status: 'fail', reason: 'check:ui 超时' }
  if (result.code !== 0) return { status: 'fail', reason: 'check:ui 失败（exit ' + result.code + '）' }
  if (!verdict.ok) return { status: 'fail', reason: verdict.reason }
  return { status: 'pass' }
}

function runReverse (config) {
  return async (step) => {
    const artifactRoot = join(runDir, 'reverse')
    const uiRunId = runId + '-' + config.id
    const logPath = join(runDir, config.id + '.log')
    step.log = relPath(logPath)
    step.reverse = config.mode
    step.expectedCase = config.caseId
    step.expectedCheck = config.expectedCheck
    const result = await runLogged(process.execPath, [
      join(GATE_ROOT, 'scripts', 'acceptance', 'check-ui.mjs'),
      '--skip-build',
      '--only=' + config.caseId,
      '--reverse=' + config.mode,
      '--run-id', uiRunId,
    ], logPath, {
      timeoutMs: 600000,
      env: { ...process.env, UI_ARTIFACT_DIR: artifactRoot, UI_LATEST_PATH: LATEST_PATH },
    })
    step.exitCode = result.code
    const manifestPath = join(artifactRoot, uiRunId, 'manifest.json')
    step.manifest = relPath(manifestPath)
    if (result.timedOut) return { status: 'fail', reason: '反向运行超时' }
    const verdict = evaluateReverseRun({
      manifest: readJson(manifestPath),
      reverse: config.mode,
      expectedCase: config.caseId,
      expectedCheck: config.expectedCheck,
    })
    step.verdict = { ok: verdict.ok, code: verdict.code, reason: verdict.reason, failedChecks: verdict.failedChecks, failedCases: verdict.failedCases }
    if (result.code === 0) return { status: 'fail', reason: '反向运行 exit 0：目标断言没有变红' }
    if (!verdict.ok) return { status: 'fail', reason: verdict.code + '：' + verdict.reason }
    return { status: 'pass' }
  }
}

function inspectCheckEsManifest (manifest) {
  if (!manifest) return { ok: false, reason: 'check:es manifest 缺失' }
  if (manifest.fatalError) return { ok: false, reason: 'check:es fatalError：' + manifest.fatalError }
  const entries = Object.entries(manifest.checks ?? {})
  if (entries.length === 0) return { ok: false, reason: 'check:es 没有断言记录' }
  const failed = entries.filter(([, value]) => value !== true).map(([key]) => key)
  if (failed.length > 0) return { ok: false, reason: 'check:es 未通过：' + failed.join(', ') }
  if (manifest.checks.esRestored !== true) return { ok: false, reason: 'check:es 未恢复 ES' }
  return { ok: true, summary: { total: entries.length, passed: entries.length, restored: true } }
}

handlers['check-es'] = async (step) => {
  const artifactRoot = join(runDir, 'check-es')
  const esRunId = runId + '-es'
  const logPath = join(runDir, 'check-es.log')
  step.log = relPath(logPath)
  step.runId = esRunId
  const result = await runLogged(process.execPath, [join(GATE_ROOT, 'scripts', 'acceptance', 'check-es-degraded.mjs'), '--skip-build', '--run-id', esRunId], logPath, {
    timeoutMs: 900000,
    env: { ...process.env, UI_ARTIFACT_DIR: artifactRoot, UI_LATEST_PATH: LATEST_PATH, SHOP_BACKEND_ROOT: BACKEND_ROOT },
  })
  step.exitCode = result.code
  const manifestPath = join(artifactRoot, esRunId + '-p7es', 'manifest.json')
  step.manifest = relPath(manifestPath)
  const verdict = inspectCheckEsManifest(readJson(manifestPath))
  if (verdict.summary) step.summary = verdict.summary
  if (result.timedOut) return { status: 'fail', reason: 'check:es 超时' }
  if (result.code !== 0) return { status: 'fail', reason: 'check:es 失败（exit ' + result.code + '）' }
  if (!verdict.ok) return { status: 'fail', reason: verdict.reason }
  return { status: 'pass' }
}

// ---------- 步骤调度 ----------

async function runStep (id) {
  const step = gate.steps.find((item) => item.id === id)
  const blockers = step.deps.filter((dep) => {
    const target = gate.steps.find((item) => item.id === dep)
    return !target || target.status !== 'pass'
  })
  if (blockers.length > 0) {
    step.status = 'blocked'
    step.blockedBy = blockers
    step.reason = '依赖未通过：' + blockers.join(', ')
    step.startedAt = nowIso()
    step.finishedAt = step.startedAt
    console.error('[gate] BLOCKED ' + id + '：' + step.reason)
    persist()
    return step
  }
  if (id === 'check-es' && gate.services.es && gate.services.es.ownership === 'external') {
    step.status = 'blocked'
    const externalPid = gate.services.es.snapshot ? gate.services.es.snapshot.pid : gate.services.es.pid
    step.reason = '9201 不是本轮创建的实例（' + String(gate.services.es.reason ?? '外部实例') + '；pid=' + String(externalPid ?? '?') + '）；不对非本轮启动的 ES 执行停机恢复'
    step.externalEs = gate.services.es.snapshot
    step.startedAt = nowIso()
    step.finishedAt = step.startedAt
    console.error('[gate] BLOCKED check-es：' + step.reason)
    persist()
    return step
  }
  step.status = 'running'
  step.startedAt = nowIso()
  persist()
  try {
    const result = await handlers[id](step)
    if (result && result.status) step.status = result.status
    else step.status = 'pass'
    if (result && result.reason) step.reason = result.reason
  } catch (error) {
    step.status = 'fail'
    step.reason = messageOf(error)
  }
  step.finishedAt = nowIso()
  step.durationMs = Date.parse(step.finishedAt) - Date.parse(step.startedAt)
  console.log('[gate] ' + step.status.toUpperCase() + ' ' + id + (step.reason ? '：' + step.reason : ''))
  persist()
  return step
}

// ---------- 收尾 ----------

async function cleanupServices () {
  const cleanup = { preview: null, backend: null, es: null }
  if (preview) {
    killTree(preview.child)
    cleanup.preview = { killed: true, pid: preview.child.pid, baseUrl: preview.baseUrl, port: preview.port, portReleased: await waitPortReleased(preview.port) }
  }
  if (backendChild && gate.services.backend && gate.services.backend.ownership === 'owned') {
    killTree(backendChild)
    cleanup.backend = { killed: true, pid: backendChild.pid, port: BACKEND_PORT, portReleased: await waitPortReleased(BACKEND_PORT) }
    backendChild = null
  } else if (gate.services.backend && gate.services.backend.ownership === 'external') {
    cleanup.backend = { killed: false, external: true, reason: '外部后端保持原状' }
  }
  if (gate.services.es && gate.services.es.ownership === 'owned') {
    const logPath = join(runDir, 'es-stop.log')
    const result = await runLogged(process.execPath, [join(BACKEND_ROOT, 'scripts', 'es-stop.mjs')], logPath, { cwd: BACKEND_ROOT, timeoutMs: 120000 })
    const after = await esSnapshot('cleanup')
    cleanup.es = { stopped: result.code === 0 && after.reachable === false, exitCode: result.code, reachableAfter: after.reachable, log: relPath(logPath) }
    gate.services.es.stoppedAfterGate = cleanup.es.stopped
  } else if (gate.services.es && gate.services.es.ownership === 'external') {
    cleanup.es = { stopped: false, external: true, reason: '外部 ES 保持原状，未停止或重启' }
  }
  const verdict = cleanupVerdict(cleanup)
  cleanup.ok = verdict.ok
  cleanup.failures = verdict.reason
  gate.cleanup = cleanup
  persist()
}

async function captureExternalAfter () {
  const before = gate.externalEs.before
  if (!before || before.pid === null) return
  const after = await esSnapshot('after')
  gate.externalEs.after = after
  gate.externalEs.comparison = compareEsSnapshots(before, after)
  gate.externalEs.beforeFile = relPath(join(runDir, 'es-external-before.json'))
  gate.externalEs.afterFile = relPath(join(runDir, 'es-external-after.json'))
  writeManifest(join(runDir, 'es-external-after.json'), after)
  persist()
}

export function gateRunManifestPath (dir) {
  return join(dir, 'gate.json')
}

// P0：收尾失败或端口未释放必须让 gate 非绿。外部服务不参与判定。
export function cleanupVerdict (cleanup) {
  if (!cleanup) return { ok: false, reason: 'cleanup 未执行' }
  const failures = []
  if (cleanup.error) failures.push(cleanup.error)
  if (cleanup.preview && cleanup.preview.killed === true && cleanup.preview.portReleased === false) failures.push('preview 端口未释放')
  if (cleanup.backend && cleanup.backend.external !== true && cleanup.backend.portReleased === false) failures.push('后端端口未释放')
  if (cleanup.es && cleanup.es.external !== true && cleanup.es.stopped !== true) failures.push('ES 未停止')
  return { ok: failures.length === 0, reason: failures.join('; ') || null }
}

async function waitPortReleased (port, timeoutMs = 5000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (pidOnPort(port) === null) return true
    await sleep(200)
  }
  return pidOnPort(port) === null
}

function finalize () {
  gate.finishedAt = nowIso()
  const base = summarizeSteps(gate.steps)
  const fatal = Boolean(gate.fatalError)
  gate.summary = {
    total: base.total,
    passed: base.passed,
    failedSteps: base.failed,
    blocked: base.blocked,
    skipped: base.skipped,
    failed: base.failed + base.blocked + base.skipped,
    fatal,
    green: base.green && !fatal,
    exitCode: base.green && !fatal ? 0 : 1,
    artifactRoot: ARTIFACT_ROOT,
    runDir,
    gateManifest: gateRunManifestPath(runDir),
    rootGateManifest: GATE_MANIFEST,
    latestPath: LATEST_PATH,
  }
  if (gate.externalEs && gate.externalEs.comparison && gate.externalEs.comparison.unchanged === false) {
    gate.summary.externalEsChanged = true
    gate.summary.green = false
    gate.summary.exitCode = 1
  }
  const cleanupCheck = cleanupVerdict(gate.cleanup)
  if (!cleanupCheck.ok) {
    gate.summary.cleanupError = cleanupCheck.reason
    gate.summary.green = false
    gate.summary.exitCode = 1
  }
  if (!gate.summary.green && !gate.summary.failed) gate.summary.failed = 1
  persist()
}

async function main () {
  runId = process.env.GATE_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, '-')
  runDir = join(ARTIFACT_ROOT, 'runs', runId)
  mkdirSync(runDir, { recursive: true })
  const frontend = headInfo(GATE_ROOT)
  const backendHead = existsSync(BACKEND_ROOT) ? headInfo(BACKEND_ROOT) : { head: null, branch: null, dirty: null }
  gate = {
    version: 1,
    runId,
    startedAt: nowIso(),
    finishedAt: null,
    commit: frontend.head,
    frontend,
    backend: { root: BACKEND_ROOT, ...backendHead },
    env: { node: process.version, platform: process.platform, backendPort: BACKEND_PORT, esPort: ES_PORT },
    artifactRoot: ARTIFACT_ROOT,
    runDir,
    gateManifest: gateRunManifestPath(runDir),
    rootGateManifest: GATE_MANIFEST,
    latestPath: LATEST_PATH,
    steps: STEP_DEFS.map((def) => ({ ...def, status: 'pending', startedAt: null, finishedAt: null, durationMs: null, reason: null })),
    services: { backend: null, es: null, preview: null },
    externalEs: { before: null, after: null, comparison: null },
    staleDist: null,
    distAfterVerify: null,
    cleanup: null,
    summary: null,
    fatalError: null,
  }
  console.log('[gate] run ' + runId)
  console.log('[gate] backend -> ' + BACKEND_ROOT + (BACKEND_ROOT_FALLBACK ? '（未设置 SHOP_BACKEND_ROOT；../shop-backend 不存在，回退 ../be-int）' : ''))
  console.log('[gate] artifacts -> ' + ARTIFACT_ROOT)

  try {
    gate.externalEs.before = await esSnapshot('before')
    writeManifest(join(runDir, 'es-external-before.json'), gate.externalEs.before)
    gate.externalEs.beforeFile = relPath(join(runDir, 'es-external-before.json'))
    console.log('[gate] 9201 before: ' + (gate.externalEs.before.pid === null ? '空闲' : 'pid=' + gate.externalEs.before.pid + ' reachable=' + gate.externalEs.before.reachable))

    gate.staleDist = snapshotDist()
    gate.staleDist.removedAt = nowIso()
    if (gate.staleDist.existed) {
      rmSync(join(GATE_ROOT, 'dist'), { recursive: true, force: true })
      gate.staleDist.removed = true
    } else {
      gate.staleDist.removed = false
    }
    writeManifest(join(runDir, 'stale-dist.json'), gate.staleDist)
    persist()

    await runStep('verify')
    await runStep('backend')
    await runStep('es')
    await runStep('e2e')
    await runStep('check-ui')
    for (const config of REVERSE_CASES) {
      handlers[config.id] = runReverse(config)
      await runStep(config.id)
    }
    await runStep('check-es')
  } catch (error) {
    gate.fatalError = messageOf(error)
    console.error('[gate] FATAL ' + gate.fatalError)
  } finally {
    try { await cleanupServices() } catch (error) { gate.cleanupError = messageOf(error) }
    try { await captureExternalAfter() } catch (error) { gate.externalEs.captureError = messageOf(error) }
    finalize()
    try {
      await recordRun({ suite: 'gate', latestPath: LATEST_PATH, manifestPath: gateRunManifestPath(runDir), manifest: gate, kind: 'full' })
    } catch (error) {
      gate.summary.latestError = messageOf(error)
      gate.summary.green = false
      gate.summary.exitCode = 1
      persist()
    }
    const summary = gate.summary
    console.log('[gate] summary ' + summary.passed + '/' + summary.total + ' pass; failed=' + summary.failed + ' blocked=' + summary.blocked + '; green=' + summary.green)
    console.log('[gate] gate.json -> ' + GATE_MANIFEST)
    if (gate.externalEs && gate.externalEs.comparison) {
      console.log('[gate] 外部 ES 未变更：' + gate.externalEs.comparison.unchanged + (gate.externalEs.comparison.reason ? '；' + gate.externalEs.comparison.reason : ''))
    }
    process.exitCode = summary.exitCode
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null
const modulePath = fileURLToPath(import.meta.url)
const isMain = invokedPath !== null && (process.platform === 'win32'
  ? invokedPath.toLowerCase() === modulePath.toLowerCase()
  : invokedPath === modulePath)

if (isMain) {
  main().catch((error) => {
    console.error('[gate] FATAL ' + messageOf(error))
    process.exitCode = 1
  })
}
