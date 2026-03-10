// Workspace management (§9)

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { sanitizeKey } from "../util/sanitize.js";
import { createLogger } from "../util/logger.js";
import type { HooksConfig, WorkspaceConfig } from "../types.js";

const execFileAsync = promisify(execFile);
const log = createLogger("workspace");

export class WorkspaceManager {
  private root: string;
  private hooks: HooksConfig;

  constructor(config: WorkspaceConfig, hooks: HooksConfig) {
    this.root = resolve(config.root);
    this.hooks = hooks;
  }

  /**
   * Get the workspace path for an issue identifier.
   */
  getPath(identifier: string): string {
    const key = sanitizeKey(identifier);
    return join(this.root, key);
  }

  /**
   * Safety invariants (§9.5):
   * - workspace_path is absolute
   * - workspace_path is inside workspace_root
   * - key is sanitized
   */
  private validatePath(workspacePath: string): void {
    if (!isAbsolute(workspacePath)) {
      throw new Error(`Workspace path must be absolute: ${workspacePath}`);
    }
    const normalizedRoot = resolve(this.root);
    const normalizedPath = resolve(workspacePath);
    if (!normalizedPath.startsWith(normalizedRoot + "/") && normalizedPath !== normalizedRoot) {
      throw new Error(`Workspace path ${normalizedPath} is not inside root ${normalizedRoot}`);
    }
  }

  /**
   * Create workspace directory (§9).
   * Returns true if the directory was newly created, false if it already existed.
   */
  async create(identifier: string): Promise<{ path: string; created_now: boolean }> {
    const workspacePath = this.getPath(identifier);
    this.validatePath(workspacePath);

    // Ensure root exists
    if (!existsSync(this.root)) {
      mkdirSync(this.root, { recursive: true });
    }

    const alreadyExists = existsSync(workspacePath);
    if (!alreadyExists) {
      mkdirSync(workspacePath, { recursive: true });
    }

    // Run after_create hook only if newly created
    if (!alreadyExists && this.hooks.after_create) {
      try {
        await this.runHook("after_create", this.hooks.after_create, workspacePath);
      } catch (err) {
        // after_create failure aborts creation — clean up
        try {
          rmSync(workspacePath, { recursive: true, force: true });
        } catch {
          // ignore cleanup errors
        }
        throw new Error(
          `after_create hook failed, aborting workspace creation: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { path: workspacePath, created_now: !alreadyExists };
  }

  /**
   * Run the before_run hook. Failure aborts the run attempt.
   */
  async runBeforeRun(workspacePath: string): Promise<void> {
    if (this.hooks.before_run) {
      await this.runHook("before_run", this.hooks.before_run, workspacePath);
    }
  }

  /**
   * Run the after_run hook. Failure is logged but ignored.
   */
  async runAfterRun(workspacePath: string): Promise<void> {
    if (this.hooks.after_run) {
      try {
        await this.runHook("after_run", this.hooks.after_run, workspacePath);
      } catch (err) {
        log.warn(`after_run hook failed (ignored): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /**
   * Remove a workspace directory (§9).
   */
  async remove(identifier: string): Promise<void> {
    const workspacePath = this.getPath(identifier);
    this.validatePath(workspacePath);

    if (!existsSync(workspacePath)) return;

    // before_remove hook — failure logged, ignored
    if (this.hooks.before_remove) {
      try {
        await this.runHook("before_remove", this.hooks.before_remove, workspacePath);
      } catch (err) {
        log.warn(`before_remove hook failed (ignored): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    try {
      rmSync(workspacePath, { recursive: true, force: true });
      log.info(`Removed workspace: ${workspacePath}`);
    } catch (err) {
      log.error(`Failed to remove workspace ${workspacePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Execute a hook script via bash -l -c (§9.4).
   * Uses execFile with bash as the binary to avoid shell injection.
   */
  private async runHook(name: string, script: string, cwd: string): Promise<void> {
    log.info(`Running ${name} hook in ${cwd}`);
    try {
      await execFileAsync("bash", ["-l", "-c", script], {
        cwd,
        timeout: this.hooks.timeout_ms,
        env: { ...process.env },
      });
    } catch (err) {
      throw new Error(`Hook ${name} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  updateConfig(config: WorkspaceConfig, hooks: HooksConfig): void {
    this.root = resolve(config.root);
    this.hooks = hooks;
  }
}
