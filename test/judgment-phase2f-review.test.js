import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { runEos } from "../src/runtime/run.js";
import { runReview, loadReviews, isReviewRef, isPersistedReviewRef } from "../src/review.js";
import { verifyLineage } from "../src/projection/lineage.js";
import { sha256 } from "../src/projection/persistence.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-phase2f-review"
);

let failures = 0;

function assert(name, condition, detail = "") {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

function evidenceRecord(id, outcome) {
  return {
    id,
    subject: `subject ${outcome}`,
    attempted: `attempt ${outcome}`,
    observed: `observed ${outcome}`,
    outcome,
    basis: [],
    unresolved: [],
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

const EV_FWD = "11111111-1111-1111-1111-111111111111";
const EV_NEU = "22222222-2222-2222-2222-222222222222";
const EV_REG = "33333333-3333-3333-3333-333333333333";
const EV_UNR = "44444444-4444-4444-4444-444444444444";

function freshWorkspace() {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspace, ".eos", "substrate", "engineering", "evidence"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, ".eos", "substrate", "engineering", "evidence", `${EV_FWD}.json`),
    JSON.stringify(evidenceRecord(EV_FWD, "forward"), null, 2)
  );
  fs.writeFileSync(
    path.join(workspace, ".eos", "substrate", "engineering", "evidence", `${EV_NEU}.json`),
    JSON.stringify(evidenceRecord(EV_NEU, "neutral"), null, 2)
  );
  fs.writeFileSync(
    path.join(workspace, ".eos", "substrate", "engineering", "evidence", `${EV_REG}.json`),
    JSON.stringify(evidenceRecord(EV_REG, "regression"), null, 2)
  );
  fs.writeFileSync(
    path.join(workspace, ".eos", "substrate", "engineering", "evidence", `${EV_UNR}.json`),
    JSON.stringify(evidenceRecord(EV_UNR, "unresolved"), null, 2)
  );
}

function judgment(type, evidenceRefs = [], claim = `${type} claim`) {
  return {
    type: "judgment",
    judgment: [
      {
        claim,
        type,
        confidence: "high",
        evidence_refs: evidenceRefs,
      },
    ],
  };
}

async function runWithResponses(userInput, responses, options = {}) {
  let calls = 0;

  const chatFn = async () => {
    const response = responses[Math.min(calls, responses.length - 1)];
    calls += 1;
    return { content: JSON.stringify(response) };
  };

  const surface = await runEos(userInput, {
    workspace,
    chatFn,
    maxIterations: options.maxIterations ?? 10,
  });

  return { surface, calls };
}

function nodeFile(judgmentId) {
  return path.join(workspace, ".eos", "judgments", `${judgmentId}.json`);
}

function reviewFile(reviewId) {
  return path.join(workspace, ".eos", "reviews", `${reviewId}.json`);
}

async function testFourOutcomes() {
  const scenarios = [
    ["forward", EV_FWD, "forward review outcome"],
    ["neutral", EV_NEU, "neutral review outcome"],
    ["regression", EV_REG, "regression review outcome"],
    ["unresolved", EV_UNR, "unresolved review outcome"],
  ];

  for (const [outcome, evidenceId, label] of scenarios) {
    freshWorkspace();
    const { surface } = await runWithResponses("Judge the evidence.", [
      judgment("declared", [evidenceId]),
    ]);

    const review = runReview(workspace);

    assert(`${label} derived`, review.outcome === outcome);
    assert(`${label} anchors judgment`, review.reviewed_judgment_id === surface.judgment_id);
    assert(
      `${label} anchors node digest`,
      review.reviewed_judgment_digest === sha256(fs.readFileSync(nodeFile(surface.judgment_id)))
    );
    assert(`${label} schema correct`, review.schema === "eos-review/v1");
    assert(
      `${label} recorded to ledger`,
      fs.existsSync(reviewFile(review.review_id)) &&
        fs.existsSync(path.join(workspace, ".eos", "review.json"))
    );
  }
}

async function testRegressionFindingSurfaces() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_REG], "the regression claim"),
  ]);

  const review = runReview(workspace);

  assert("regression surfaces a finding", review.findings.length === 1);
  assert("finding carries outcome", review.findings[0].outcome === "regression");
  assert("finding carries claim", review.findings[0].claim === "the regression claim");
  assert("finding carries refs", review.findings[0].evidence_refs[0] === EV_REG);
  assert("claim resolution recorded", review.claims[0].resolved[0].ref === EV_REG);
  assert("claim resolution outcome recorded", review.claims[0].resolved[0].outcome === "regression");
}

async function testReviewOutcomeBecomesEvidence() {
  freshWorkspace();
  const { surface: judgmentA } = await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD]),
  ]);

  const review = runReview(workspace);

  let seenPrompt = "";
  const fakeChat = async (messages) => {
    seenPrompt = messages[0].content;
    return { content: JSON.stringify(judgment("declared", [`review:${review.review_id}`])) };
  };

  const reverified = await runEos("Re-verify the prior judgment.", {
    workspace,
    chatFn: fakeChat,
  });

  assert("re-verification accepted", reverified.judgment[0].type === "declared");
  assert("review ref preserved", reverified.judgment[0].evidence_refs[0] === `review:${review.review_id}`);
  assert("review ref consumed", reverified.evidence.consumed.includes(`review:${review.review_id}`));
  assert("review provenance in surface", Array.isArray(reverified.evidence.reviews) && reverified.evidence.reviews.length >= 1);
  assert("review provenance id", reverified.evidence.reviews.some((r) => r.id === review.review_id));
  assert("review provenance outcome", reverified.evidence.reviews[0].outcome === "forward");
  assert("review provenance anchors judgment", reverified.evidence.reviews[0].judgment_id === judgmentA.judgment_id);
  assert("review provenance digest is hex", /^[0-9a-f]{64}$/.test(reverified.evidence.reviews[0].digest));
  assert("REVIEW EVIDENCE block present", seenPrompt.includes("REVIEW EVIDENCE"));
  assert("review ref listed in context", seenPrompt.includes(`review:${review.review_id}`));
}

async function testFabricatedReviewRefRejected() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD]),
  ]);
  runReview(workspace);

  const { surface, calls } = await runWithResponses(
    "Re-verify the prior judgment.",
    [judgment("declared", ["review:00000000-0000-0000-0000-000000000000"])],
    { maxIterations: 3 }
  );

  assert("fabricated review ref rejected", calls >= 3);
  assert("fabricated review ref never commits a validated judgment", surface.commit_reason === "fallback");
}

async function testReviewIsNotKnowledgeSubstitute() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD]),
  ]);
  runReview(workspace);

  const reviewId = loadReviews(workspace)[0].review.review_id;

  const fakeChat = async () => ({
    content: JSON.stringify(judgment("declared", [`review:${reviewId}`])),
  });

  const surface = await runEos("Re-verify using review evidence.", {
    workspace,
    chatFn: fakeChat,
  });

  assert("review ref accepted without knowledge model", surface.judgment[0].type === "declared");

  const knowledgeFakeChat = async () => ({
    content: JSON.stringify(judgment("declared", ["symbol:Agent"])),
  });

  const knowledgeSurface = await runEos("Judge repository symbols.", {
    workspace,
    chatFn: knowledgeFakeChat,
    maxIterations: 3,
  });

  assert("knowledge ref still rejected when knowledge absent", knowledgeSurface.commit_reason === "fallback");
}

async function testReviewPathRefRejected() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD]),
  ]);
  const review = runReview(workspace);

  const pathRef = path.posix.join(".eos", "reviews", `${review.review_id}.json`);

  const { surface } = await runWithResponses(
    "Re-verify the prior judgment.",
    [judgment("declared", [pathRef])],
    { maxIterations: 3 }
  );

  assert(
    "review artifact path rejected as evidence (2D-consistent)",
    surface.judgment.every(
      (item) => !(item.evidence_refs ?? []).some((ref) => ref.includes(".eos"))
    )
  );
  assert("review path citation never commits a validated judgment", surface.commit_reason === "fallback");
}

async function testLineageContinuousAcrossCycle() {
  freshWorkspace();
  const { surface: judgmentA } = await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD]),
  ]);

  const review = runReview(workspace);

  const { surface: judgmentB } = await runWithResponses("Re-verify the prior judgment.", [
    judgment("declared", [`review:${review.review_id}`]),
  ]);

  assert("re-verification links previous judgment", judgmentB.previous_judgment_id === judgmentA.judgment_id);
  assert(
    "re-verification links previous digest",
    judgmentB.previous_judgment_digest === sha256(fs.readFileSync(nodeFile(judgmentA.judgment_id)))
  );
  assert("review does not replace judgment node", fs.existsSync(nodeFile(judgmentA.judgment_id)));

  const lineage = verifyLineage(workspace);
  assert("lineage consistent across review cycle", lineage.state === "consistent");
  assert("lineage chain includes both judgments", lineage.chain.includes(judgmentA.judgment_id) && lineage.chain.includes(judgmentB.judgment_id));
}

async function testFallbackDistinguishable() {
  freshWorkspace();
  const { surface: judgmentA } = await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD]),
  ]);
  const review = runReview(workspace);

  const fallbackChat = async () => ({
    content: JSON.stringify({ type: "tool", tool: "read_file", input: { path: "missing.js" } }),
  });

  const fallbackSurface = await runEos("Judge something impossible.", {
    workspace,
    chatFn: fallbackChat,
    maxIterations: 2,
  });

  assert("fallback recorded as fallback", fallbackSurface.commit_reason === "fallback");
  assert("fallback preserves prior declared state", fallbackSurface.status === "declared");
  assert("fallback links lineage", fallbackSurface.previous_judgment_id === judgmentA.judgment_id);

  const fallbackReview = runReview(workspace);
  assert("review of fallback is neutral", fallbackReview.outcome === "neutral");

  const { surface: reverified } = await runWithResponses("Re-verify the prior judgment.", [
    judgment("declared", [`review:${review.review_id}`, EV_FWD]),
  ]);

  assert("re-judgment recorded as judgment", reverified.commit_reason === "judgment");
  assert("fallback and re-judgment distinguishable", fallbackSurface.commit_reason !== reverified.commit_reason);
}

async function testReviewDeterministic() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_UNR, EV_FWD], "mixed claim"),
  ]);

  const first = runReview(workspace);
  const second = runReview(workspace);

  assert("deterministic outcome", first.outcome === second.outcome);
  assert("deterministic findings", JSON.stringify(first.findings) === JSON.stringify(second.findings));
  assert("deterministic claims", JSON.stringify(first.claims) === JSON.stringify(second.claims));
  assert("deterministic evidence provenance", JSON.stringify(first.evidence) === JSON.stringify(second.evidence));
  assert("distinct review ids", first.review_id !== second.review_id);
}

async function testReviewLedgerWriteOnce() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD]),
  ]);

  const first = runReview(workspace);
  const second = runReview(workspace);

  const ledger = fs
    .readdirSync(path.join(workspace, ".eos", "reviews"))
    .filter((f) => f.endsWith(".json"))
    .sort();

  assert("three review nodes recorded", ledger.length === 3);
  assert("ledger write-once preserved", ledger.includes(`${first.review_id}.json`) && ledger.includes(`${second.review_id}.json`));

  const latest = JSON.parse(fs.readFileSync(path.join(workspace, ".eos", "review.json"), "utf8"));
  assert("latest review points at most recent", latest.review_id === second.review_id);
}

async function testReviewMissingJudgmentRejected() {
  freshWorkspace();

  let threw = false;
  try {
    runReview(workspace, "00000000-0000-0000-0000-000000000000");
  } catch {
    threw = true;
  }

  assert("review of missing judgment rejected", threw);
  assert("no review ledger created on failure", fs.existsSync(path.join(workspace, ".eos", "reviews")) === false);
}

async function testGateStillRejectsWithReviewsPresent() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD]),
  ]);
  runReview(workspace);

  const { surface, calls } = await runWithResponses(
    "Judge the evidence again.",
    [judgment("declared", ["99999999-9999-9999-9999-999999999999"])],
    { maxIterations: 3 }
  );

  assert("fabricated evidence id still rejected with reviews present", calls >= 3);
  assert("gate not weakened", surface.commit_reason === "fallback");
}

async function testReviewRefHelpers() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD]),
  ]);
  const review = runReview(workspace);
  const reviews = loadReviews(workspace);

  assert("isReviewRef true for id form", isReviewRef(`review:${review.review_id}`, reviews) === true);
  assert("isReviewRef false for fabricated id", isReviewRef("review:00000000-0000-0000-0000-000000000000", reviews) === false);
  assert("isReviewRef false without reviews", isReviewRef(`review:${review.review_id}`, []) === false);
  assert(
    "isPersistedReviewRef true for ledger path",
    isPersistedReviewRef(path.posix.join(".eos", "reviews", `${review.review_id}.json`), workspace) === true
  );
  assert(
    "isPersistedReviewRef true for latest review",
    isPersistedReviewRef(".eos/review.json", workspace) === true
  );
}

async function testSubstrateReadOnly() {
  freshWorkspace();
  const before = JSON.stringify(fs.readdirSync(path.join(workspace, ".eos", "substrate"), { recursive: true }).sort());

  await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD]),
  ]);
  runReview(workspace);

  const after = JSON.stringify(fs.readdirSync(path.join(workspace, ".eos", "substrate"), { recursive: true }).sort());

  assert(".eos substrate untouched across review cycle", before === after);
}

async function main() {
  await testFourOutcomes();
  await testRegressionFindingSurfaces();
  await testReviewOutcomeBecomesEvidence();
  await testFabricatedReviewRefRejected();
  await testReviewIsNotKnowledgeSubstitute();
  await testReviewPathRefRejected();
  await testLineageContinuousAcrossCycle();
  await testFallbackDistinguishable();
  await testReviewDeterministic();
  await testReviewLedgerWriteOnce();
  await testReviewMissingJudgmentRejected();
  await testGateStillRejectsWithReviewsPresent();
  await testReviewRefHelpers();
  await testSubstrateReadOnly();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all phase 2F review tests passed");
}

main();
