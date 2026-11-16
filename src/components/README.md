# Components

放在此目录的 `.vue` 文件**不会**被自动注册为全局组件，使用前需要显式 import。

```vue
<template>
  <MyComponent />
</template>

<script lang="ts" setup>
  import MyComponent from '@/components/MyComponent.vue'
</script>
```

> 说明：`vite.config.mts` 里的 `autoImport: true` 属于 `vite-plugin-vuetify`，只自动导入 Vuetify 自带组件，与本目录无关。
