import fs from "node:fs";
import path from "node:path";

const SUPPORTED_EXTENSIONS = new Set([
  "js",
  "ts",
  "tsx",
  "jsx",
  "json",
  "md",
  "sql",
  "yaml",
  "yml",
  "py",
  "sh",
]);

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function workspaceRelativePath(absolutePath, workspaceRoot) {
  const root = normalizePath(path.resolve(workspaceRoot));
  const abs = normalizePath(path.resolve(absolutePath));

  if (abs === root) return "";

  if (abs.startsWith(root + "/")) {
    return abs.slice(root.length + 1);
  }

  return null;
}

const SCOPE_DEPENDENCY_PATTERN =
  /(?:(?:\bimport\s+[\s\S]*?\s+from\s+)|(?:\brequire\s*\(\s*)|(?:\bimport\s*\(\s*))["'](\.[^"']+)["']/g;

/**
 * Deterministically extract structural dependencies from inspected content.
 *
 * Only relative specifiers ("./x", "../x") are resolved. Resolution is
 * relative to the importing file's directory, normalized to a
 * workspace-relative path, and restricted to existing files with supported
 * source extensions. Results are deduplicated by (from, to).
 *
 * This does NOT crawl the repository and does NOT treat repository knowledge
 * imports as scope requirements.
 */
export function extractScopeDependencies(content, fromFile, workspaceRoot) {
  const root = path.resolve(workspaceRoot);
  const source = String(content ?? "");
  const result = [];
  const seen = new Set();

  let match;

  while ((match = SCOPE_DEPENDENCY_PATTERN.exec(source)) !== null) {
    const specifier = match[1];
    const baseDir = path.dirname(path.resolve(root, fromFile));
    const absTarget = path.resolve(baseDir, specifier);

    if (absTarget !== root && !absTarget.startsWith(root + path.sep)) {
      continue;
    }

    if (!fs.existsSync(absTarget)) continue;

    const ext = path.extname(absTarget).slice(1).toLowerCase();

    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

    const to = workspaceRelativePath(absTarget, root);

    if (to === null) continue;

    const key = `${fromFile}->${to}`;

    if (seen.has(key)) continue;

    seen.add(key);
    result.push({ from: fromFile, specifier, to, status: "pending" });
  }

  return result;
}

/**
 * Create the investigation state for a user input.
 *
 * explicitRequirements preserves the existing regex extraction behavior.
 * requiredFiles is kept as a compatibility alias of explicitRequirements.
 */
export function createInvestigation(userInput) {
  const explicitRequirements = new Set();

  const filePattern =
    /(?:^|[\s"'`(])((?:\.\/)?(?:[\w.-]+\/)*[\w.-]+\.(?:js|ts|tsx|jsx|json|md|sql|yaml|yml|py|sh))(?=$|[\s"'`),.:;])/g;

  const input = String(userInput ?? "");
  let match;

  while ((match = filePattern.exec(input)) !== null) {
    const candidate = match[1].trim();

    if (
      !candidate.endsWith(".") &&
      !candidate.startsWith("Do ") &&
      !candidate.startsWith("http")
    ) {
      explicitRequirements.add(normalizePath(candidate));
    }
  }

  const firstLine = input.split("\n")[0] ?? "";

  return {
    target: firstLine.slice(0, 200),
    objective: firstLine.slice(0, 200),
    explicitRequirements,
    requiredFiles: [...explicitRequirements],
    adoptedRequirements: new Set(),
    inspectedEvidence: new Set(),
    discoveredDependencies: [],
    inspections: [],
  };
}

/**
 * Record a successful inspection.
 *
 * - The inspected file becomes a workspace-relative entry in inspectedEvidence
 *   and is therefore universally citable.
 * - If the inspected file corresponds to a pending discovered dependency, the
 *   dependency transitions pending -> adopted (reading constitutes adoption).
 * - If the inspected file is in scope, its structural dependencies are
 *   extracted and added as pending.
 * - Out-of-scope context reads MUST NOT create discovered dependencies.
 */
export function recordInspection(inv, inspection, workspaceRoot) {
  if (
    inv == null ||
    inspection == null ||
    inspection.ok !== true ||
    typeof inspection.path !== "string"
  ) {
    return;
  }

  const rel = workspaceRelativePath(inspection.path, workspaceRoot);

  if (rel === null) return;

  inv.inspectedEvidence.add(rel);

  const pending = inv.discoveredDependencies.find(
    (dependency) => dependency.status === "pending" && dependency.to === rel
  );

  if (pending !== undefined) {
    pending.status = "adopted";
  }

  if (scopeOf(inv).has(rel)) {
    for (const dependency of extractScopeDependencies(
      inspection.content,
      rel,
      workspaceRoot
    )) {
      if (
        !inv.discoveredDependencies.some(
          (existing) =>
            existing.from === dependency.from && existing.to === dependency.to
        )
      ) {
        inv.discoveredDependencies.push(dependency);
      }
    }
  }
}

/**
 * The investigation scope is the union of explicit and adopted requirements.
 */
export function scopeOf(inv) {
  const scope = new Set();

  for (const file of inv.explicitRequirements) scope.add(file);
  for (const file of inv.adoptedRequirements) scope.add(file);

  return scope;
}

/**
 * Apply a model-proposed plan deterministically.
 *
 * - adopt must reference discovered dependencies.
 * - waive must reference discovered dependencies and requires a non-empty
 *   reason.
 * - An adopted dependency becomes an investigation requirement.
 * - A waived dependency becomes terminal and does not require inspection.
 */
export function applyPlan(inv, { adopt = [], waive = [] } = {}) {
  const errors = [];
  const adoptList = Array.isArray(adopt) ? adopt : [];
  const waiveList = Array.isArray(waive) ? waive : [];

  for (const file of adoptList) {
    if (typeof file !== "string" || file.length === 0) {
      errors.push(`adopt entry must be a non-empty path string: ${String(file)}`);
      continue;
    }

    const dependency = inv.discoveredDependencies.find((d) => d.to === file);

    if (dependency === undefined) {
      errors.push(`cannot adopt "${file}": not a discovered dependency`);
      continue;
    }

    if (dependency.status === "waived") {
      errors.push(`cannot adopt "${file}": dependency has already been waived`);
      continue;
    }

    dependency.status = "adopted";
    inv.adoptedRequirements.add(dependency.to);
  }

  for (const entry of waiveList) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      errors.push("waive entry must be an object with path and reason");
      continue;
    }

    if (typeof entry.path !== "string" || entry.path.length === 0) {
      errors.push("waive entry is missing a path");
      continue;
    }

    if (typeof entry.reason !== "string" || entry.reason.trim().length === 0) {
      errors.push(`waive of "${entry.path}" requires a non-empty reason`);
      continue;
    }

    const dependency = inv.discoveredDependencies.find((d) => d.to === entry.path);

    if (dependency === undefined) {
      errors.push(`cannot waive "${entry.path}": not a discovered dependency`);
      continue;
    }

    if (dependency.status === "adopted") {
      errors.push(
        `cannot waive "${entry.path}": adopted requirements must be inspected`
      );
      continue;
    }

    dependency.status = "waived";
    dependency.reason = entry.reason.trim();
  }

  if (errors.length > 0) {
    return { ok: false, message: errors.join(" ") };
  }

  return { ok: true };
}

/**
 * Planning completeness: no discovered dependency remains pending.
 */
export function planningComplete(inv) {
  return inv.discoveredDependencies.every(
    (dependency) => dependency.status !== "pending"
  );
}

/**
 * Investigation completeness: every explicit and adopted requirement has been
 * inspected.
 */
export function investigationComplete(inv) {
  for (const file of inv.explicitRequirements) {
    if (!inv.inspectedEvidence.has(file)) return false;
  }

  for (const file of inv.adoptedRequirements) {
    if (!inv.inspectedEvidence.has(file)) return false;
  }

  return true;
}