/**
 * 验收证据根与 latest.json 的默认路径解析（#33，G5）。
 *
 * worktree 布局下仓库根不是主检出：
 *   <main>/session-tmp/phase8-spec.md   ← 规划文档所在，权威证据根
 *   <main>/session-tmp/ui-acceptance/   ← 四个入口共用的 latest.json
 *   <main>/wt/<worktree>/               ← 各分支 worktree，入口从这里向上找
 *
 * 旧默认 resolve(ROOT, '..', 'session-tmp') 在 worktree 里会落到 <main>/wt/session-tmp，
 * 指针被拆成两份。四个入口（check-ui / check-es / verify:e2e / gate）统一走本模块：
 * 优先含 phase8-spec.md 的 session-tmp，其次最近的已存在 session-tmp，最后退回父目录。
 */
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export const SESSION_TMP_DIR = 'session-tmp'
export const MAIN_MARKER = 'phase8-spec.md'
export const UI_ACCEPTANCE_DIR = 'ui-acceptance'
export const E2E_ACCEPTANCE_DIR = 'e2e-acceptance'
export const LATEST_FILE = 'latest.json'

const MAX_DEPTH = 8

/**
 * 从 start 逐级向上找 session-tmp。
 * @param {string} start 仓库根或任意子目录
 * @returns {string} 绝对路径
 */
export function findSessionTmp (start) {
  const origin = resolve(start)
  const candidates = []
  let cursor = origin
  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    const candidate = join(cursor, SESSION_TMP_DIR)
    if (existsSync(candidate)) candidates.push(candidate)
    const parent = dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }
  // 规划文档所在的 session-tmp 才是权威证据根；worktree 布局下 wt/session-tmp 可能被其他运行创建。
  const marked = candidates.find((candidate) => existsSync(join(candidate, MAIN_MARKER)))
  return marked ?? candidates[0] ?? join(dirname(origin), SESSION_TMP_DIR)
}

/** check:ui / check:es 的默认证据根：<session-tmp>/ui-acceptance。 */
export function uiAcceptanceDir (start) {
  return join(findSessionTmp(start), UI_ACCEPTANCE_DIR)
}

/** verify:e2e 的默认证据根：<session-tmp>/e2e-acceptance。 */
export function e2eAcceptanceDir (start) {
  return join(findSessionTmp(start), E2E_ACCEPTANCE_DIR)
}

/**
 * latest.json 的默认路径：<session-tmp>/ui-acceptance/latest.json。
 * override 对应各入口自己的环境变量（UI_LATEST_PATH / E2E_LATEST_PATH / GATE_LATEST_PATH）。
 */
export function resolveLatestPath ({ start, override = null } = {}) {
  if (typeof start !== 'string' || start.trim() === '') throw new Error('resolveLatestPath 需要 start 目录')
  const fromEnv = typeof override === 'string' ? override.trim() : ''
  if (fromEnv !== '') return resolve(fromEnv)
  return join(uiAcceptanceDir(start), LATEST_FILE)
}
