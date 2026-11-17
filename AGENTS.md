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
- 提交前由 pre-commit hook 自动跑 `pnpm build`（含 type-check）；`pnpm install` 时经 `prepare` 安装。
- **依赖构建白名单**：pnpm 12 用 `pnpm-workspace.yaml` 的 `allowBuilds`（**映射形式** `'包名': true`）决定哪些依赖可以跑构建脚本。写在 `package.json` 的 `pnpm` 字段**不生效**，写成列表会报 `expected mapping start`。本仓库用它放行 `@parcel/watcher`（`sass` 的依赖）。

## Agent skills

### Issue tracker

Issues and specs live in this repo's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles with default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.

