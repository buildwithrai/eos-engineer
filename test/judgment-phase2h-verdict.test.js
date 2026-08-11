import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/loop.js";
import { runReview } from "../src/review.js";
import { verifyLineage, sha256 } from "../src/lineage.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-phase2h-verdict"
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

function multiJudgment(items) {
  return { type: "judgment", judgment: items };
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

async function testDeclaredForwardSupported() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD], "the declaration"),
  ]);

  const review = runReview(workspace);

  assert("review outcome forward", review.outcome === "forward");
  assert("declared claim verdict supported", review.claims[0].verdict === "supported");
  assert("no verdict findings", review.verdict_findings.length === 0);
  assert("no generic findings", review.findings.length === 0);
  assert("claim record keeps resolved refs", review.claims[0].resolved[0].ref === EV_FWD);
}

async function testDeclaredNeutralUnsupported() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_NEU], "the neutral-backed declaration"),
  ]);

  const review = runReview(workspace);

  assert("review outcome neutral", review.outcome === "neutral");
  assert("declared claim verdict unsupported", review.claims[0].verdict === "unsupported");
  assert("verdict finding surfaced", review.verdict_findings.length === 1);
  assert("verdict finding carries rule", review.verdict_findings[0].rule === "JudgmentVerdictRule");
  assert("verdict finding carries claim", review.verdict_findings[0].claim === "the neutral-backed declaration");
  assert("verdict finding carries outcome", review.verdict_findings[0].outcome === "neutral");
  assert("generic finding still surfaces", review.findings.length === 1);
}

async function testDeclaredUnresolvedUnsupported() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_UNR], "the unresolved-backed declaration"),
  ]);

  const review = runReview(workspace);

  assert("review outcome unresolved", review.outcome === "unresolved");
  assert("unresolved declared verdict unsupported", review.claims[0].verdict === "unsupported");
  assert("unresolved verdict finding surfaced", review.verdict_findings.length === 1);
}

async function testDeclaredRegressionUnsupported() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_REG], "the regression-backed declaration"),
  ]);

  const review = runReview(workspace);

  assert("review outcome regression", review.outcome === "regression");
  assert("regression declared verdict unsupported", review.claims[0].verdict === "unsupported");
  assert("regression verdict finding surfaced", review.verdict_findings.length === 1);
  assert("regression generic finding still surfaces", review.findings.length === 1);
}

async function testDeclaredMixedRefsUnsupported() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD, EV_UNR], "the mixed declaration"),
  ]);

  const review = runReview(workspace);

  assert("mixed refs outcome unresolved", review.outcome === "unresolved");
  assert("mixed declared verdict unsupported", review.claims[0].verdict === "unsupported");
  assert("mixed verdict finding surfaced", review.verdict_findings.length === 1);
}

async function testCandidateToleratesNonForward() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    judgment("candidate", [EV_UNR], "the unresolved candidate"),
  ]);

  const review = runReview(workspace);

  assert("candidate outcome unresolved", review.outcome === "unresolved");
  assert("candidate verdict supported", review.claims[0].verdict === "supported");
  assert("no verdict finding for candidate", review.verdict_findings.length === 0);
  assert("generic finding still surfaces", review.findings.length === 1);
}

async function testCandidateNeutralSupported() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    judgment("candidate", [EV_NEU], "the neutral candidate"),
  ]);

  const review = runReview(workspace);

  assert("neutral candidate verdict supported", review.claims[0].verdict === "supported");
  assert("no verdict finding for neutral candidate", review.verdict_findings.length === 0);
}

async function testCandidateRegressionSurfacesFindingNotVerdict() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    judgment("candidate", [EV_REG], "the regression candidate"),
  ]);

  const review = runReview(workspace);

  assert("regression candidate outcome regression", review.outcome === "regression");
  assert("regression candidate verdict supported", review.claims[0].verdict === "supported");
  assert("no verdict finding for regression candidate", review.verdict_findings.length === 0);
  assert("regression finding still surfaces", review.findings.length === 1);
}

async function testBlockedNoVerdictViolation() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    judgment("blocked", [], "the blocked claim"),
  ]);

  const review = runReview(workspace);

  assert("blocked review outcome neutral", review.outcome === "neutral");
  assert("blocked claim verdict supported", review.claims[0].verdict === "supported");
  assert("no verdict finding for blocked", review.verdict_findings.length === 0);
}

async function testMixedClaimsVerdictPerClaim() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    multiJudgment([
      {
        claim: "supported declaration",
        type: "declared",
        confidence: "high",
        evidence_refs: [EV_FWD],
      },
      {
        claim: "unsupported declaration",
        type: "declared",
        confidence: "high",
        evidence_refs: [EV_UNR],
      },
    ]),
  ]);

  const review = runReview(workspace);

  assert("two claims reviewed", review.claims.length === 2);
  assert("first verdict supported", review.claims[0].verdict === "supported");
  assert("second verdict unsupported", review.claims[1].verdict === "unsupported");
  assert("one verdict finding", review.verdict_findings.length === 1);
  assert("verdict finding targets unsupported claim", review.verdict_findings[0].claim === "unsupported declaration");
  assert("review outcome unresolved", review.outcome === "unresolved");
}

async function testDeclaredCommitGateUnchanged() {
  freshWorkspace();
  const { surface } = await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_UNR], "the unresolved declaration"),
  ]);

  assert("declared on unresolved still commits", surface.status === "declared");
  assert("declared commit reason is judgment", surface.commit_reason === "judgment");

  const review = runReview(workspace);
  assert("verdict rule flags it after the fact", review.verdict_findings.length === 1);
  assert("2C gate not converted into verdict gate", review.outcome === "unresolved");
}

async function testVerdictDeterministic() {
  freshWorkspace();
  await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD, EV_UNR], "the mixed declaration"),
  ]);

  const first = runReview(workspace);
  const second = runReview(workspace);

  assert(
    "verdict findings deterministic",
    JSON.stringify(first.verdict_findings) === JSON.stringify(second.verdict_findings)
  );
  assert(
    "claim verdicts deterministic",
    JSON.stringify(first.claims) === JSON.stringify(second.claims)
  );
  assert("outcome deterministic", first.outcome === second.outcome);
  assert("distinct review ids", first.review_id !== second.review_id);
}

async function testRevisionNodeReviewNoVerdictViolation() {
  freshWorkspace();
  const { surface: declaredSurface } = await runWithResponses(
    "Judge the evidence.",
    [judgment("declared", [EV_REG], "the regression-backed declaration")]
  );
  const regressionReview = runReview(workspace);
  assert(
    "pre-correction review regression",
    regressionReview.outcome === "regression"
  );

  const { surface: corrected } = await runWithResponses(
    "Correct the prior judgment.",
    [
      judgment(
        "candidate",
        [`review:${regressionReview.review_id}`],
        "prior declaration is no longer supported"
      ),
    ]
  );
  assert("correction commits revision", corrected.commit_reason === "revision");
  assert("correction lands candidate", corrected.status === "candidate");

  const review = runReview(workspace);
  assert("review of revision node outcome regression", review.outcome === "regression");
  assert("revision node claim verdict supported", review.claims[0].verdict === "supported");
  assert("no verdict finding on revision node", review.verdict_findings.length === 0);
  assert("lineage consistent across verdict cycle", verifyLineage(workspace).state === "consistent");
  assert("prior node preserved", fs.existsSync(nodeFile(declaredSurface.judgment_id)));
}

async function testSubstrateReadOnlyAcrossVerdictReview() {
  freshWorkspace();
  const before = JSON.stringify(
    fs.readdirSync(path.join(workspace, ".ewa"), { recursive: true }).sort()
  );

  await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_UNR], "the unresolved declaration"),
  ]);
  runReview(workspace);

  const after = JSON.stringify(
    fs.readdirSync(path.join(workspace, ".ewa"), { recursive: true }).sort()
  );

  assert(".ewa untouched across verdict cycle", before === after);
}

async function testReviewDigestAnchoringPreserved() {
  freshWorkspace();
  const { surface } = await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_UNR], "the unresolved declaration"),
  ]);

  const review = runReview(workspace);

  assert(
    "verdict review anchors node digest",
    review.reviewed_judgment_digest === sha256(fs.readFileSync(nodeFile(surface.judgment_id)))
  );
}

async function main() {
  await testDeclaredForwardSupported();
  await testDeclaredNeutralUnsupported();
  await testDeclaredUnresolvedUnsupported();
  await testDeclaredRegressionUnsupported();
  await testDeclaredMixedRefsUnsupported();
  await testCandidateToleratesNonForward();
  await testCandidateNeutralSupported();
  await testCandidateRegressionSurfacesFindingNotVerdict();
  await testBlockedNoVerdictViolation();
  await testMixedClaimsVerdictPerClaim();
  await testDeclaredCommitGateUnchanged();
  await testVerdictDeterministic();
  await testRevisionNodeReviewNoVerdictViolation();
  await testSubstrateReadOnlyAcrossVerdictReview();
  await testReviewDigestAnchoringPreserved();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all phase 2H verdict tests passed");
}

main();
