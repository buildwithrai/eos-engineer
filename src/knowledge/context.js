import { buildKnowledgeProjection } from "../knowledge.js";

export function buildSubstrateContext(evidence, knowledge, decisions, traceability, reviews, changes = [], intents = []) {
  const parts = [];

  if (knowledge !== undefined) {
    const projection = buildKnowledgeProjection(knowledge);

    if (projection !== undefined) {
      parts.push(projection);
    }
  }

  if (evidence.length > 0) {
    const ids = evidence.map((item) => item.evidence.id).join(", ");
    parts.push(`ENGINEERING EVIDENCE\nEvidence ids available for citation: ${ids}`);
  }

  if (reviews.length > 0) {
    const lines = reviews.map(
      ({ review }) =>
        `- review:${review.review_id} [${review.outcome}] (reviewed ${review.reviewed_judgment_id})`
    );
    parts.push(`REVIEW EVIDENCE\nReview refs available for citation:\n${lines.join("\n")}`);
  } else {
    parts.push("REVIEW EVIDENCE\n(none — no review evidence recorded)");
  }

  if (changes.length > 0) {
    const lines = changes.map(
      ({ change }) =>
        `- change:${change.change_id} [${change.status}] ${change.contract.target} (source judgment ${change.contract.source_judgment_id})`
    );
    parts.push(`ENGINEERING OUTCOME RECORDS\nChange records available for citation:\n${lines.join("\n")}`);
  } else {
    parts.push("ENGINEERING OUTCOME RECORDS\n(none — no engineering change records)");
  }

  if (intents.length > 0) {
    const lines = intents.map(
      ({ intent, source }) =>
        `- intent:${intent.intent_id} (recorded ${intent.recorded_at})\n  ${intent.intent}`
    );
    parts.push(
      `ENGINEERING INTENT\nProject-formation intent records available for citation as intent:<id> or by record path:\n${lines.join("\n")}`
    );
  }

  if (decisions.length > 0) {
    const lines = decisions.map(({ item: decision }) => {
      const artifacts = Array.isArray(decision.relatedArtifacts)
        ? decision.relatedArtifacts.join(", ")
        : "";
      return `- ${decision.id} [${decision.status}]: ${decision.title}\n  decision: ${decision.decision}\n  artifacts: ${artifacts || "none"}`;
    });
    parts.push(`DECISIONS\n${lines.join("\n")}`);
  } else {
    parts.push("DECISIONS\n(none — substrate consulted)");
  }

  const traceabilityLinks =
    traceability !== undefined && Array.isArray(traceability.item)
      ? traceability.item
      : [];

  if (traceabilityLinks.length > 0) {
    const lines = traceabilityLinks.map((link) => {
      const rationale = link.rationale ? ` — ${link.rationale}` : "";
      return `- ${link.id}: ${link.from} -> ${link.to} [${link.relationship}]${rationale}`;
    });
    parts.push(`TRACEABILITY\n${lines.join("\n")}`);
  } else {
    parts.push("TRACEABILITY\n(none — substrate consulted)");
  }

  return parts.join("\n\n");
}