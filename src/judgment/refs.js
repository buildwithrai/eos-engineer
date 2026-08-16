import fs from "node:fs";
import path from "node:path";
import { findEvidence } from "../investigation/evidence.js";
import { isKnowledgeRef } from "../knowledge.js";
import { loadLatestProjection } from "../projection/persistence.js";

export const REVIEW_OUTCOMES = ["forward", "neutral", "regression", "unresolved"];

const JUDGMENT_STATUS_OUTCOME = {
  declared: "forward",
  candidate: "neutral",
  blocked: "neutral",
};

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function reviewIdFromRef(ref) {
  if (typeof ref !== "string") return null;

  if (ref.startsWith("review:")) {
    const id = ref.slice("review:".length).trim();
    return id.length > 0 ? id : null;
  }

  const match = ref.match(/(?:^|\/)\.eos\/reviews\/([^/]+)\.json$/);

  if (match) return match[1];

  return null;
}

export function isReviewRef(ref, reviews = []) {
  const id = reviewIdFromRef(ref);

  if (id === null) return false;

  return reviews.some((record) => record.review.review_id === id);
}

export function isPersistedReviewRef(ref, workspaceRoot) {
  if (typeof ref !== "string") return false;

  const reviewFile = normalizePath(
    path.relative(
      workspaceRoot,
      path.join(workspaceRoot, ".eos", "review.json")
    )
  );

  const reviewDir = normalizePath(
    path.relative(
      workspaceRoot,
      path.join(workspaceRoot, ".eos", "reviews")
    )
  );

  const normalizedRef = normalizePath(ref).replace(/^\.\//, "");

  return (
    normalizedRef === reviewFile ||
    normalizedRef.endsWith(`/${reviewFile}`) ||
    normalizedRef === reviewDir ||
    normalizedRef.startsWith(`${reviewDir}/`)
  );
}

function judgmentIdFromRef(ref) {
  if (typeof ref !== "string") return null;

  const match = ref.match(/(?:^|\/)\.eos\/judgments\/([^/]+)\.json$/);

  if (match) return match[1];

  if (ref === ".eos/judgment.json" || ref.endsWith("/.eos/judgment.json")) {
    return "latest";
  }

  return null;
}

function loadJudgmentStatusById(root, id) {
  if (id === "latest") {
    const latest = loadLatestProjection(root);

    if (latest === null) return null;

    return typeof latest.surface.status === "string"
      ? latest.surface.status
      : null;
  }

  const file = path.join(root, ".eos", "judgments", `${id}.json`);

  if (!fs.existsSync(file)) return null;

  try {
    const surface = JSON.parse(fs.readFileSync(file, "utf8"));
    return typeof surface.status === "string" ? surface.status : null;
  } catch {
    return null;
  }
}

export function resolveRefOutcome(ref, context) {
  const evidenceRecord = findEvidence(context.evidenceItems, ref);

  if (evidenceRecord !== undefined) {
    const outcome = REVIEW_OUTCOMES.includes(evidenceRecord.evidence.outcome)
      ? evidenceRecord.evidence.outcome
      : "unresolved";

    return {
      outcome,
      evidenceRecord: {
        id: evidenceRecord.evidence.id,
        outcome,
        source: evidenceRecord.source,
        digest: evidenceRecord.digest,
      },
    };
  }

  const reviewId = reviewIdFromRef(ref);

  if (reviewId !== null) {
    const record = context.reviews.find(
      (item) => item.review.review_id === reviewId
    );

    if (record !== undefined) return { outcome: record.review.outcome };

    return { outcome: "unresolved" };
  }

  const judgmentId = judgmentIdFromRef(ref);

  if (judgmentId !== null) {
    const status = loadJudgmentStatusById(context.workspaceRoot, judgmentId);

    if (status === null) return { outcome: "unresolved" };

    return {
      outcome: JUDGMENT_STATUS_OUTCOME[status] ?? "unresolved",
    };
  }

  const changeId = changeIdFromRef(ref);

  if (changeId !== null) {
    const changes = context.changes ?? [];
    const record = changes.find((entry) => entry.change.change_id === changeId);

    if (record === undefined) return { outcome: "unresolved" };

    return { outcome: changeVerdictOutcome(record.change) };
  }

  const intentId = intentIdFromRef(ref);

  if (intentId !== null) {
    const intents = context.intents ?? [];

    if (intents.length === 0) return { outcome: "unresolved" };

    if (intentId === "latest") {
      const ids = intents.map((record) => record.intent.intent_id).sort();
      const latestId = ids[ids.length - 1];
      return intents.some((record) => record.intent.intent_id === latestId)
        ? { outcome: "forward" }
        : { outcome: "unresolved" };
    }

    return intents.some((record) => record.intent.intent_id === intentId)
      ? { outcome: "forward" }
      : { outcome: "unresolved" };
  }

  if (isKnowledgeRef(ref, context.knowledge)) {
    return { outcome: "forward" };
  }

  const normalized = normalizePath(ref);

  if (
    context.inspections.some(
      (inspection) =>
        normalizePath(inspection.path) === normalized ||
        normalizePath(inspection.path).endsWith(`/${normalized}`)
    )
  ) {
    return { outcome: "forward" };
  }

  return { outcome: "unresolved" };
}

export function changeIdFromRef(ref) {
  if (typeof ref !== "string") return null;

  if (ref.startsWith("change:")) {
    const id = ref.slice("change:".length).trim();
    return id.length > 0 ? id : null;
  }

  const match = ref.match(/(?:^|\/)\.eos\/changes\/([^/]+)\//);

  if (match) return match[1];

  return null;
}

export function isChangeRef(ref, changes = []) {
  const id = changeIdFromRef(ref);

  if (id === null) return false;

  return changes.some(
    (record) => (record.change ?? record).change_id === id
  );
}

export function changeVerdictOutcome(change) {
  if (change === null || typeof change !== "object") return "unresolved";

  if (change.status === "verified") return "forward";
  if (change.status === "failed") return "regression";

  return "unresolved";
}

export function intentIdFromRef(ref) {
  if (typeof ref !== "string") return null;

  if (ref.startsWith("intent:")) {
    const id = ref.slice("intent:".length).trim();
    return id.length > 0 ? id : null;
  }

  const match = ref.match(
    /(?:^|\/)\.eos\/formation\/records\/([^/]+)\.json$/
  );

  if (match) return match[1];

  if (
    ref === ".eos/formation/intent.json" ||
    ref.endsWith("/.eos/formation/intent.json")
  ) {
    return "latest";
  }

  return null;
}

export function isIntentRef(ref, intents = []) {
  const id = intentIdFromRef(ref);

  if (id === null) return false;
  if (intents.length === 0) return false;

  if (id === "latest") {
    const ids = intents.map((record) => record.intent.intent_id).sort();
    const latestId = ids[ids.length - 1];
    return intents.some((record) => record.intent.intent_id === latestId);
  }

  return intents.some((record) => record.intent.intent_id === id);
}
