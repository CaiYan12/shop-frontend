<template>
  <v-app-bar
    :elevation="0"
    class="bg-surface border-b border-outline"
    height="64"
  >
    <v-toolbar-title class="header-title">{{ SITE_NAME }}</v-toolbar-title>

    <v-btn
      :aria-label="toggleLabel"
      color="primary"
      icon
      variant="flat"
      @click="toggle"
    >
      <v-icon :icon="toggleIcon" />
    </v-btn>
  </v-app-bar>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { SITE_NAME } from '@/theme'
  import { useThemePreference } from '@/composables/useThemePreference'

  const { current, toggle } = useThemePreference()

  const isDark = computed(() => current.value === 'dark')

  // 按钮文案描述「点下去会发生什么」，而不是当前主题；
  // 读屏用户听到的与视觉图标（月亮 / 太阳）指向同一个目标。
  const toggleLabel = computed(() => (isDark.value ? '切换到浅色主题' : '切换到暗色主题'))
  const toggleIcon = computed(() => (isDark.value ? 'mdi-weather-sunny' : 'mdi-weather-night'))
</script>

<style scoped>
  /*
   * 页头标题跟随 Material 3 的 title-large 度量，小屏也不放大到挤出按钮。
   * 颜色沿用 Vuetify 的 on-surface（由 v-app-bar 自带），切主题时自动跟随。
   */
  .header-title {
    font-size: 1.125rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }
</style>
