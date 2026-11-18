import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import Vue from '@vitejs/plugin-vue'
import Fonts from 'unplugin-fonts/vite'
import { defineConfig } from 'vite'
import Vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

// 端口由 scripts/dev.mjs 决定并通过 --port 传入，此处不再重复声明。
export default defineConfig({
  plugins: [
    Vue({
      template: { transformAssetUrls },
    }),
    Vuetify({
      autoImport: true,
      styles: {
        configFile: 'src/styles/settings.scss',
      },
    }),
    Fonts({
      fontsource: {
        families: [
          {
            name: 'Roboto',
            weights: [100, 300, 400, 500, 700, 900],
            styles: ['normal', 'italic'],
          },
        ],
      },
    }),
    tailwindcss(),
  ],
  define: { 'process.env': {} },
  server: {
    // 浏览器只认识当前源：`/api/*` 由 Vite 转发到本机后端。
    // 后端路由本身带 `/api` 前缀，因此保留前缀、不做 rewrite。
    // Vite 8 的 preview 默认继承 server.proxy（`preview?.proxy ?? server.proxy`），
    // 所以 preview 不重复配置，两种形态共用这一份。
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
    extensions: ['.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.vue'],
  },
})
