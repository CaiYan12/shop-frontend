#!/usr/bin/env node
/**
 * 从 shop-backend 的 openapi.json 生成前端契约类型（决策 D65）。
 *
 * 默认输入：<repo>/../shop-backend/openapi.json
 * 默认输出：<repo>/src/api/schema.d.ts
 * 可用环境变量 OPENAPI_INPUT / OPENAPI_OUTPUT 覆盖，便于在 CI 或临时验证时指向别处。
 *
 * 生成后做契约自检：OpenAPI 版本、业务路径数、operationId 齐全，任一不满足
 * 以非零码退出且不写产物，避免把「看起来生成成功」的错误契约带进仓库。
 *
 * 本包用 `pnpm install --ignore-workspace` 安装，锁定 openapi-typescript@7.13.0
 * 与 typescript@5.9.3，避免与前端根目录的 TypeScript 6 混用。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript'

const HERE = dirname(fileURLToPath(import.meta.url))
const TOOL_ROOT = join(HERE, '..')
const REPO_ROOT = join(TOOL_ROOT, '..', '..')

/** 后端契约的预期形状；与 shop-backend 的 OpenAPI 生成器保持同步。 */
const EXPECTED_OPENAPI = '3.1.0'
const EXPECTED_PATH_COUNT = 5
const EXPECTED_OPERATION_IDS = [
  'listProducts',
  'getProduct',
  'listRecommendations',
  'listCategories',
  'checkPurchase',
]

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'])

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
const generated = astToString(ast)

// —— 生成后自检：契约形状不符合预期时非零退出，不写产物 ——
const operationIds = new Set()
for (const pathItem of Object.values(schema.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem ?? {})) {
    if (HTTP_METHODS.has(method) && operation?.operationId) {
      operationIds.add(operation.operationId)
    }
  }
}
const missingOperationIds = EXPECTED_OPERATION_IDS.filter((id) => !operationIds.has(id))

const failures = []
if (schema.openapi !== EXPECTED_OPENAPI) {
  failures.push(`OpenAPI 版本应为 ${EXPECTED_OPENAPI}，实际为 ${String(schema.openapi)}`)
}
if (pathCount !== EXPECTED_PATH_COUNT) {
  failures.push(`业务路径数应为 ${EXPECTED_PATH_COUNT}，实际为 ${pathCount}`)
}
if (missingOperationIds.length > 0) {
  failures.push(
    `缺少 operationId：${missingOperationIds.join(', ')}（期望 ${EXPECTED_OPERATION_IDS.join(', ')}）`,
  )
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[openapi] 自检失败：${failure}`)
  }
  console.error(`[openapi] 未写出 ${output}`)
  process.exit(1)
}
console.log(
  `[openapi] 自检通过：openapi=${EXPECTED_OPENAPI} · 业务路径=${EXPECTED_PATH_COUNT} · operationId=${EXPECTED_OPERATION_IDS.length}/${EXPECTED_OPERATION_IDS.length}`,
)

// openapi-typescript 导出的 COMMENT_HEADER 是「勿手改」横幅；生成器默认不拼，
// 这里显式加上，避免 schema.d.ts 被当成可手改文件。
const contents = COMMENT_HEADER + generated

await mkdir(dirname(output), { recursive: true })
await writeFile(output, contents, 'utf8')
console.log(`[openapi] 输出 ${output}（${contents.length} 字符，含勿手改横幅）`)
