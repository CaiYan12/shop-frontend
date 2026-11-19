#!/usr/bin/env node
/**
 * 一次性打印本地开发栈三端状态，替代 `netstat -ano | findstr` 手工拼端口。
 * 为什么需要：Phase 5 一个会话里查端口用了 33 次 netstat（retro P5）。
 *
 * 端口来源（单点，改端口时同步这里）：
 * - 前端 5173：`scripts/dev.mjs` 的 CONFIG.port
 * - 后端 3001：`shop-backend/scripts/dev.mjs`
 * - ES   9201：`shop-backend/scripts/es-dev.mjs` 的 ES_HTTP_PORT
 *
 * 用法：node scripts/stack-status.mjs [--json]
 */
import { existsSync, readFileSync } from 'node:fs'
import net from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const TARGETS = [
  { name: 'frontend', host: 'localhost', port: 5173, note: 'vite' },
  { name: 'backend', host: '127.0.0.1', port: 3001, note: 'fastify' },
  { name: 'es', host: '127.0.0.1', port: 9201, note: 'elasticsearch' },
]

function probe (host, port, timeoutMs = 400) {
  return new Promise(resolve => {
    const sock = new net.Socket()
    let settled = false
    const finish = ok => {
      if (settled) return
      settled = true
      sock.destroy()
      resolve(ok)
    }
    sock.setTimeout(timeoutMs)
    sock.once('connect', () => finish(true))
    sock.once('timeout', () => finish(false))
    sock.once('error', () => finish(false))
    sock.connect(port, host)
  })
}

/** 前端 pid 记录在 .run/dev.json，顺带核对进程是否还活着。 */
function frontendPid () {
  const file = join(ROOT, '.run', 'dev.json')
  if (!existsSync(file)) return null
  try {
    const { pid } = JSON.parse(readFileSync(file, 'utf8'))
    if (!pid) return null
    process.kill(pid, 0)
    return pid
  } catch {
    return null
  }
}

const pid = frontendPid()
const rows = await Promise.all(TARGETS.map(async t => ({
  ...t,
  up: await probe(t.host, t.port),
  extra: t.name === 'frontend' && pid ? `pid ${pid}` : '',
})))

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows.map(r => ({ name: r.name, host: r.host, port: r.port, up: r.up, pid: r.name === 'frontend' ? pid : null })), null, 2))
} else {
  for (const r of rows) {
    const state = r.up ? 'up  ' : 'down'
    const tail = r.extra ? `(${r.note} · ${r.extra})` : `(${r.note})`
    console.log(`${r.name.padEnd(9)} ${`${r.host}:${r.port}`.padEnd(20)} ${state}  ${tail}`)
  }
}
