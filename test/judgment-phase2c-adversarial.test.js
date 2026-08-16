import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/runtime/run.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-phase2c-adversarial"
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
    '{"project":{"name":"phase2c-test"}}\n'
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

function judgment(type, evidenceRefs = []) {
  return {
    type: "judgment",
    judgment: [
      {
        claim: `${type} adversarial claim`,
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

async function testCandidateRequiresEvidence() {
  freshWorkspace();

  const { surface, calls } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      judgment("candidate", []),
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("candidate", ["src/index.js"]),
    ]
  );

  assert("candidate without evidence is rejected", calls >= 3);
  assert("candidate becomes valid after inspection", surface.status === "candidate");
  assert("candidate type preserved", surface.judgment[0].type === "candidate");
  assert(
    "candidate evidence ref preserved",
    surface.judgment[0].evidence_refs[0] === "src/index.js"
  );
}

async function testBlockedRequiresNoEvidence() {
  freshWorkspace();

  const { surface, calls } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [judgment("blocked", [])]
  );

  assert("blocked judgment does not require evidence", calls === 1);
  assert("blocked status recorded", surface.status === "blocked");
  assert("blocked type preserved", surface.judgment[0].type === "blocked");
}

async function testDeclaredRequiresEvidence() {
  freshWorkspace();

  const { surface, calls } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      judgment("declared", ["src/index.js"]),
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("declared", ["src/index.js"]),
    ]
  );

  assert("declared claim with uninspected evidence is rejected", calls >= 3);
  assert("declared judgment accepted after inspection", surface.status === "declared");
  assert("declared type preserved", surface.judgment[0].type === "declared");
}

async function testFabricatedEvidenceIsRejected() {
  freshWorkspace();

  const { surface, calls } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      judgment("candidate", ["fabricated-evidence-id"]),
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("blocked", []),
    ]
  );

  assert("fabricated evidence is rejected", calls >= 3);
  assert("fallback blocked judgment recorded", surface.status === "blocked");
}

async function testDecisionIdCannotBecomeEvidence() {
  freshWorkspace();

  const decisionId = "11111111-1111-1111-1111-111111111111";

  const { surface, calls } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      judgment("declared", [decisionId]),
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("blocked", []),
    ]
  );

  assert("decision id is not accepted as evidence", calls >= 3);
  assert("decision-only citation ends blocked", surface.status === "blocked");
}

async function testRequiredEvidenceCannotBeSkipped() {
  freshWorkspace();

  const { surface, calls } = await runWithResponses(
    "Investigate src/index.js and src/other.js and judge them.",
    [
      judgment("declared", ["src/index.js", "src/other.js"]),
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/other.js" },
      },
      judgment("declared", ["src/index.js", "src/other.js"]),
    ]
  );

  assert("multiple required files cannot be skipped", calls >= 4);
  assert("all required evidence eventually permits judgment", surface.status === "declared");
  assert(
    "both evidence refs preserved",
    surface.judgment[0].evidence_refs.length === 2
  );
}

async function testMixedStateSurfaceUsesBlockedPrecedence() {
  freshWorkspace();

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "judgment",
        judgment: [
          {
            claim: "blocked claim",
            type: "blocked",
            confidence: "low",
            evidence_refs: [],
          },
          {
            claim: "candidate claim",
            type: "candidate",
            confidence: "medium",
            evidence_refs: [],
          },
        ],
      },
    ]
  );

  /*
   * Current surface semantics:
   * blocked > candidate > declared
   */
  assert("mixed blocked/candidate surface is blocked", surface.status === "blocked");
}

async function testSurfaceHasSingleIdentityTimestamp() {
  freshWorkspace();

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [judgment("blocked", [])]
  );

  assert(
    "judgment id is UUID",
    /^[0-9a-f-]{36}$/.test(surface.judgment_id)
  );

  assert(
    "investigation id is UUID",
    /^[0-9a-f-]{36}$/.test(surface.investigation_id)
  );

  assert(
    "judgment and investigation identities differ",
    surface.judgment_id !== surface.investigation_id
  );

  assert(
    "surface timestamp is valid",
    typeof surface.recorded_at === "string" &&
      !Number.isNaN(Date.parse(surface.recorded_at))
  );

  assert(
    "individual claim has no independent timestamp",
    surface.judgment[0].recorded_at === undefined
  );
}

async function testProjectionRemainsInEos() {
  freshWorkspace();

  await runWithResponses(
    "Investigate src/index.js and judge it.",
    [judgment("blocked", [])]
  );

  assert(
    "judgment projection exists in .eos",
    fs.existsSync(path.join(workspace, ".eos", "judgment.json"))
  );

  assert(
    "judgment projection is not written to .ige",
    !fs.existsSync(path.join(workspace, ".ige", "judgment.json"))
  );
}

async function main() {
  await testCandidateRequiresEvidence();
  await testBlockedRequiresNoEvidence();
  await testDeclaredRequiresEvidence();
  await testFabricatedEvidenceIsRejected();
  await testDecisionIdCannotBecomeEvidence();
  await testRequiredEvidenceCannotBeSkipped();
  await testMixedStateSurfaceUsesBlockedPrecedence();
  await testSurfaceHasSingleIdentityTimestamp();
  await testProjectionRemainsInEos();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }

  console.log("all Phase 2C adversarial tests passed");
}

main();
