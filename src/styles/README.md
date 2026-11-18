# Styles

本目录是样式入口。分工：Vuetify 负责组件与 Material 3 主题变量，Tailwind 负责布局与颜色（`settings.scss` 里 `$utilities: false` 关掉了 Vuetify 工具类）。

## 视觉基线（#5 确立，后续票直接复用）

- **表面**：`bg-surface rounded-xl border border-outline` —— 24px 圆角（`--radius-xl`）+ 1px 细边框（`--color-outline` = Vuetify 的 `border-color` × `border-opacity`，浅色 `rgba(0,0,0,.12)`、暗色 `rgba(255,255,255,.12)`）。
- **强调操作**：Vuetify 组件用 `color="primary"`（M3 状态层随之生效）；自绘元素用 `bg-primary text-on-primary`。
- **颜色令牌**：`tailwind.css` 的 `@theme` 把 `--color-*` 映射到 Vuetify 注入的 `--v-theme-*`，同一批类名在浅色 / 暗色下自动换色。
- **文案与主题真源**：站名、两套色板、localStorage 键都在 `src/theme/index.ts`，不要在组件里写十六进制。

## 文件

- `tailwind.css`：Tailwind 入口 + 主题令牌 + 页面底色。
- `settings.scss`：Vuetify SASS 配置（`$utilities: false`）。
- `vuetify-rounded.css`：把 `$rounded` 映射补回成 `rounded-*` 类，供组件 `rounded="xl"` 等属性使用。
