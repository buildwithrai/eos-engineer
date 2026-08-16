import crypto from "node:crypto";
import { readFile } from "../investigation/tools/read-file.js";
import { readFiles } from "../tools/readFiles.js";

export const tools = { read_file: readFile, read_files: readFiles };

export function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

export const WORKSPACE_UNAVAILABLE_REASONS = {
  missing: "path does not exist",
  "not-a-directory": "path is not a directory",
  inaccessible: "path is not accessible",
};

/**
 * Deterministic blocked surface for an unavailable repository target.
 *
 * This result is returned in-memory and is never committed or reviewed: the
 * workspace cannot be read (missing / not-a-directory / inaccessible), and
 * writing a projection or a formation intent would fabricate a target that
 * does not exist. No formation intent is ever created merely because a
 * requested repository path does not exist.
 */
export function buildUnavailableSurface(userInput, workspaceRoot, validation) {
  const recordedAt = new Date().toISOString();
  const firstLine = String(userInput ?? "").split("\n")[0] ?? "";
  const reasonDetail = WORKSPACE_UNAVAILABLE_REASONS[validation.reason] ?? "path is unavailable";

  const claim = `Blocked: requested workspace is unavailable (${validation.reason}): ${workspaceRoot} — ${reasonDetail}. No investigation was performed and no formation intent was recorded.`;

  const surface = {
    schema: "eos-judgment/v1",
    judgment_id: crypto.randomUUID(),
    investigation_id: crypto.randomUUID(),
    recorded_at: recordedAt,
    status: "blocked",
    mode: "repository",
    perspective: undefined,
    previous_judgment_id: null,
    previous_judgment_digest: null,
    commit_reason: "blocked",
    investigation: {
      target: firstLine.slice(0, 200),
      objective: firstLine.slice(0, 200),
      mode: "repository",
      phase: "blocked",
      explicit_requirements: [],
      required_evidence: [],
      adopted_requirements: [],
      inspected_evidence: [],
      discovered_dependencies: [],
      pending_requirements: [],
      gaps: [],
      unresolved_relationships: [],
      evidence_obligations: [],
      prospective_artifacts: [],
    },
    evidence: {
      source: "eos-substrate",
      evidence: [],
      inspections: [],
      reviews: [],
      changes: [],
      intents: [],
      consumed: [],
    },
    blocker: {
      reason: "workspace-unavailable",
      detail: validation.reason,
      path: workspaceRoot,
    },
    judgment: [
      {
        claim,
        type: "blocked",
        confidence: "low",
        evidence_refs: [],
      },
    ],
    restrictions: [],
  };

  return surface;
}

export function normalizeJson(raw) {
  let jsonText = String(raw ?? "").trim();

  if (!jsonText) throw new Error("Model returned empty content");

  const fenced = jsonText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  if (fenced) jsonText = fenced[1].trim();

  return jsonText.replace(/\\\\([^"\\\\\\/bfnrtu])/g, "$1");
}