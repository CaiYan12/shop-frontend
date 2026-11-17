# 新建 worktree 的准备工作

本文件是给 agent 与人的操作说明。`AGENTS.md` 只放指针，细节在这里。

## 1. 依赖要单独装

worktree 里没有 `node_modules`，进 worktree 后先 `pnpm install`。`prepare` 会自动安装 pre-commit hook。

## 2. 读 `node_modules` 里的包类型

pnpm 的 `node_modules/<包>` 是符号链接，OPS 文件工具拒绝穿过符号链接，`ops_glob` 也不列隐藏目录（`.pnpm`、`.github`）。

- 列目录用 shell `ls`，不要指望 `ops_glob`
- 读包内类型文件用 `.pnpm` 下的真实路径

## 3. 素材目录

商品图片在 `public/images/products/{slug}/`，来源与授权记录在 `docs/assets/product-images.json` 与 `public/images/products/CREDITS.md`。后端 `pnpm verify:images` 会检查这些文件是否存在、路径是否归属正确。
