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
} from "../src/change.js";
import { loadReviews } from "../src/review.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-test-workspace-arch-invariants"
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

async function testIdentityInvariants() {
  freshWorkspace();

  const surface = await runEos("Inspect src/a.js and judge.", {
    workspace,
    chatFn: chatFor([readA, declaredWithChange(changeProposal())]),
  });

  assert(
    "I identity: surface carries unique judgment and investigation ids",
    typeof surface.judgment_id === "string" &&
      surface.judgment_id.length > 0 &&
      typeof surface.investigation_id === "string" &&
      surface.investigation_id.length > 0 &&
      surface.judgment_id !== surface.investigation_id,
    JSON.stringify({ jid: surface.judgment_id, iid: surface.investigation_id })
  );

  assert(
    "I identity: recorded_at present and valid",
    typeof surface.recorded_at === "string" &&
      !Number.isNaN(Date.parse(surface.recorded_at))
  );

  const lineage = verifyLineage(workspace);

  assert(
    "I identity: lineage never inconsistent after a judgment",
    lineage.state === "consistent" || lineage.state === "none",
    JSON.stringify(lineage)
  );

  const second = await runEos("Inspect src/a.js and judge again.", {
    workspace,
    chatFn: chatFor([readA, declaredWithChange(null)]),
  });

  assert(
    "I identity: second judgment chains to first",
    second.previous_judgment_id === surface.judgment_id &&
      typeof second.previous_judgment_digest === "string",
    JSON.stringify({ prev: second.previous_judgment_id, first: surface.judgment_id })
  );
}

async function testEpistemicInvariants() {
  freshWorkspace();

  const surface = await runEos("Inspect src/a.js and judge.", {
    workspace,
    chatFn: chatFor([readA, declaredWithChange(changeProposal())]),
  });

  assert(
    "E epistemology: judgment is an inference, not a decision",
    surface.judgment !== undefined &&
      Array.isArray(surface.judgment) &&
      surface.judgment.length > 0 &&
      surface.proposed_change !== undefined &&
      surface.proposed_change.authorization === null,
    JSON.stringify(surface.judgment)
  );

  assert(
    "E epistemology: evidence grounding is recorded",
    surface.investigation !== undefined &&
      Array.isArray(surface.investigation.inspected_evidence) &&
      surface.investigation.inspected_evidence.includes("src/a.js"),
    JSON.stringify(surface.investigation)
  );

  assert(
    "E epistemology: understanding distinct from judgment",
    surface.investigation.understanding !== undefined &&
      typeof surface.investigation.understanding === "object" &&
      surface.investigation.understanding.mode !== undefined,
    JSON.stringify(surface.investigation.understanding)
  );
}

async function testInvestigationInvariants() {
  freshWorkspace();

  const surface = await runEos("Inspect src/a.js and judge.", {
    workspace,
    chatFn: chatFor([readA, declaredWithChange(null)]),
  });

  assert(
    "INV investigation: observations recorded per inspected path",
    Array.isArray(surface.investigation.observations) &&
      surface.investigation.observations.some(
        (obs) => obs.path !== undefined && obs.digest !== undefined
      ),
    JSON.stringify(surface.investigation.observations)
  );

  assert(
    "INV investigation: completion reason surfaced",
    surface.investigation.completion !== undefined &&
      typeof surface.investigation.completion.reason === "string",
    JSON.stringify(surface.investigation.completion)
  );

  assert(
    "INV investigation: inspection recorded in evidence block",
    Array.isArray(surface.evidence.inspections) &&
      surface.evidence.inspections.some(
        (insp) => insp.digest !== undefined
      )
  );
}

async function testKnowledgeBoundaryInvariants() {
  freshWorkspace();

  const surface = await runEos("Inspect src/a.js and judge.", {
    workspace,
    chatFn: chatFor([readA, declaredWithChange(null)]),
  });

  assert(
    "K knowledge: REPOSITORY KNOWLEDGE is a separate substrate block",
    surface.evidence.knowledge === undefined ||
      surface.evidence.knowledge.source.endsWith("substrate/knowledge.json"),
    JSON.stringify(surface.evidence.knowledge)
  );
}

async function testJudgmentProposalExecutionInvariants() {
  freshWorkspace();

  const surface = await runEos("Inspect src/a.js and judge whether X can be exposed.", {
    workspace,
    chatFn: chatFor([readA, declaredWithChange(changeProposal())]),
  });

  assert(
    "JP judgment commits declared with gated proposal",
    surface.status === "declared" &&
      surface.proposed_change !== undefined &&
      surface.proposed_change.rejected !== true &&
      surface.proposed_change.status === "proposed",
    JSON.stringify(surface.proposed_change)
  );

  assert(
    "JP proposal never self-authorized",
    surface.proposed_change.authorization === null
  );

  // Drive the actor lifecycle: authorization, execution, verification. EOS
  // records each; the actor and the adapter perform them.
  const changeId = surface.proposed_change.change_id;

  const authorized = authorizeChange(workspace, changeId, {
    actor: "engineer",
    rationale: "actor approved the proposal",
  });
  assert("JP actor authorizes", authorized.ok === true);

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
  assert("JP adapter executes the action", dispatched.ok === true);

  const checked = await verifyChange(workspace, changeId);
  assert(
    "JP EOS verifies by re-reading, not on the adapter's claim",
    checked.change.status === "verified",
    JSON.stringify(checked.change.status)
  );
}

async function testVerificationMemoryStateInvariants() {
  freshWorkspace();

  const surface = await runEos("Inspect src/a.js and judge whether X can be exposed.", {
    workspace,
    chatFn: chatFor([readA, declaredWithChange(changeProposal())]),
  });

  assert(
    "V memory block present with verification summary",
    surface.memory !== undefined &&
      surface.memory.schema === "eos-memory/v1" &&
      typeof surface.memory.verification === "object",
    JSON.stringify(surface.memory)
  );

  assert(
    "V engineering_state transition present",
    surface.engineering_state !== undefined &&
      surface.engineering_state.schema === "eos-engineering-state/v1" &&
      surface.engineering_state.to.judgment_id === surface.judgment_id,
    JSON.stringify(surface.engineering_state)
  );

  assert(
    "V review committed and chained to this judgment",
    loadReviews(workspace).some(
      ({ review }) => review.reviewed_judgment_id === surface.judgment_id
    )
  );

  const changes = loadChanges(workspace);
  assert("V change persisted to EOS ledger", changes.length === 1);
}

await testIdentityInvariants();
await testEpistemicInvariants();
await testInvestigationInvariants();
await testKnowledgeBoundaryInvariants();
await testJudgmentProposalExecutionInvariants();
await testVerificationMemoryStateInvariants();

if (failures > 0) {
  console.error(`${failures} architectural-invariant test(s) failed`);
  process.exit(1);
}

console.log("all architectural-invariant tests passed");
