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

export function createInvestigation(userInput, options = {}) {
  const mode = options.mode === "formation" ? "formation" : "repository";
  const workspaceRoot =
    typeof options.workspaceRoot === "string" ? options.workspaceRoot : null;

  const explicitRequirements = new Set();
  const prospectiveArtifacts = [];
  const observations = [];

  const filePattern =
    /(?:^|[\s"'`(])((?:\.\/)?(?:[\w.-]+\/)*[\w.-]+\.(?:js|ts|tsx|jsx|json|md|sql|yaml|yml|py|sh))(?=$|[\s"'`),.:;])/g;

  const input = String(userInput ?? "");
  let match;

  while ((match = filePattern.exec(input)) !== null) {
    const candidate = match[1].trim();

    if (
      candidate.endsWith(".") ||
      candidate.startsWith("Do ") ||
      candidate.startsWith("http")
    ) {
      continue;
    }

    const normalized = normalizePath(candidate);

    if (mode === "formation") {
      const absolute =
        workspaceRoot === null
          ? null
          : path.resolve(workspaceRoot, normalized);

      if (absolute !== null && fs.existsSync(absolute)) {
        explicitRequirements.add(normalized);
      } else {
        prospectiveArtifacts.push(normalized);
      }
    } else {
      explicitRequirements.add(normalized);
    }
  }

  const firstLine = input.split("\n")[0] ?? "";

  // Evidence obligations make the objective's evidence requirement explicit.
  // A repository objective that names no files still requires current
  // repository evidence before candidate/declared judgment: a semantic
  // investigation must never be vacuously complete. File-based objectives
  // already carry explicit inspection requirements, and formation invests its
  // evidence in the recorded intent, so only file-less repository objectives
  // receive a semantic obligation here.
  const evidenceObligations = [];

  if (mode === "repository" && explicitRequirements.size === 0) {
    evidenceObligations.push({
      id: "obligation-1",
      statement: `Establish whether the repository satisfies the objective: ${firstLine.slice(0, 200)}`,
      kinds: [
        "inspected-file",
        "evidence-store",
        "knowledge",
        "perspective",
        "change",
        "intent",
        "review",
      ],
      satisfied: false,
      satisfiedBy: [],
      pending: true,
      dependencies: [],
    });
  }

  return {
    mode,
    target: firstLine.slice(0, 200),
    objective: firstLine.slice(0, 200),
    explicitRequirements,
    requiredFiles: [...explicitRequirements],
    adoptedRequirements: new Set(),
    inspectedEvidence: new Set(),
    discoveredDependencies: [],
    inspections: [],
    prospectiveArtifacts,
    evidenceObligations,
    observations,
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
 *
 * Returns { ok: false, message } on an invalid plan and { ok: true, mutated }
 * on a valid one. `mutated` reports whether any dependency disposition
 * actually changed (pending -> adopted, pending -> waived). A valid plan
 * that re-adopts/re-waives already-disposed dependencies is accepted but
 * reports mutated: false because it advances no investigation state.
 */

export function planningComplete(inv) {
  return inv.discoveredDependencies.every(
    (dependency) => dependency.status !== "pending"
  );
}

/**
 * Deterministic investigation phase derived entirely from current state.
 *
 * - "formation": a formation-mode investigation whose evidence obligations
 *   are satisfied (the recorded intent plus any existing-file inspections).
 *   Formation completion admits judgment; a formation investigation with an
 *   uninspected existing-file requirement reports "inspecting" instead.
 * - "planning": a discovered dependency remains pending and must be adopted
 *   or waived before candidate/declared judgment.
 * - "inspecting": planning is complete but an explicit or adopted
 *   requirement remains uninspected.
 * - "complete": planning and inspection are both complete; candidate and
 *   declared judgment are permitted.
 *
 * The phase is never stored. It is always recomputed from state, so it
 * cannot drift from the investigation state that produced it. The runtime
 * uses it as the explicit completion transition: when it becomes "complete"
 * or "formation", the loop acknowledges that candidate/declared judgment is
 * admitted.
 */

export function investigationComplete(inv) {
  // Investigation cannot be complete while any discovered relationship
  // remains unresolved. Planning completion is therefore a prerequisite
  // for investigation completion.
  if (!planningComplete(inv)) return false;

  for (const file of inv.explicitRequirements) {
    if (!inv.inspectedEvidence.has(file)) return false;
  }

  for (const file of inv.adoptedRequirements) {
    if (!inv.inspectedEvidence.has(file)) return false;
  }

  // Semantic evidence obligations are not part of file completeness: they are
  // satisfied at judgment time against the claims' evidence refs and are
  // reflected in the investigation phase (see phaseOf) and the gate.
  return true;
}

/**
 * Deterministic completion/blockage reason for an investigation.
 *
 * The runtime must be able to answer, purely from state: is the investigation
 * complete, incomplete, or blocked, and why. This is never stored and never
 * model-authored; it is recomputed exactly like the phase.
 *
 * Returns { status, reason, detail } where status is one of
 * "complete" | "incomplete" | "blocked".
 */
export function completionReason(inv) {
  if (inv.mode === "formation" && investigationComplete(inv)) {
    return {
      status: "complete",
      reason: "formation-satisfied",
      detail: "The recorded intent and existing-file inspections satisfy the formation obligations; candidate/declared judgment is permitted.",
    };
  }

  const pending = inv.discoveredDependencies.filter(
    (dependency) => dependency.status === "pending"
  );

  if (pending.length > 0) {
    return {
      status: "incomplete",
      reason: "planning-pending",
      detail: `${pending.length} discovered relationship${
        pending.length === 1 ? " remains" : "s remain"
      } pending: ${pending
        .map((dependency) => `${dependency.from} -> ${dependency.to}`)
        .join(", ")}. Dispose of each with adopt or waive before judging.`,
    };
  }

  const explicitMissing = [...inv.explicitRequirements].filter(
    (file) => !inv.inspectedEvidence.has(file)
  );

  const adoptedMissing = [...inv.adoptedRequirements].filter(
    (file) => !inv.inspectedEvidence.has(file)
  );

  const missing = [...explicitMissing, ...adoptedMissing];

  if (missing.length > 0) {
    return {
      status: "incomplete",
      reason: "evidence-uninspected",
      detail: `Uninspected requirements: ${missing.join(", ")}. Inspect them with read_file or read_files before judging.`,
    };
  }

  if ((inv.evidenceObligations ?? []).some((obligation) => obligation.pending)) {
    return {
      status: "incomplete",
      reason: "obligations-pending",
      detail: "Evidence obligations are pending; the judgment's evidence_refs must ground in current evidence before candidate/declared judgment is permitted.",
    };
  }

  return {
    status: "complete",
    reason: "investigation-complete",
    detail: "Planning and inspection are complete; candidate and declared judgment are permitted.",
  };
}

/**
 * Deterministic synthesis of the investigation's account so far.
 *
 * Understanding is the synthesized account derived from the set of
 * observations — what the investigation has established, distinct from
 * judgment. It is recomputed from state and can never drift.
 */
export function understandingOf(inv) {
  const completion = completionReason(inv);
  const obligations = Array.isArray(inv.evidenceObligations) ? inv.evidenceObligations : [];

  return {
    mode: inv.mode,
    target: inv.target,
    objective: inv.objective,
    inspected: [...inv.inspectedEvidence].sort(),
    observations: inv.observations.map((observation) => ({
      path: observation.path,
      exists: observation.exists,
      digest: observation.digest,
      bytes: observation.bytes,
      lines: observation.lines,
    })),
    dependencies: inv.discoveredDependencies.map((dependency) => ({
      from: dependency.from,
      to: dependency.to,
      status: dependency.status,
      reason: dependency.reason ?? null,
    })),
    obligations: obligations.map((obligation) => ({
      id: obligation.id,
      statement: obligation.statement,
      pending: obligation.pending,
      satisfied: obligation.satisfied ?? false,
      satisfiedBy: Array.isArray(obligation.satisfiedBy) ? obligation.satisfiedBy : [],
    })),
    completion,
  };
}
