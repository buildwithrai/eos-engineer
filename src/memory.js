import fs from "node:fs";
import path from "node:path";

const JUDGMENTS_DIR = path.join(".eos", "judgments");
const REVIEWS_DIR = path.join(".eos", "reviews");
const CHANGES_DIR = path.join(".eos", "changes");

/**
 * EOS Memory
 *
 * Memory is the history EOS retains across runs: intents, investigations,
 * judgments, reviews, proposals, verifications. It is a first-class concept on
 * the projection surface, distinct from verification (which is EOS re-reading
 * the current engineering state after an actor's action). Memory is
 * deterministic: it is a synthesis of the persisted ledgers, never a model
 * assertion.
 */

function countJson(dir) {
  if (!fs.existsSync(dir)) return 0;

  let count = 0;

  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(".json")) continue;

    const file = path.join(dir, entry);

    try {
      if (fs.statSync(file).isFile()) count += 1;
    } catch {
      // ignore unreadable entries
    }
  }

  return count;
}

function verificationSummary(changes) {
  const summary = { proposed: 0, authorized: 0, executing: 0, executed: 0, verified: 0, failed: 0 };
  const verified = [];
  const failed = [];
  const pending = [];

  for (const { change } of changes) {
    const status = change.status;

    if (Object.prototype.hasOwnProperty.call(summary, status)) {
      summary[status] += 1;
    }

    if (status === "verified") {
      verified.push({
        change_id: change.change_id,
        target: change.contract?.target ?? null,
        verdict: change.verification?.verdict ?? "verified",
        verified_at: change.verification?.verified_at ?? null,
      });
    } else if (status === "failed") {
      failed.push({
        change_id: change.change_id,
        target: change.contract?.target ?? null,
        verdict: change.verification?.verdict ?? "failed",
      });
    } else {
      pending.push({
        change_id: change.change_id,
        target: change.contract?.target ?? null,
        status,
      });
    }
  }

  return { summary, verified, failed, pending };
}

/**
 * Synthesize the retained history into a deterministic memory account.
 *
 * - changes and reviews are loaded ledger records (arrays of { change, source,
 *   digest } / { review, source, digest }).
 * - The memory account answers: what has EOS retained, and what is the
 *   verification state of the changes it recorded?
 */
export function buildMemory(workspaceRoot, { changes = [], reviews = [], intents = [] } = {}) {
  const judgmentCount = countJson(path.join(workspaceRoot, JUDGMENTS_DIR));
  const reviewCount = countJson(path.join(workspaceRoot, REVIEWS_DIR));

  const latestReview = reviews.length > 0 ? reviews[reviews.length - 1].review : null;

  return {
    schema: "eos-memory/v1",
    judgments: judgmentCount,
    reviews: reviewCount,
    intents: Array.isArray(intents) ? intents.length : 0,
    latest_review: latestReview
      ? {
          review_id: latestReview.review_id,
          reviewed_judgment_id: latestReview.reviewed_judgment_id,
          outcome: latestReview.outcome,
          reviewed_at: latestReview.reviewed_at,
        }
      : null,
    verification: verificationSummary(changes),
  };
}

/**
 * Model-facing rendering of the memory account.
 */
export function renderMemory(memory) {
  if (memory === undefined || memory === null) return "";

  const lines = [
    "MEMORY",
    `Retained judgments: ${memory.judgments}`,
    `Retained reviews: ${memory.reviews}`,
    `Retained intents: ${memory.intents}`,
  ];

  if (memory.latest_review !== null) {
    lines.push(
      `Latest review: ${memory.latest_review.outcome} (review:${memory.latest_review.review_id} of ${memory.latest_review.reviewed_judgment_id})`
    );
  }

  const summary = memory.verification.summary;

  lines.push(
    `Change verification: ${summary.verified} verified, ${summary.failed} failed, ${summary.executed} executed, ${summary.proposed} proposed`
  );

  return lines.join("\n");
}

export { countJson };
