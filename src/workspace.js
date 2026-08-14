import fs from "node:fs";
import path from "node:path";

/**
 * Deterministic repository-target validation.
 *
 * A repository investigation requires a concrete, accessible workspace. A
 * missing, non-directory, or inaccessible target cannot be investigated and
 * must never be silently reinterpreted as a greenfield formation workspace:
 * formation is only ever admitted by an explicit formation request, never by
 * absence of a target.
 *
 * Returns { ok: true } or { ok: false, reason } where reason is one of:
 * - "missing": the path does not exist;
 * - "not-a-directory": the path exists but is not a directory;
 * - "inaccessible": the path exists but cannot be read.
 */
export function validateWorkspace(root) {
  const resolved = path.resolve(root);

  if (!fs.existsSync(resolved)) {
    return { ok: false, reason: "missing" };
  }

  let stat;

  try {
    stat = fs.statSync(resolved);
  } catch {
    return { ok: false, reason: "inaccessible" };
  }

  if (!stat.isDirectory()) {
    return { ok: false, reason: "not-a-directory" };
  }

  try {
    fs.readdirSync(resolved);
  } catch {
    return { ok: false, reason: "inaccessible" };
  }

  return { ok: true };
}
