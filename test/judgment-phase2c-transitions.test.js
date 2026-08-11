import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/loop.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-phase2c-transitions"
);

let failures = 0;

function freshWorkspace() {
  fs.rmSync(workspace, { recursive: true, force: true });

  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });

  fs.writeFileSync(
    path.join(workspace, "src", "index.js"),
    "export const x = 1;\n"
  );

  fs.writeFileSync(
    path.join(workspace, "src", "validated.js"),
    "export const validated = true;\n"
  );

  fs.mkdirSync(path.join(workspace, ".ige"), { recursive: true });
}

function assert(name, condition) {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}`);
  }
}

function judgment(type, evidenceRefs = [], claim = `${type} transition claim`) {
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

async function runWithResponses(userInput, responses) {
  let calls = 0;

  const chatFn = async () => {
    const response = responses[Math.min(calls, responses.length - 1)];
    calls += 1;
    return { content: JSON.stringify(response) };
  };

  const surface = await runEos(userInput, {
    workspace,
    chatFn,
    maxIterations: 10,
  });

  return { surface, calls };
}

/*
 * The current runEos invocation is one investigation.
 * These tests establish what a sequence of separate investigations
 * should preserve when the same engineering question evolves.
 */

async function testBlockedToCandidate() {
  freshWorkspace();

  const blocked = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [judgment("blocked", [])]
  );

  const candidate = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("candidate", ["src/index.js"]),
    ]
  );

  assert(
    "initial investigation can end blocked",
    blocked.surface.status === "blocked"
  );

  assert(
    "later investigation can become candidate",
    candidate.surface.status === "candidate"
  );

  assert(
    "blocked-to-candidate retains evidence support",
    candidate.surface.judgment[0].evidence_refs[0] === "src/index.js"
  );
}

async function testCandidateToDeclared() {
  freshWorkspace();

  const candidate = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("candidate", ["src/index.js"]),
    ]
  );

  const declared = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("declared", ["src/index.js"]),
    ]
  );

  assert(
    "candidate state established",
    candidate.surface.status === "candidate"
  );

  assert(
    "candidate can progress to declared",
    declared.surface.status === "declared"
  );

  assert(
    "declared transition retains evidence reference",
    declared.surface.judgment[0].evidence_refs[0] === "src/index.js"
  );
}

async function testIdentitiesChangeAcrossInvestigations() {
  freshWorkspace();

  const first = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [judgment("blocked", [])]
  );

  const second = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [judgment("blocked", [])]
  );

  assert(
    "successive judgments receive different judgment ids",
    first.surface.judgment_id !== second.surface.judgment_id
  );

  assert(
    "successive investigations receive different investigation ids",
    first.surface.investigation_id !== second.surface.investigation_id
  );
}

async function testTransitionCannotManufactureEvidence() {
  freshWorkspace();

  const first = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [judgment("blocked", [])]
  );

  const second = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [judgment("candidate", ["fabricated-transition-evidence"])]
  );

  assert(
    "blocked state does not become evidence",
    first.surface.evidence.consumed.length === 0
  );

  assert(
    "fabricated transition evidence cannot produce candidate",
    second.surface.status === "blocked"
  );
}

async function testPreviousJudgmentIsNotEvidence() {
  freshWorkspace();

  const first = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("candidate", ["src/index.js"]),
    ]
  );

  const second = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      judgment("declared", [first.surface.judgment_id]),
      judgment("blocked", []),
    ]
  );

  assert(
    "previous judgment id is not accepted as evidence",
    second.surface.status === "blocked"
  );
}

async function testEvidenceCannotDisappearFromValidTransition() {
  freshWorkspace();

  const candidate = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("candidate", ["src/index.js"]),
    ]
  );

  const declared = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("declared", ["src/index.js"]),
    ]
  );

  assert(
    "candidate has evidence",
    candidate.surface.judgment[0].evidence_refs.length === 1
  );

  assert(
    "declared transition still has evidence",
    declared.surface.judgment[0].evidence_refs.length === 1
  );

  assert(
    "same evidence remains cited",
    declared.surface.judgment[0].evidence_refs[0] ===
      candidate.surface.judgment[0].evidence_refs[0]
  );
}

async function main() {
  await testBlockedToCandidate();
  await testCandidateToDeclared();
  await testIdentitiesChangeAcrossInvestigations();
  await testTransitionCannotManufactureEvidence();
  await testPreviousJudgmentIsNotEvidence();
  await testEvidenceCannotDisappearFromValidTransition();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }

  console.log("all Phase 2C transition tests passed");
}

main();
