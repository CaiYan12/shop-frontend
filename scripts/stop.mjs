#!/usr/bin/env node
/**
 * 停止 shop-frontend。终止前校验：记录存在 + pid 存活 + 该 pid 确实监听记录端口。
 * 任一不满足即拒绝终止，避免误杀其他进程。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pidFile = join(root, '.run', 'dev.json')

const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

function isAlive (pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
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

if (!existsSync(pidFile)) {
  console.log('[stop] 未发现运行记录，shop-frontend 可能未启动')
  process.exit(0)
}

let record
try {
  record = JSON.parse(readFileSync(pidFile, 'utf8'))
} catch {
  console.error('[stop] 运行记录损坏，请手工检查 .run/dev.json')
  process.exit(1)
}

if (!isAlive(record.pid)) {
  console.log('[stop] 进程 ' + record.pid + ' 已不存在，清理记录')
  unlinkSync(pidFile)
  process.exit(0)
}

const owner = pidOnPort(record.port)
if (owner !== record.pid) {
  console.error('[stop] 归属校验失败：记录 pid=' + record.pid + '，端口 ' + record.port + ' 实际属于 ' + (owner === null ? '无进程' : owner))
  console.error('[stop] 为避免误杀，本次不终止任何进程')
  process.exit(1)
}

spawnSync('taskkill', ['/PID', String(record.pid), '/T', '/F'], { stdio: 'inherit' })
unlinkSync(pidFile)

const deadline = Date.now() + 10000
while (Date.now() < deadline && pidOnPort(record.port) !== null) sleep(200)

if (pidOnPort(record.port) === null) {
  console.log('[stop] ' + record.name + ' 已停止，端口 ' + record.port + ' 已释放')
  process.exit(0)
}

console.error('[stop] 进程已发出终止指令，但端口 ' + record.port + ' 仍在监听')
process.exit(1)
