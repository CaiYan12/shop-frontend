# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- 初始化仓库文档：`README.md`、`AGENTS.md`、`CHANGELOG.md`、`.gitignore`。
- Phase 3：OpenAPI 3.1 契约类型生成、前端契约客户端与购买结果映射。
- Phase 4：搜索命中高亮、503 降级与保留旧结果、搜索联想状态机。
- Phase 5：列表页搜索 / 分类与价格筛选 / 排序 / 分页、商品卡片、浅色暗色主题切换。
- Phase 6：商品详情页（轮播与放大查看、规格选择、数量校验、加购、图文详情、相关推荐）与右侧固定购物车（摘要、抽屉面板、`localStorage` 存档与恢复复核）。

### Fixed

- Phase 6 复审修复：轮播与放大的焦点/退场时序、复核期只读与 `persist` 守卫、恢复提示按 SKU 区分并可展开、390×844 恢复明细滚动、商品切换清空浮层退场状态。
- 新增购物车运行时检查 `pnpm check:cart`：15 个用例覆盖存档解析与版本、只读四动作、`persist` 守卫、正常加购与同 SKU 合并、累计超限、恢复提示与展开。
