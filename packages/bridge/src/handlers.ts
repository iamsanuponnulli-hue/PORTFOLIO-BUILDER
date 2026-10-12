import { PortfolioContent } from '@pb/schema';

/**
 * Methods that run inside the background worker. Phase 0 only proves the
 * plumbing; image, PDF, ZIP and rendering handlers are added in later phases.
 */
export const workerHandlers = {
  ping: () => 'pong',
  /** Parses and normalises content with the shared schema (defaults applied). */
  normalizeContent: (raw: unknown) => PortfolioContent.parse(raw ?? {}),
  /** CPU-bound sample used to verify the UI stays responsive during worker work. */
  busyWork: (ms: number) => {
    const end = Date.now() + Math.min(ms, 5000);
    let n = 0;
    while (Date.now() < end) n++;
    return n > 0;
  },
};
export type WorkerHandlers = typeof workerHandlers;
