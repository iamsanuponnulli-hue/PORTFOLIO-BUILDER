import { Operation, PortfolioContent, ProfileType } from '@pb/schema';
import { applyAll, defaultSpec, render, type RenderOptions, type SiteState } from '@pb/renderer';

/**
 * Methods that run inside the background worker. Inputs arrive as JSON strings
 * from Dart and are validated here with the shared schema.
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
  /** Starting design for a profile type. */
  defaultSpec: (profileType: string, presetId?: string) =>
    defaultSpec(ProfileType.parse(profileType), presetId),
  /** Validates operations, then applies them in order. Returns the new state. */
  applyOperations: (state: SiteState, ops: unknown[]) =>
    applyAll(
      state,
      ops.map((o) => Operation.parse(o)),
    ),
  /** Builds the site files and instant checks. */
  render: (state: SiteState, options: RenderOptions) => render(state, options),
};
export type WorkerHandlers = typeof workerHandlers;
