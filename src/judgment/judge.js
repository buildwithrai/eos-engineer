import {
  JUDGMENT_STATES,
  canTransition,
  regressionAuthorizedFor,
  surfaceStatus,
} from "./state.js";

import { canonicalizeEvidenceRefs, gateJudgment } from "./gate.js";
import { rejectedJudgmentGuidance } from "../reasoning/context.js";

export function evaluateJudgment({
  parsed,
  investigation,
  workspaceRoot,
  evidence,
  knowledge,
  reviews,
  changes,
  intents,
  perspective,
  reviewContext,
  priorJudgmentId,
  previousStatus,
}) {
  const items = Array.isArray(parsed.judgment) ? parsed.judgment : [];

  if (items.length === 0) {
    return {
      ok: false,
      message: "You cannot finish yet. A judgment must contain at least one claim.",
    };
  }

  const canonicalItems = canonicalizeEvidenceRefs(
    items,
    workspaceRoot,
    evidence,
    knowledge,
    reviews,
    changes,
    intents,
    perspective
  );

  const gate = gateJudgment(
    canonicalItems,
    investigation,
    evidence,
    knowledge,
    workspaceRoot,
    reviews,
    changes,
    intents,
    perspective,
    priorJudgmentId
  );

  if (!gate.ok) {
    return {
      ok: false,
      message: rejectedJudgmentGuidance(
        gate,
        investigation,
        knowledge
      ),
    };
  }

  const nextStatus = surfaceStatus(canonicalItems);

  const regressionAuthorized = regressionAuthorizedFor(
    canonicalItems,
    reviewContext,
    priorJudgmentId
  );

  if (!canTransition(
    previousStatus,
    nextStatus,
    regressionAuthorized
  )) {
    return {
      ok: false,
      message:
        `You cannot finish yet. Judging as "${nextStatus}" is not a legal transition from the previous state "${previousStatus}". ` +
        `Legal transitions are blocked -> candidate -> declared, plus one-level downgrades ` +
        `(declared -> candidate, candidate -> blocked) when a cited reference resolves to a regression outcome.`,
    };
  }

  return {
    ok: true,
    canonicalItems,
    nextStatus,
    revision:
      previousStatus !== null &&
      JUDGMENT_STATES[nextStatus].rank <
        JUDGMENT_STATES[previousStatus].rank,
    restrictions: Array.isArray(parsed.restrictions)
      ? parsed.restrictions
      : [],
  };
}
