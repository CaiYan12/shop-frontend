#!/usr/bin/env node
/**
 * 启动 shop-frontend 并记录进程归属，供 stop.mjs 校验。
 * 归属校验：pid 存活 + 该 pid 确实监听记录端口。
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const runDir = join(root, '.run')
const pidFile = join(runDir, 'dev.json')

const CONFIG = {
  name: 'shop-frontend',
  port: 5173,
  command: process.execPath,
  args: [
    join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
  ],
}

function readPidFile () {
  if (!existsSync(pidFile)) return null
  try {
    return JSON.parse(readFileSync(pidFile, 'utf8'))
  } catch {
    return null
  }
}

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

const existing = readPidFile()
if (existing) {
  if (isAlive(existing.pid) && pidOnPort(CONFIG.port) === existing.pid) {
    console.log('[dev] ' + CONFIG.name + ' 已在运行：pid=' + existing.pid + ' port=' + CONFIG.port)
    process.exit(0)
  }
  console.log('[dev] 发现失效的运行记录，已清理')
  unlinkSync(pidFile)
}

const occupied = pidOnPort(CONFIG.port)
if (occupied !== null) {
  console.error('[dev] 端口 ' + CONFIG.port + ' 已被进程 ' + occupied + ' 占用，无法启动 ' + CONFIG.name)
  console.error('[dev] 请先释放该端口，或修改配置后重试')
  process.exit(1)
}

mkdirSync(runDir, { recursive: true })

const child = spawn(CONFIG.command, CONFIG.args, {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
})

writeFileSync(pidFile, JSON.stringify({
  name: CONFIG.name,
  pid: child.pid,
  port: CONFIG.port,
  execPath: process.execPath,
  startedAt: new Date().toISOString(),
}, null, 2) + '\n', 'utf8')

console.log('[dev] ' + CONFIG.name + ' 已启动：pid=' + child.pid + ' port=' + CONFIG.port)

function cleanup () {
  try {
    if (existsSync(pidFile)) unlinkSync(pidFile)
  } catch {}
}

process.on('SIGINT', () => { child.kill(); cleanup(); process.exit(0) })
process.on('SIGTERM', () => { child.kill(); cleanup(); process.exit(0) })
child.on('exit', code => { cleanup(); process.exit(code ?? 0) })
