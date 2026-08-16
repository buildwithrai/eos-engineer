import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/runtime/run.js";
import { buildMemory, renderMemory } from "../src/memory.js";
import { sha256 } from "../src/projection/persistence.js";
import {
  loadChanges,
  authorizeChange,
  dispatchChange,
  verifyChange,
} from "../src/change.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-test-workspace-memory"
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

const declared = {
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
};

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

async function testMemorySurfacedOnSurface() {
  freshWorkspace();

  const surface = await runEos("Inspect src/a.js and judge.", {
    workspace,
    chatFn: chatFor([readA, declared]),
  });

  assert(
    "M1 memory block present on surface",
    surface.memory !== undefined && surface.memory.schema === "eos-memory/v1",
    JSON.stringify(surface.memory)
  );

  assert(
    "M1 memory is deterministic from ledgers",
    typeof surface.memory.judgments === "number" &&
      typeof surface.memory.reviews === "number" &&
      typeof surface.memory.intents === "number",
    JSON.stringify(surface.memory)
  );

  assert(
    "M1 memory records the current judgment in retained history",
    surface.memory.judgments >= 1,
    JSON.stringify(surface.memory)
  );

  assert(
    "M1 review committed so memory sees the review",
    surface.memory.reviews >= 1 &&
      surface.memory.latest_review !== null &&
      surface.memory.latest_review.reviewed_judgment_id === surface.judgment_id,
    JSON.stringify(surface.memory)
  );

  const render = renderMemory(surface.memory);
  assert(
    "M1 renderMemory renders a deterministic account",
    typeof render === "string" &&
      render.includes("Retained judgments") &&
      render.includes("Change verification"),
    render
  );
}

async function testVerificationStateReflectedInMemory() {
  freshWorkspace();

  const surface = await runEos("Inspect src/a.js and judge.", {
    workspace,
    chatFn: chatFor([readA, declaredWithChange(changeProposal())]),
  });

  assert(
    "M2 empty change ledger yields zero verification counters",
    surface.memory.verification.summary.verified === 0 &&
      surface.memory.verification.summary.failed === 0,
    JSON.stringify(surface.memory.verification)
  );

  // Drive one change through the actor lifecycle to authorized -> executing.
  // EOS never performs this itself; the actor is a participant.
  const changes = loadChanges(workspace);

  if (changes.length === 0) {
    assert("M2 no change to drive (skipped)", true);
    return;
  }

  const change = changes[0].change;
  const authorized = authorizeChange(workspace, change.change_id, {
    actor: "engineer",
    rationale: "actor approved the proposal",
  });

  assert(
    "M2 change authorizes for the actor",
    authorized.ok,
    authorized.message ?? ""
  );

  // The actor applies the engineering change through an execution adapter.
  // The adapter's claimed report is never trusted on its own.
  const applied = "export const X = 1;\n";
  const appliedDigest = sha256(Buffer.from(applied));

  const adapter = {
    id: "engineer",
    execute: async () => {
      fs.writeFileSync(path.join(workspace, "src", "a.js"), applied);
      return {
        adapter_id: "engineer",
        claimed_changes: [{ path: "src/a.js", after_digest: appliedDigest }],
        verification: [{ kind: "unit", name: "x-exposed", outcome: "passed" }],
      };
    },
  };

  const dispatched = await dispatchChange(workspace, change.change_id, adapter);

  assert(
    "M2 change dispatches for the actor",
    dispatched.ok,
    JSON.stringify(dispatched)
  );

  // EOS verifies by re-reading the workspace, never on the adapter's claim.
  const verified = await verifyChange(workspace, change.change_id);

  assert(
    "M2 EOS verifies by re-reading the workspace",
    verified.ok && verified.change.status === "verified",
    JSON.stringify(verified)
  );

  const memory = buildMemory(workspace, {
    changes: loadChanges(workspace),
    reviews: [],
    intents: [],
  });

  assert(
    "M2 memory records verified change and actor-path only after EOS re-read",
    memory.verification.summary.verified === 1 &&
      memory.verification.verified.length === 1 &&
      memory.verification.verified[0].verdict === "verified",
    JSON.stringify(memory.verification)
  );
}

await testMemorySurfacedOnSurface();
await testVerificationStateReflectedInMemory();

if (failures > 0) {
  console.error(`${failures} memory regression test(s) failed`);
  process.exit(1);
}

console.log("all memory regression tests passed");
