/**
 * plugins/vuetify.ts
 *
 * Framework documentation: https://vuetifyjs.com`
 */
// Composables
import { createVuetify } from 'vuetify'
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
  theme: {
    defaultTheme: readStoredTheme(),
    themes: vuetifyThemes,
  },
})
