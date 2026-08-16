import path from "node:path";
import { normalizePath } from "../runtime/context.js";
import { JUDGMENT_STATES } from "./state.js";
import {
  planningComplete,
  investigationComplete,
} from "../investigation.js";
import { evidenceExists } from "../investigation/evidence.js";
import {
  isKnowledgeRef,
  isKnowledgeEntityRef,
} from "../knowledge.js";
import {
  isReviewRef,
  isPersistedReviewRef,
  reviewIdFromRef,
  isChangeRef,
  isIntentRef,
} from "./refs.js";
import {
  isPerspectiveRef,
  isPerspectiveEntityRef,
} from "../perspective.js";

export function isPersistedJudgmentRef(ref, workspaceRoot) {
  if (typeof ref !== "string") return false;

  const judgmentFile = normalizePath(
    path.relative(
      workspaceRoot,
      path.join(workspaceRoot, ".eos", "judgment.json")
    )
  );

  const ledgerDir = normalizePath(
    path.relative(
      workspaceRoot,
      path.join(workspaceRoot, ".eos", "judgments")
    )
  );

  const normalizedRef = normalizePath(ref).replace(/^\.\//, "");

  return (
    normalizedRef === judgmentFile ||
    normalizedRef.endsWith(`/${judgmentFile}`) ||
    normalizedRef === ledgerDir ||
    normalizedRef.startsWith(`${ledgerDir}/`)
  );
}

export function canonicalizeEvidenceRefs(
  judgment,
  workspaceRoot,
  evidence = [],
  knowledge = undefined,
  reviews = [],
  changes = [],
  intents = [],
  perspective = undefined
) {
  const absoluteRoot = normalizePath(workspaceRoot);

  return judgment.map((item) => ({
    ...item,

    evidence_refs: (
      Array.isArray(item.evidence_refs)
        ? item.evidence_refs
        : []
    ).map((ref) => {
      if (typeof ref !== "string") return ref;

      // Review references are canonical as-is. Never normalize them as
      // filesystem paths.
      if (isReviewRef(ref, reviews)) {
        return ref;
      }

      // Engineering change references are canonical as-is. Never normalize
      // them as filesystem paths.
      if (isChangeRef(ref, changes)) {
        return ref;
      }

      // Formation intent references are canonical as-is. Never normalize
      // them as filesystem paths.
      if (isIntentRef(ref, intents)) {
        return ref;
      }

      // Perspective references are canonical as-is. Never normalize them
      // as filesystem paths.
      if (isPerspectiveRef(ref, perspective)) {
        return ref;
      }

      // Knowledge references are canonical as-is (blanket or specific
      // entity refs). Never normalize them as filesystem paths.
      if (isKnowledgeRef(ref, knowledge)) {
        return ref;
      }

      // Canonical substrate reference.
      if (ref === "REPOSITORY KNOWLEDGE") {
        return ref;
      }

      // Engineering evidence IDs are already canonical.
      // Never normalize them as filesystem paths.
      if (evidenceExists(evidence, ref)) {
        return ref;
      }

      // Filesystem evidence references are canonicalized as
      // workspace-relative paths.
      const normalizedRef = normalizePath(ref);

      if (normalizedRef.startsWith(absoluteRoot + "/")) {
        return normalizedRef.slice(absoluteRoot.length + 1);
      }

      return normalizedRef;
    }),
  }));
}

/**
 * Determine the evidence kind a ref resolves to, or null when it resolves to
 * nothing. Mirrors the ref-resolution logic used by the gate. A review ref is
 * always classified "review" here; anchoring is applied separately by
 * currentGroundingRefs.
 */
export function evidenceKindOf(ref, ctx) {
  if (typeof ref !== "string") return null;

  const {
    investigation,
    evidence,
    knowledge,
    reviews,
    changes,
    intents,
    perspective,
  } = ctx;

  const inspected = [...investigation.inspectedEvidence];
  const normalizedRef = normalizePath(ref);

  const directlyInspected = inspected.some(
    (file) =>
      file === normalizedRef ||
      file.endsWith(`/${normalizedRef}`)
  );

  const requiredEvidenceInspected =
    [...investigation.explicitRequirements].some(
      (requiredFile) =>
        (
          requiredFile === normalizedRef ||
          requiredFile.endsWith(`/${normalizedRef}`) ||
          normalizedRef.endsWith(`/${requiredFile}`)
        ) &&
        investigation.inspectedEvidence.has(requiredFile)
    );

  if (directlyInspected || requiredEvidenceInspected) {
    return "inspected-file";
  }

  if (evidenceExists(evidence, ref)) return "evidence-store";
  if (isKnowledgeRef(ref, knowledge)) return "knowledge";
  if (isChangeRef(ref, changes)) return "change";
  if (isIntentRef(ref, intents)) return "intent";
  if (isPerspectiveRef(ref, perspective)) return "perspective";
  if (isReviewRef(ref, reviews)) return "review";

  return null;
}

/**
 * True when a review ref re-verifies the judgment currently under review.
 */
export function anchoredReviewRef(ref, ctx) {
  const { reviews, priorJudgmentId } = ctx;

  if (priorJudgmentId === null || priorJudgmentId === undefined) {
    return false;
  }

  const id = reviewIdFromRef(ref);
  if (id === null) return false;

  const record = reviews.find(
    (entry) => entry.review && entry.review.review_id === id
  );

  return (
    record !== undefined &&
    record.review.reviewed_judgment_id === priorJudgmentId
  );
}

/**
 * Refs that ground a claim in current evidence: any resolved non-review ref,
 * plus review refs that re-verify the judgment currently under review.
 * Unanchored historical reviews never count as current grounding.
 */
export function currentGroundingRefs(refs, ctx) {
  if (!Array.isArray(refs)) return [];

  return refs.filter((ref) => {
    const kind = evidenceKindOf(ref, ctx);

    if (kind === null) return false;
    if (kind === "review") return anchoredReviewRef(ref, ctx);

    return true;
  });
}

/**
 * Whether a set of grounded refs satisfies an evidence obligation, restricted
 * to the evidence kinds the obligation accepts.
 */
export function evidenceObligationStatus(obligation, groundedRefs, ctx) {
  const kinds = Array.isArray(obligation?.kinds) ? obligation.kinds : [];

  const satisfiedBy = (Array.isArray(groundedRefs) ? groundedRefs : []).filter(
    (ref) => kinds.includes(evidenceKindOf(ref, ctx))
  );

  return { satisfied: satisfiedBy.length > 0, satisfiedBy };
}

export function gateJudgment(
  judgment,
  investigation,
  evidence = [],
  knowledge = undefined,
  workspaceRoot = undefined,
  reviews = [],
  changes = [],
  intents = [],
  perspective = undefined,
  priorJudgmentId = null
) {
  for (const item of judgment) {
    const state = JUDGMENT_STATES[item.type];

    if (!state) {
      return {
        ok: false,
        reason: "state",
        message: `Judgment state "${item.type}" is not a legal EOS state. Use blocked, candidate, or declared.`,
      };
    }

    if (!state.requiresEvidence) continue;

    const planningOk = planningComplete(investigation);
    const investigationOk = investigationComplete(investigation);

    if (!planningOk || !investigationOk) {
      const missingRequired = [...investigation.explicitRequirements].filter(
        (file) => !investigation.inspectedEvidence.has(file)
      );
      const missingAdopted = [...investigation.adoptedRequirements].filter(
        (file) => !investigation.inspectedEvidence.has(file)
      );
      const pending = investigation.discoveredDependencies
        .filter((dependency) => dependency.status === "pending")
        .map((dependency) => `${dependency.from} -> ${dependency.to}`);

      let message =
        `Claim "${item.claim}" cannot reach ${item.type} because the investigation is incomplete. `;

      if (missingRequired.length > 0) {
        message += `Required evidence not inspected: ${missingRequired.join(", ")}. `;
      }

      if (missingAdopted.length > 0) {
        message += `Adopted evidence not inspected: ${missingAdopted.join(", ")}. `;
      }

      if (pending.length > 0) {
        message += `Discovered relationships not disposed: ${pending.join(", ")}. Waive or adopt them before judging.`;
      }

      return {
        ok: false,
        reason: "evidence",
        missing: [...missingRequired, ...missingAdopted],
        pending,
        message,
      };
    }

    const refs = Array.isArray(item.evidence_refs) ? item.evidence_refs : [];

    if (refs.length === 0) {
      return {
        ok: false,
        reason: "evidence",
        missing: [],
        message: `Claim "${item.claim}" references no evidence. Provide evidence_refs.`,
      };
    }

    const ctx = {
      investigation,
      evidence,
      knowledge,
      workspaceRoot,
      reviews,
      changes,
      intents,
      perspective,
      priorJudgmentId,
    };

    const grounded = currentGroundingRefs(refs, ctx);

    // A review artifact is grounded only when it re-verifies the judgment
    // currently under review, or when the claim is otherwise anchored to
    // evidence acquired for the current investigation. A historical review
    // alone must never substitute for current evidence.
    const hasNonReviewGrounding = grounded.some(
      (ref) => evidenceKindOf(ref, ctx) !== "review"
    );

    const missing = refs.filter((ref) => {
      if (typeof ref !== "string") return true;

      const persistedJudgmentRef =
        workspaceRoot !== undefined &&
        isPersistedJudgmentRef(ref, workspaceRoot);

      const persistedReviewRef =
        workspaceRoot !== undefined &&
        isPersistedReviewRef(ref, workspaceRoot);

      if (persistedJudgmentRef || persistedReviewRef) return true;

      const kind = evidenceKindOf(ref, ctx);

      if (kind === null) return true;

      // A review is missing only when it is neither anchored to the judgment
      // under review nor carried by other current grounding in the claim. This
      // mirrors the pre-existing gate behavior: a historical review cannot
      // substitute for current evidence, but it is tolerated when the claim
      // otherwise grounds in current evidence.
      if (kind === "review") {
        return !(anchoredReviewRef(ref, ctx) || hasNonReviewGrounding);
      }

      return false;
    });
    if (missing.length > 0) {
      const knowledgeLike = missing.filter((ref) => isKnowledgeEntityRef(ref));
      const perspectiveLike = missing.filter((ref) => isPerspectiveEntityRef(ref));
      const reviewLike = missing.filter((ref) => isReviewRef(ref, reviews));

      let message;

      if (knowledgeLike.length > 0) {
        message = `Claim "${item.claim}" cites knowledge refs not present in the REPOSITORY KNOWLEDGE block: ${knowledgeLike.join(", ")}. Never claim a symbol, package, import, export, or dependency exists unless it is listed there.`;
      } else if (perspectiveLike.length > 0) {
        message = `Claim "${item.claim}" cites perspective refs not present in the PERSPECTIVE block: ${perspectiveLike.join(", ")}. Never claim a workspace, governing framework, participant, substrate, or epistemic fact unless the PERSPECTIVE block reports it.`;
      } else if (reviewLike.length > 0) {
        message = `Claim "${item.claim}" cites review evidence that cannot ground the claim: ${reviewLike.join(", ")}. A review is citable only when it re-verifies the judgment it reviewed, and it cannot substitute for evidence acquired in the current investigation.`;
      } else {
        message = `Claim "${item.claim}" references evidence not inspected, not in the engineering evidence store, or not in the repository knowledge model: ${missing.join(", ")}`;
      }

      return {
        ok: false,
        reason: "evidence",
        missing,
        knowledge: knowledgeLike,
        message,
      };
    }

    // Evidence obligations are the semantic investigation's explicit evidence
    // requirement: the objective demands current evidence even when no files
    // were named. Enforcement coincides with the current-grounding rule above,
    // but the obligation check surfaces the objective-level requirement
    // directly so the investigator knows why judgment is held.
    const obligations = Array.isArray(investigation.evidenceObligations)
      ? investigation.evidenceObligations
      : [];

    if (obligations.some((obligation) => obligation.pending)) {
      const unsatisfied = [];

      for (const obligation of obligations) {
        if (!obligation.pending) continue;

        const status = evidenceObligationStatus(obligation, grounded, ctx);
        if (status.satisfied) {
          obligation.satisfied = true;
          obligation.satisfiedBy = status.satisfiedBy;
          obligation.pending = false;
        } else {
          unsatisfied.push(obligation);
        }
      }

      if (unsatisfied.length > 0) {
        return {
          ok: false,
          reason: "obligations",
          missing: [],
          obligations: unsatisfied.map((obligation) => ({
            id: obligation.id,
            statement: obligation.statement,
            kinds: obligation.kinds,
            pending: true,
          })),
          message: `Claim "${item.claim}" cannot reach ${item.type} because pending evidence obligations are unsatisfied: ${unsatisfied
            .map((obligation) => obligation.id)
            .join(", ")}. ${unsatisfied[0].statement} Ground the claim in current evidence of kind: ${unsatisfied[0].kinds.join(", ")}.`,
        };
      }
    }
  }

  return { ok: true };
}
