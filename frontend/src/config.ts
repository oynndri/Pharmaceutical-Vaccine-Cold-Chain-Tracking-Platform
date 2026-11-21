export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
  /** Vite inlines this at build time, so the mock module is dropped from production bundles. */
  useMockApi: import.meta.env.VITE_USE_MOCK_API === 'true',
  /** Live-board refresh. Replace with WebSocket/SSE if the backend provides a push channel. */
  livePollMs: 5000,
  outboxSyncMs: 15000,
} as const;
