# tools/openapi

从 `shop-backend/openapi.json` 生成前端契约类型（决策 D65 / 验收 V17）。

## 为什么独立成包

`openapi-typescript@7.13.0` 的 peer 依赖是 `typescript@^5.x`，而前端根目录用的是
`@typescript/typescript6`。生成环境与消费环境分开验收：生成器在自己的 TS 5
环境跑通，产物再交给前端 TS 6 做类型检查。

本包**不在**前端 pnpm workspace 内（根 `pnpm-workspace.yaml` 没有 `packages` 字段），
所以必须用 `--ignore-workspace` 安装，否则 pnpm 会把它并入前端根包：

```bash
cd tools/openapi
pnpm install --ignore-workspace
```

## 生成

```bash
pnpm generate
```

- 默认输入：`../../../shop-backend/openapi.json`
- 默认输出：`../../src/api/schema.d.ts`
- 可用 `OPENAPI_INPUT` / `OPENAPI_OUTPUT` 覆盖路径。

生成是确定性的：同样的 `openapi.json` 重复运行不会产生差异，产物随仓库提交。
