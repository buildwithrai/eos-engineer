import path from "node:path";
import { sha256 } from "./projection/persistence.js";
import {
  phaseOf,
  completionReason,
  understandingOf,
} from "./investigation.js";
import {
  currentGroundingRefs,
  evidenceObligationStatus,
} from "./judgment/gate.js";

function buildEvidenceBlock(
  evidence,
  inspections,
  knowledge,
  decisions,
  traceability,
  reviews,
  judgment,
  changes = [],
  intents = []
) {
  const consumed = new Set();

  for (const item of judgment) {
    for (const ref of item.evidence_refs ?? []) {
      consumed.add(ref);
    }
  }

  return {
    source: "eos",
    evidence: evidence.map(({ evidence: e, source, digest }) => ({
      id: e.id,
      subject: e.subject,
      attempted: e.attempted,
      observed: e.observed,
      outcome: e.outcome,
      source,
      digest,
    })),
    inspections: inspections.map((inspection) => ({
      ok: inspection.ok,
      path: inspection.path,
      digest:
        typeof inspection.content === "string"
          ? sha256(inspection.content)
          : null,
    })),
    knowledge:
      knowledge === undefined
        ? undefined
        : {
            id: "REPOSITORY KNOWLEDGE",
            source: knowledge.source,
            digest: knowledge.digest,
            generatedAt: knowledge.knowledge.generatedAt,
            repositoryRoot: knowledge.knowledge.repository?.root,
          },
    decisions: decisions.map(({ item: decision, source, digest }) => ({
      id: decision.id,
      title: decision.title,
      status: decision.status,
      decision: decision.decision,
      source,
      digest,
    })),
    traceability:
      traceability === undefined
        ? undefined
        : {
            source: traceability.source,
            digest: traceability.digest,
            links: (traceability.item ?? []).map((link) => ({
              id: link.id,
              from: link.from,
              to: link.to,
              relationship: link.relationship,
            })),
          },
    reviews: reviews.map(({ review, source, digest }) => ({
      id: review.review_id,
      outcome: review.outcome,
      judgment_id: review.reviewed_judgment_id,
      source,
      digest,
    })),
    changes: changes.map(({ change, source, digest }) => ({
      id: change.change_id,
      status: change.status,
      target: change.contract?.target,
      source_judgment_id: change.contract?.source_judgment_id,
      source,
      digest,
    })),
    intents: intents.map(({ intent, source, digest }) => ({
      id: intent.intent_id,
      source,
      digest,
    })),
    consumed: [...consumed],
  };
}

function buildSurface(
  investigation,
  judgment,
  restrictions,
  evidence,
  knowledge,
  decisions,
  traceability,
  reviews,
  previousJudgmentId = null,
  previousJudgmentDigest = null,
  commitReason = "judgment",
  changes = [],
  intents = [],
  blocker = null,
  perspective = undefined,
  resolvedJudgmentStatus = null,
  priorStatus = null
) {
  const explicitMissing = [...investigation.explicitRequirements].filter(
    (file) => !investigation.inspectedEvidence.has(file)
  );

  const adoptedMissing = [...investigation.adoptedRequirements].filter(
    (file) => !investigation.inspectedEvidence.has(file)
  );

  const pendingRequirements = [...investigation.adoptedRequirements].filter(
    (file) => !investigation.inspectedEvidence.has(file)
  );

  const unresolvedRelationships = investigation.discoveredDependencies
    .filter((dependency) => dependency.status === "pending")
    .map((dependency) => `${dependency.from} -> ${dependency.to}`);

  const obligations = Array.isArray(investigation.evidenceObligations)
    ? investigation.evidenceObligations
    : [];

  // Obligations are satisfied by the committed judgment's claim refs: the
  // evidence the model actually grounded its conclusion in. Only genuinely
  // committed judgments (judgment or revision) may satisfy an obligation; a
  // blocked or fallback surface leaves obligations pending.
  if (
    obligations.length > 0 &&
    (commitReason === "judgment" || commitReason === "revision")
  ) {
    const ctx = {
      investigation,
      evidence,
      knowledge,
      reviews,
      changes,
      intents,
      perspective,
      priorJudgmentId: previousJudgmentId,
    };

    const claimRefs = [];

    for (const item of judgment) {
      for (const ref of item.evidence_refs ?? []) {
        if (typeof ref === "string") claimRefs.push(ref);
      }
    }

    const grounded = currentGroundingRefs(claimRefs, ctx);

    for (const obligation of obligations) {
      if (!obligation.pending) continue;

      const status = evidenceObligationStatus(obligation, grounded, ctx);

      if (status.satisfied) {
        obligation.satisfied = true;
        obligation.satisfiedBy = status.satisfiedBy;
        obligation.pending = false;
      }
    }
  }

  const unsatisfiedObligationIds = obligations
    .filter((obligation) => obligation.pending)
    .map((obligation) => obligation.id);

  const gaps = [
    ...explicitMissing,
    ...adoptedMissing,
    ...unsatisfiedObligationIds,
  ];

  const evidenceObligations = obligations.map((obligation) => ({
    id: obligation.id,
    statement: obligation.statement,
    kinds: obligation.kinds,
    satisfied: obligation.satisfied,
    satisfiedBy: Array.isArray(obligation.satisfiedBy)
      ? obligation.satisfiedBy
      : [],
    pending: obligation.pending,
    dependencies: investigation.discoveredDependencies.map((dependency) => ({
      from: dependency.from,
      specifier: dependency.specifier,
      to: dependency.to,
      status: dependency.status,
    })),
  }));

  const recordedAt = new Date().toISOString();
  const investigationId = crypto.randomUUID();
  const judgmentId = crypto.randomUUID();

  // The engineering-state transition is the explicit from -> transition -> to
  // record of how this surface advances the projected engineering state. It is
  // derived entirely from deterministic inputs: the previous projected state
  // (lineage id/digest/status), the transition this run performed (commit
  // reason and mode), and the resulting projected state.
  const engineeringState = {
    schema: "eos-engineering-state/v1",
    from:
      previousJudgmentId !== null
        ? {
            status: priorStatus,
            judgment_id: previousJudgmentId,
            digest: previousJudgmentDigest,
          }
        : null,
    transition: {
      reason: commitReason,
      mode: investigation.mode,
    },
    to: {
      status: resolvedJudgmentStatus,
      judgment_id: judgmentId,
      investigation_id: investigationId,
      recorded_at: recordedAt,
    },
  };

  return {
    schema: "eos-judgment/v1",
    judgment_id: judgmentId,
    investigation_id: investigationId,
    recorded_at: recordedAt,
    status: resolvedJudgmentStatus,
    mode: investigation.mode,
    perspective,
    previous_judgment_id: previousJudgmentId,
    previous_judgment_digest: previousJudgmentDigest,
    commit_reason: commitReason,
    engineering_state: engineeringState,
    investigation: {
      target: investigation.target,
      objective: investigation.objective,
      mode: investigation.mode,
      phase: phaseOf(investigation),
      completion: completionReason(investigation),
      understanding: understandingOf(investigation),
      explicit_requirements: [...investigation.explicitRequirements],
      required_evidence: investigation.requiredFiles,
      adopted_requirements: [...investigation.adoptedRequirements],
      inspected_evidence: [...investigation.inspectedEvidence],
      observations: investigation.observations.map((observation) => ({
        path: observation.path,
        exists: observation.exists,
        digest: observation.digest,
        bytes: observation.bytes,
        lines: observation.lines,
        observed_at: observation.observedAt,
      })),
      discovered_dependencies: investigation.discoveredDependencies.map(
        (dependency) => ({
          from: dependency.from,
          specifier: dependency.specifier,
          to: dependency.to,
          status: dependency.status,
          reason: dependency.reason,
        })
      ),
      pending_requirements: pendingRequirements,
      gaps,
      unresolved_relationships: unresolvedRelationships,
      evidence_obligations: evidenceObligations,
      prospective_artifacts: [...investigation.prospectiveArtifacts],
    },
    evidence: buildEvidenceBlock(
      evidence,
      investigation.inspections,
      knowledge,
      decisions,
      traceability,
      reviews,
      judgment,
      changes,
      intents
    ),
    formation:
      investigation.mode === "formation"
        ? {
            mode: "formation",
            intent_records: intents.map(({ intent, source, digest }) => ({
              id: intent.intent_id,
              path: path.normalize(source),
              digest,
            })),
            prospective_artifacts: [...investigation.prospectiveArtifacts],
            boundary: {
              status: "candidate",
              canonical_owner: "Engineer",
              eos_writes_canonical_project_state: false,
            },
          }
        : undefined,
    judgment: judgment.map((item) => ({
      ...item,
      evidence_refs: Array.isArray(item.evidence_refs)
        ? item.evidence_refs
        : [],
    })),
    restrictions,
    blocker,
  };
}

export { buildSurface };
