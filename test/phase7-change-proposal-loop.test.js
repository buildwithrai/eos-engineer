import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/runtime/run.js";
import { sha256 } from "../src/projection/persistence.js";
import { verifyLineage } from "../src/projection/lineage.js";
import { loadReviews } from "../src/review.js";
import {
  loadChanges,
  authorizeChange,
  dispatchChange,
  verifyChange,
  verifyChangeLedger,
} from "../src/change.js";
import { EOS_RESPONSE_SCHEMA } from "../src/provider/ollama.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-test-workspace-change-proposal"
);

function freshWorkspace() {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "src", "a.js"), "export const a = 1;\n");
  fs.writeFileSync(path.join(workspace, "src", "b.js"), "export const b = 2;\n");
}

function changeProposal(overrides = {}) {
  return {
    target: "Expose X from src/a.js",
    objective: "Make X importable",
    scope: { changed: ["src/a.js"], created: [], unchanged: [] },
    predicates: [{ path: "src/a.js", contains: "X" }],
    restrictions: ["Do not modify other files"],
    requested_actor: "engineer",
    ...overrides,
  };
}

function judgmentItem(claim, type, evidenceRefs, overrides = {}) {
  return {
    claim,
    type,
    confidence: "high",
    evidence_refs: evidenceRefs,
    ...overrides,
  };
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

function declaredJudgment(evidenceRefs = ["src/a.js"], change = null) {
  return {
    type: "judgment",
    judgment: [judgmentItem("paths inspected", "declared", evidenceRefs)],
    restrictions: [],
    change,
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

async function testProposalCreatesProposedChange() {
  freshWorkspace();

  const surface = await runEos("Inspect src/a.js and judge whether X can be exposed.", {
    workspace,
    chatFn: chatFor([readA, declaredJudgment(["src/a.js"], changeProposal())]),
  });

  assert("P1 judgment commits declared", surface.status === "declared");
  assert("P1 change proposed on surface", surface.proposed_change !== undefined && surface.proposed_change.rejected !== true);
  assert("P1 proposed change is bound to the committed judgment", surface.proposed_change.source_judgment_id === surface.judgment_id);
  assert("P1 change starts proposed", surface.proposed_change.status === "proposed");
  assert("P1 change is never authorized by EOS", surface.proposed_change.authorization === null);
  assert("P1 requested actor recorded in contract", surface.proposed_change.contract.requested_actor === "engineer");
  assert("P1 scope normalized and grounded", surface.proposed_change.contract.scope.changed.includes("src/a.js"));
  assert("P1 change appears in surface evidence block", surface.evidence.changes.some((c) => c.id === surface.proposed_change.change_id));

  const changes = loadChanges(workspace);
  assert("P1 change persisted in the change ledger", changes.length === 1 && changes[0].change.status === "proposed");
  assert("P1 change ledger consistent", verifyChangeLedger(workspace).state === "consistent");
  assert("P1 judgment lineage unaffected", verifyLineage(workspace).state === "consistent" || verifyLineage(workspace).state === "none");
}

async function testCandidateProposalRejectedThenRetried() {
  freshWorkspace();

  const candidateWithChange = {
    type: "judgment",
    judgment: [judgmentItem("candidate claim", "candidate", ["src/a.js"])],
    restrictions: [],
    change: changeProposal(),
  };

  const surface = await runEos("Inspect src/a.js and judge whether X can be exposed.", {
    workspace,
    chatFn: chatFor([readA, candidateWithChange, declaredJudgment(["src/a.js"])]),
  });

  assert("P2 declared retry commits", surface.status === "declared");
  assert("P2 candidate change proposal never created", surface.proposed_change === undefined);
  assert("P2 no change persisted", loadChanges(workspace).length === 0);
}

async function testUngroundedScopeRejectedThenRetried() {
  freshWorkspace();

  const badScope = changeProposal({ scope: { changed: ["src/b.js"], created: [], unchanged: [] } });

  const surface = await runEos("Inspect src/a.js and judge whether X can be exposed.", {
    workspace,
    chatFn: chatFor([readA, declaredJudgment(["src/a.js"], badScope), declaredJudgment(["src/a.js"], changeProposal())]),
  });

  assert("P3 retry commits declared", surface.status === "declared");
  assert("P3 corrected proposal created", surface.proposed_change !== undefined && surface.proposed_change.rejected !== true);
  assert("P3 grounded scope used", surface.proposed_change.contract.scope.changed.includes("src/a.js"));
  assert("P3 ungrounded path not in scope", !surface.proposed_change.contract.scope.changed.includes("src/b.js"));
}

async function testCreatedPathAlreadyInspectedRejectedThenRetried() {
  freshWorkspace();

  const badCreated = changeProposal({ scope: { changed: [], created: ["src/a.js"], unchanged: [] } });

  const surface = await runEos("Inspect src/a.js and judge whether X can be exposed.", {
    workspace,
    chatFn: chatFor([readA, declaredJudgment(["src/a.js"], badCreated), declaredJudgment(["src/a.js"], changeProposal())]),
  });

  assert("P4 retry commits declared", surface.status === "declared");
  assert("P4 corrected proposal created", surface.proposed_change !== undefined && surface.proposed_change.rejected !== true);
  assert("P4 inspected file never a created path", surface.proposed_change.contract.scope.created.length === 0);
}

async function testBlockedJudgmentCannotCarryProposal() {
  freshWorkspace();

  const blockedWithChange = {
    type: "judgment",
    judgment: [judgmentItem("cannot judge", "blocked", ["src/a.js"])],
    restrictions: [],
    change: changeProposal(),
  };

  const surface = await runEos("Inspect src/a.js and judge whether X can be exposed.", {
    workspace,
    chatFn: chatFor([readA, blockedWithChange, declaredJudgment(["src/a.js"], changeProposal())]),
  });

  assert("P5 declared retry commits", surface.status === "declared");
  assert("P5 blocked proposal rejected, retry created", surface.proposed_change !== undefined && surface.proposed_change.rejected !== true);
  assert("P5 exactly one change persisted", loadChanges(workspace).length === 1);
}

async function testJudgmentWithoutProposalCreatesNothing() {
  freshWorkspace();

  const surface = await runEos("Inspect src/a.js and judge whether X can be exposed.", {
    workspace,
    chatFn: chatFor([readA, declaredJudgment(["src/a.js"])]),
  });

  assert("P6 committed without a proposal", surface.status === "declared");
  assert("P6 no proposed_change block", surface.proposed_change === undefined);
  assert("P6 no change persisted", loadChanges(workspace).length === 0);
}

async function testSchemaAdmitsChangeField() {
  const judgmentBranch = EOS_RESPONSE_SCHEMA.oneOf.find((b) => b.properties.type.const === "judgment");

  assert("P7 schema admits change field", judgmentBranch.properties.change !== undefined);
  assert("P7 change requires target/objective/scope", judgmentBranch.properties.change.required.join(",") === "target,objective,scope");
  assert("P7 scope requires changed/created/unchanged", judgmentBranch.properties.change.properties.scope.required.join(",") === "changed,created,unchanged");
  assert("P7 predicates schema present", judgmentBranch.properties.change.properties.predicates !== undefined);
  assert("P7 requested_actor admitted", judgmentBranch.properties.change.properties.requested_actor.type === "string");
}

async function testProposalConsumedByNextIteration() {
  freshWorkspace();

  const proposed = await runEos("Inspect src/a.js and judge whether X can be exposed.", {
    workspace,
    chatFn: chatFor([readA, declaredJudgment(["src/a.js"], changeProposal())]),
  });

  const changeId = proposed.proposed_change.change_id;

  const verified = await authorizeChange(workspace, changeId, { actor: "engineer", rationale: "approved after review" });
  assert("P8 actor authorizes", verified.ok === true && verified.change.status === "authorized");

  const adapter = {
    id: "fake",
    execute: async () => {
      const file = path.join(workspace, "src", "a.js");
      const content = fs.readFileSync(file, "utf8") + "export const X = 1;\n";
      fs.writeFileSync(file, content);
      return {
        adapter_id: "fake",
        claimed_changes: [{ path: "src/a.js", after_digest: sha256(content) }],
        verification: [{ kind: "unit", name: "x-exposed", outcome: "passed" }],
      };
    },
  };

  const executed = await dispatchChange(workspace, changeId, adapter);
  assert("P8 adapter executes the contract", executed.ok === true && executed.change.status === "executed");

  const checked = await verifyChange(workspace, changeId);
  assert("P8 EOS-observed verification succeeds", checked.change.status === "verified");

  let systemContent = null;
  let consumingCalls = 0;

  const surface = await runEos("Assess whether X is exposed in src/a.js.", {
    workspace,
    chatFn: async (messages) => {
      if (messages[0]?.role === "system") systemContent = messages[0].content;

      consumingCalls += 1;

      if (consumingCalls === 1) {
        return { content: JSON.stringify(readA) };
      }

      return {
        content: JSON.stringify({
          type: "judgment",
          judgment: [judgmentItem("X is exposed per the committed change", "declared", ["src/a.js", `change:${changeId}`])],
          restrictions: [],
        }),
      };
    },
  });

  assert("P8 consuming judgment chains lineage", surface.previous_judgment_id === proposed.judgment_id);
  assert("P8 consuming judgment commits declared", surface.status === "declared");
  assert("P8 change citable in the next iteration", (surface.judgment[0].evidence_refs ?? []).includes(`change:${changeId}`));
  assert("P8 substrate lists the change", systemContent !== null && systemContent.includes("ENGINEERING OUTCOME RECORDS") && systemContent.includes(`change:${changeId}`));

  const reviews = loadReviews(workspace);
  const latest = reviews[reviews.length - 1];
  assert("P8 review resolves the verified change forward", latest.review.outcome === "forward");
}

async function testNoParallelAgentCoupling() {
  const changeSource = fs.readFileSync(new URL("../src/change.js", import.meta.url), "utf8");
  const runSource = fs.readFileSync(new URL("../src/runtime/run.js", import.meta.url), "utf8");

  assert("P9 no opencode coupling in runtime wiring", !runSource.toLowerCase().includes("opencode") && !runSource.toLowerCase().includes("cline"));
  assert("P9 no run_command in change lifecycle", !changeSource.includes("run_command"));
}

async function main() {
  await testProposalCreatesProposedChange();
  await testCandidateProposalRejectedThenRetried();
  await testUngroundedScopeRejectedThenRetried();
  await testCreatedPathAlreadyInspectedRejectedThenRetried();
  await testBlockedJudgmentCannotCarryProposal();
  await testJudgmentWithoutProposalCreatesNothing();
  await testSchemaAdmitsChangeField();
  await testProposalConsumedByNextIteration();
  await testNoParallelAgentCoupling();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all phase7 change proposal loop tests passed");
}

main();
