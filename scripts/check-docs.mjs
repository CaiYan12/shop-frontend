#!/usr/bin/env node
/**
 * 校验 README 里的契约数字与 `src/api/schema.d.ts` 实际数量一致。
 * 为什么需要：Phase 5 评审发现 README 写「17 个命名组件」而后端契约已是 20 个——
 * 这类文档漂移只有人眼盯，改成机械检查（retro P4）。
 * 契约真身在 shop-backend，CI 读不到，所以对已生成的 schema.d.ts 取数。
 *
 * 用法：node scripts/check-docs.mjs [--readme <path>] [--schema <path>]
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function argOf (name, fallback) {
  const i = process.argv.indexOf(name)
  return i > -1 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : fallback
}

const readmePath = argOf('--readme', join(ROOT, 'README.md'))
const schemaPath = argOf('--schema', join(ROOT, 'src', 'api', 'schema.d.ts'))

/** 数出 `export interface paths {` 块里 4 空格缩进的路径键。 */
function countPaths (text) {
  const lines = text.split('\n')
  const start = lines.findIndex(l => /^export interface paths \{$/.test(l))
  if (start === -1) throw new Error('schema.d.ts 里找不到 `export interface paths {`')
  let n = 0
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\}$/.test(lines[i])) break
    if (/^ {4}"\/.*": \{$/.test(lines[i])) n++
  }
  return n
}

/** 数出 `components.schemas` 里 8 空格缩进的命名组件。 */
function countSchemas (text) {
  const lines = text.split('\n')
  const start = lines.findIndex(l => /^ {4}schemas: \{$/.test(l))
  if (start === -1) throw new Error('schema.d.ts 里找不到 `schemas: {`')
  let n = 0
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {4}\};?$/.test(lines[i])) break
    if (/^ {8}[A-Za-z_][A-Za-z0-9_]*: \{$/.test(lines[i])) n++
  }
  return n
}

/** 取出 README 里所有「N 个(业务)路径」「N 个(命名)组件」的声明。 */
function claimsOf (text, re) {
  const out = []
  for (const m of text.matchAll(re)) out.push({ value: Number(m[1]), line: m[0].trim() })
  return out
}

const schema = readFileSync(schemaPath, 'utf8')
const readme = readFileSync(readmePath, 'utf8')
const actualPaths = countPaths(schema)
const actualSchemas = countSchemas(schema)

const pathClaims = claimsOf(readme, /(\d+) 个(?:业务)?路径/g)
const schemaClaims = claimsOf(readme, /(\d+) 个(?:命名)?组件/g)

const problems = []
for (const [label, claims, actual] of [['路径', pathClaims, actualPaths], ['组件', schemaClaims, actualSchemas]]) {
  if (claims.length === 0) {
    problems.push(`README 里找不到「N 个${label}」的声明，规则已失效，需要同步本脚本`)
    continue
  }
  for (const c of claims) {
    if (c.value !== actual) problems.push(`README 写「${c.line}」，实际 ${actual} 个${label}`)
  }
}

console.log(`check-docs: schema.d.ts paths=${actualPaths} schemas=${actualSchemas}; README 声明 paths=${pathClaims.length} 处、schemas=${schemaClaims.length} 处`)

if (problems.length > 0) {
  for (const p of problems) console.error(`  ✗ ${p}`)
  process.exit(1)
}
console.log('check-docs: OK')
