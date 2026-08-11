import fs from "node:fs";
import path from "node:path";
import {
  runEos,
  JUDGMENT_STATES,
  isJudgmentState,
  canTransition,
  surfaceStatus,
} from "../src/loop.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-phase2c-state-machine"
);

let failures = 0;

function freshWorkspace() {
  fs.rmSync(workspace, { recursive: true, force: true });

  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });

  fs.writeFileSync(
    path.join(workspace, "src", "index.js"),
    "export const x = 1;\n"
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

function judgment(type, evidenceRefs = []) {
  return {
    type: "judgment",
    judgment: [
      {
        claim: `${type} claim`,
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

function testStateModelIsExplicit() {
  assert(
    "state model exposes exactly three legal states",
    JSON.stringify(Object.keys(JUDGMENT_STATES).sort()) ===
      JSON.stringify(["blocked", "candidate", "declared"])
  );

  assert(
    "blocked precedes candidate precedes declared",
    JUDGMENT_STATES.blocked.rank === 0 &&
      JUDGMENT_STATES.candidate.rank === 1 &&
      JUDGMENT_STATES.declared.rank === 2
  );

  assert(
    "blocked does not require evidence",
    JUDGMENT_STATES.blocked.requiresEvidence === false
  );

  assert(
    "candidate requires evidence",
    JUDGMENT_STATES.candidate.requiresEvidence === true
  );

  assert(
    "declared requires evidence",
    JUDGMENT_STATES.declared.requiresEvidence === true
  );

  assert(
    "unknown state is not a legal judgment state",
    isJudgmentState("confirmed") === false
  );
}

function testLegalTransitions() {
  assert("fresh investigation may start blocked", canTransition(null, "blocked"));
  assert("fresh investigation may start candidate", canTransition(null, "candidate"));
  assert("fresh investigation may start declared", canTransition(null, "declared"));

  assert("blocked can transition to candidate", canTransition("blocked", "candidate"));
  assert("candidate can transition to declared", canTransition("candidate", "declared"));

  assert(
    "a state may remain itself",
    canTransition("blocked", "blocked") &&
      canTransition("candidate", "candidate") &&
      canTransition("declared", "declared")
  );

  assert("blocked cannot skip to declared", canTransition("blocked", "declared") === false);
  assert("candidate cannot regress to blocked", canTransition("candidate", "blocked") === false);
  assert("declared cannot regress to candidate", canTransition("declared", "candidate") === false);
  assert("declared cannot regress to blocked", canTransition("declared", "blocked") === false);

  assert(
    "unknown states never transition",
    canTransition("blocked", "confirmed") === false &&
      canTransition(null, "confirmed") === false
  );
}

function testSurfaceStatusPrecedence() {
  assert("single blocked surface is blocked", surfaceStatus([{ type: "blocked" }]) === "blocked");
  assert("single candidate surface is candidate", surfaceStatus([{ type: "candidate" }]) === "candidate");
  assert("single declared surface is declared", surfaceStatus([{ type: "declared" }]) === "declared");
  assert("blocked dominates candidate", surfaceStatus([{ type: "candidate" }, { type: "blocked" }]) === "blocked");
  assert("candidate dominates declared", surfaceStatus([{ type: "declared" }, { type: "candidate" }]) === "candidate");
  assert("blocked dominates declared", surfaceStatus([{ type: "declared" }, { type: "blocked" }]) === "blocked");
}

async function testInvalidStateRejected() {
  freshWorkspace();

  const { surface, calls } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      judgment("confirmed", ["src/index.js"]),
      judgment("blocked", []),
    ]
  );

  assert("invalid judgment state is rejected", calls >= 2);
  assert("surface falls back to blocked", surface.status === "blocked");
  assert(
    "surface never contains the invalid state",
    surface.judgment.every((item) => item.type !== "confirmed")
  );
}

async function testInvalidStateCannotElevateSurface() {
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
            claim: "confirmed claim",
            type: "confirmed",
            confidence: "high",
            evidence_refs: ["src/index.js"],
          },
        ],
      },
    ]
  );

  assert(
    "invalid state poisons the whole judgment response",
    surface.status === "blocked"
  );
  assert(
    "no invalid state is persisted",
    surface.judgment.every((item) =>
      ["blocked", "candidate", "declared"].includes(item.type)
    )
  );
}

async function testFullProgressionChain() {
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

  assert("chain starts blocked", blocked.surface.status === "blocked");
  assert("chain progresses to candidate", candidate.surface.status === "candidate");
  assert("chain commits to declared", declared.surface.status === "declared");
  assert(
    "candidate evidence preserved into declared",
    declared.surface.judgment[0].evidence_refs.length === 1 &&
      declared.surface.judgment[0].evidence_refs[0] ===
        candidate.surface.judgment[0].evidence_refs[0]
  );
  assert(
    "each surface retains independent identity",
    blocked.surface.judgment_id !== candidate.surface.judgment_id &&
      candidate.surface.judgment_id !== declared.surface.judgment_id
  );
}

async function main() {
  testStateModelIsExplicit();
  testLegalTransitions();
  testSurfaceStatusPrecedence();
  await testInvalidStateRejected();
  await testInvalidStateCannotElevateSurface();
  await testFullProgressionChain();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }

  console.log("all Phase 2C state-machine tests passed");
}

main();
