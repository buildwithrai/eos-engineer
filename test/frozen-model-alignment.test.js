import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/runtime/run.js";
import { sha256 } from "../src/projection/persistence.js";
import { verifyLineage } from "../src/projection/lineage.js";
import {
  loadChanges,
  authorizeChange,
  dispatchChange,
  verifyChange,
  verifyChangeLedger,
} from "../src/change.js";
import { loadReviews } from "../src/review.js";
import { buildMemory, renderMemory } from "../src/memory.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-test-workspace-frozen-model-alignment"
);

function freshWorkspace() {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "src", "a.js"), "export const a = 1;\n");
}

let failures = 0;

function assert(name, condition, detail = "") {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

function chatFor(plan) {
  let calls = 0;

  return async () => {
    const step = plan[Math.min(calls, plan.length - 1)];
    calls += 1;
    return { content: JSON.stringify(step) };
  };
}

const readA = { type: "tool", tool: "read_file", input: { path: "src/a.js" } };

function declaredWithChange(change) {
  return {
    type: "judgment",
    judgment: [
      {
        claim: "paths inspected",
        type: "declared",
        confidence: "high",
        evidence_refs: ["src/a.js"],
      },
    ],
    restrictions: [],
    change,
  };
}

function changeProposal() {
  return {
    target: "Expose X from src/a.js",
    objective: "Make X importable",
    scope: { changed: ["src/a.js"], created: [], unchanged: [] },
    predicates: [{ path: "src/a.js", contains: "X" }],
    restrictions: ["Do not modify other files"],
    requested_actor: "engineer",
  };
}

// The frozen loop, in order. Each step must have a runtime representation that
// the whole-loop test exercises.
const LOOP_STEPS = [
  "intent",
  "objective",
  "what must be known",
  "evidence obligations",
  "investigation",
  "evidence acquisition",
  "inspection",
  "observation",
  "understanding",
  "knowledge",
  "judgment",
  "decision",
  "actor",
  "action",
  "verification",
  "memory",
  "next engineering state",
];

async function testLoopStepsHaveRuntimeRepresentations() {
  freshWorkspace();

  const surface = await runEos("Inspect src/a.js and judge whether X can be exposed.", {
    workspace,
    chatFn: chatFor([readA, declaredWithChange(changeProposal())]),
  });

  const representations = {
    "intent": typeof surface.investigation.target === "string",
    "objective": typeof surface.investigation.objective === "string",
    "what must be known": Array.isArray(surface.investigation.required_evidence) || typeof surface.investigation.completion === "object",
    "evidence obligations": surface.investigation.obligations !== undefined || surface.investigation.completion !== undefined,
    "investigation": typeof surface.investigation === "object" && surface.investigation !== null,
    "evidence acquisition": Array.isArray(surface.evidence?.inspections) || Array.isArray(surface.evidence?.evidence),
    "inspection": Array.isArray(surface.evidence?.inspections) && surface.evidence.inspections.length > 0,
    "observation": Array.isArray(surface.investigation?.observations) && surface.investigation.observations.length > 0,
    "understanding": typeof surface.investigation?.understanding === "object" && surface.investigation.understanding !== null,
    "knowledge": surface.evidence?.knowledge === undefined || typeof surface.evidence.knowledge === "object",
    "judgment": Array.isArray(surface.judgment) && surface.judgment.length > 0,
    "decision": surface.proposed_change !== undefined && surface.proposed_change.authorization === null,
    "actor": typeof surface.proposed_change?.contract?.requested_actor === "string",
    "action": surface.proposed_change?.contract?.scope?.changed?.includes("src/a.js") === true,
    "verification": typeof surface.memory?.verification === "object",
    "memory": surface.memory?.schema === "eos-memory/v1",
    "next engineering state": surface.engineering_state?.schema === "eos-engineering-state/v1",
  };

  let missing = [];

  for (const step of LOOP_STEPS) {
    if (representations[step] !== true) {
      missing.push(step);
    }
  }

  assert(
    "A1 every frozen loop step has a runtime representation on the surface",
    missing.length === 0,
    `missing: ${missing.join(", ")}`
  );
}

async function testWholeLoopRoundTrip() {
  freshWorkspace();

  // Iteration 1: intent -> judgment -> proposal.
  const first = await runEos("Inspect src/a.js and judge whether X can be exposed.", {
    workspace,
    chatFn: chatFor([readA, declaredWithChange(changeProposal())]),
  });

  const changeId = first.proposed_change.change_id;

  // decision + actor + action: participant authorizes, adapter executes.
  const authorized = authorizeChange(workspace, changeId, {
    actor: "engineer",
    rationale: "actor approved the proposal",
  });
  assert("A2 actor decides to authorize the proposal", authorized.ok === true);

  const applied = "export const X = 1;\n";
  const adapter = {
    id: "engineer",
    execute: async () => {
      fs.writeFileSync(path.join(workspace, "src", "a.js"), applied);
      return {
        adapter_id: "engineer",
        claimed_changes: [
          { path: "src/a.js", after_digest: sha256(Buffer.from(applied)) },
        ],
        verification: [{ kind: "unit", name: "x-exposed", outcome: "passed" }],
      };
    },
  };

  const dispatched = await dispatchChange(workspace, changeId, adapter);
  assert("A2 action performed by the adapter", dispatched.ok === true);

  // verification: EOS re-reads and records the verdict in memory.
  const verified = await verifyChange(workspace, changeId);
  assert("A2 EOS verification by re-reading", verified.change.status === "verified");

  const memoryAfter = buildMemory(workspace, {
    changes: loadChanges(workspace),
    reviews: loadReviews(workspace),
  });
  assert(
    "A2 memory retains the verified change",
    memoryAfter.verification.summary.verified === 1,
    JSON.stringify(memoryAfter.verification)
  );

  // Iteration 2: next engineering state becomes the substrate of a new loop.
  let systemContent = null;
  let consumingReads = 0;

  const second = await runEos("Assess whether X is exposed in src/a.js.", {
    workspace,
    chatFn: async (messages) => {
      if (messages[0]?.role === "system") systemContent = messages[0].content;

      if (consumingReads === 0) {
        consumingReads += 1;
        return { content: JSON.stringify(readA) };
      }

      return {
        content: JSON.stringify({
          type: "judgment",
          judgment: [
            {
              claim: "X is exposed per the verified change",
              type: "declared",
              confidence: "high",
              evidence_refs: ["src/a.js", `change:${changeId}`],
            },
          ],
          restrictions: [],
        }),
      };
    },
  });

  assert(
    "A3 next state chains to the prior judgment",
    second.previous_judgment_id === first.judgment_id,
    JSON.stringify({ prev: second.previous_judgment_id, first: first.judgment_id })
  );

  assert(
    "A3 engineering-state transition records from -> to",
    second.engineering_state?.from?.judgment_id === first.judgment_id &&
      second.engineering_state?.to?.judgment_id === second.judgment_id,
    JSON.stringify(second.engineering_state)
  );

  assert(
    "A3 verified change citable in the next iteration",
    (second.judgment[0].evidence_refs ?? []).includes(`change:${changeId}`)
  );

  assert(
    "A3 substrate lists the verified change record",
    systemContent !== null && systemContent.includes(`change:${changeId}`)
  );

  assert(
    "A3 review resolves the verified change forward",
    loadReviews(workspace)[loadReviews(workspace).length - 1].review.outcome === "forward",
    JSON.stringify(loadReviews(workspace)[loadReviews(workspace).length - 1].review)
  );

  assert(
    "A3 memory of the next loop is deterministic and renders",
    second.memory?.schema === "eos-memory/v1" &&
      renderMemory(second.memory).includes("Retained judgments"),
    JSON.stringify(second.memory)
  );

  assert(
    "A3 lineage consistent across the whole round trip",
    verifyLineage(workspace).state === "consistent" || verifyLineage(workspace).state === "none"
  );

  assert(
    "A3 change ledger consistent across the whole round trip",
    verifyChangeLedger(workspace).state === "consistent",
    JSON.stringify(verifyChangeLedger(workspace))
  );
}

await testLoopStepsHaveRuntimeRepresentations();
await testWholeLoopRoundTrip();

if (failures > 0) {
  console.error(`${failures} frozen-model alignment test(s) failed`);
  process.exit(1);
}

console.log("all frozen-model alignment tests passed");
