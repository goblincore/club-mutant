/// <reference types="vite/client" />

type ViteEnv = {
  readonly VITE_WS_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv & ViteEnv
}
