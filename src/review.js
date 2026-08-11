import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { sha256, loadLatestProjection } from "./lineage.js";
import { loadEvidence, findEvidence, loadKnowledge } from "./evidence.js";
import { isKnowledgeRef } from "./knowledge.js";

export const REVIEW_OUTCOMES = ["forward", "neutral", "regression", "unresolved"];

const REVIEW_SCHEMA = "eos-review/v1";
const REVIEW_DIR = path.join(".eos", "reviews");
const LATEST_REVIEW_FILE = path.join(".eos", "review.json");

const OUTCOME_SEVERITY = {
  forward: 0,
  neutral: 1,
  unresolved: 2,
  regression: 3,
};

const JUDGMENT_STATUS_OUTCOME = {
  declared: "forward",
  candidate: "neutral",
  blocked: "neutral",
};

export function reviewsDirectory(root) {
  return path.join(root, REVIEW_DIR);
}

export function reviewPath(root, reviewId) {
  return path.join(reviewsDirectory(root), `${reviewId}.json`);
}

export function latestReviewFile(root) {
  return path.join(root, LATEST_REVIEW_FILE);
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function worstOf(outcomes) {
  if (outcomes.length === 0) return "neutral";

  return [...outcomes].sort(
    (a, b) => (OUTCOME_SEVERITY[b] ?? -1) - (OUTCOME_SEVERITY[a] ?? -1)
  )[0];
}

export function loadReviews(root) {
  const dir = reviewsDirectory(root);

  if (!fs.existsSync(dir)) return [];

  const items = [];

  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(".json")) continue;

    const file = path.join(dir, entry);
    const raw = fs.readFileSync(file, "utf8");
    let review;

    try {
      review = JSON.parse(raw);
    } catch {
      continue;
    }

    if (!review || typeof review.review_id !== "string") continue;

    items.push({
      review,
      source: file,
      digest: sha256(raw),
    });
  }

  return items;
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

function resolveReviewedNode(root, judgmentId) {
  if (judgmentId !== null && judgmentId !== undefined) {
    const file = path.join(root, ".eos", "judgments", `${judgmentId}.json`);

    if (!fs.existsSync(file)) {
      throw new Error(`review target judgment not found (${judgmentId})`);
    }

    const bytes = fs.readFileSync(file);
    const node = JSON.parse(bytes);

    if (node.judgment_id !== judgmentId) {
      throw new Error(`review target judgment id mismatch (${judgmentId})`);
    }

    return { node, bytes, file, digest: sha256(bytes) };
  }

  const latest = loadLatestProjection(root);

  if (latest === null) {
    throw new Error("no judgment to review");
  }

  const file = path.join(
    root,
    ".eos",
    "judgments",
    `${latest.surface.judgment_id}.json`
  );

  if (!fs.existsSync(file)) {
    throw new Error("latest judgment node missing from ledger");
  }

  const bytes = fs.readFileSync(file);

  return { node: latest.surface, bytes, file, digest: sha256(bytes) };
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

export function runReview(workspaceRoot, judgmentId = null) {
  const target = resolveReviewedNode(workspaceRoot, judgmentId);

  const context = {
    workspaceRoot,
    evidenceItems: loadEvidence(workspaceRoot),
    knowledge: loadKnowledge(workspaceRoot),
    reviews: loadReviews(workspaceRoot),
    inspections: target.node.evidence?.inspections ?? [],
  };

  const claims = [];
  const findings = [];
  const verdictFindings = [];
  const evidenceMap = new Map();

  for (const claim of target.node.judgment ?? []) {
    if (claim.type === "blocked") {
      claims.push({
        claim: claim.claim,
        type: claim.type,
        confidence: claim.confidence,
        outcome: "neutral",
        verdict: "supported",
        evidence_refs: Array.isArray(claim.evidence_refs) ? claim.evidence_refs : [],
        resolved: [],
      });
      continue;
    }

    const refs = Array.isArray(claim.evidence_refs) ? claim.evidence_refs : [];
    const resolved = [];

    for (const ref of refs) {
      const resolution = resolveRefOutcome(ref, context);

      resolved.push({ ref, outcome: resolution.outcome });

      if (resolution.evidenceRecord !== undefined) {
        evidenceMap.set(
          resolution.evidenceRecord.id,
          resolution.evidenceRecord
        );
      }
    }

    const outcome = worstOf(resolved.map((entry) => entry.outcome));

    const verdict =
      claim.type === "declared" && outcome !== "forward"
        ? "unsupported"
        : "supported";

    const claimRecord = {
      claim: claim.claim,
      type: claim.type,
      confidence: claim.confidence,
      outcome,
      verdict,
      evidence_refs: refs,
      resolved,
    };

    claims.push(claimRecord);

    if (outcome !== "forward") {
      findings.push({
        claim: claim.claim,
        type: claim.type,
        confidence: claim.confidence,
        outcome,
        evidence_refs: refs,
      });
    }

    if (verdict === "unsupported") {
      verdictFindings.push({
        rule: "JudgmentVerdictRule",
        claim: claim.claim,
        type: claim.type,
        confidence: claim.confidence,
        outcome,
        evidence_refs: refs,
      });
    }
  }

  const outcome = worstOf(claims.map((entry) => entry.outcome));

  const review = {
    schema: REVIEW_SCHEMA,
    review_id: crypto.randomUUID(),
    reviewed_judgment_id: target.node.judgment_id,
    reviewed_judgment_digest: target.digest,
    reviewed_at: new Date().toISOString(),
    outcome,
    claims,
    findings,
    verdict_findings: verdictFindings,
    evidence: [...evidenceMap.values()],
  };

  commitReview(workspaceRoot, review, target);

  return review;
}

function validateReview(review, target) {
  if (review === null || typeof review !== "object") {
    throw new Error("cannot commit invalid review: not-an-object");
  }

  if (review.schema !== REVIEW_SCHEMA) {
    throw new Error("cannot commit invalid review: schema");
  }

  if (typeof review.review_id !== "string" || review.review_id.length === 0) {
    throw new Error("cannot commit invalid review: review-id");
  }

  if (typeof review.reviewed_judgment_id !== "string") {
    throw new Error("cannot commit invalid review: reviewed-judgment-id");
  }

  if (review.reviewed_judgment_id !== target.node.judgment_id) {
    throw new Error("cannot commit invalid review: reviewed-judgment-mismatch");
  }

  if (!REVIEW_OUTCOMES.includes(review.outcome)) {
    throw new Error("cannot commit invalid review: outcome");
  }

  const bytes = fs.readFileSync(target.file);

  if (sha256(bytes) !== review.reviewed_judgment_digest) {
    throw new Error("cannot commit review: reviewed judgment digest mismatch");
  }
}

function commitReview(root, review, target) {
  validateReview(review, target);

  const file = reviewPath(root, review.review_id);

  if (fs.existsSync(file)) {
    throw new Error(`review ledger is write-once; review already exists (${review.review_id})`);
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });

  const bytes = JSON.stringify(review, null, 2) + "\n";

  fs.writeFileSync(file, bytes);

  const latestFile = latestReviewFile(root);
  const tmpPath = path.join(path.dirname(latestFile), "review.json.tmp");

  fs.mkdirSync(path.dirname(latestFile), { recursive: true });
  fs.writeFileSync(tmpPath, bytes);
  fs.renameSync(tmpPath, latestFile);
}
