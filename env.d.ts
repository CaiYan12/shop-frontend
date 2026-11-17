/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端 API 基址；未设置时 `src/api/client.ts` 回落到本机默认值。 */
  readonly VITE_API_BASE_URL?: string
}
