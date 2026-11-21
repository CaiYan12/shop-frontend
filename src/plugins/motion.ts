/**
 * src/plugins/motion.ts
 *
 * GSAP 的唯一入口（D109）：组件只从这里取 `gsap` 与 `allowsMotion()`。
 * `prefers-reduced-motion` 每次调用时读取，系统设置切换与 CDP 模拟都能即时生效。
 */
import { gsap } from 'gsap'

export { gsap }

/** 当前是否允许装饰性动画；减少动态效果时返回 `false`，调用方直接落终态。 */
export function allowsMotion(): boolean {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
