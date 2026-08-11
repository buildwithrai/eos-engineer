import fs from "node:fs";
import path from "node:path";

export async function readFile({ path: filePath }, workspaceRoot) {
  const absolutePath = path.resolve(workspaceRoot, filePath);

  if (
    absolutePath !== workspaceRoot &&
    !absolutePath.startsWith(workspaceRoot + path.sep)
  ) {
    return { ok: false, error: "Path escapes configured workspace" };
  }

  try {
    const content = fs.readFileSync(absolutePath, "utf-8");
    return { ok: true, path: absolutePath, content };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
