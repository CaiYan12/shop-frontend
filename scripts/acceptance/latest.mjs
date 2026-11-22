// latest.json：验收入口的调试指针。正式证据始终是它指向的固定 manifest。
// 并发语义：各入口只合并自己的 suite；共享文件用锁串行化，整份文档原子替换。
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, relative, resolve, sep } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

export const LATEST_VERSION = 1

// 四个正式入口各占一个 suite；check-ui / check-es / verify:e2e / gate 均已接入。
export const SUITES = ['check-ui', 'check-es', 'verify-e2e', 'gate']

const LOCK_SUFFIX = '.lock'
const LOCK_RETRY_MS = 10
const LOCK_TIMEOUT_MS = 20000
// stale 必须大于等锁超时，避免持锁临界区被误判为失效锁而并发写入（审查 P1-7）。
const LOCK_STALE_MS = 60000

export function defaultLatestPath (artifactRoot) {
  return resolve(artifactRoot, 'latest.json')
}

// 只有全量运行算 full；只要指定过 only / reverse（含空选择）就算定向运行，只更新 lastRun。
export function classifyRun ({ only = null, reverse = null } = {}) {
  const hasOnly = only !== null && only !== undefined
  const hasReverse = reverse !== null && reverse !== undefined
  return hasOnly || hasReverse ? 'targeted' : 'full'
}

function atomicWrite (filePath, text) {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = filePath + '.' + process.pid + '.' + randomUUID().slice(0, 8) + '.tmp'
  const fd = openSync(tmpPath, 'w')
  try {
    writeSync(fd, text)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  try {
    renameSync(tmpPath, filePath)
  } catch (error) {
    // Windows 上 rename 覆盖已存在文件可能失败；锁内只有一个写者，退回先删后改名。
    if (error && (error.code === 'EEXIST' || error.code === 'EPERM')) {
      rmSync(filePath, { force: true })
      renameSync(tmpPath, filePath)
      return
    }
    rmSync(tmpPath, { force: true })
    throw error
  }
}

export function writeManifest (manifestPath, manifest) {
  atomicWrite(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
}

function emptyLatest () {
  return { version: LATEST_VERSION, updatedAt: null, suites: {} }
}

function normalizeDocument (value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('latest.json 根节点不是对象')
  }
  const suites = value.suites && typeof value.suites === 'object' && !Array.isArray(value.suites)
    ? { ...value.suites }
    : {}
  return {
    version: LATEST_VERSION,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
    suites,
  }
}

function readLatestUnlocked (latestPath) {
  if (!existsSync(latestPath)) return emptyLatest()
  let text
  try {
    text = readFileSync(latestPath, 'utf8')
  } catch (error) {
    // 原子替换在 Windows 回退路径上会短暂移走目标文件；读不到时按空文档处理。
    if (error && error.code === 'ENOENT') return emptyLatest()
    throw error
  }
  try {
    return normalizeDocument(JSON.parse(text))
  } catch {
    // 指针只是调试入口：坏文件留档后重建，避免所有入口被一份坏 latest.json 卡死。
    try { renameSync(latestPath, latestPath + '.corrupt-' + Date.now()) } catch {}
    return emptyLatest()
  }
}

export function readLatest (latestPath) {
  return readLatestUnlocked(resolve(latestPath))
}

async function withFileLock (lockPath, fn) {
  mkdirSync(dirname(lockPath), { recursive: true })
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  let fd = null
  while (fd === null) {
    try {
      fd = openSync(lockPath, 'wx')
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error
      let stale = false
      try {
        stale = Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS
      } catch {}
      if (stale) {
        rmSync(lockPath, { force: true })
        continue
      }
      if (Date.now() > deadline) throw new Error('latest.json 锁等待超时：' + lockPath)
      await sleep(LOCK_RETRY_MS + Math.floor(Math.random() * LOCK_RETRY_MS))
    }
  }
  try {
    writeSync(fd, String(process.pid))
    return await fn()
  } finally {
    closeSync(fd)
    try { rmSync(lockPath, { force: true }) } catch {}
  }
}

function finishedTime (entry) {
  const parsed = Date.parse(entry && typeof entry.finishedAt === 'string' ? entry.finishedAt : '')
  return Number.isFinite(parsed) ? parsed : 0
}

function startedTime (entry) {
  const parsed = Date.parse(entry && typeof entry.startedAt === 'string' ? entry.startedAt : '')
  return Number.isFinite(parsed) ? parsed : 0
}

// “最近一次完成”按 finishedAt 比较；同一毫秒内完成时保留后写入的记录。
function isNewerOrEqual (candidate, current) {
  if (!current) return true
  const candidateFinished = finishedTime(candidate)
  const currentFinished = finishedTime(current)
  if (candidateFinished !== currentFinished) return candidateFinished > currentFinished
  return startedTime(candidate) >= startedTime(current)
}

function toRelative (latestPath, targetPath) {
  if (!targetPath) return null
  return relative(dirname(resolve(latestPath)), resolve(targetPath)).split(sep).join('/')
}

export function buildEntry ({ suite, kind, manifest, manifestPath, latestPath, status = null }) {
  if (typeof suite !== 'string' || suite.length === 0) throw new Error('latest.json 需要非空 suite')
  if (kind !== 'full' && kind !== 'targeted') throw new Error('latest.json 未知 kind：' + kind)
  const summary = manifest.summary && typeof manifest.summary === 'object' ? manifest.summary : null
  const failed = summary
    ? Boolean(summary.fatal) || Number(summary.failed ?? 0) > 0
    : Boolean(manifest.failed || manifest.fatalError)
  const startedAt = manifest.startedAt ?? null
  const finishedAt = manifest.finishedAt ?? new Date().toISOString()
  const startedMs = Date.parse(startedAt ?? '')
  const finishedMs = Date.parse(finishedAt)
  return {
    suite,
    kind,
    status: status ?? (failed ? 'fail' : 'pass'),
    runId: manifest.runId ?? null,
    startedAt,
    finishedAt,
    durationMs: Number.isFinite(startedMs) && Number.isFinite(finishedMs) ? Math.max(0, finishedMs - startedMs) : null,
    commit: manifest.commit ?? null,
    mode: manifest.mode ?? null,
    summary: summary
      ? {
          total: summary.total ?? null,
          passed: summary.passed ?? null,
          failed: summary.failed ?? null,
          fatal: Boolean(summary.fatal),
        }
      : null,
    manifest: toRelative(latestPath, manifestPath),
    artifactDir: toRelative(latestPath, dirname(resolve(manifestPath))),
  }
}

export async function updateLatest ({ latestPath, suite, kind, entry }) {
  if (typeof latestPath !== 'string' || latestPath.length === 0) throw new Error('latest.json 路径不能为空')
  const absolute = resolve(latestPath)
  return withFileLock(absolute + LOCK_SUFFIX, async () => {
    const current = readLatestUnlocked(absolute)
    const suites = { ...current.suites }
    const previous = suites[suite] && typeof suites[suite] === 'object' ? { ...suites[suite] } : {}
    const next = { ...previous }
    if (isNewerOrEqual(entry, previous.lastRun)) next.lastRun = entry
    if (kind === 'full' && isNewerOrEqual(entry, previous.lastFull)) next.lastFull = entry
    suites[suite] = next
    const document = {
      version: LATEST_VERSION,
      updatedAt: new Date().toISOString(),
      suites,
    }
    atomicWrite(absolute, JSON.stringify(document, null, 2) + '\n')
    return document
  })
}

// 先落固定 manifest，再更新指针；manifest 写失败时必须让 latest.json 保持原样。
export async function recordRun ({ suite, latestPath, manifestPath, manifest, kind = 'full', status = null }) {
  if (!manifest || typeof manifest !== 'object') throw new Error('recordRun 需要 manifest 对象')
  if (!manifestPath) throw new Error('recordRun 需要固定 manifest 路径')
  if (!latestPath) throw new Error('recordRun 需要 latest.json 路径')
  writeManifest(manifestPath, manifest)
  const entry = buildEntry({ suite, kind, manifest, manifestPath, latestPath, status })
  return updateLatest({ latestPath, suite, kind, entry })
}
