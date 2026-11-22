import { fileURLToPath, URL } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// 单元层分两个 project：纯逻辑跑 Node，组件跑 jsdom；两套 include 不重叠。
// 组件测试显式注册所需 Vuetify 组件，不经过 vite-plugin-vuetify 的全局自动导入。
export default defineConfig({
  plugins: [Vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
    extensions: ['.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.vue'],
  },
  test: {
    // Vuetify 4 的组件入口会 import 同目录 .css；inline 后交给 Vite 处理，
    // 否则 Node ESM 直接加载 .css 会报 Unknown file extension。
    server: {
      deps: {
        inline: ['vuetify'],
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/unit/**/*.test.{ts,mjs}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['tests/component/**/*.test.ts'],
        },
      },
    ],
  },
})
