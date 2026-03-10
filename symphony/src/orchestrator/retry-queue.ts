// Exponential backoff retry queue with timer handles (§8.4)

import type { RetryEntry } from "../types.js";
import { createLogger } from "../util/logger.js";

const log = createLogger("retry-queue");

export class RetryQueue {
  private entries: Map<string, RetryEntry> = new Map();

  /**
   * Calculate backoff delay (§8.4):
   * - Normal exit (continuation): fixed delay
   * - Failure: min(10000 * 2^(attempt-1), max_retry_backoff_ms)
   */
  static calculateBackoff(
    attempt: number,
    isContinuation: boolean,
    continuationDelayMs: number,
    maxBackoffMs: number,
  ): number {
    if (isContinuation) {
      return continuationDelayMs;
    }
    return Math.min(10_000 * Math.pow(2, attempt - 1), maxBackoffMs);
  }

  /**
   * Enqueue a retry for an issue.
   */
  enqueue(
    issueId: string,
    identifier: string,
    attempt: number,
    delayMs: number,
    error: string | null,
    onFire: (issueId: string) => void,
  ): void {
    // Clear any existing timer for this issue
    this.cancel(issueId);

    const dueAt = Date.now() + delayMs;

    const timerHandle = setTimeout(() => {
      log.info(`Retry timer fired for ${identifier} (attempt ${attempt})`, { identifier });
      this.entries.delete(issueId);
      onFire(issueId);
    }, delayMs);

    const entry: RetryEntry = {
      issue_id: issueId,
      identifier,
      attempt,
      due_at_ms: dueAt,
      timer_handle: timerHandle,
      error,
    };

    this.entries.set(issueId, entry);
    log.info(`Queued retry for ${identifier} in ${delayMs}ms (attempt ${attempt})`, { identifier });
  }

  /**
   * Cancel a pending retry.
   */
  cancel(issueId: string): boolean {
    const entry = this.entries.get(issueId);
    if (entry) {
      clearTimeout(entry.timer_handle);
      this.entries.delete(issueId);
      return true;
    }
    return false;
  }

  /**
   * Cancel all pending retries.
   */
  cancelAll(): void {
    for (const [id, entry] of this.entries) {
      clearTimeout(entry.timer_handle);
    }
    this.entries.clear();
  }

  /**
   * Check if an issue has a pending retry.
   */
  has(issueId: string): boolean {
    return this.entries.has(issueId);
  }

  /**
   * Get retry entry for an issue.
   */
  get(issueId: string): RetryEntry | undefined {
    return this.entries.get(issueId);
  }

  /**
   * Get all retry entries (for dashboard/API).
   */
  getAll(): RetryEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Number of issues in the retry queue.
   */
  get size(): number {
    return this.entries.size;
  }
}
