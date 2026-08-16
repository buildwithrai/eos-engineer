import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/runtime/run.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-phase2c-state-machine-adversarial"
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
    path.join(workspace, "src", "other.js"),
    "export const y = 2;\n"
  );

  fs.mkdirSync(path.join(workspace, ".ige"), { recursive: true });

  fs.writeFileSync(
    path.join(workspace, ".ige", "inspect.json"),
    '{"project":{"name":"phase2c-state-machine-adversarial"}}\n'
  );
}

function assert(name, condition) {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}`);
  }
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
    const response =
      responses[Math.min(calls, responses.length - 1)];

    calls += 1;

    return {
      content: JSON.stringify(response),
    };
  };

  const surface = await runEos(userInput, {
    workspace,
    chatFn,
    maxIterations: options.maxIterations ?? 10,
  });

  return { surface, calls };
}

/**
 * Attack: model tries to jump directly from blocked to declared.
 *
 * A previously established blocked state must not advance to declared even
 * when the later declared judgment carries valid inspected evidence.
 * EOS must not treat the prior blocked judgment as evidence-backed
 * progression, and must never auto-inspect files on the model's behalf.
 */
async function testBlockedDoesNotBecomeEvidence() {
  freshWorkspace();

  const first = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [judgment("blocked", [])]
  );

  const second = await runWithResponses(
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

  assert(
    "initial blocked judgment is blocked",
    first.surface.status === "blocked"
  );

  assert(
    "blocked state does not become evidence",
    first.surface.evidence.consumed.length === 0
  );

  assert(
    "blocked to declared is rejected despite valid inspected evidence",
    second.calls >= 3 && second.surface.status === "blocked"
  );
}

/**
 * Attack: evidence exists in the repository but was never inspected
 * during the current investigation.
 */
async function testUninspectedEvidenceCannotElevateState() {
  freshWorkspace();

  const { surface, calls } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      judgment("declared", ["src/index.js"]),
      judgment("blocked", []),
    ]
  );

  assert(
    "repository presence is not equivalent to inspection",
    calls >= 2
  );

  assert(
    "uninspected evidence cannot produce declared",
    surface.status === "blocked"
  );
}

/**
 * Attack: one valid claim plus one invalid claim.
 *
 * The invalid claim must poison the response rather than allowing the
 * valid claim to elevate the surface.
 */
async function testMixedValidAndInvalidClaimsPoisonResponse() {
  freshWorkspace();

  const { surface, calls } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "judgment",
        judgment: [
          {
            claim: "valid candidate",
            type: "candidate",
            confidence: "high",
            evidence_refs: ["src/index.js"],
          },
          {
            claim: "invalid confirmed state",
            type: "confirmed",
            confidence: "high",
            evidence_refs: ["src/index.js"],
          },
        ],
      },
      judgment("blocked", []),
    ]
  );

  assert(
    "mixed valid/invalid response is rejected",
    calls >= 2
  );

  assert(
    "invalid state cannot elevate surface",
    surface.status === "blocked"
  );

  assert(
    "invalid state is not persisted",
    surface.judgment.every(
      (item) =>
        item.type === "blocked" ||
        item.type === "candidate" ||
        item.type === "declared"
    )
  );
}

/**
 * Attack: candidate cites two files but only one is inspected.
 */
async function testPartialEvidenceCannotElevateCandidate() {
  freshWorkspace();

  const { surface, calls } = await runWithResponses(
    "Investigate src/index.js and src/other.js and judge them.",
    [
      judgment("candidate", ["src/index.js", "src/other.js"]),
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("blocked", []),
    ]
  );

  assert(
    "partial evidence causes another iteration",
    calls >= 3
  );

  assert(
    "partial evidence cannot establish candidate",
    surface.status === "blocked"
  );
}

/**
 * Attack: candidate starts with evidence, then declared attempts to
 * introduce a new uninspected evidence reference.
 */
async function testDeclaredCannotIntroduceUninspectedEvidence() {
  freshWorkspace();

  const { surface, calls } = await runWithResponses(
    "Investigate src/index.js and src/other.js and judge them.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("candidate", ["src/index.js"]),
      judgment("declared", ["src/index.js", "src/other.js"]),
      judgment("blocked", []),
    ]
  );

  assert(
    "declared transition with new uninspected evidence is rejected",
    calls >= 4
  );

  assert(
    "uninspected evidence prevents declared state",
    surface.status === "blocked"
  );
}

/**
 * Attack: evidence is cited twice.
 *
 * Duplicate references must not accidentally create stronger evidence.
 */
async function testDuplicateEvidenceDoesNotAlterSemantics() {
  freshWorkspace();

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("candidate", [
        "src/index.js",
        "src/index.js",
      ]),
    ]
  );

  assert(
    "duplicate evidence refs do not prevent candidate",
    surface.status === "candidate"
  );

  assert(
    "duplicate evidence refs remain exactly represented",
    surface.judgment[0].evidence_refs.length === 2
  );
}

/**
 * Attack: malformed evidence_refs value.
 */
async function testMalformedEvidenceRefsAreRejected() {
  freshWorkspace();

  const { surface, calls } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "judgment",
        judgment: [
          {
            claim: "malformed refs",
            type: "candidate",
            confidence: "high",
            evidence_refs: "src/index.js",
          },
        ],
      },
      judgment("blocked", []),
    ]
  );

  assert(
    "malformed evidence_refs causes rejection",
    calls >= 2
  );

  assert(
    "malformed evidence_refs cannot elevate state",
    surface.status === "blocked"
  );
}

/**
 * Attack: missing type.
 */
async function testMissingStateIsRejected() {
  freshWorkspace();

  const { surface, calls } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "judgment",
        judgment: [
          {
            claim: "missing type",
            confidence: "high",
            evidence_refs: ["src/index.js"],
          },
        ],
      },
      judgment("blocked", []),
    ]
  );

  assert(
    "missing judgment state is rejected",
    calls >= 2
  );

  assert(
    "missing state cannot elevate surface",
    surface.status === "blocked"
  );
}

/**
 * Attack: model returns an empty judgment collection.
 */
async function testEmptyJudgmentCannotBecomeDeclared() {
  freshWorkspace();

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "judgment",
        judgment: [],
      },
    ]
  );

  assert(
    "empty judgment does not become declared",
    surface.status !== "declared"
  );
}

/**
 * Attack: tool call appears after a terminal blocked judgment.
 *
 * The system should not treat the later tool call as evidence that
 * retroactively validates the already-produced blocked judgment.
 */
async function testToolAfterBlockedDoesNotRetroactivelyValidate() {
  freshWorkspace();

  const { surface, calls } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      judgment("blocked", []),
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("blocked", []),
    ]
  );

  assert(
    "blocked judgment terminates without fabricated evidence",
    calls === 1
  );

  assert(
    "blocked remains blocked",
    surface.status === "blocked"
  );
}

/**
 * Attack: iteration exhaustion must not leave a candidate/declared
 * surface based on an unaccepted response.
 */
async function testIterationExhaustionCannotCommitUngatedJudgment() {
  freshWorkspace();

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      judgment("declared", ["fabricated-id"]),
    ],
    { maxIterations: 1 }
  );

  assert(
    "iteration exhaustion cannot commit fabricated judgment",
    surface.status === "blocked"
  );
}

/**
 * Attack: conflicting states in one response.
 *
 * Explicit precedence must remain deterministic.
 */
async function testConflictingValidStatesUseBlockedPrecedence() {
  freshWorkspace();

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "judgment",
        judgment: [
          {
            claim: "declared claim",
            type: "declared",
            confidence: "high",
            evidence_refs: ["src/index.js"],
          },
          {
            claim: "candidate claim",
            type: "candidate",
            confidence: "high",
            evidence_refs: ["src/index.js"],
          },
          {
            claim: "blocked claim",
            type: "blocked",
            confidence: "high",
            evidence_refs: [],
          },
        ],
      },
    ]
  );

  assert(
    "conflicting valid states use blocked precedence",
    surface.status === "blocked"
  );

  assert(
    "all states remain canonical",
    surface.judgment.every((item) =>
      ["blocked", "candidate", "declared"].includes(item.type)
    )
  );
}

/**
 * Attack: declared regresses to candidate.
 *
 * A persisted declared state must not be allowed to regress to candidate,
 * even when the candidate claim carries valid inspected evidence.
 */
async function testDeclaredCannotRegressToCandidate() {
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

  const regressed = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("candidate", ["src/index.js"]),
      judgment("blocked", []),
    ]
  );

  assert(
    "initial declared state is established",
    declared.surface.status === "declared"
  );

  assert(
    "declared cannot regress to candidate despite valid evidence",
    regressed.calls >= 3 && regressed.surface.status === "declared"
  );

  assert(
    "persisted declared survives the rejected regression attempt",
    regressed.surface.judgment[0].type === "declared"
  );
}

/**
 * Attack: model returns an evidence-requiring judgment without ever
 * requesting a read_file.
 *
 * EOS must reject and retry the model rather than automatically
 * inspecting evidence on the model's behalf.
 */
async function testJudgmentDoesNotTriggerAutomaticInspection() {
  freshWorkspace();

  const { surface, calls } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [judgment("declared", ["src/index.js"])],
    { maxIterations: 3 }
  );

  assert(
    "judgment does not auto-inspect evidence",
    surface.evidence.inspections.length === 0
  );

  assert(
    "judgment without inspection is rejected, not auto-satisfied",
    calls === 3
  );

  assert(
    "uninspected judgment cannot reach declared",
    surface.status === "blocked"
  );
}

/**
 * Attack: the persisted .eos/judgment.json file is cited as evidence.
 *
 * A previous judgment projection must never be usable as evidence for a
 * new judgment, even when the file was read via read_file.
 */
async function testPersistedJudgmentFileIsNotEvidence() {
  freshWorkspace();

  const first = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [judgment("blocked", [])]
  );

  const second = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      {
        type: "tool",
        tool: "read_file",
        input: { path: ".eos/judgment.json" },
      },
      judgment("candidate", ["src/index.js", ".eos/judgment.json"]),
      judgment("blocked", []),
    ]
  );

  assert(
    "initial judgment is persisted",
    first.surface.status === "blocked"
  );

  assert(
    "persisted judgment file is rejected as evidence",
    second.calls >= 4 && second.surface.status === "blocked"
  );
}

/**
 * Attack: model requests read_file for a non-required path.
 *
 * EOS must execute the path the model actually requested and must not
 * silently rewrite it to a different required file.
 */
async function testReadFilePathIsNotRewritten() {
  freshWorkspace();

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/other.js" },
      },
      judgment("blocked", []),
    ]
  );

  assert(
    "model-requested read_file path is executed as requested",
    surface.evidence.inspections.length === 1 &&
      surface.evidence.inspections[0].path.endsWith("src/other.js")
  );

  assert(
    "requested path is not silently replaced with a required file",
    !surface.investigation.inspected_evidence.includes("src/index.js")
  );
}

async function main() {
  await testBlockedDoesNotBecomeEvidence();
  await testUninspectedEvidenceCannotElevateState();
  await testMixedValidAndInvalidClaimsPoisonResponse();
  await testPartialEvidenceCannotElevateCandidate();
  await testDeclaredCannotIntroduceUninspectedEvidence();
  await testDuplicateEvidenceDoesNotAlterSemantics();
  await testMalformedEvidenceRefsAreRejected();
  await testMissingStateIsRejected();
  await testEmptyJudgmentCannotBecomeDeclared();
  await testToolAfterBlockedDoesNotRetroactivelyValidate();
  await testIterationExhaustionCannotCommitUngatedJudgment();
  await testConflictingValidStatesUseBlockedPrecedence();
  await testDeclaredCannotRegressToCandidate();
  await testJudgmentDoesNotTriggerAutomaticInspection();
  await testPersistedJudgmentFileIsNotEvidence();
  await testReadFilePathIsNotRewritten();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }

  console.log("all Phase 2C state-machine adversarial tests passed");
}

main();
