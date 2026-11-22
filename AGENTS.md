# AGENTS.md

本文件是 `shop-frontend` 仓库的 agent 操作说明。全局规则以 `~/.dsh/AGENTS.md` 为准；本文件只补充项目上下文。

## 项目

- 课程大作业题目二「电商商品列表及详情页开发」的前端仓库。
- 后端为独立仓库 `shop-backend`；两个仓库通过后端生成的 `openapi.json` 对接。
- 规划文档（决策台账、推进计划）位于 `D:\pages\webqianduan\big-homework\`，不在本仓库内。

## 约束

- 动手前先读规划文档中的决策台账；标为「已确认」的决策不得擅自修改。
- 不提交、不 push，除非用户明确授权。
- 不把 `.env`、口令、token 写入仓库；只保留占位示例。
- 文档与提交信息用中文；代码标识符保持实际大小写，不做归一化。
- 未验证的结论不写成事实；事实、推论、建议分开写。

## 组件库样式与验收

- 新增、修改或复审任何用户可见 UI 元件时，先核对仓库当前版本的 Vuetify 组件与 API。有适用组件时，优先用它渲染控件本体及关联界面，并通过组件属性、插槽和项目主题适配需求。此规则覆盖所有元件及其状态，包括展开后的选项、浮层、抽屉和内部滚动条。
- Vuetify 无适用组件时，记录能力缺口和实现理由，保留合适的 HTML 语义与交互，并用项目主题显式定义可见样式。浏览器或系统默认外观仅限用户明确同意的例外。
- 完成前在真实浏览器中操作每个受影响的元件，检查实际 DOM、计算样式和可见结果。覆盖适用的默认、展开、选中、焦点、禁用和溢出状态。受主题或断点影响的元件，还须验证浅色、暗色及桌面、390px 窄屏。交接时记录各元件的实际渲染来源和验证证据。
- **验收顺序：先跑 smoke，通过后再做真实视觉验证。** 视觉验证是 UI 任务的必做验收项，须实际查看浏览器渲染画面并记录证据。涉及动画或过渡时，检查过程中的画面。交接分别记录 smoke 和视觉验证的结果；未查看实际画面时，视觉验证标为待验。
- **复审交接分三栏写**：① 静态代码发现（文件:行 + 依据）；② smoke 结果（命令、manifest、断言数）；③ 实看证据（截图路径 + 观察结论）。三者不合并成一句「已通过」。

## 双仓库约定

本作业由两个独立仓库组成：`shop-frontend` 与 `shop-backend`。

- 跨仓库的契约变更（接口路径、字段、错误码、分页 / 排序 / 价格规则）必须在同一阶段内两边闭环，不允许只改一侧。
- 涉及跨仓库的改动，提交信息里引用同一决策编号（如 `C38`）。
- 一次只在一个仓库里开工；需要同时改两边时，先落后端契约，再改前端消费，避免对着未落地的契约写代码。
- 清理阶段（分支合并、worktree 清理）两个仓库各做一次。

## 命令

```bash
pnpm install        # 安装依赖（精确版本，见 pnpm-lock.yaml）
pnpm dev            # 开发服务器（Vite，默认 5173）
pnpm build          # 类型检查 + 生产构建（run-p type-check build-only）
pnpm type-check     # 统一类型检查入口（vue-tsc --build --force）
pnpm check:docs     # README 契约数字（路径数 / 组件数）与 schema.d.ts 一致性
pnpm check:cart     # 购物车回归：存档恢复、只读入口、persist 守卫
pnpm check:ui       # UI 验收：干净构建 + F1 / R26 / R27 / P7-NAV / P7-PURCHASE / P7-MOTION 冒烟与截图证据（调试可加 `-- --only=P7-PURCHASE`）
pnpm check:es       # ES 降级与恢复的独立实机复验（P7-ES；会停并恢复本轮 ES）
pnpm lint           # Oxlint correctness 基线（check-only）
pnpm verify         # check:docs + 全量单测 + lint + build
pnpm verify:e2e     # Playwright 六条业务路径 + theme.spec（本地必跑）
pnpm gate           # 本地总门禁 verify → 后端/ES → Playwright → check:ui → 三条反向 → check:es
pnpm stack          # 开发栈三端状态：前端 5173 / 后端 3001 / ES 9201
pnpm preview        # 预览构建产物
```

启停（Windows）：

```bat
start.bat           # 启动开发服务器，端口 5173
stop.bat            # 停止并释放端口
```

- 端口在 `scripts/dev.mjs` 单点定义，通过 `--port` 与 `--strictPort` 强制下发给 Vite，避免脚本探测端口与应用监听端口漂移。
- 启动记录写入 `.run/dev.json`（已 gitignore）。`stop.bat` 会校验 pid 存活 + 该 pid 确实监听记录端口，不符时**拒绝终止**，避免误杀其他进程。
- 重复执行 `start.bat` 不会产生第二个进程，会提示「已在运行」。
- 新建 worktree 的准备工作（依赖单独安装、读 `node_modules` 的路径写法、素材目录）见 `docs/worktree-setup.md`。
- 提交前由 pre-commit hook 自动跑 `pnpm check:docs`、`pnpm check:cart` 与 `pnpm build`（含 type-check）；`pnpm install` 时经 `prepare` 安装。
- `type-check` 已开 `noUnusedLocals` / `noUnusedParameters`：未用变量或导入会让构建变红；类型测试里的断言别名必须写成 `export type`，否则会被同一条规则拦下。
- CI 按 `check:docs` → `check:cart` → `build` 的顺序执行，其中构建已包含 type-check，不再单独跑 `pnpm type-check`。
- UI 验收先跑 `pnpm check:ui`（默认 clean build + preview，独立临时浏览器 profile；含 F1 / R26 / R27 与 Phase 7 的 P7-NAV / P7-PURCHASE / P7-MOTION）；ES 降级另有独立入口 `node scripts/acceptance/check-es-degraded.mjs`（会停本轮 ES 再恢复，不并入 check:ui 预检）。脚本通过后仍须实际查看 manifest 指向的关键截图，分别记录 smoke 与视觉验证结果。用法与证据约定见 `scripts/acceptance/README.md`。
- **依赖构建白名单**：pnpm 12 用 `pnpm-workspace.yaml` 的 `allowBuilds`（**映射形式** `'包名': true`）决定哪些依赖可以跑构建脚本。写在 `package.json` 的 `pnpm` 字段**不生效**，写成列表会报 `expected mapping start`。本仓库用它放行 `@parcel/watcher`（`sass` 的依赖）。

## Agent skills

### Issue tracker

Issues and specs live in this repo's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles with default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.

