import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/loop.js";
import {
  detectFormation,
  isGreenfield,
  loadIntents,
  loadLatestIntent,
  persistIntent,
  intentIdFromRef,
} from "../src/formation.js";
import { loadReviews } from "../src/review.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-test-workspace-formation"
);

function freshWorkspace() {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(workspace, { recursive: true });
}

function freshRepoWorkspace() {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "src", "a.js"), "export const a = 1;\n");
}

function formationChat(claimsFactory) {
  return async () => ({
    content: JSON.stringify({
      type: "judgment",
      judgment: claimsFactory(),
    }),
  });
}

function readThenJudgment(paths, claimsFactory) {
  let calls = 0;

  return async () => {
    calls += 1;

    if (calls <= paths.length) {
      return {
        content: JSON.stringify({
          type: "tool",
          tool: "read_file",
          input: { path: paths[calls - 1] },
        }),
      };
    }

    return {
      content: JSON.stringify({
        type: "judgment",
        judgment: claimsFactory(),
      }),
    };
  };
}

function intentRefs() {
  const record = loadIntents(workspace)[0].intent;
  return {
    id: record.intent_id,
    symbolic: `intent:${record.intent_id}`,
    record: path.join(".eos", "formation", "records", `${record.intent_id}.json`),
  };
}

let failures = 0;

function assert(name, cond) {
  if (cond) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}`);
  }
}

async function testGreenfieldFormationEndToEnd() {
  freshWorkspace();

  const surface = await runEos(
    "Create a project charter for a greenfield automated irrigation controller project. Mission: keep gardens alive with minimal water. Constraints: low power, offline-first, local-first data.",
    {
      workspace,
      chatFn: formationChat(() => [
        {
          claim: "Mission: keep gardens alive with minimal water.",
          type: "candidate",
          confidence: "high",
          evidence_refs: [intentRefs().symbolic],
        },
        {
          claim: "The controller must be offline-first, local-first, and low power.",
          type: "candidate",
          confidence: "high",
          evidence_refs: [".eos/formation/intent.json"],
        },
        {
          claim: "The charter is a candidate proposal; canonical declaration is the Engineer's act.",
          type: "candidate",
          confidence: "high",
          evidence_refs: [intentRefs().record],
        },
      ]),
      maxIterations: 3,
    }
  );

  assert("F1 formation mode detected", surface.mode === "formation");
  assert("F1 formation phase reached", surface.investigation.phase === "formation");
  assert("F1 formation judgment admitted as candidate", surface.status === "candidate");
  assert(
    "F1 intent record persisted",
    loadIntents(workspace).length === 1 &&
      fs.existsSync(path.join(workspace, ".eos", "formation", "intent.json"))
  );
  assert(
    "F1 intent record inspected as evidence",
    surface.investigation.inspected_evidence.includes(intentRefs().record) &&
      surface.investigation.inspected_evidence.includes(".eos/formation/intent.json")
  );
  assert(
    "F1 symbolic intent ref preserved",
    surface.judgment.some((item) => (item.evidence_refs ?? []).includes(`intent:${intentRefs().id}`))
  );
  assert(
    "F1 boundary block marks result non-canonical candidate",
    surface.formation?.boundary?.status === "candidate" &&
      surface.formation?.boundary?.canonical_owner === "Engineer" &&
      surface.formation?.boundary?.eos_writes_canonical_project_state === false
  );
  assert(
    "F1 boundary block declares no gaps and no inspection obligations",
    surface.investigation.gaps.length === 0 &&
      surface.investigation.explicit_requirements.length === 0
  );
  assert(
    "F1 intent refs are reviewable forward",
    (() => {
      const reviews = loadReviews(workspace);
      const review = reviews[reviews.length - 1].review;
      const ref = intentRefs().symbolic;
      const resolution = review.claims
        .flatMap((claim) => claim.resolved ?? [])
        .find((entry) => entry.ref === ref);
      return review.outcome === "forward" && resolution?.outcome === "forward";
    })()
  );
}

async function testProspectiveArtifactNotInspectionObligation() {
  freshWorkspace();

  const surface = await runEos(
    "Create a project charter (docs/charter.md) for a greenfield irrigation controller project.",
    {
      workspace,
      chatFn: readThenJudgment(
        ["docs/charter.md"],
        () => [
          {
            claim: "Mission: keep gardens alive with minimal water.",
            type: "candidate",
            confidence: "high",
            evidence_refs: [intentRefs().symbolic],
          },
          {
            claim: "The charter document will be materialized as docs/charter.md by the Engineer.",
            type: "candidate",
            confidence: "high",
            evidence_refs: [".eos/formation/intent.json"],
          },
        ]
      ),
      maxIterations: 4,
    }
  );

  assert("F2 prospective artifact does not block formation", surface.status === "candidate");
  assert("F2 formation phase reached", surface.investigation.phase === "formation");
  assert(
    "F2 referenced but non-existent file listed as prospective artifact",
    surface.investigation.prospective_artifacts.includes("docs/charter.md")
  );
  assert(
    "F2 non-existent file is not an explicit requirement",
    surface.investigation.explicit_requirements.length === 0
  );
  assert("F2 no inspection gaps", surface.investigation.gaps.length === 0);
  assert(
    "F2 prospective artifact declared on surface formation block",
    (surface.formation?.prospective_artifacts ?? []).includes("docs/charter.md")
  );
}

async function testExistingFileRemainsInspectionObligation() {
  freshWorkspace();
  fs.mkdirSync(path.join(workspace, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, "docs", "requirements.md"),
    "# Requirements\n\nMission: keep gardens alive with minimal water.\n"
  );

  const surface = await runEos(
    "Create a project charter for a greenfield irrigation controller project, based on docs/requirements.md.",
    {
      workspace,
      chatFn: readThenJudgment(
        ["docs/requirements.md"],
        () => [
          {
            claim: "Mission: keep gardens alive with minimal water.",
            type: "candidate",
            confidence: "high",
            evidence_refs: [intentRefs().symbolic, "docs/requirements.md"],
          },
        ]
      ),
      maxIterations: 4,
    }
  );

  assert("F3 formation mode via explicit marker", surface.mode === "formation");
  assert(
    "F3 existing referenced file remains an explicit requirement",
    surface.investigation.explicit_requirements.includes("docs/requirements.md")
  );
  assert(
    "F3 existing file inspected",
    surface.investigation.inspected_evidence.includes("docs/requirements.md")
  );
  assert("F3 formation phase reached after inspection", surface.investigation.phase === "formation");
  assert("F3 formation judgment admitted as candidate", surface.status === "candidate");
}

async function testRepositoryModeUnchanged() {
  freshRepoWorkspace();

  let calls = 0;

  const surface = await runEos("Inspect src/a.js and judge it.", {
    workspace,
    chatFn: async () => {
      calls += 1;
      return {
        content: JSON.stringify({
          type: "judgment",
          judgment: [
            {
              claim: "declared without any inspection",
              type: "declared",
              confidence: "high",
              evidence_refs: [],
            },
          ],
        }),
      };
    },
    maxIterations: 2,
  });

  assert("F4 repository mode unchanged", surface.mode === "repository");
  assert("F4 declared without evidence rejected", surface.status === "blocked");
  assert(
    "F4 fallback judgment committed",
    surface.judgment.some((item) => item.claim.includes("iteration limit"))
  );
  assert(
    "F4 no formation boundary on repository result",
    surface.formation === undefined
  );
}

async function testDetectionAndLedgerSemantics() {
  freshWorkspace();
  assert("F5 empty workspace is greenfield", isGreenfield(workspace));
  assert(
    "F5 empty workspace classified as formation regardless of wording",
    detectFormation(workspace, "Please investigate this repository.").mode === "formation"
  );

  freshRepoWorkspace();
  assert("F5 repository workspace is not greenfield", !isGreenfield(workspace));
  assert(
    "F5 repository request stays repository mode",
    detectFormation(workspace, "Investigate src/a.js and judge it.").mode === "repository"
  );
  assert(
    "F5 formation marker on repository workspace forces formation mode",
    detectFormation(workspace, "Create a project charter based on src/a.js.").mode === "formation"
  );

  freshWorkspace();
  const first = persistIntent(workspace, "charter intent");
  const firstAgain = persistIntent(workspace, "charter intent");
  assert(
    "F5 re-persisting identical intent is idempotent",
    first.intent.intent_id === firstAgain.intent.intent_id &&
      loadIntents(workspace).length === 1
  );
  assert(
    "F5 intent ledger alone does not reclassify workspace",
    isGreenfield(workspace)
  );

  const second = persistIntent(workspace, "revised charter intent");
  assert(
    "F5 distinct intent appends a write-once record",
    loadIntents(workspace).length === 2 &&
      second.intent.intent_id !== first.intent.intent_id
  );
  assert(
    "F5 latest pointer follows the newest intent",
    loadLatestIntent(workspace).intent.intent === "revised charter intent"
  );
  assert(
    "F5 intent id extraction from symbolic and path refs",
    intentIdFromRef(`intent:${first.intent.intent_id}`) === first.intent.intent_id &&
      intentIdFromRef(`.eos/formation/records/${first.intent.intent_id}.json`) === first.intent.intent_id &&
      intentIdFromRef(".eos/formation/intent.json") === "latest"
  );

  const substrateWs = path.resolve(workspace, "..", ".tmp-formation-substrate-probe");
  fs.rmSync(substrateWs, { recursive: true, force: true });
  fs.mkdirSync(path.join(substrateWs, ".eos"), { recursive: true });
  fs.writeFileSync(path.join(substrateWs, ".eos", "judgment.json"), "{}");
  assert("F5 persisted judgment disables greenfield", !isGreenfield(substrateWs));
  fs.rmSync(substrateWs, { recursive: true, force: true });
}

async function main() {
  await testGreenfieldFormationEndToEnd();
  await testProspectiveArtifactNotInspectionObligation();
  await testExistingFileRemainsInspectionObligation();
  await testRepositoryModeUnchanged();
  await testDetectionAndLedgerSemantics();

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }

  console.log("all phase5 formation lifecycle tests passed");
}

main();
