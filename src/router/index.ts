/**
 * router/index.ts
 *
 * 骨架期占位路由：列表页 + 详情页。
 */

import { createRouter, createWebHistory } from 'vue-router'
import Index from '@/pages/index.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Index,
    },
    {
      path: '/product/:id',
      name: 'product',
      component: () => import('@/pages/product.vue'),
    },
  ],
})

export default router
