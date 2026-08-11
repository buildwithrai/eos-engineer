import fs from "node:fs";
import path from "node:path";
import { runEos, canTransition } from "../src/loop.js";
import { runReview } from "../src/review.js";
import { verifyLineage, sha256 } from "../src/lineage.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-phase2g-correction"
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
const EV_FAKE = "99999999-9999-9999-9999-999999999999";

function freshWorkspace() {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspace, ".ewa", "engineering", "evidence"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(workspace, ".ewa", "engineering", "evidence", `${EV_FWD}.json`),
    JSON.stringify(evidenceRecord(EV_FWD, "forward"), null, 2)
  );
  fs.writeFileSync(
    path.join(workspace, ".ewa", "engineering", "evidence", `${EV_NEU}.json`),
    JSON.stringify(evidenceRecord(EV_NEU, "neutral"), null, 2)
  );
  fs.writeFileSync(
    path.join(workspace, ".ewa", "engineering", "evidence", `${EV_REG}.json`),
    JSON.stringify(evidenceRecord(EV_REG, "regression"), null, 2)
  );
  fs.writeFileSync(
    path.join(workspace, ".ewa", "engineering", "evidence", `${EV_UNR}.json`),
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

function nodeBytes(judgmentId) {
  return fs.readFileSync(nodeFile(judgmentId));
}

function testCanTransitionDowngradeContract() {
  assert(
    "declared cannot downgrade to candidate without regression",
    canTransition("declared", "candidate") === false
  );
  assert(
    "declared downgrades to candidate with regression",
    canTransition("declared", "candidate", true) === true
  );
  assert(
    "candidate cannot downgrade to blocked without regression",
    canTransition("candidate", "blocked") === false
  );
  assert(
    "candidate downgrades to blocked with regression",
    canTransition("candidate", "blocked", true) === true
  );
  assert(
    "declared cannot skip to blocked even with regression",
    canTransition("declared", "blocked", true) === false
  );
  assert(
    "forward transitions unaffected by downgrade authorization",
    canTransition("blocked", "candidate", false) === true &&
      canTransition("candidate", "declared", true) === true
  );
  assert(
    "same-state remains legal regardless of authorization",
    canTransition("declared", "declared", true) === true &&
      canTransition("candidate", "candidate", false) === true
  );
  assert(
    "unknown states never transition even with regression",
    canTransition("declared", "confirmed", true) === false
  );
}

async function testAnchoredRegressionReviewAuthorizesDescent() {
  freshWorkspace();
  const { surface: declaredSurface } = await runWithResponses(
    "Judge the evidence.",
    [judgment("declared", [EV_REG], "the regression-backed declaration")]
  );
  assert("initial state declared", declaredSurface.status === "declared");

  const review = runReview(workspace);
  assert("review outcome regression", review.outcome === "regression");
  assert(
    "review anchored to prior node",
    review.reviewed_judgment_id === declaredSurface.judgment_id
  );

  const { surface: corrected } = await runWithResponses(
    "Correct the prior judgment.",
    [
      judgment(
        "candidate",
        [`review:${review.review_id}`],
        "prior declaration is no longer supported"
      ),
    ]
  );

  assert("downgrade commits candidate", corrected.status === "candidate");
  assert(
    "downgrade commit reason is revision",
    corrected.commit_reason === "revision"
  );
  assert(
    "correction links prior node",
    corrected.previous_judgment_id === declaredSurface.judgment_id
  );
  assert(
    "correction links prior digest",
    corrected.previous_judgment_digest === sha256(nodeBytes(declaredSurface.judgment_id))
  );
  assert(
    "prior node unmutated",
    JSON.parse(fs.readFileSync(nodeFile(declaredSurface.judgment_id), "utf8"))
      .commit_reason === "judgment"
  );
  assert(
    "regression ref retained as authorization ref",
    corrected.judgment[0].evidence_refs.includes(`review:${review.review_id}`)
  );
  assert(
    "regression ref does not become claim content",
    corrected.judgment[0].claim === "prior declaration is no longer supported"
  );
  assert(
    "review ref recorded as consumed",
    corrected.evidence.consumed.includes(`review:${review.review_id}`)
  );
  assert("correction creates new node", fs.existsSync(nodeFile(corrected.judgment_id)));

  const lineage = verifyLineage(workspace);
  assert("lineage consistent after revision", lineage.state === "consistent", lineage.reason);
  assert(
    "lineage chain includes both nodes",
    lineage.chain.includes(declaredSurface.judgment_id) &&
      lineage.chain.includes(corrected.judgment_id)
  );
  assert(
    "revision reason persisted on node",
    fs.readFileSync(nodeFile(corrected.judgment_id), "utf8").includes(
      '"commit_reason": "revision"'
    )
  );
}

async function testRawRegressionEvidenceAuthorizesDescent() {
  freshWorkspace();
  const { surface: declaredSurface } = await runWithResponses(
    "Judge the evidence.",
    [judgment("declared", [EV_FWD], "the declaration")]
  );

  const { surface: corrected } = await runWithResponses(
    "Correct the prior judgment.",
    [judgment("candidate", [EV_REG], "prior claim is no longer supported")]
  );

  assert(
    "raw regression evidence authorizes one-level descent",
    corrected.status === "candidate"
  );
  assert(
    "raw regression revision reason",
    corrected.commit_reason === "revision"
  );
  assert(
    "regression evidence retained as authorization ref",
    corrected.judgment[0].evidence_refs.includes(EV_REG)
  );
  assert(
    "raw regression revision links prior node",
    corrected.previous_judgment_id === declaredSurface.judgment_id
  );

  const lineage = verifyLineage(workspace);
  assert(
    "lineage consistent after raw regression revision",
    lineage.state === "consistent",
    lineage.reason
  );
}

async function testNonRegressionOutcomeCannotAuthorizeDescent(outcome, id) {
  freshWorkspace();
  const { surface: declaredSurface } = await runWithResponses(
    "Judge the evidence.",
    [judgment("declared", [EV_FWD], "the declaration")]
  );

  const { surface: attempted, calls } = await runWithResponses(
    "Correct the prior judgment.",
    [judgment("candidate", [id], "attempted correction")],
    { maxIterations: 3 }
  );

  assert(`${outcome} evidence does not authorize descent`, calls >= 2);
  assert(`${outcome} attempt stays declared`, attempted.status === "declared");
  assert(
    `${outcome} attempt commits no revision`,
    attempted.commit_reason === "fallback"
  );
  assert(
    `${outcome} attempt preserves declared claim`,
    attempted.judgment[0].type === "declared"
  );
}

async function testFabricatedRefCannotAuthorizeDescent() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD], "the declaration"),
  ]);

  const { surface: attempted, calls } = await runWithResponses(
    "Correct the prior judgment.",
    [judgment("candidate", [EV_FAKE], "attempted correction")],
    { maxIterations: 3 }
  );

  assert("fabricated ref rejected by evidence gate", calls >= 3);
  assert("no descent from fabricated ref", attempted.status === "declared");
  assert("fabricated ref commits no revision", attempted.commit_reason === "fallback");
}

async function testUnanchoredReviewCannotAuthorizeDescent() {
  freshWorkspace();
  const { surface: judgmentA } = await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_REG], "claim A"),
  ]);
  const reviewA = runReview(workspace);
  assert("review A is regression", reviewA.outcome === "regression");
  assert(
    "review A anchored to A",
    reviewA.reviewed_judgment_id === judgmentA.judgment_id
  );

  const { surface: judgmentB } = await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD], "claim B"),
  ]);
  assert(
    "prior node is now B, not A",
    judgmentB.judgment_id !== judgmentA.judgment_id
  );

  const { surface: attempted, calls } = await runWithResponses(
    "Correct the prior judgment.",
    [judgment("candidate", [`review:${reviewA.review_id}`], "attempted correction")],
    { maxIterations: 3 }
  );

  assert("unanchored regression review rejected", calls >= 2);
  assert("no descent from unanchored review", attempted.status === "declared");
  assert(
    "unanchored review commits no revision",
    attempted.commit_reason === "fallback"
  );
  assert(
    "unanchored review preserves declared claim",
    attempted.judgment[0].type === "declared"
  );
}

async function testOneLevelOnlyDeclaredToBlockedRejected() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD], "the declaration"),
  ]);

  const { surface: attempted, calls } = await runWithResponses(
    "Correct the prior judgment.",
    [judgment("blocked", [EV_REG], "attempt to drop two levels")],
    { maxIterations: 3 }
  );

  assert(
    "regression cannot authorize declared to blocked",
    calls >= 2 && attempted.status === "declared"
  );
  assert(
    "two-level attempt commits no revision",
    attempted.commit_reason === "fallback"
  );
}

async function testCandidateToBlockedWithAnchoredReview() {
  freshWorkspace();
  const { surface: candidateSurface } = await runWithResponses(
    "Judge the evidence.",
    [judgment("candidate", [EV_REG], "the candidate claim")]
  );
  assert("initial state candidate", candidateSurface.status === "candidate");

  const review = runReview(workspace);
  assert(
    "review of candidate is regression",
    review.outcome === "regression"
  );
  assert(
    "review anchored to candidate node",
    review.reviewed_judgment_id === candidateSurface.judgment_id
  );

  const { surface: corrected } = await runWithResponses(
    "Correct the prior judgment.",
    [
      judgment(
        "blocked",
        [`review:${review.review_id}`],
        "cannot judge; evidence regressed"
      ),
    ]
  );

  assert("downgrade commits blocked", corrected.status === "blocked");
  assert(
    "candidate-to-blocked revision reason",
    corrected.commit_reason === "revision"
  );
  assert(
    "regression ref retained on blocked claim",
    corrected.judgment[0].evidence_refs.includes(`review:${review.review_id}`)
  );
  assert(
    "blocked claim content distinct from ref",
    corrected.judgment[0].claim === "cannot judge; evidence regressed"
  );

  const lineage = verifyLineage(workspace);
  assert(
    "lineage consistent after candidate to blocked",
    lineage.state === "consistent",
    lineage.reason
  );
}

async function testCandidateCannotRegressWithoutRegression() {
  freshWorkspace();
  const { surface: candidateSurface } = await runWithResponses(
    "Judge the evidence.",
    [judgment("candidate", [EV_FWD], "the candidate claim")]
  );

  const { surface: attempted, calls } = await runWithResponses(
    "Correct the prior judgment.",
    [judgment("blocked", [], "attempted regression")],
    { maxIterations: 3 }
  );

  assert("candidate not dropped without regression", calls >= 2);
  assert("state stays candidate", attempted.status === "candidate");
  assert("attempted regression is not a revision", attempted.commit_reason === "fallback");
  assert(
    "candidate claim preserved",
    attempted.judgment[0].type === "candidate" &&
      !attempted.judgment[0].evidence_refs.includes(EV_REG)
  );
}

async function testSubstrateReadOnlyAcrossCorrection() {
  freshWorkspace();
  const before = JSON.stringify(
    fs.readdirSync(path.join(workspace, ".ewa"), { recursive: true }).sort()
  );

  const { surface: declaredSurface } = await runWithResponses(
    "Judge the evidence.",
    [judgment("declared", [EV_FWD], "the declaration")]
  );
  runReview(workspace);

  const { surface: corrected } = await runWithResponses(
    "Correct the prior judgment.",
    [judgment("candidate", [EV_REG], "corrected claim")]
  );

  const after = JSON.stringify(
    fs.readdirSync(path.join(workspace, ".ewa"), { recursive: true }).sort()
  );

  assert(".ewa untouched across correction cycle", before === after);
  assert("correction committed revision", corrected.commit_reason === "revision");
  assert("prior node untouched by correction", fs.existsSync(nodeFile(declaredSurface.judgment_id)));
}

async function main() {
  testCanTransitionDowngradeContract();
  await testAnchoredRegressionReviewAuthorizesDescent();
  await testRawRegressionEvidenceAuthorizesDescent();
  await testNonRegressionOutcomeCannotAuthorizeDescent("unresolved", EV_UNR);
  await testNonRegressionOutcomeCannotAuthorizeDescent("neutral", EV_NEU);
  await testNonRegressionOutcomeCannotAuthorizeDescent("forward", EV_FWD);
  await testFabricatedRefCannotAuthorizeDescent();
  await testUnanchoredReviewCannotAuthorizeDescent();
  await testOneLevelOnlyDeclaredToBlockedRejected();
  await testCandidateToBlockedWithAnchoredReview();
  await testCandidateCannotRegressWithoutRegression();
  await testSubstrateReadOnlyAcrossCorrection();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all phase 2G correction tests passed");
}

main();
