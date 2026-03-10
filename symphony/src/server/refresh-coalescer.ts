// POST /refresh request coalescing (§13.7)

import { createLogger } from "../util/logger.js";

const log = createLogger("refresh-coalescer");

export class RefreshCoalescer {
  private pending: Promise<void> | null = null;
  private queued = false;

  constructor(private doRefresh: () => Promise<void>) {}

  /**
   * Request a refresh. If one is already in progress, coalesce.
   * Returns immediately — the caller gets a 202.
   */
  async request(): Promise<void> {
    if (this.pending) {
      this.queued = true;
      log.info("Refresh already in progress, coalescing");
      return;
    }

    await this.run();
  }

  private async run(): Promise<void> {
    this.pending = this.doRefresh();
    try {
      await this.pending;
    } catch (err) {
      log.error(`Refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.pending = null;
      if (this.queued) {
        this.queued = false;
        // Run coalesced request
        this.run().catch(() => {});
      }
    }
  }
}
