/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface NakamaSession {
  token: string;
  refreshToken: string;
  host: string;
  port: string;
  ssl: boolean;
  youtubeApiUrl: string;
}

interface Window {
  nakamaSession?: NakamaSession;
}
