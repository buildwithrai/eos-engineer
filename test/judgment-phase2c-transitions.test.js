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
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("declared", [first.surface.judgment_id]),
      judgment("candidate", ["src/index.js"]),
    ]
  );

  assert(
    "candidate state established",
    first.surface.status === "candidate"
  );

  assert(
    "previous judgment id is not accepted as evidence",
    second.calls >= 3
  );

  assert(
    "previous judgment id never enters accepted evidence",
    second.surface.judgment.every(
      (item) => !(item.evidence_refs ?? []).includes(first.surface.judgment_id)
    )
  );

  assert(
    "state remains candidate after rejected judgment-id citation",
    second.surface.status === "candidate"
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

/**
 * The chain blocked -> candidate -> declared must be enforced across
 * persisted runs: blocked cannot skip to declared, but can later advance
 * to candidate.
 */
async function testBlockedToDeclaredRejectedAcrossRuns() {
  freshWorkspace();

  const blocked = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [judgment("blocked", [])]
  );

  const skipped = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("declared", ["src/index.js"]),
      judgment("blocked", []),
    ]
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
    "persisted run may start blocked",
    blocked.surface.status === "blocked"
  );

  assert(
    "blocked cannot skip directly to declared across persisted runs",
    skipped.calls >= 3 && skipped.surface.status === "blocked"
  );

  assert(
    "blocked can then advance to candidate",
    candidate.surface.status === "candidate"
  );
}

/**
 * A fresh workspace with no persisted judgment may begin directly at any
 * legal state, subject to the evidence gate.
 */
async function testFreshWorkspaceMayBeginAtDeclared() {
  freshWorkspace();

  assert(
    "no persisted judgment exists before the fresh run",
    !fs.existsSync(path.join(workspace, ".eos", "judgment.json"))
  );

  const { surface } = await runWithResponses(
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
    "fresh workspace may begin directly at declared with evidence",
    surface.status === "declared"
  );
}

/**
 * An invalid persisted status must not gate transitions; it is treated as
 * a fresh workspace.
 */
async function testInvalidPersistedStatusIsTreatedAsFresh() {
  freshWorkspace();

  fs.mkdirSync(path.join(workspace, ".eos"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, ".eos", "judgment.json"),
    '{ "status": "confirmed" }\n'
  );

  const { surface } = await runWithResponses(
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
    "invalid persisted status is ignored as fresh state",
    surface.status === "candidate"
  );
}

/**
 * A malformed persisted judgment must not gate transitions; it is treated
 * as a fresh workspace.
 */
async function testMalformedPersistedJudgmentIsTreatedAsFresh() {
  freshWorkspace();

  fs.mkdirSync(path.join(workspace, ".eos"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, ".eos", "judgment.json"),
    "{ not valid json\n"
  );

  const { surface } = await runWithResponses(
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
    "malformed persisted judgment is ignored as fresh state",
    surface.status === "candidate"
  );
}

/**
 * A persisted declared state must survive iteration exhaustion: EOS must
 * not commit a blocked regression when no judgment is accepted.
 */
async function testExhaustionPreservesDeclaredState() {
  freshWorkspace();

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

  const exhausted = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [judgment("declared", ["src/index.js"])],
    { maxIterations: 1 }
  );

  assert(
    "declared state is established",
    declared.surface.status === "declared"
  );

  assert(
    "iteration exhaustion does not regress persisted declared",
    exhausted.surface.status === "declared"
  );

  assert(
    "exhaustion fallback preserves the declared claim type",
    exhausted.surface.judgment[0].type === "declared"
  );
}

/**
 * A persisted candidate state must survive iteration exhaustion: EOS must
 * not commit a blocked regression, and must not elevate to declared.
 */
async function testExhaustionPreservesCandidateState() {
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

  const exhausted = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [judgment("declared", ["src/index.js"])],
    { maxIterations: 1 }
  );

  assert(
    "candidate state is established",
    candidate.surface.status === "candidate"
  );

  assert(
    "iteration exhaustion does not regress persisted candidate",
    exhausted.surface.status === "candidate"
  );

  assert(
    "exhaustion does not elevate candidate to declared",
    exhausted.surface.judgment[0].type === "candidate"
  );
}

/**
 * A fresh workspace with iteration exhaustion keeps the blocked fallback
 * and never manufactures evidence.
 */
async function testExhaustionFreshWorkspaceRemainsBlocked() {
  freshWorkspace();

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [judgment("declared", ["src/index.js"])],
    { maxIterations: 1 }
  );

  assert(
    "fresh exhaustion falls back to blocked",
    surface.status === "blocked"
  );

  assert(
    "exhaustion fallback never manufactures evidence",
    surface.evidence.inspections.length === 0
  );
}

async function main() {
  await testBlockedToCandidate();
  await testCandidateToDeclared();
  await testIdentitiesChangeAcrossInvestigations();
  await testTransitionCannotManufactureEvidence();
  await testPreviousJudgmentIsNotEvidence();
  await testEvidenceCannotDisappearFromValidTransition();
  await testBlockedToDeclaredRejectedAcrossRuns();
  await testFreshWorkspaceMayBeginAtDeclared();
  await testInvalidPersistedStatusIsTreatedAsFresh();
  await testMalformedPersistedJudgmentIsTreatedAsFresh();
  await testExhaustionPreservesDeclaredState();
  await testExhaustionPreservesCandidateState();
  await testExhaustionFreshWorkspaceRemainsBlocked();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }

  console.log("all Phase 2C transition tests passed");
}

main();
