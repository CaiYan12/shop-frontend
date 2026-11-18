/**
 * main.ts
 *
 * Bootstraps Vuetify and other plugins then mounts the App
 */

// Composables
import { createApp } from 'vue'

// Plugins
import { registerPlugins } from '@/plugins'

// Components
import App from './App.vue'

// Theme
import { SITE_NAME } from '@/theme'

// Styles
import 'unfonts.css'
import '@/styles/tailwind.css'
import '@/styles/vuetify-rounded.css'

// 页头文案与 `<title>` 共用同一份站名（#5）：index.html 里写死的是首屏前的值，
// 这里再设一次，保证两者永远同名。
document.title = SITE_NAME

const app = createApp(App)

registerPlugins(app)

app.mount('#app')
