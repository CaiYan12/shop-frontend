# shop-frontend

Web 前端开发技术课程大作业 · 题目二「电商商品列表及详情页开发」的前端仓库。

## 项目概述

商品列表页与商品详情页，覆盖搜索、分类筛选、排序、分页、规格选择、购物车与模拟购买校验。后端为独立仓库 `shop-backend`。

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Vue 3 + Vite 8 + TypeScript |
| UI | Vuetify 4（Material Design 3） |
| 样式 | Tailwind CSS 4 |
| 状态 | Pinia 4 |
| 路由 | Vue Router 5 |
| 动效 | GSAP 3 |
| 契约 | `openapi-typescript` + `openapi-fetch`，消费后端生成的 `openapi.json` |

## 契约类型（D65）

前端不手写后端响应类型，统一消费后端生成的 OpenAPI 契约：

1. 后端产出契约：在 `shop-backend` 执行 `pnpm openapi:generate`，生成 `shop-backend/openapi.json`（OpenAPI 3.1.0，5 个业务路径、15 个命名组件，含 `ErrorResponse` 错误信封）。
2. 前端生成类型：在 `tools/openapi` 执行 `node scripts/generate.mjs`（或 `pnpm generate`），输出 `src/api/schema.d.ts`。该目录用 `pnpm install --ignore-workspace` 单独安装 `openapi-typescript@7.13.0` 与 `typescript@5.9.3`，避免与根目录的 TypeScript 6 混用。
3. 生成物顶部带 `openapi-typescript` 的 `COMMENT_HEADER`「勿手改」横幅；要改类型先改后端契约再重新生成，不要手改 `schema.d.ts`。
4. 生成器在写出前自检：`openapi` 版本必须为 `3.1.0`、业务路径数必须为 5、五个 `operationId`（`listProducts` / `getProduct` / `listRecommendations` / `listCategories` / `checkPurchase`）必须齐全；任一不满足以退出码 1 结束且不写产物。

### 验收记录

| 项 | 命令 | 退出码 | 关键输出 |
|---|---|---|---|
| 生成器可用 | `cd tools/openapi && node scripts/generate.mjs` | 0 | `OpenAPI 3.1.0 · 5 个路径 · 15 个命名组件`；`自检通过：openapi=3.1.0 · 业务路径=5 · operationId=5/5` |
| 生成器可重复 | 再次执行同一命令 | 0 | `schema.d.ts` 的 SHA-256 前后均为 `e1567911d5b8710cac166571f1e81afb66208723f469eab7ca0119bfd1d7bd98`，无差异 |
| 生成器自检（负向） | `OPENAPI_INPUT=<篡改副本> node scripts/generate.mjs`（版本改为 3.0.3、删掉 `listCategories` 的 `operationId`） | 1 | `自检失败：OpenAPI 版本应为 3.1.0，实际为 3.0.3`；`缺少 operationId：listCategories`；未写出产物 |
| 消费端可用 | `pnpm type-check` | 0 | `vue-tsc --build --force` 通过（仅 `vue-router` 的 rootDir 提示） |
| 消费端可用 | `pnpm build` | 0 | `✓ built in 2.65s` |
| 穷尽检查（负向） | 删除 `describePurchaseResult` 的 `case 'INSUFFICIENT_STOCK'` 后 `pnpm type-check` | 2 | `TS2345`：`INSUFFICIENT_STOCK` 分支不可赋给 `never` |
| 穷尽检查（恢复） | 恢复该分支后 `pnpm type-check` | 0 | 通过 |

## 当前状态

Phase 0（项目初始化与对齐）已完成仓库初始化与文档骨架。应用骨架、列表页、详情页自 Phase 1 起逐步落地。

## 目录

Phase 1 建立骨架后补充。

## 相关仓库

- 后端：`shop-backend`
- 规划文档（决策台账、推进计划）不在本仓库内。

## 文档

- `AGENTS.md` — 本仓库的 agent 操作说明
- `CHANGELOG.md` — 变更记录
