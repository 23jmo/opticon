// $VAR resolution and ~ expansion (§6.1)

import { homedir } from "node:os";

/**
 * Resolve $VAR references in a string value using process.env.
 * Supports $VAR and ${VAR} syntax.
 */
export function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, braced, plain) => {
    const varName = braced || plain;
    const resolved = process.env[varName];
    if (resolved === undefined) {
      throw new Error(`Environment variable $${varName} is not set`);
    }
    return resolved;
  });
}

/**
 * Expand ~ at the start of a path to the user's home directory.
 */
export function expandTilde(path: string): string {
  if (path === "~" || path.startsWith("~/")) {
    return homedir() + path.slice(1);
  }
  return path;
}

/**
 * Resolve both env vars and tilde in a path string.
 */
export function resolvePath(value: string): string {
  return expandTilde(resolveEnvVars(value));
}
