# UI 验收（check:ui）

`pnpm check:ui` 是 `shop-frontend` 的最小可重复 UI 验收入口。它默认：

1. 执行干净构建 `pnpm build`（含 type-check）；
2. 启动 `vite preview`（随机空闲端口，不使用 HMR dev server）；
3. 启动一个独立的临时浏览器 profile（默认 headless）；
4. 通过零依赖 CDP 跑 F1 / R26 / R27 三组真实交互与截图断言；
5. 写入本次运行的 `manifest.json` 和证据截图；失败时以非零状态退出。

## 前置条件

- 本机已安装 Chrome 或 Edge；也可用 `CHROME_PATH` 指定可执行文件。
- 后端 `shop-backend` 已启动在 `127.0.0.1:3001`，Elasticsearch 已启动在 `127.0.0.1:9201`。
  `vite preview` 沿用 `vite.config.mts` 的 `/api` 代理。脚本会先请求联想与详情接口做预检，服务不可用时直接报错。
- 已执行 `pnpm install`。

## 命令

```bash
pnpm check:ui                    # 干净构建 + 预览 + 六组验收（F1 / R26 / R27 / P7-NAV / P7-PURCHASE / P7-MOTION）
pnpm check:ui:unit               # 对比度门槛边界单测（27/27/27 vs 102/102/102）
pnpm check:ui -- --skip-build    # 复用现有 dist，迭代脚本时用
pnpm check:ui -- --headed        # 有头浏览器，便于人工观察
pnpm check:ui -- --only=P7-PURCHASE[,P7-MOTION]   # 只跑指定用例（默认仍是全量）
```

受控反向验证（只用于确认断言能变红）：

```bash
pnpm check:ui -- --skip-build --reverse=f1        # 联想列表上移，F1 必须失败
pnpm check:ui -- --skip-build --reverse=island     # 岛移到右下压住摘要，P7-NAV 必须失败（islandNotOverSummary）
pnpm check:ui -- --skip-build --reverse=purchase         # 保留首次 PRICE_CHANGED，模拟确认前就发出第二次校验，P7-PURCHASE 必须失败（confirmationRequired）
pnpm check:ui -- --skip-build --reverse=purchase-price   # 保留真实变价流程，只把第二次请求记录的期望价改回旧价，必须失败（secondRequestCarriesConfirmedPrice）
```

反向模式只用于确认断言能变红，不会修改仓库源码；验证完再跑一次正常命令即可。

用例抛错时，manifest 会保留抛错前已采集的 `checks` / `measurements` / `screenshots`；`--only` 只用于调试单组用例，正式验收仍跑全量。

可选环境变量：

- `UI_ARTIFACT_DIR`：证据根目录；默认 `../session-tmp/ui-acceptance`。
- `PREVIEW_PORT`：固定预览端口；默认自动寻找空闲端口。
- `CHROME_PATH`：Chrome / Edge 可执行文件路径。

## 用例

### F1：390px 搜索按钮真实点击

- 视口 `390×844`，输入 `sony`，等待联想展开。
- 用 `document.elementFromPoint` 检查搜索按钮中心是否命中按钮或其子元素，记录 `isButton` 与 `isListbox`。
- 真实点击按钮中心，断言 URL 提交 `keyword=sony` 且联想列表关闭。

### R26：放大图双轴轨道点击

- 桌面 `1365×900` 打开 `apple-earpods` 放大浮层，再点 `2×`。
- 断言放大视口确实同时产生横向、纵向溢出，且两根 OverlayScrollbars 可见。
- 分别真实点击纵向、横向轨道的空白处（避开 handle），记录命中元素、点击前后滚动量；两轴都必须向点击方向移动。

### R27：购物车 / 筛选抽屉原生滚动条对比度

- 购物车：`1365×900`、8 个商品，构造实际溢出；浅色、暗色各一次。
- 筛选抽屉：`390×360`，构造实际溢出；浅色、暗色各一次。
- 从截图的真实滚动条像素取样滑块与轨道：分别滚动到顶部和底部各拍一次，用滑块的实际位移区分两者；用**原始对比度**判定至少 `3:1`，只在 manifest / 失败文案中显示两位小数。
- 采样失败、滚动条不可见或没有实际溢出时，明确写入失败原因并以非零状态退出。

### P7-NAV：灵动岛职责、避让与可访问性

- `1365×900` 与 `390×844`、浅色与暗色四组：收起态文案与 `aria-expanded`、展开项 3 个、`aria-current`、`aria-controls` 指向面板、展开前后岛高差 ≤ 8px。
- 真实命中：展开态岛与搜索输入框 / 购物车摘要无几何重叠，输入框中心命中输入框；展开态仍能打开联想、点击摘要打开购物车面板。
- Esc 收起并回焦；展开后焦点落在第一个导航项（Tab 顺序完整）；浅暗两组的 `backdropFilter` 计算值都是 blur，强制无模糊时回退背景可读。
- 反向模式 `island` 把岛移到右下压住摘要后，`islandNotOverSummary` 必须变红。

### P7-PURCHASE：购买三分支、价格二次确认与前端拦截

- `1365×900`：用 CDP `Fetch` 拦截 `/api/purchase-check` 返回可控响应，连续两次 `PRICE_CHANGED` 后 `purchasable`；断言首请求携带页面展示价、确认后请求携带刚确认的新价、成功态小计与「不会生成订单」。
- 商品 / 规格 / 价格从详情接口解析（`fixtures.mjs`），不在断言里写死种子值；价格变化用固定相对增量，断言按实际值格式化。
- 断言只读「事件发生时保存的快照」；mock 被重装后不要回读旧句柄，也不要在用例末尾读已被替换的 `mock`。
- 库存不足分支按响应库存展示并给「调整数量」，关闭后回焦数量输入且保留原输入。
- 页面已知的超库存数量必须被前端拦截，且不发出购买校验请求。
- 已确认新价后第一次请求返回 500：点「重试」仍携带刚确认的 13500，不回到旧价。
- 关闭在途校验：`Network.loadingFailed` 出现 `canceled=true`；关闭后立即重开时旧响应不改写新对话框。
- 对话框 `aria-labelledby` 指向「模拟购买校验」标题；`390×844` 暗色下在视口内且两侧 ≥16px。

### P7-MOTION：动效与 reduced-motion

- 允许动画时：岛展开 / 收起、搜索联想显隐、成功加购的摘要强调都能采样到中间帧。
- 用 `Emulation.setEmulatedMedia` 切到 `prefers-reduced-motion: reduce`：三处直接落终态，加购功能照常生效。

### P7-ES：ES 降级与恢复（独立入口）

- `node scripts/acceptance/check-es-degraded.mjs --skip-build`：先确认在线搜索成功，再停本轮 ES → 关键词 503 固定文案 + 重试 / 清除关键词 → **停机期间真实点一次重试（仍 503、关键词保留）** → 普通浏览可用 → 恢复 ES 并等待冷却 → 点原页面「重试」恢复结果。
- 任一步抛错时会在 `finally` 恢复本轮停掉的 ES，并记录 `restoreAfterFailure`。
- 停机重试额外用 CDP `Network` 断言：点击确实发出新的关键词请求（`retryWhileDownSendsRequest`），且该请求响应为 HTTP 503（`retryWhileDownGets503`）。
- 会停并恢复本轮 `es-dev.mjs` 启动的 ES；不并入 `check:ui`（其预检强依赖联想接口）。

## 证据目录

默认按运行分目录：

```text
session-tmp/ui-acceptance/<runId>/
├── build.log
├── preview.log
├── manifest.json
├── f1/390-light/search-open.png
├── f1/390-light/search-submitted.png
├── r26/1365-light/zoom-2x.png
├── r26/1365-light/track-vertical.png
├── r26/1365-light/track-horizontal.png
├── p7-nav/1365-light/{collapsed,expanded,expanded-search}.png
├── p7-nav/1365-dark/expanded.png
├── p7-nav/390-light/expanded.png
├── p7-nav/390-dark/expanded.png
├── p7-purchase/1365-light/{price-changed-1,price-changed-2,purchasable,insufficient}.png
├── p7-purchase/390-dark/purchasable.png
├── p7-motion/1365-light/{nav-enter-mid,nav-enter-final,nav-leave-mid,search-enter-mid,summary-pulse-mid}.png
├── p7-motion/1365-reduced/nav-enter.png
└── r27/
    ├── cart/1365-light/{full,scrollbar-top,scrollbar-bottom}.png
    ├── cart/1365-dark/{full,scrollbar-top,scrollbar-bottom}.png
    ├── filter/390x360-light/{full,scrollbar-top,scrollbar-bottom}.png
    └── filter/390x360-dark/{full,scrollbar-top,scrollbar-bottom}.png
```

`manifest.json` 包含：运行时间、提交 SHA、浏览器模式、预览地址、预检结果、每个用例的断言对象、实测值、截图相对路径和失败原因。

## 结果解读

- 脚本退出码 `0`：六组 smoke 全部通过；**视觉验证仍待人工完成**。ES 降级看 `check-es-degraded.mjs` 自己的 manifest。
- 脚本退出码非 `0`：至少一个断言失败，或构建 / 预览 / 预检 / 浏览器启动失败。
- 脚本通过后必须实际查看 `manifest.json` 列出的关键截图，再分别记录 smoke 与视觉验证结果；脚本不代替肉眼验收。
- 本命令不接入 CI，也不启动后端或 Elasticsearch；它只负责前端干净构建后的可重复验收。

## 本地总门禁（`pnpm gate`）

`pnpm gate` 是 Phase 8 的本地总验收入口（#32 / G1-G4），顺序固定：

1. `pnpm verify`（docs → unit → lint → build）；
2. 后端预检 / 启动（`SHOP_BACKEND_ROOT`，默认 `../shop-backend`；校验 `.env` 与 `dist/server.js`）；
3. Elasticsearch 预检 / 启动（9201，经后端 `scripts/es-dev.mjs`）；
4. `pnpm exec playwright test`（gate 自起 preview，`E2E_SKIP_WEBSERVER=1`）；
5. `check:ui` 全量正向；
6. 三条反向：`island` / `purchase` / `purchase-price`，分别只核对 `islandNotOverSummary` / `confirmationRequired` / `secondRequestCarriesConfirmedPrice`；
7. `check:es`（只对本轮启动的专享 ES 执行停机恢复）。

约定：

- gate 启动时先记录并删除旧 `dist`；前置失败时依赖步骤记为 `blocked`，独立步骤继续，且不会复用 gate 之前的旧构建。
- `9201` 被外部实例占用时 `check:es` 记为 `blocked`、总门禁非绿，并记录该实例 PID / 启动时间 / HTTP 响应前后快照；gate 收尾不停止外部实例。
- 每条运行写固定 `gate.json`（默认 `<session-tmp>/phase8-evidence/F8/gate.json`，可用 `GATE_ARTIFACT_DIR` / `GATE_MANIFEST` 覆盖），并归档到 `runs/<runId>/gate.json`。
- 环境变量：`SHOP_BACKEND_ROOT`、`GATE_ARTIFACT_DIR`、`GATE_MANIFEST`、`GATE_LATEST_PATH`、`GATE_RUN_ID`、`GATE_BACKEND_PORT`、`GATE_ES_PORT`。
- 任一步 fail / blocked / skipped，或外部 ES 前后快照不一致，gate 均以非零退出。

受控失败（G2）：

- 在 `tests/` 放一条临时失败用例，使 `pnpm verify` 在 build 之前失败；gate 会删除旧 `dist`、把依赖 dist 的步骤记为 blocked，并继续后端 / ES 独立步骤。验证完成后删除临时用例。

反向判定：`scripts/acceptance/gate.mjs` 的 `evaluateReverseRun` 要求 manifest 存在、无 fatal、`mode.reverse` 匹配、目标断言实际执行且为 false、失败断言恰好只有预期一条、失败用例恰好只有目标用例；缺 manifest、崩溃、目标未失败或额外失败均判非绿。fixture 见 `tests/fixtures/gate/`，单元测试见 `tests/unit/gate.test.mjs`。
