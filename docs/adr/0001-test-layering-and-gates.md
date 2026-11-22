# 测试分层与本地总门禁

## 背景与决定

Phase 8 要建立单元 / API / E2E 三层测试与可重复的本地总门禁。当前前端只有 node:test 纯逻辑测试与 `check:ui` 的零依赖 CDP 视觉验收，后端有 206 条测试（API 层为 `app.inject` 路由级用例）；三个测试工具（Vitest / Playwright / Oxlint）都未安装。我们决定：

- **单元层**：引入 Vitest + jsdom + Vue Test Utils，迁移现有 17 条 node:test 用例；纯逻辑用例跑 Node 环境，组件用例跑 jsdom；`check:cart` / `check:ui:unit` 保留为定向入口，`verify` 跑一次全量单测。首批组件测试为 `QuantityInput`：输入更新原始文本、失焦触发校验提示、加减边界、禁用行为。
- **API 层**：后端现有 206 条测试中的 `app.inject` 路由用例即 API 层；Phase 8 只做验收项映射与缺口补测，不新建框架。206 是整套测试总数，验收记录按对应路由用例统计。
- **E2E 层**：Playwright 覆盖搜索、详情规格、加购、修改 / 删除、刷新恢复、模拟购买六条业务路径；`theme.spec.ts` 单独验 O3，不计入六条。默认使用本机 Chrome，显式 `CHROME_PATH` 优先；缺少浏览器时明确报错。本地必跑，单 worker、零重试、失败保留 trace；本阶段不新增前端 E2E CI。`check:ui` 继续承担视觉、冒烟、反向与动效证据；后端保留 `search-es` CI。
- **lint**：两个仓库用 Oxlint 的 `correctness: "error"` 基线，前端启用 Vue 脚本规则；CI 与手动入口都 check-only，pre-commit 沿用现有检查。两仓分别用坏样例验证门禁确实失败。
- **本地总门禁**：`pnpm gate` 串联 `verify` → 后端预检 / 启动 → Playwright → `check:ui` → 三条反向（`island` / `purchase` / `purchase-price`）→ `check:es`。只复用本轮成功生成的构建产物；前置失败把依赖步骤记为 `blocked`，其余独立步骤继续；汇总 `gate.json` 并以非零退出。三条反向读 manifest，分别核对唯一失败断言命中预期。已存在且通过预检的服务可供只读步骤复用；`check:es` 只对本轮启动的专用 ES 执行停机恢复，`9201` 被他例占用时该步记为 `blocked`，总门禁不得判绿。收尾只关闭本轮启动的服务。
- **记录**：`phase8-acceptance.md` 存命令、结果与证据路径；每次运行写固定 manifest；`latest.json` 按 suite 记 `lastFull`（最近一次完成的全量，含失败）与 `lastRun`（最近一次完成，含 `only` / `reverse` / 失败），先落 manifest 再更新指针，并以并发安全方式合并；正式验收链接固定 manifest，并记录前后端各自的 HEAD 与工作树状态。
- **文档**：本 ADR 记架构取舍；`scripts/acceptance/README.md` 记验收 / 调试入口用法；`GLOSSARY.md` 只留产品术语。

## 理由

- 现有 17 条 node:test 与后端 206 条已经有价值，迁移 / 沿用比另起炉灶便宜；Vitest 只为组件测试与统一报告付成本，Oxlint 只为跨仓 lint 付成本。
- `check:ui` 的像素取样、反向验证、动效中间帧是 Playwright 迁移成本最高的部分，保留它能避免 Phase 8 变成一次重写。
- 前端 E2E 依赖 MySQL + ES + 后端，放进 CI 的维护成本高于本阶段收益；本地 `gate` 提供可重复证据，CI 继续跑快速门禁与后端 `search-es`。
- 用一套 lint 工具覆盖两个仓库，并避开后端当前的 TypeScript peer 约束：后端 TS 7 与 `@typescript-eslint/parser` 的 peer 上限（`<6.1.0`）冲突，因此不采用 ESLint + typescript-eslint 的双仓方案。
- `latest.json` 只做调试入口，正式验收链接固定 manifest，避免「指针指向哪次运行」成为验收歧义。

## 考虑过的其他方案

- **只用 node:test**：省依赖，但没有组件测试与统一 runner；用户选择 Vitest。
- **Playwright 全面替代 `check:ui`**：长期更整齐，但 97 条断言、像素取样、反向与动效迁移成本高，本阶段不做。
- **前端 ESLint + 后端 Oxlint**：前端模板可 lint，但两套配置；且后端 TS 7 仍不能用 typescript-eslint。
- **E2E 进 CI**：覆盖更完整，但要加 MySQL + ES services 与后端启动；本阶段按计划把 E2E 放本地。
- **只有 gate 写 `latest.json`**：简单，但单次 `--only` / 反向运行没有稳定指针；改为四入口按 suite 更新。
- **单个原子替换写 `latest.json`**：不能防读改写丢更新；实现需并发安全合并，并加并发写入测试。

## 后果

- 两个浏览器栈（Playwright + CDP）并存，维护成本上升；`check:ui` 的视觉能力不可被 Playwright 完全替代。
- Oxlint 不 lint Vue 模板；模板类型由 `vue-tsc`，行为由 E2E 兜底。
- `gate` 依赖 3001 / 9201 与数据库，运行慢；只能本地必跑，CI 不覆盖前端集成。
- `latest.json` 的并发合并需要专门实现与测试；它只是调试入口，正式验收仍看固定 manifest。
- N6（D85）与 O3（D86）作为 Phase 8 的代码票单独跟踪；本 ADR 只定测试架构，不改变它们的验收口径。

## 状态

accepted（2026-11-22）