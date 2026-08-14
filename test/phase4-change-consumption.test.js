import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/loop.js";
import { verifyLineage, sha256 } from "../src/lineage.js";
import { loadReviews, resolveRefOutcome } from "../src/review.js";
import {
  createChange,
  authorizeChange,
  dispatchChange,
  verifyChange,
  verifyChangeLedger,
} from "../src/change.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-test-workspace-change-consumption"
);

function freshWorkspace() {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "src", "a.js"), "export const a = 1;\n");
}

function judgeChat(paths, judgmentType = "declared") {
  let calls = 0;

  return async (messages) => {
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
            type: judgmentType,
            confidence: "high",
            evidence_refs: paths,
          },
        ],
      }),
    };
  };
}

function judgeChatThen(finalResponse) {
  let calls = 0;

  return async () => {
    calls += 1;

    if (calls === 1) {
      return {
        content: JSON.stringify({ type: "tool", tool: "read_file", input: { path: "src/a.js" } }),
      };
    }

    return { content: JSON.stringify(finalResponse) };
  };
}

function makeVerifiedChange() {
  return {
    id: "fake",
    execute: async () => {
      const aFile = path.join(workspace, "src", "a.js");
      const content = fs.readFileSync(aFile, "utf8") + "export const X = 1;\n";
      fs.writeFileSync(aFile, content);

      return {
        adapter_id: "fake",
        claimed_changes: [{ path: "src/a.js", after_digest: sha256(content) }],
        verification: [{ kind: "unit", name: "x", outcome: "passed" }],
      };
    },
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

async function establishVerifiedChange() {
  const surface = await runEos("Inspect src/a.js and judge it.", {
    workspace,
    chatFn: judgeChat(["src/a.js"]),
  });

  const created = createChange(workspace, {
    target: "Expose X from src/a.js",
    objective: "Make X importable",
    source_judgment_id: surface.judgment_id,
    scope: { changed: ["src/a.js"], created: [], unchanged: [] },
    predicates: [{ path: "src/a.js", contains: "X" }],
    restrictions: [],
    supersedes_change_id: null,
  });

  await authorizeChange(workspace, created.change.change_id, { actor: "engineer", rationale: "approved" });
  await dispatchChange(workspace, created.change.change_id, makeVerifiedChange());
  const verified = await verifyChange(workspace, created.change.change_id);

  return { judgmentId: surface.judgment_id, changeId: created.change.change_id, verified };
}

async function testVerifiedChangeCitable() {
  freshWorkspace();

  const { judgmentId, changeId } = await establishVerifiedChange();

  let systemContent = null;

  const chatFn = judgeChatThen({
    type: "judgment",
    judgment: [
      {
        claim: "X is exposed per the committed change",
        type: "declared",
        confidence: "high",
        evidence_refs: ["src/a.js", `change:${changeId}`],
      },
    ],
  });

  const surface = await runEos("Assess whether X is exposed in src/a.js.", {
    workspace,
    chatFn: async (messages) => {
      if (messages[0]?.role === "system") systemContent = messages[0].content;
      return chatFn(messages);
    },
  });

  const refs = surface.judgment[0].evidence_refs ?? [];

  assert("C1 verified change citable as change:<id>", refs.some((ref) => ref === `change:${changeId}`));
  assert("C1 canonicalized change ref preserved", refs.includes(`change:${changeId}`));
  assert("C1 judgment committed as declared", surface.status === "declared");
  assert("C1 substrate lists change records", systemContent !== null && systemContent.includes("ENGINEERING OUTCOME RECORDS") && systemContent.includes(`change:${changeId}`));

  const reviews = loadReviews(workspace);
  const latest = reviews[reviews.length - 1];

  assert("C1 review resolves verified change forward", latest.review.outcome === "forward");
}

async function testFabricatedChangeRefRejected() {
  freshWorkspace();

  await runEos("Inspect src/a.js and judge it.", {
    workspace,
    chatFn: judgeChat(["src/a.js"]),
  });

  const surface = await runEos("Assess src/a.js.", {
    workspace,
    maxIterations: 2,
    chatFn: judgeChatThen(() => ({
      type: "judgment",
      judgment: [
        {
          claim: "cites fabricated change",
          type: "declared",
          confidence: "high",
          evidence_refs: ["src/a.js", "change:does-not-exist"],
        },
      ],
    })),
  });

  assert("C2 fabricated change ref never commits", surface.judgment.every((item) => !(item.evidence_refs ?? []).includes("change:does-not-exist")));
  assert("C2 fallback judgment committed", surface.judgment[0].claim.includes("iteration limit"));
}

async function testRefOutcomeMapping() {
  freshWorkspace();

  const verifiedNode = { change_id: "c-verified", status: "verified", contract: { target: "t" } };
  const failedNode = { change_id: "c-failed", status: "failed", contract: { target: "t" } };
  const proposedNode = { change_id: "c-proposed", status: "proposed", contract: { target: "t" } };
  const executingNode = { change_id: "c-executing", status: "executing", contract: { target: "t" } };

  const context = {
    workspaceRoot: workspace,
    evidenceItems: [],
    knowledge: undefined,
    reviews: [],
    changes: [
      { change: verifiedNode, source: "x", digest: "a" },
      { change: failedNode, source: "x", digest: "a" },
      { change: proposedNode, source: "x", digest: "a" },
      { change: executingNode, source: "x", digest: "a" },
    ],
  };

  assert("C3 verified change resolves forward", resolveRefOutcome("change:c-verified", context).outcome === "forward");
  assert("C3 failed change resolves regression", resolveRefOutcome("change:c-failed", context).outcome === "regression");
  assert("C3 proposed change resolves unresolved", resolveRefOutcome("change:c-proposed", context).outcome === "unresolved");
  assert("C3 executing change resolves unresolved", resolveRefOutcome("change:c-executing", context).outcome === "unresolved");
  assert("C3 unknown change resolves unresolved", resolveRefOutcome("change:c-missing", context).outcome === "unresolved");
}

async function testLedgerAndLineageIntegrity() {
  freshWorkspace();

  const { judgmentId } = await establishVerifiedChange();

  const ledger = verifyChangeLedger(workspace);
  assert("C4 change ledger consistent", ledger.state === "consistent");
  assert("C4 ledger reports verified change", ledger.latest !== undefined);

  const lineage = verifyLineage(workspace);
  assert("C4 judgment lineage intact after change ledger", lineage.state !== "inconsistent");

  const surface = await runEos("Assess whether X is exposed in src/a.js.", {
    workspace,
    chatFn: judgeChat(["src/a.js"]),
  });

  assert("C5 consuming judgment chains lineage", surface.previous_judgment_id === judgmentId);
  assert("C5 judgment lineage still consistent", verifyLineage(workspace).state === "consistent");
}

async function main() {
  await testVerifiedChangeCitable();
  await testFabricatedChangeRefRejected();
  await testRefOutcomeMapping();
  await testLedgerAndLineageIntegrity();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all phase4 change consumption tests passed");
}

main();
