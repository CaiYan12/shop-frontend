/**
 * plugins/vuetify.ts
 *
 * Framework documentation: https://vuetifyjs.com`
 */
// Composables
import { createVuetify } from 'vuetify'
import { en } from 'vuetify/locale'
// Styles
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
// Theme
import { readStoredTheme } from '@/theme'
import { vuetifyThemes } from '@/theme/vuetify-theme'

// 主题只在这里注册一次：色板来自 `@/theme`，启动时先读 localStorage，
// 这样「刷新后保留主题」不需要先渲染浅色再闪一下暗色。
// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export default createVuetify({
  // 只覆盖轮播箭头与分页按钮的读屏名（#16 视觉验收）：
  // 默认 en 的 carousel.prev/next 会朗读 "Previous visual" / "Next visual"，
  // 分页会朗读 "Previous page" / "Next page" / "Page 1, Current page" 等；
  // 这里换成中文，其余文案保持原样。
  locale: {
    messages: {
      en: {
        ...en,
        carousel: {
          ...en.carousel,
          prev: '上一张',
          next: '下一张',
        },
        pagination: {
          ...en.pagination,
          ariaLabel: {
            ...en.pagination.ariaLabel,
            root: '分页导航',
            next: '下一页',
            previous: '上一页',
            page: '转到第 {0} 页',
            currentPage: '第 {0} 页，当前页',
            first: '第一页',
            last: '最后一页',
          },
        },
      },
    },
  },
  theme: {
    defaultTheme: readStoredTheme(),
    themes: vuetifyThemes,
  },
})
