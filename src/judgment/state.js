import fs from "node:fs";
import path from "node:path";
import { resolveRefOutcome, reviewIdFromRef } from "./refs.js";

export const JUDGMENT_STATES = {
  blocked: { rank: 0, requiresEvidence: false },
  candidate: { rank: 1, requiresEvidence: true },
  declared: { rank: 2, requiresEvidence: true },
};

const LEGAL_TRANSITIONS = {
  blocked: ["candidate"],
  candidate: ["declared"],
};

const LEGAL_DOWNGRADES = {
  declared: ["candidate"],
  candidate: ["blocked"],
};

export function isJudgmentState(type) {
  return Object.prototype.hasOwnProperty.call(JUDGMENT_STATES, type);
}

export function canTransition(from, to, regressionAuthorized = false) {
  if (!isJudgmentState(to)) return false;
  if (from == null) return true;
  if (from === to) return true;
  if ((LEGAL_TRANSITIONS[from] ?? []).includes(to)) return true;
  if (regressionAuthorized) {
    return (LEGAL_DOWNGRADES[from] ?? []).includes(to);
  }
  return false;
}

export function regressionAuthorizedFor(judgment, context, priorJudgmentId) {
  for (const item of judgment) {
    const refs = Array.isArray(item.evidence_refs) ? item.evidence_refs : [];

    for (const ref of refs) {
      const resolved = resolveRefOutcome(ref, context);

      if (resolved.outcome !== "regression") continue;

      const reviewId = reviewIdFromRef(ref);

      if (reviewId === null) return true;

      const record = context.reviews.find(
        (entry) => entry.review.review_id === reviewId
      );

      if (
        record !== undefined &&
        record.review.reviewed_judgment_id === priorJudgmentId
      ) {
        return true;
      }
    }
  }

  return false;
}

export function surfaceStatus(judgment) {
  let status = "declared";

  for (const item of judgment) {
    const state = JUDGMENT_STATES[item.type];

    if (!state) continue;

    if (state.rank < JUDGMENT_STATES[status].rank) {
      status = item.type;
    }
  }

  return status;
}

export function loadJudgmentStatus(workspaceRoot) {
  const file = path.join(workspaceRoot, ".eos", "judgment.json");

  if (!fs.existsSync(file)) return null;

  let parsed;

  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }

  return isJudgmentState(parsed?.status) ? parsed.status : null;
}