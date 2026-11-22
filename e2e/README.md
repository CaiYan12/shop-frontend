# E2E（Playwright）

Phase 8 F3 建立的本机 E2E 入口，验收项 E1。与 `check:ui` 分工：

- `check:ui`：零依赖 CDP，负责视觉、像素取样、反向与动效证据；
- `verify:e2e`：Playwright，负责六条业务路径与 theme.spec.ts（O3，由 F4 添加），不替代 `check:ui`。

## 前置条件

- MySQL 已启动；
- 后端 `shop-backend` 已启动在 `127.0.0.1:3001`，Elasticsearch 在 `127.0.0.1:9201`（关键词搜索与联想需要 ES）；
- 本机已安装 Google Chrome（或设置 `CHROME_PATH` 指向 chrome.exe）；
- 已执行 `pnpm install`。

本入口**不会**下载 Playwright 自带 Chromium；缺少 Chrome 时在加载配置阶段报明确错误。

## 命令

```bash
pnpm verify:e2e                         # clean build + vite preview + 六条业务 spec
pnpm exec playwright test e2e/search.spec.ts   # 定向复跑单条
node scripts/acceptance/probe-chrome.mjs       # 最小 Chrome 探测（无需服务）
```

## 环境变量

| 变量 | 作用 |
|---|---|
| `CHROME_PATH` | 显式指定 Chrome 可执行文件；优先于自动探测 |
| `E2E_BASE_URL` | 覆盖默认 `http://127.0.0.1:4173`；配合 `E2E_SKIP_WEBSERVER=1` 复用已有服务 |
| `E2E_SKIP_WEBSERVER=1` | 不启动 `vite preview`（gate 复用已通过预检的服务时使用） |
| `E2E_REUSE_SERVER=1` | 允许 Playwright 复用 4173 上已在运行的服务 |
| `E2E_ARTIFACT_DIR` | 证据根目录；默认 `<repo>/../session-tmp/e2e-acceptance` |
| `E2E_RUN_ID` | 固定本轮目录名；默认按时间生成 |
| `E2E_BACKEND_HEAD` | 写入 manifest 的后端提交 SHA（正式验收必填） |
| `E2E_BACKEND_WORKTREE` | 写入 manifest 的后端 worktree 标识 |

## 固定 manifest

每轮写 `<E2E_ARTIFACT_DIR>/<runId>/manifest.json`，同目录的 `browser.json` 记录 globalSetup 的 Chrome 探测结果。manifest 包含：

- 运行状态、起止时间、提交 SHA / 分支、Node / 平台；
- 实际浏览器路径、来源（`CHROME_PATH` / `auto`）与版本；
- 后端 HEAD（`E2E_BACKEND_HEAD`）；
- `workers: 1`、`retries: 0`、`trace: retain-on-failure`；
- `suites.business` / `suites.theme` 分开统计；每条用例的状态、耗时与失败原因；
- 附件路径（失败时的 trace / 截图、购买校验请求与响应 JSON）。

## Spec 与验收点

| 文件 | 业务路径 |
|---|---|
| `search.spec.ts` | 关键词联想直达详情；提交后列表与 `/api/products` 一致 |
| `detail-spec.spec.ts` | 规格名称 / 选项来自契约；选齐后价格、库存与 SKU 联动 |
| `add-to-cart.spec.ts` | 选规格与数量后加购；摘要、面板与购物车存档一致 |
| `cart-edit-delete.spec.ts` | 面板内改量、删除；摘要、合计与存档同步 |
| `refresh-recovery.spec.ts` | 刷新后从存档恢复并完成恢复复核 |
| `purchase.spec.ts` | 正常购买经真实 UI 发出未拦截的 `POST /api/purchase-check`，响应 `result: 'purchasable'` 且页面展示可购买结果 |

购买用例不注册 `page.route` / CDP Fetch 拦截；仅变价 / 库存不足分支允许局部 mock（不在本票六条内）。
