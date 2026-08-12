import { readFile } from "./readFile.js";

/**
 * Execute read_file once per path and return each result independently.
 *
 * Each successful result receives normal evidence/digest handling in the
 * investigation loop, making read_files equivalent to read_file.
 */
export async function readFiles({ paths } = {}, workspaceRoot) {
  if (!Array.isArray(paths)) {
    return {
      ok: false,
      error: "read_files input.paths must be an array of paths",
    };
  }

  const inspections = [];

  for (const filePath of paths) {
    if (typeof filePath !== "string") continue;

    inspections.push(await readFile({ path: filePath }, workspaceRoot));
  }

  return { ok: true, inspections };
}