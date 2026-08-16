import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  investigationComplete,
  scopeOf,
} from "./investigation.js";

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

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
 * Deterministic per-evidence observation derived from a successful inspection.
 *
 * An inspection is a matter of record (which artifact was read, when, from
 * where, and its digest). An observation is what that single inspection
 * revealed, recorded per evidence: the artifact exists, its digest, size, and
 * line count. It is deterministic — never a model assertion.
 */
export function observationOf(inspection, workspaceRoot) {
  if (
    inspection == null ||
    inspection.ok !== true ||
    typeof inspection.path !== "string" ||
    typeof inspection.content !== "string"
  ) {
    return null;
  }

  const rel = workspaceRelativePath(inspection.path, workspaceRoot);

  if (rel === null) return null;

  return {
    path: rel,
    exists: true,
    digest: sha256(inspection.content),
    bytes: Buffer.byteLength(inspection.content, "utf8"),
    lines: inspection.content.split("\n").length,
    observedAt: new Date().toISOString(),
  };
}

/**
 * Record a successful inspection.
 *
 * - The inspected file becomes a workspace-relative entry in inspectedEvidence
 *   and is therefore universally citable.
 * - A deterministic per-evidence observation is recorded for the inspection.
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
    typeof inspection.path !== "string" ||
    typeof inspection.content !== "string"
  ) {
    return;
  }

  const rel = workspaceRelativePath(inspection.path, workspaceRoot);

  if (rel === null) return;

  inv.inspectedEvidence.add(rel);

  const observation = observationOf(inspection, workspaceRoot);

  if (observation !== null) {
    const existing = inv.observations.findIndex(
      (entry) => entry.path === observation.path
    );

    if (existing === -1) {
      inv.observations.push(observation);
    } else {
      inv.observations[existing] = observation;
    }
  }

  const pending = inv.discoveredDependencies.find(
    (dependency) => dependency.status === "pending" && dependency.to === rel
  );

  if (pending !== undefined) {
    pending.status = "adopted";
    inv.adoptedRequirements.add(rel);
  }

  if (scopeOf(inv).has(rel)) {
    for (const dependency of extractScopeDependencies(
      inspection.content,
      rel,
      workspaceRoot
    )) {
      const existing = inv.discoveredDependencies.find(
        (candidate) =>
          candidate.from === dependency.from && candidate.to === dependency.to
      );

      if (existing !== undefined) {
        continue;
      }

      // Relationship discovery is order-independent. If the target was
      // already inspected before this relationship was discovered, the
      // relationship is already disposed by that inspection and must not
      // become a new pending obligation.
      if (inv.inspectedEvidence.has(dependency.to)) {
        dependency.status = "adopted";
        inv.adoptedRequirements.add(dependency.to);
      }

      inv.discoveredDependencies.push(dependency);
    }
  }
}

/**
 * Apply a model-proposed plan deterministically.
 *
 * - adopt must reference discovered dependencies.
 * - waive must reference discovered dependencies and requires a non-empty
 *   reason.
 * - An adopted dependency becomes an investigation requirement.
 * - A waived dependency becomes terminal and does not require inspection.
 *
 * Returns { ok: false, message } on an invalid plan and { ok: true, mutated }
 * on a valid one. `mutated` reports whether any dependency disposition
 * actually changed (pending -> adopted, pending -> waived). A valid plan
 * that re-adopts/re-waives already-disposed dependencies is accepted but
 * reports mutated: false because it advances no investigation state.
 */
export function applyPlan(inv, { adopt = [], waive = [] } = {}) {
  const errors = [];
  const adoptList = Array.isArray(adopt) ? adopt : [];
  const waiveList = Array.isArray(waive) ? waive : [];
  let mutated = false;

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

    if (dependency.status !== "adopted") {
      dependency.status = "adopted";
      inv.adoptedRequirements.add(dependency.to);
      mutated = true;
    }
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

    const dependency = inv.discoveredDependencies.find(
      (d) => d.to === entry.path
    );

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

    if (dependency.status !== "waived") {
      dependency.status = "waived";
      mutated = true;
    }

    dependency.reason = entry.reason.trim();
  }

  if (errors.length > 0) {
    return { ok: false, message: errors.join(" ") };
  }

  return { ok: true, mutated };
}

/**
 * Deterministic investigation phase derived entirely from current state.
 *
 * - "formation": a formation-mode investigation whose evidence obligations
 *   are satisfied.
 * - "planning": a discovered dependency remains pending and must be adopted
 *   or waived before candidate/declared judgment.
 * - "inspecting": planning is complete but an explicit or adopted
 *   requirement remains uninspected.
 * - "complete": planning and inspection are both complete; candidate and
 *   declared judgment are permitted.
 *
 * The phase is never stored. It is always recomputed from state.
 */
export function phaseOf(inv) {
  if (inv.mode === "formation" && investigationComplete(inv)) {
    return "formation";
  }

  if (inv.discoveredDependencies.some((d) => d.status === "pending")) {
    return "planning";
  }

  if (!investigationComplete(inv)) {
    return "inspecting";
  }

  // A semantic repository objective carries a pending evidence obligation
  // until its claims ground in current evidence. The investigation is never
  // vacuously complete just because no filenames were named. buildSurface
  // marks satisfied obligations when a judgment commits; blocked or fallback
  // surfaces leave them pending.
  if ((inv.evidenceObligations ?? []).some((o) => o.pending)) {
    return "obligations";
  }

  return "complete";
}
