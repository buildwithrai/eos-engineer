import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/runtime/run.js";
import { sha256 } from "../src/projection/persistence.js";
import { verifyLineage } from "../src/projection/lineage.js";
import {
  createChange,
  authorizeChange,
  dispatchChange,
  recordExecution,
  verifyChange,
  verifyChangeLedger,
  serializeChange,
  nodeFile,
  latestChangeFile,
} from "../src/change.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-test-workspace-change"
);

function freshWorkspace() {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "src", "a.js"), "export const a = 1;\n");
  fs.writeFileSync(path.join(workspace, "src", "b.js"), "export const b = 2;\n");
}

function chatForJudgment(type, paths = ["src/a.js"]) {
  let calls = 0;

  return async () => {
    calls += 1;

    const nextIndex = calls - 1;

    if (nextIndex < paths.length) {
      return {
        content: JSON.stringify({
          type: "tool",
          tool: "read_file",
          input: { path: paths[nextIndex] },
        }),
      };
    }

    return {
      content: JSON.stringify({
        type: "judgment",
        judgment: [
          {
            claim: "paths inspected",
            type,
            confidence: "high",
            evidence_refs: paths,
          },
        ],
      }),
    };
  };
}

async function establishJudgment(type = "declared", paths = ["src/a.js"]) {
  const surface = await runEos("Inspect src/a.js and judge it.", {
    workspace,
    chatFn: chatForJudgment(type, paths),
  });
  return surface;
}

function baseChangeInput(judgmentId, overrides = {}) {
  return {
    target: "Expose constant X from src/a.js",
    objective: "Make X importable",
    source_judgment_id: judgmentId,
    scope: { changed: ["src/a.js"], created: [], unchanged: [] },
    predicates: [{ path: "src/a.js", contains: "X" }],
    restrictions: ["Do not modify other files"],
    supersedes_change_id: null,
    ...overrides,
  };
}

function modifyA(append = "export const X = 1;\n") {
  const file = path.join(workspace, "src", "a.js");
  const before = fs.readFileSync(file, "utf8");
  const after = before + append;
  fs.writeFileSync(file, after);
  return { before, after, beforeDigest: sha256(before), afterDigest: sha256(after) };
}

function fakeAdapter({ id = "fake", behavior }) {
  return {
    id,
    execute: async (contract, root) => behavior(contract, root),
  };
}

const cleanAdapter = fakeAdapter({
  behavior: () => {
    const { afterDigest } = modifyA();
    return {
      adapter_id: "fake",
      claimed_changes: [{ path: "src/a.js", after_digest: afterDigest }],
      verification: [{ kind: "unit", name: "x-exposed", outcome: "passed" }],
      note: "added X export",
    };
  },
});

const noopAdapter = fakeAdapter({
  behavior: () => ({
    adapter_id: "fake",
    claimed_changes: [],
    verification: [],
  }),
});

const throwingAdapter = fakeAdapter({
  behavior: async () => {
    throw new Error("simulated adapter crash");
  },
});

const scopeBreachAdapter = fakeAdapter({
  behavior: () => ({
    adapter_id: "fake",
    claimed_changes: [{ path: "src/b.js", after_digest: "a".repeat(64) }],
    verification: [],
  }),
});

const invalidVerificationAdapter = fakeAdapter({
  behavior: () => ({
    adapter_id: "fake",
    claimed_changes: [{ path: "src/a.js", after_digest: "a".repeat(64) }],
    verification: [{ kind: "unit", name: "t", outcome: "definitely-passed" }],
  }),
});

const fabricatedClaimAdapter = fakeAdapter({
  behavior: () => {
    modifyA();
    return {
      adapter_id: "fake",
      claimed_changes: [{ path: "src/a.js", after_digest: "f".repeat(64) }],
      verification: [{ kind: "unit", name: "x-exposed", outcome: "passed" }],
    };
  },
});

const unchangedGuardrailAdapter = fakeAdapter({
  behavior: () => {
    const { afterDigest } = modifyA();
    fs.writeFileSync(path.join(workspace, "src", "b.js"), "export const b = 999;\n");
    return {
      adapter_id: "fake",
      claimed_changes: [{ path: "src/a.js", after_digest: afterDigest }],
      verification: [],
    };
  },
});

let failures = 0;

function assert(name, cond) {
  if (cond) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}`);
  }
}

async function testJudgmentGate() {
  freshWorkspace();

  const candidate = await establishJudgment("candidate");
  const candidateInput = baseChangeInput(candidate.judgment_id);
  const blocked = await establishJudgment("blocked");
  const blockedInput = baseChangeInput(blocked.judgment_id);

  const candidateResult = createChange(workspace, candidateInput);
  const blockedResult = createChange(workspace, blockedInput);

  assert("T1 candidate judgment cannot ground a change", candidateResult.ok === false);
  assert("T1 blocked judgment cannot ground a change", blockedResult.ok === false);
  assert("T1 rejection names the judgment", typeof candidateResult.message === "string" && candidateResult.message.includes("not declared"));
}

async function testScopeValidation() {
  freshWorkspace();

  const surface = await establishJudgment("declared");

  const missing = createChange(workspace, baseChangeInput(surface.judgment_id, { scope: { changed: ["src/nope.js"], created: [], unchanged: [] } }));
  assert("T2 changed path outside inspected evidence rejected", missing.ok === false);

  const createdExisting = createChange(workspace, baseChangeInput(surface.judgment_id, { scope: { changed: [], created: ["src/a.js"], unchanged: [] } }));
  assert("T2 created path already inspected rejected", createdExisting.ok === false);

  const emptyScope = createChange(workspace, baseChangeInput(surface.judgment_id, { scope: { changed: [], created: [], unchanged: [] } }));
  assert("T2 empty scope rejected", emptyScope.ok === false);

  const predicateOutside = createChange(workspace, baseChangeInput(surface.judgment_id, { predicates: [{ path: "src/b.js", contains: "X" }] }));
  assert("T2 predicate path outside editable scope rejected", predicateOutside.ok === false);

  const duplicate = createChange(workspace, baseChangeInput(surface.judgment_id, { scope: { changed: ["src/a.js"], created: ["src/a.js"], unchanged: [] } }));
  assert("T2 duplicated scope path rejected", duplicate.ok === false);

  const good = createChange(workspace, baseChangeInput(surface.judgment_id));
  assert("T2 grounded change accepted", good.ok === true);
  assert("T2 change starts proposed", good.change.status === "proposed");
  assert("T2 change carries contract schema", good.change.contract.schema === "eos-change-contract/v1");
}

async function testAuthorizationGate() {
  freshWorkspace();

  const surface = await establishJudgment("declared");
  const created = createChange(workspace, baseChangeInput(surface.judgment_id));

  const noActor = authorizeChange(workspace, created.change.change_id, { actor: "", rationale: "because" });
  assert("T3 authorization requires an actor", noActor.ok === false);

  const noRationale = authorizeChange(workspace, created.change.change_id, { actor: "engineer", rationale: "" });
  assert("T3 authorization requires a rationale", noRationale.ok === false);

  const authorized = authorizeChange(workspace, created.change.change_id, { actor: "engineer", rationale: "approved after review" });
  assert("T3 valid authorization accepted", authorized.ok === true);
  assert("T3 status authorized", authorized.change.status === "authorized");
  assert("T3 authorization recorded", authorized.change.authorization.actor === "engineer" && authorized.change.authorization.rationale.includes("approved"));

  const double = authorizeChange(workspace, created.change.change_id, { actor: "engineer", rationale: "again" });
  assert("T3 double authorization rejected", double.ok === false);
}

async function testDispatchHandsContract() {
  freshWorkspace();

  const surface = await establishJudgment("declared");
  const created = createChange(workspace, baseChangeInput(surface.judgment_id));
  const authorized = authorizeChange(workspace, created.change.change_id, { actor: "engineer", rationale: "approved" });

  let received = null;

  const adapter = fakeAdapter({
    behavior: async (contract) => {
      received = contract;
      const { afterDigest } = modifyA();
      return {
        adapter_id: "fake",
        claimed_changes: [{ path: "src/a.js", after_digest: afterDigest }],
        verification: [{ kind: "unit", name: "x-exposed", outcome: "passed" }],
      };
    },
  });

  const dispatched = await dispatchChange(workspace, created.change.change_id, adapter);

  assert("T4 dispatch accepted", dispatched.ok === true);
  assert("T4 change executed", dispatched.change.status === "executed");
  assert("T4 attempt recorded", dispatched.change.attempts.length === 1 && dispatched.change.attempts[0].outcome === "executed");
  assert("T4 contract handed to adapter", received !== null && received.change_id === created.change.change_id);
  assert("T4 contract carries authorization", received.authorization !== null && received.authorization.actor === "engineer");
  assert("T4 contract carries scope", received.scope.changed.includes("src/a.js"));
  assert("T4 report bound to attempt", dispatched.change.attempts[0].report !== null);
}

async function testReportWithoutEvidenceRejected() {
  freshWorkspace();

  const surface = await establishJudgment("declared");
  const created = createChange(workspace, baseChangeInput(surface.judgment_id));
  const authorized = authorizeChange(workspace, created.change.change_id, { actor: "engineer", rationale: "approved" });

  const dispatched = await dispatchChange(workspace, created.change.change_id, noopAdapter);

  assert("T5 empty report rejected", dispatched.ok === false);
  assert("T5 change remains executing", dispatched.change.status === "executing");
  assert("T5 attempt failed but recoverable", dispatched.change.attempts[0].outcome === "failed");
  assert("T5 rejection mentions claimed changes", dispatched.message.includes("claimed changes"));
}

async function testFabricatedVerificationRejected() {
  freshWorkspace();

  const surface = await establishJudgment("declared");
  const created = createChange(workspace, baseChangeInput(surface.judgment_id));
  await authorizeChange(workspace, created.change.change_id, { actor: "engineer", rationale: "approved" });

  const breach = await dispatchChange(workspace, created.change.change_id, scopeBreachAdapter);
  assert("T6 scope-breach claim rejected", breach.ok === false);
  assert("T6 breach change resumable", breach.change.status === "executing");

  const badVerification = await dispatchChange(workspace, created.change.change_id, invalidVerificationAdapter);
  assert("T6 invalid verification outcome rejected", badVerification.ok === false);
  assert("T6 invalid verification resumable", badVerification.change.status === "executing");
}

async function testVerificationDistinctFromExecution() {
  freshWorkspace();

  const surface = await establishJudgment("declared");
  const created = createChange(workspace, baseChangeInput(surface.judgment_id));
  await authorizeChange(workspace, created.change.change_id, { actor: "engineer", rationale: "approved" });

  const dispatched = await dispatchChange(workspace, created.change.change_id, cleanAdapter);

  const verified = await verifyChange(workspace, created.change.change_id);

  assert("T7 change verified", verified.ok === true);
  assert("T7 verdict verified", verified.change.status === "verified");
  assert("T7 verification recorded", verified.change.verification !== null && verified.change.verification.verdict === "verified");
  assert("T7 changed finding present", verified.change.verification.findings.some((f) => f.expectation === "changed" && f.ok));
  assert("T7 claimed finding present", verified.change.verification.findings.some((f) => f.expectation === "claimed" && f.ok));
  assert("T7 EOS-observed evidence recorded", verified.change.verification.evidence.some((e) => e.path === "src/a.js" && e.exists));
  assert("T7 verification is distinct from execution", verified.change.verification.verified_at !== dispatched.change.attempts[0].dispatched_at || verified.change.status === "verified");
}

async function testFabricatedClaimFails() {
  freshWorkspace();

  const surface = await establishJudgment("declared");
  const created = createChange(workspace, baseChangeInput(surface.judgment_id));
  await authorizeChange(workspace, created.change.change_id, { actor: "engineer", rationale: "approved" });

  await dispatchChange(workspace, created.change.change_id, fabricatedClaimAdapter);

  const verified = await verifyChange(workspace, created.change.change_id);

  assert("T8 fabricated claim does not verify", verified.ok === true);
  assert("T8 verdict failed", verified.change.status === "failed");
  assert("T8 claimed finding flagged", verified.change.verification.findings.some((f) => f.expectation === "claimed" && !f.ok));
}

async function testFailedExecutionRecoverable() {
  freshWorkspace();

  const surface = await establishJudgment("declared");
  const created = createChange(workspace, baseChangeInput(surface.judgment_id));
  await authorizeChange(workspace, created.change.change_id, { actor: "engineer", rationale: "approved" });

  const first = await dispatchChange(workspace, created.change.change_id, throwingAdapter);

  assert("T9 adapter failure recorded", first.ok === false);
  assert("T9 failure leaves change executing", first.change.status === "executing");
  assert("T9 failed attempt retained", first.change.attempts[0].outcome === "failed");

  const second = await dispatchChange(workspace, created.change.change_id, cleanAdapter);

  assert("T9 resume accepted", second.ok === true);
  assert("T9 resumed attempt executed", second.change.status === "executed");
  assert("T9 attempt history preserved", second.change.attempts.length === 2 && second.change.attempts[0].outcome === "failed" && second.change.attempts[1].outcome === "executed");

  const verified = await verifyChange(workspace, created.change.change_id);
  assert("T9 resumed change verifies", verified.change.status === "verified");
}

async function testInterruptResumeAbortsPending() {
  freshWorkspace();

  const surface = await establishJudgment("declared");
  const created = createChange(workspace, baseChangeInput(surface.judgment_id));
  const authorized = authorizeChange(workspace, created.change.change_id, { actor: "engineer", rationale: "approved" });

  const pendingAttempt = {
    attempt_id: "interrupted-attempt",
    adapter_id: "fake",
    dispatched_at: new Date().toISOString(),
    pre_state: [{ path: "src/a.js", exists: true, digest: sha256(fs.readFileSync(path.join(workspace, "src", "a.js"), "utf8")) }],
    outcome: "pending",
    report: null,
    report_digest: null,
    error: null,
  };

  const pendingNode = {
    ...authorized.change,
    seq: authorized.change.seq + 1,
    event: "dispatched",
    status: "executing",
    at: new Date().toISOString(),
    prev_digest: sha256(serializeChange(authorized.change)),
    attempts: [...authorized.change.attempts, pendingAttempt],
  };

  fs.mkdirSync(path.dirname(nodeFile(workspace, created.change.change_id, pendingNode.seq)), { recursive: true });
  fs.writeFileSync(nodeFile(workspace, created.change.change_id, pendingNode.seq), serializeChange(pendingNode));
  fs.writeFileSync(latestChangeFile(workspace), serializeChange(pendingNode));

  const resumed = await dispatchChange(workspace, created.change.change_id, cleanAdapter);

  assert("T10 resume from interrupted dispatch accepted", resumed.ok === true);
  assert("T10 interrupted attempt aborted", resumed.change.attempts[0].outcome === "aborted");
  assert("T10 fresh attempt executed", resumed.change.attempts[1].outcome === "executed" && resumed.change.status === "executed");
}

async function testStaleIntakeRejected() {
  freshWorkspace();

  const surface = await establishJudgment("declared");
  const created = createChange(workspace, baseChangeInput(surface.judgment_id));
  await authorizeChange(workspace, created.change.change_id, { actor: "engineer", rationale: "approved" });

  const dispatched = await dispatchChange(workspace, created.change.change_id, cleanAdapter);

  const stale = await recordExecution(workspace, created.change.change_id, dispatched.change.attempts[0].attempt_id, {
    adapter_id: "fake",
    claimed_changes: [{ path: "src/a.js", after_digest: "a".repeat(64) }],
    verification: [],
  });

  assert("T10 stale execution report rejected", stale.ok === false);
  assert("T10 stale intake rejected as not pending", stale.message.includes("not pending") || stale.message.includes("cannot record execution"));
}

async function testCreatedFileHandling() {
  freshWorkspace();

  const surface = await establishJudgment("declared");
  const created = createChange(workspace, baseChangeInput(surface.judgment_id, {
    target: "Introduce src/new.js",
    objective: "Expose a helper",
    scope: { changed: [], created: ["src/new.js"], unchanged: [] },
    predicates: [{ path: "src/new.js", contains: "helper" }],
  }));

  const adapter = fakeAdapter({
    behavior: () => {
      const content = "export const helper = () => 1;\n";
      fs.writeFileSync(path.join(workspace, "src", "new.js"), content);
      return {
        adapter_id: "fake",
        claimed_changes: [{ path: "src/new.js", after_digest: sha256(content) }],
        verification: [],
      };
    },
  });

  await authorizeChange(workspace, created.change.change_id, { actor: "engineer", rationale: "approved" });
  await dispatchChange(workspace, created.change.change_id, adapter);

  const verified = await verifyChange(workspace, created.change.change_id);

  assert("T12 created file verified", verified.change.status === "verified");
  assert("T12 created finding present", verified.change.verification.findings.some((f) => f.expectation === "created" && f.ok));
  assert("T12 predicate finding present", verified.change.verification.findings.some((f) => f.expectation === "predicate" && f.ok));
}

async function testUnchangedGuardrail() {
  freshWorkspace();

  const surface = await establishJudgment("declared", ["src/a.js", "src/b.js"]);
  const created = createChange(workspace, baseChangeInput(surface.judgment_id, {
    scope: { changed: ["src/a.js"], created: [], unchanged: ["src/b.js"] },
  }));

  await authorizeChange(workspace, created.change.change_id, { actor: "engineer", rationale: "approved" });
  await dispatchChange(workspace, created.change.change_id, unchangedGuardrailAdapter);

  const verified = await verifyChange(workspace, created.change.change_id);

  assert("T13 out-of-contract modification detected", verified.change.status === "failed");
  assert("T13 unchanged finding flagged", verified.change.verification.findings.some((f) => f.expectation === "unchanged" && !f.ok));
}

async function testSupersedeFailedChange() {
  freshWorkspace();

  const surface = await establishJudgment("declared");
  const first = createChange(workspace, baseChangeInput(surface.judgment_id));
  await authorizeChange(workspace, first.change.change_id, { actor: "engineer", rationale: "approved" });
  await dispatchChange(workspace, first.change.change_id, fabricatedClaimAdapter);
  await verifyChange(workspace, first.change.change_id);

  const supersedingDeclared = await establishJudgment("declared");
  const superseding = createChange(workspace, baseChangeInput(supersedingDeclared.judgment_id, {
    supersedes_change_id: first.change.change_id,
  }));

  assert("T11 failed change supersede accepted", superseding.ok === true);
  assert("T11 supersedes recorded", superseding.change.contract.supersedes_change_id === first.change.change_id);

  const nonTerminal = await establishJudgment("declared");
  const second = createChange(workspace, baseChangeInput(nonTerminal.judgment_id, {
    supersedes_change_id: first.change.change_id,
    target: "independent successor change",
  }));
  assert("T11 failed change may have multiple supersedes", second.ok === true);

  const pendingChange = await establishJudgment("declared");
  const pendingSupersede = createChange(workspace, baseChangeInput(pendingChange.judgment_id, {
    supersedes_change_id: superseding.change.change_id,
  }));
  assert("T11 non-failed change cannot be superseded", pendingSupersede.ok === false);
  assert("T11 rejection names supersede status", pendingSupersede.message.includes("only a failed change"));
}

async function testLedgerIntegrityAfterLifecycle() {
  freshWorkspace();

  const surface = await establishJudgment("declared");
  const created = createChange(workspace, baseChangeInput(surface.judgment_id));
  await authorizeChange(workspace, created.change.change_id, { actor: "engineer", rationale: "approved" });
  await dispatchChange(workspace, created.change.change_id, cleanAdapter);
  await verifyChange(workspace, created.change.change_id);

  const ledger = verifyChangeLedger(workspace);
  assert("T13 change ledger consistent after lifecycle", ledger.state === "consistent");
  assert("T13 ledger exposes verified change", ledger.changes.length === 1 && ledger.changes[0].change.status === "verified");
  const lineage = verifyLineage(workspace);
  assert("T13 judgment lineage untouched by change ledger", lineage.state === "consistent" || lineage.state === "none");
}

async function testNoExecutionPrimitive() {
  freshWorkspace();

  const changeSource = fs.readFileSync(new URL("../src/change.js", import.meta.url), "utf8");
  const executionSource = fs.readFileSync(new URL("../src/execution.js", import.meta.url), "utf8");
  const loopSource = fs.readFileSync(new URL("../src/runtime/run.js", import.meta.url), "utf8");

  assert("T14 no opencode coupling in change.js", !changeSource.toLowerCase().includes("opencode") && !changeSource.toLowerCase().includes("cline"));
  assert("T14 no opencode coupling in execution.js", !executionSource.toLowerCase().includes("opencode") && !executionSource.toLowerCase().includes("cline"));
  assert("T14 no opencode coupling in runtime loop", !loopSource.toLowerCase().includes("opencode") && !loopSource.toLowerCase().includes("cline"));
  assert("T14 EOS never runs commands", !changeSource.includes("run_command") && !executionSource.includes("run_command"));
}

async function main() {
  await testJudgmentGate();
  await testScopeValidation();
  await testAuthorizationGate();
  await testDispatchHandsContract();
  await testReportWithoutEvidenceRejected();
  await testFabricatedVerificationRejected();
  await testVerificationDistinctFromExecution();
  await testFabricatedClaimFails();
  await testFailedExecutionRecoverable();
  await testInterruptResumeAbortsPending();
  await testStaleIntakeRejected();
  await testCreatedFileHandling();
  await testUnchangedGuardrail();
  await testSupersedeFailedChange();
  await testLedgerIntegrityAfterLifecycle();
  await testNoExecutionPrimitive();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all phase4 engineering change tests passed");
}

main();
