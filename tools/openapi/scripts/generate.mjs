#!/usr/bin/env node
/**
 * 从 shop-backend 的 openapi.json 生成前端契约类型（决策 D65）。
 *
 * 默认输入：<repo>/../shop-backend/openapi.json
 * 默认输出：<repo>/src/api/schema.d.ts
 * 可用环境变量 OPENAPI_INPUT / OPENAPI_OUTPUT 覆盖，便于在 CI 或临时验证时指向别处。
 *
 * 本包用 `pnpm install --ignore-workspace` 安装，锁定 openapi-typescript@7.13.0
 * 与 typescript@5.9.3，避免与前端根目录的 TypeScript 6 混用。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import openapiTS, { astToString } from 'openapi-typescript'

const HERE = dirname(fileURLToPath(import.meta.url))
const TOOL_ROOT = join(HERE, '..')
const REPO_ROOT = join(TOOL_ROOT, '..', '..')

const input = resolve(process.env.OPENAPI_INPUT ?? join(REPO_ROOT, '..', 'shop-backend', 'openapi.json'))
const output = resolve(process.env.OPENAPI_OUTPUT ?? join(REPO_ROOT, 'src', 'api', 'schema.d.ts'))

let schema
try {
  schema = JSON.parse(await readFile(input, 'utf8'))
} catch (error) {
  console.error(`[openapi] 读取契约失败：${input}`)
  console.error(`[openapi] ${error instanceof Error ? error.message : String(error)}`)
  console.error('[openapi] 可用 OPENAPI_INPUT 指定契约文件路径')
  process.exit(1)
}

const pathCount = Object.keys(schema.paths ?? {}).length
const schemaCount = Object.keys(schema.components?.schemas ?? {}).length
console.log(`[openapi] 输入 ${input}`)
console.log(`[openapi] OpenAPI ${schema.openapi} · ${pathCount} 个路径 · ${schemaCount} 个命名组件`)

const ast = await openapiTS(schema)
const contents = astToString(ast)

await mkdir(dirname(output), { recursive: true })
await writeFile(output, contents, 'utf8')
console.log(`[openapi] 输出 ${output}（${contents.length} 字符）`)
