import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/runtime/run.js";
import { loadReviews } from "../src/review.js";
import { loadEvidence } from "../src/investigation/evidence.js";
import {
  createInvestigation,
  investigationComplete,
  phaseOf,
} from "../src/investigation.js";
import {
  canonicalizeEvidenceRefs,
  gateJudgment,
} from "../src/judgment/gate.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-evidence-obligation"
);

const SEMANTIC_OBJECTIVE =
  "Determine whether this workspace has the architectural substrate required to implement a multi-tenant SaaS application.";

let failures = 0;

function assert(name, condition, detail = "") {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

const EV_FWD = "22222222-2222-2222-2222-222222222222";

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

function freshWorkspace() {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
  fs.mkdirSync(
    path.join(workspace, ".eos", "substrate", "engineering", "evidence"),
    { recursive: true }
  );
  fs.writeFileSync(path.join(workspace, "src", "a.js"), "export const a = 1;\n");
  fs.writeFileSync(
    path.join(
      workspace,
      ".eos",
      "substrate",
      "engineering",
      "evidence",
      `${EV_FWD}.json`
    ),
    JSON.stringify(evidenceRecord(EV_FWD, "forward"), null, 2)
  );
}

function seedHistoricalReview(reviewedJudgmentId, reviewId) {
  const reviewsDir = path.join(workspace, ".eos", "reviews");
  fs.mkdirSync(reviewsDir, { recursive: true });
  const review = {
    schema: "eos-review/v1",
    review_id: reviewId,
    reviewed_judgment_id: reviewedJudgmentId,
    reviewed_judgment_digest: "0".repeat(64),
    reviewed_at: "2026-08-13T21:56:05.200Z",
    outcome: "neutral",
    claims: [],
    findings: [],
    verdict_findings: [],
    evidence: [],
  };
  fs.writeFileSync(
    path.join(reviewsDir, `${reviewId}.json`),
    JSON.stringify(review, null, 2) + "\n"
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

function toolCall(tool, input) {
  return { type: "tool", tool, input };
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
    maxIterations: options.maxIterations ?? 6,
  });

  return { surface, calls };
}

function testASemanticObjectiveProducesObligations() {
  freshWorkspace();

  const investigation = createInvestigation(SEMANTIC_OBJECTIVE, {
    workspaceRoot: workspace,
  });

  assert(
    "A: semantic objective produces one obligation",
    investigation.evidenceObligations.length === 1
  );

  const obligation = investigation.evidenceObligations[0];

  assert("A: obligation pending initially", obligation.pending === true);
  assert("A: obligation not satisfied initially", obligation.satisfied === false);
  assert(
    "A: obligation covers all current-grounding kinds",
    ["inspected-file", "evidence-store", "knowledge", "perspective", "change", "intent", "review"].every(
      (kind) => obligation.kinds.includes(kind)
    )
  );
  assert(
    "A: obligation names the objective",
    obligation.statement.includes("multi-tenant SaaS")
  );
  assert(
    "A: obligation carries a stable id",
    typeof obligation.id === "string" && obligation.id.length > 0
  );

  const fileInvestigation = createInvestigation(
    "Investigate src/a.js and judge it.",
    { workspaceRoot: workspace }
  );
  assert(
    "A: file-based investigation has no obligations",
    fileInvestigation.evidenceObligations.length === 0
  );

  const formationInvestigation = createInvestigation(
    "Form a new project: a note-taking app.",
    { mode: "formation", workspaceRoot: workspace }
  );
  assert(
    "A: formation keeps no obligations",
    formationInvestigation.evidenceObligations.length === 0
  );
}

function testBNoVacuousCompleteness() {
  const investigation = createInvestigation(SEMANTIC_OBJECTIVE, {
    workspaceRoot: workspace,
  });

  assert(
    "B: semantic investigation is file-complete",
    investigationComplete(investigation) === true
  );
  assert(
    "B: yet phase is obligations, never vacuously complete",
    phaseOf(investigation) === "obligations"
  );
}

async function testCEvidenceAcquisitionSatisfiesObligation() {
  freshWorkspace();

  const { surface: inspected } = await runWithResponses(SEMANTIC_OBJECTIVE, [
    toolCall("read_file", { path: "src/a.js" }),
    judgment("declared", ["src/a.js"], "src/a.js exports a."),
  ]);

  assert("C: inspection-based judgment commits", inspected.status === "declared");
  assert(
    "C: phase completes once obligation satisfied",
    inspected.investigation.phase === "complete"
  );
  const obligation = inspected.investigation.evidence_obligations[0];
  assert("C: obligation satisfied", obligation.satisfied === true);
  assert("C: obligation no longer pending", obligation.pending === false);
  assert(
    "C: satisfied by the inspected file",
    obligation.satisfiedBy.includes("src/a.js")
  );
  assert(
    "C: obligation id not in gaps",
    !inspected.investigation.gaps.includes(obligation.id)
  );

  freshWorkspace();

  const { surface: store } = await runWithResponses(SEMANTIC_OBJECTIVE, [
    judgment("declared", [EV_FWD], "An engineering evidence record exists."),
  ]);

  assert("C: evidence-store record satisfies the obligation", store.status === "declared");
  assert(
    "C: evidence-store satisfaction recorded",
    store.investigation.evidence_obligations[0].satisfiedBy.includes(EV_FWD)
  );
}

async function testDInventedEvidenceBlocked() {
  freshWorkspace();

  const { surface } = await runWithResponses(
    SEMANTIC_OBJECTIVE,
    [judgment("declared", ["repository_content"], "repository content is evidence")],
    { maxIterations: 2 }
  );

  assert("D: invented ref cannot declare a semantic judgment", surface.status === "blocked");
  assert(
    "D: invented ref never consumed as evidence",
    !surface.evidence.consumed.includes("repository_content")
  );
  assert(
    "D: obligation stays pending",
    surface.investigation.evidence_obligations[0].pending === true
  );
  assert(
    "D: pending obligation surfaces in gaps",
    surface.investigation.gaps.includes("obligation-1")
  );
}

async function testEFileBasedInvestigationsUnaffected() {
  freshWorkspace();

  const { surface } = await runWithResponses("Investigate src/a.js and judge it.", [
    toolCall("read_file", { path: "src/a.js" }),
    judgment("declared", ["src/a.js"], "src/a.js exports a."),
  ]);

  assert("E: file-based judgment commits", surface.status === "declared");
  assert("E: file-based phase complete", surface.investigation.phase === "complete");
  assert(
    "E: file-based investigation reports empty obligations",
    Array.isArray(surface.investigation.evidence_obligations) &&
      surface.investigation.evidence_obligations.length === 0
  );
}

function testFEvidenceBoundaryStillHolds() {
  freshWorkspace();
  seedHistoricalReview("judgment-before", "review-before");

  const reviews = loadReviews(workspace);

  const item = (evidenceRefs) => ({
    claim: "c",
    type: "declared",
    confidence: "high",
    evidence_refs: evidenceRefs,
  });

  const gateFor = (evidenceRefs, priorJudgmentId) => {
    const investigation = createInvestigation(SEMANTIC_OBJECTIVE, {
      workspaceRoot: workspace,
    });

    return gateJudgment(
      canonicalizeEvidenceRefs(
        [item(evidenceRefs)],
        workspace,
        loadEvidence(workspace),
        undefined,
        reviews,
        [],
        [],
        undefined
      ),
      investigation,
      loadEvidence(workspace),
      undefined,
      workspace,
      reviews,
      [],
      [],
      undefined,
      priorJudgmentId
    );
  };

  const unanchored = gateFor(["review:review-before"], null);
  assert("F: historical review alone still rejected", unanchored.ok === false);

  const anchored = gateFor(["review:review-before"], "judgment-before");
  assert("F: anchored review still citable", anchored.ok === true);

  const withLive = gateFor(["review:review-before", EV_FWD], null);
  assert("F: historical review plus live evidence still citable", withLive.ok === true);

  const liveOnly = gateFor([EV_FWD], null);
  assert("F: live evidence-store record still citable", liveOnly.ok === true);
}

async function testGInsufficientEvidenceStaysPending() {
  freshWorkspace();

  const { surface } = await runWithResponses(
    SEMANTIC_OBJECTIVE,
    [
      toolCall("read_file", { path: "src/a.js" }),
      judgment("declared", ["src/b.js"], "src/b.js does not exist."),
    ],
    { maxIterations: 3 }
  );

  assert(
    "G: uninspected ref cannot satisfy the obligation",
    surface.status === "blocked"
  );
  assert(
    "G: obligation stays pending on insufficient evidence",
    surface.investigation.evidence_obligations[0].pending === true
  );
  assert(
    "G: blocked surface reports phase obligations",
    surface.investigation.phase === "obligations"
  );
}

async function testHReviewAnchoringIntact() {
  freshWorkspace();

  const { surface: judgmentA } = await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD]),
  ]);
  assert("H: base judgment commits", judgmentA.status === "declared");

  const reviewA = loadReviews(workspace).find(
    ({ review }) => review.reviewed_judgment_id === judgmentA.judgment_id
  );
  assert("H: prior node is auto-reviewed", reviewA !== undefined);

  const { surface: reverified } = await runWithResponses(
    SEMANTIC_OBJECTIVE,
    [judgment("declared", [`review:${reviewA.review.review_id}`], "Review confirmed.")],
    { maxIterations: 3 }
  );

  assert("H: anchored review satisfies the obligation", reverified.status === "declared");
  assert(
    "H: anchored review recorded as satisfied by",
    reverified.investigation.evidence_obligations[0].satisfiedBy.some((ref) =>
      ref.includes(reviewA.review.review_id)
    )
  );
}

async function main() {
  testASemanticObjectiveProducesObligations();
  testBNoVacuousCompleteness();
  await testCEvidenceAcquisitionSatisfiesObligation();
  await testDInventedEvidenceBlocked();
  await testEFileBasedInvestigationsUnaffected();
  testFEvidenceBoundaryStillHolds();
  await testGInsufficientEvidenceStaysPending();
  await testHReviewAnchoringIntact();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all evidence obligation regression tests passed");
}

main();
