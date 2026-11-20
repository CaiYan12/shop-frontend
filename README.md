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

1. 后端产出契约：在 `shop-backend` 执行 `pnpm openapi:generate`，生成 `shop-backend/openapi.json`（OpenAPI 3.1.0，6 个业务路径、20 个命名组件，含 `ErrorResponse` 错误信封）。
2. 前端生成类型：在 `tools/openapi` 执行 `node scripts/generate.mjs`（或 `pnpm generate`），输出 `src/api/schema.d.ts`。该目录用 `pnpm install --ignore-workspace` 单独安装 `openapi-typescript@7.13.0` 与 `typescript@5.9.3`，避免与根目录的 TypeScript 6 混用。
3. 生成物顶部带 `openapi-typescript` 的 `COMMENT_HEADER`「勿手改」横幅；要改类型先改后端契约再重新生成，不要手改 `schema.d.ts`。
4. 生成器在写出前自检：`openapi` 版本必须为 `3.1.0`、业务路径数必须为 6、六个 `operationId`（`listProducts` / `listSuggestions` / `getProduct` / `listRecommendations` / `listCategories` / `checkPurchase`）必须齐全；任一不满足以退出码 1 结束且不写产物。

### 验收记录

| 项 | 命令 | 退出码 | 关键输出 |
|---|---|---|---|
| 生成器可用 | `cd tools/openapi && node scripts/generate.mjs` | 0 | `OpenAPI 3.1.0 · 6 个路径 · 20 个命名组件`；`自检通过：openapi=3.1.0 · 业务路径=6 · operationId=6/6` |
| 生成器可重复 | 再次执行同一命令 | 0 | `schema.d.ts` 的 SHA-256 前后均为 `bb1ef57c5e50ec5f5a1bba2523a6e4b65a7b83fc2b8408b20218d07694d850a4`，无差异 |
| 契约含商品联想（#22） | `grep -n 'listSuggestions' src/api/schema.d.ts` | 0 | 生成 `/api/products/suggestions` 路径与 `operations["listSuggestions"]`，响应引用 `ProductSuggestionsResponse` |
| 生成器自检（负向） | `OPENAPI_INPUT=<篡改副本> node scripts/generate.mjs`（版本改为 3.0.3、删掉 `listCategories` 的 `operationId`） | 1 | `自检失败：OpenAPI 版本应为 3.1.0，实际为 3.0.3`；`缺少 operationId：listCategories`；未写出产物 |
| 消费端可用 | `pnpm type-check` | 0 | `vue-tsc --build --force` 通过（仅 `vue-router` 的 rootDir 提示） |
| 消费端可用 | `pnpm build` | 0 | `✓ built in 2.84s` |
| 穷尽检查（负向） | 删除 `describePurchaseResult` 的 `case 'INSUFFICIENT_STOCK'` 后 `pnpm type-check` | 2 | `TS2345`：`INSUFFICIENT_STOCK` 分支不可赋给 `never` |
| 穷尽检查（恢复） | 恢复该分支后 `pnpm type-check` | 0 | 通过 |

## 当前状态

Phase 0（项目初始化与对齐）已完成仓库初始化与文档骨架；Phase 3 的 OpenAPI 契约类型已生成并被前端消费。Phase 5（前端基础与列表页）已实现：

- Vuetify 4 的浅色 / 暗色主题与页头主题切换；
- 列表页的搜索（含防抖联想）、商品类型 / 价格 / 销量筛选、排序与分页；
- 商品卡片、加载骨架、空态、503 降级与保留旧结果；
- 命中高亮（只把成对 `<em>` 渲染为强调）；
- 购物车 Pinia store 雏形。

Phase 6（详情页与购物车）已实现：

- 商品详情页：轮播与放大查看（5 图 / 键盘可切）、两维规格选择与组合价/库存联动、数量输入校验、加购提示、图文详情、相关推荐；
- 右侧固定购物车：摘要（件数与总金额）、抽屉面板（名称 / 单价 / 数量 / 小计 / 删除）、小屏底部抽屉；
- `localStorage` 单键存档（`shop-frontend:cart:v1`）与启动恢复复核：脏数据丢弃、按商品去重核对、请求失败不改存档、写入失败保留上次值。

## 目录

```text
src/
├── api/          # openapi-fetch 客户端、生成的契约类型、购买结果映射
├── components/   # 页头、搜索、筛选、卡片与高亮组件（需显式 import）
├── composables/  # 商品联想状态机、主题偏好
├── pages/        # 列表页 index.vue、详情页 product.vue
├── plugins/      # Vuetify / Pinia / Router 注册
├── router/       # 路由表
├── stores/       # Pinia store（购物车雏形与骨架期 demo）
├── styles/       # Tailwind、Vuetify 设置与圆角样式
├── theme/        # 站点身份、主题色板与 Vuetify 主题映射
├── utils/        # URL 编解码、分价格式化、命中高亮解析
├── App.vue
└── main.ts
```

- `components/`：6 个文件——`AppHeader`、`HighlightedText`、`ProductCard`、`ProductFilterBar`、`ProductFilterControls`、`ProductSearchBar`；不使用自动全局注册，必须显式 import。
- `composables/`：`useProductSuggestions`（250 ms 防抖 + AbortController 的联想状态机）、`useThemePreference`（页头主题切换的唯一入口）。
- `utils/`：`list-query`（URL ↔ 列表查询参数的唯一编解码）、`price`（分 → 人民币展示）、`highlight`（命中片段分段解析）。
- `stores/`：`cart`（购物车内存态与 `localStorage` 存档恢复；运行时检查见 `scripts/phase6/cart-runtime-check.test.ts`，运行 `pnpm check:cart`）。
- `theme/`：`THEME_PALETTE` 是颜色唯一来源，`vuetify-theme` 只做命名转换。

仓库内还有 `tools/openapi/`（契约类型生成器）、`scripts/`（dev / stop / git hooks）、`docs/`（worktree 与 agent 约定）、`public/images/products/`（商品素材）。

## 相关仓库

- 后端：`shop-backend`
- 规划文档（决策台账、推进计划）不在本仓库内。

## 文档

- `AGENTS.md` — 本仓库的 agent 操作说明
- `CHANGELOG.md` — 变更记录
