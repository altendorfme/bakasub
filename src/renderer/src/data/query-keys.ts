/**
 * Every query key in one place, so invalidation and event patches can't drift from the queries.
 * Hierarchical: invalidating `qk.jobs.all` also covers the list and every detail.
 */
export const qk = {
  app: {
    info: () => ['app', 'info'] as const,
    update: () => ['app', 'update'] as const
  },
  sidecars: {
    report: () => ['sidecars', 'report'] as const
  },
  settings: {
    apiKey: () => ['settings', 'api-key'] as const
  },
  jobs: {
    all: ['jobs'] as const,
    list: () => ['jobs', 'list'] as const,
    detail: (id: string) => ['jobs', 'detail', id] as const
  }
}
