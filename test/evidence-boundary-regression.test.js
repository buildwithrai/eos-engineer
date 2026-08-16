import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/runtime/run.js";
import { loadReviews } from "../src/review.js";
import { loadEvidence } from "../src/investigation/evidence.js";
import { createInvestigation } from "../src/investigation/investigation.js";
import {
  canonicalizeEvidenceRefs,
  gateJudgment,
} from "../src/judgment/gate.js";
import { sha256 } from "../src/projection/persistence.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-evidence-boundary"
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

const EV_FWD = "11111111-1111-1111-1111-111111111111";

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
  fs.writeFileSync(path.join(workspace, "src", "empty.js"), "");
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

function gateFor(item, { reviews, priorJudgmentId }) {
  const investigation = createInvestigation(
    "Investigate the current evidence.",
    { workspaceRoot: workspace }
  );

  return gateJudgment(
    canonicalizeEvidenceRefs(
      [item],
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
}

function testGateReviewAnchoring() {
  freshWorkspace();
  seedHistoricalReview("judgment-before", "review-before");

  const reviews = loadReviews(workspace);
  const item = (evidenceRefs) => ({
    claim: "c",
    type: "declared",
    confidence: "high",
    evidence_refs: evidenceRefs,
  });

  const unanchored = gateFor(item(["review:review-before"]), {
    reviews,
    priorJudgmentId: null,
  });
  assert("gate: historical review alone is not citable", unanchored.ok === false);

  const invented = gateFor(item(["repository_content"]), {
    reviews,
    priorJudgmentId: null,
  });
  assert("gate: invented evidence ref rejected", invented.ok === false);

  const anchored = gateFor(item(["review:review-before"]), {
    reviews,
    priorJudgmentId: "judgment-before",
  });
  assert("gate: review of the prior judgment is citable", anchored.ok === true);

  const withLive = gateFor(item(["review:review-before", EV_FWD]), {
    reviews,
    priorJudgmentId: null,
  });
  assert(
    "gate: historical review plus live evidence-store record is citable",
    withLive.ok === true
  );

  const liveOnly = gateFor(item([EV_FWD]), {
    reviews,
    priorJudgmentId: null,
  });
  assert("gate: live evidence-store record alone is citable", liveOnly.ok === true);
}

async function testAInventedRefRejected() {
  freshWorkspace();
  const { surface } = await runWithResponses("Investigate src/a.js and judge it.", [
    judgment("declared", ["repository_content"], "repository content is evidence"),
  ]);

  assert("A: invented ref never reaches declared", surface.status === "blocked");
  assert(
    "A: invented ref never consumed as evidence",
    !surface.evidence.consumed.includes("repository_content")
  );
}

async function testBEmptyInvestigationCannotLeap() {
  freshWorkspace();
  seedHistoricalReview(
    "97c7f2ca-e256-4a91-bcec-32b33d398fc7",
    "ba8e67b0-5da8-45ab-b511-2ed7aee83002"
  );

  const { surface } = await runWithResponses(
    "Determine whether this workspace has the architectural substrate required to implement a multi-tenant SaaS application.",
    [
      judgment(
        "declared",
        ["review:ba8e67b0-5da8-45ab-b511-2ed7aee83002"],
        "The current implementation has an evidence model."
      ),
    ],
    { maxIterations: 2 }
  );

  assert("B: historical review cannot declare an empty investigation", surface.commit_reason === "fallback" && surface.status !== "declared");
  assert(
    "B: review not consumed as evidence",
    !surface.evidence.consumed.some((ref) => ref.includes("ba8e67b0"))
  );
  assert("B: no explicit requirements forced", surface.investigation.required_evidence.length === 0);
}

async function testCAnchoredReviewStillCitable() {
  freshWorkspace();
  const { surface: judgmentA } = await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD]),
  ]);
  assert("C: base judgment commits", judgmentA.status === "declared");

  const reviewA = loadReviews(workspace).find(
    ({ review }) => review.reviewed_judgment_id === judgmentA.judgment_id
  );
  assert("C: prior node is auto-reviewed", reviewA !== undefined);

  const { surface: reverified } = await runWithResponses(
    "Re-verify the prior judgment.",
    [judgment("declared", [`review:${reviewA.review.review_id}`])]
  );

  assert("C: review of the prior judgment is citable", reverified.status === "declared");
  assert("C: re-verification commits as judgment", reverified.commit_reason === "judgment");
}

async function testC2OlderReviewNotCitable() {
  freshWorkspace();
  const { surface: judgmentA } = await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD]),
  ]);

  const reviewA = loadReviews(workspace).find(
    ({ review }) => review.reviewed_judgment_id === judgmentA.judgment_id
  );
  assert("C2: prior auto-review exists", reviewA !== undefined);

  const { surface: judgmentB } = await runWithResponses(
    "Judge the evidence again.",
    [judgment("declared", [EV_FWD])]
  );
  assert("C2: second node commits", judgmentB.status === "declared");

  const { surface } = await runWithResponses(
    "Re-verify the earlier judgment.",
    [judgment("declared", [`review:${reviewA.review.review_id}`])],
    { maxIterations: 2 }
  );

  assert("C2: review of a non-prior judgment cannot commit a judgment", surface.commit_reason === "fallback");
  assert(
    "C2: older review not consumed",
    !surface.evidence.consumed.some((ref) => ref.includes(reviewA.review.review_id))
  );
}

async function testDRealInspection() {
  freshWorkspace();
  let read = false;

  const chatFn = async () => {
    if (!read) {
      read = true;
      return {
        content: JSON.stringify({
          type: "tool",
          tool: "read_file",
          input: { path: "src/a.js" },
        }),
      };
    }
    return {
      content: JSON.stringify(
        judgment("declared", ["src/a.js"], "src/a.js exports a.")
      ),
    };
  };

  const surface = await runEos("Investigate src/a.js and judge it.", {
    workspace,
    chatFn,
    maxIterations: 3,
  });

  assert("D: real inspection supports declared", surface.status === "declared");
  assert("D: inspected path recorded", surface.investigation.inspected_evidence.includes("src/a.js"));

  const realContent = fs.readFileSync(path.join(workspace, "src", "a.js"), "utf8");
  const inspection = surface.evidence.inspections.find(
    (entry) => path.resolve(entry.path) === path.join(workspace, "src", "a.js")
  );
  assert("D: inspection digest derives from real content", inspection !== undefined && inspection.digest === sha256(realContent));
  assert("D: non-empty file digest differs from empty-content hash", inspection.digest !== sha256(""));
}

async function testDEmptyFileDigest() {
  freshWorkspace();
  let read = false;

  const chatFn = async () => {
    if (!read) {
      read = true;
      return {
        content: JSON.stringify({
          type: "tool",
          tool: "read_file",
          input: { path: "src/empty.js" },
        }),
      };
    }
    return {
      content: JSON.stringify(judgment("declared", ["src/empty.js"], "src/empty.js is empty.")),
    };
  };

  const surface = await runEos("Investigate src/empty.js and judge it.", {
    workspace,
    chatFn,
    maxIterations: 3,
  });

  assert("D2: empty file is inspectable", surface.investigation.inspected_evidence.includes("src/empty.js"));

  const inspection = surface.evidence.inspections.find(
    (entry) => path.resolve(entry.path) === path.join(workspace, "src", "empty.js")
  );
  assert("D2: empty-file digest equals empty-content hash (correct)", inspection.digest === sha256(""));
  assert(
    "D2: empty-content hash is the known e3b0c44... digest",
    sha256("") === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  );
}

async function testELiveEvidenceFlows() {
  freshWorkspace();
  const { surface } = await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD]),
  ]);
  assert("E1: evidence-store-backed judgment commits", surface.status === "declared");
  assert("E1: evidence-store ref preserved", surface.judgment[0].evidence_refs[0] === EV_FWD);
}

async function testEFallbackDistinguishable() {
  freshWorkspace();
  const { surface: judgmentA } = await runWithResponses("Judge the evidence.", [
    judgment("declared", [EV_FWD]),
  ]);

  const reviewA = loadReviews(workspace).find(
    ({ review }) => review.reviewed_judgment_id === judgmentA.judgment_id
  );
  assert("E2: prior auto-review exists", reviewA !== undefined);

  const fallbackChat = async () => ({
    content: JSON.stringify({ type: "tool", tool: "read_file", input: { path: "missing.js" } }),
  });
  const fallbackSurface = await runEos("Judge something impossible.", {
    workspace,
    chatFn: fallbackChat,
    maxIterations: 2,
  });
  assert("E2: fallback recorded as fallback", fallbackSurface.commit_reason === "fallback");

  const { surface: reverified } = await runWithResponses(
    "Re-verify the prior judgment.",
    [judgment("declared", [`review:${reviewA.review.review_id}`, EV_FWD])]
  );

  assert("E2: historical review plus live evidence still citable", reverified.status === "declared");
  assert("E2: re-judgment distinguishable from fallback", reverified.commit_reason === "judgment");
}

async function main() {
  testGateReviewAnchoring();
  await testAInventedRefRejected();
  await testBEmptyInvestigationCannotLeap();
  await testCAnchoredReviewStillCitable();
  await testC2OlderReviewNotCitable();
  await testDRealInspection();
  await testDEmptyFileDigest();
  await testELiveEvidenceFlows();
  await testEFallbackDistinguishable();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all evidence boundary regression tests passed");
}

main();
