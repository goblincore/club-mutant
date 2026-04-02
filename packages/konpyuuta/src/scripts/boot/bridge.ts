// Receives the boot postMessage from KonpyuuTAShell and stores session on window.

window.addEventListener('message', (e: MessageEvent) => {
  if (e.data?.type === 'boot') {
    window.nakamaSession = {
      token:         e.data.nakamaToken    ?? '',
      refreshToken:  e.data.refreshToken   ?? '',
      host:          e.data.nakamaHost     ?? 'localhost',
      port:          e.data.nakamaPort     ?? '7350',
      ssl:           e.data.useSSL         ?? false,
      youtubeApiUrl: e.data.youtubeApiUrl  ?? 'http://localhost:8081',
    };
  }
});
