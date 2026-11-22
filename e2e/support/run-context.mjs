/**
 * 每轮 E2E 的固定证据目录与运行 ID（E1）。
 *
 * 默认与 check:ui 同源：<repo>/../session-tmp/e2e-acceptance/<runId>/。
 * E2E_ARTIFACT_DIR / E2E_RUN_ID 可覆盖，供 gate 或定向复跑复用固定目录。
 *
 * Playwright 的 config / globalSetup / reporter 在不同进程里执行；
 * 仅靠 config 里改 process.env 不能让 globalSetup 读到同一个 runId。
 * 因此 config 用 createRunContext() 生成一次，并把 runId 写到 artifactRoot
 * 的 .run-id 指针；其余进程用 resolveRunContext() 读同一个指针。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)))

function artifactRoot () {
  return process.env.E2E_ARTIFACT_DIR?.trim()
    ? resolve(process.env.E2E_ARTIFACT_DIR)
    : resolve(REPO_ROOT, '..', 'session-tmp', 'e2e-acceptance')
}

function pointerPath (root) {
  return join(root, '.run-id')
}

export function createRunId () {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/** config 进程调用：显式给定 E2E_RUN_ID 时复用，否则生成一轮新的 runId。 */
export function createRunContext () {
  const root = artifactRoot()
  const runId = process.env.E2E_RUN_ID?.trim() || createRunId()
  mkdirSync(join(root, runId), { recursive: true })
  writeFileSync(pointerPath(root), runId + '\n', 'utf8')
  return { runId, runDir: join(root, runId) }
}

/** globalSetup / reporter 调用：读 config 写下的同一轮 runId。 */
export function resolveRunContext () {
  const root = artifactRoot()
  const fromEnv = process.env.E2E_RUN_ID?.trim()
  const pointer = pointerPath(root)
  const runId = fromEnv || (existsSync(pointer) ? readFileSync(pointer, 'utf8').trim() : '')
  if (runId === '') {
    return createRunContext()
  }
  const runDir = join(root, runId)
  mkdirSync(runDir, { recursive: true })
  return { runId, runDir }
}
