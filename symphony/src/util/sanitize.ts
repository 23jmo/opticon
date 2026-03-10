// Workspace key sanitization (§4.2)

/**
 * Sanitize an issue identifier for use as a filesystem directory name.
 * Replaces any character not in [A-Za-z0-9._-] with underscore.
 */
export function sanitizeKey(identifier: string): string {
  return identifier.replace(/[^A-Za-z0-9._-]/g, "_");
}
