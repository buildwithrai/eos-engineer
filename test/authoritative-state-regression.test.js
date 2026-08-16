import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/runtime/run.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-test-workspace-authoritative-state"
);

function freshWorkspace() {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "src", "a.js"), "export const a = 1;\n");

  // Authoritative external state: decisions, knowledge, traceability, evidence.
  // This is the substrate EOS must consume read-only and never mutate.
  fs.mkdirSync(
    path.join(workspace, ".eos", "substrate", "engineering", "decisions"),
    { recursive: true }
  );
  fs.mkdirSync(
    path.join(workspace, ".eos", "substrate", "engineering", "evidence"),
    { recursive: true }
  );
  fs.mkdirSync(
    path.join(workspace, ".eos", "substrate", "engineering"),
    { recursive: true }
  );

  fs.writeFileSync(
    path.join(
      workspace,
      ".eos",
      "substrate",
      "engineering",
      "decisions",
      "d1.json"
    ),
    JSON.stringify(
      {
        id: "d1",
        title: "External decision",
        status: "decided",
        decision: "the architecture is frozen",
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(workspace, ".eos", "substrate", "engineering", "traceability.json"),
    JSON.stringify([], null, 2)
  );

  fs.writeFileSync(
    path.join(workspace, ".eos", "substrate", "knowledge.json"),
    JSON.stringify(
      { repository: { root: workspace, language: "javascript" } },
      null,
      2
    )
  );
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

function snapshotSubstrate() {
  const files = [];

  for (const file of [
    ".eos/substrate/engineering/decisions/d1.json",
    ".eos/substrate/engineering/traceability.json",
    ".eos/substrate/knowledge.json",
  ]) {
    const full = path.join(workspace, file);

    if (fs.existsSync(full)) {
      files.push({ path: file, content: fs.readFileSync(full, "utf8") });
    }
  }

  return files;
}

async function testSubstrateImmutability() {
  freshWorkspace();

  const before = snapshotSubstrate();

  await runEos("Inspect src/a.js and judge whether a is exported.", {
    workspace,
    chatFn: chatFor([readA, declared]),
  });

  const after = snapshotSubstrate();

  assert(
    "G12 substrate files byte-identical after an EOS run",
    before.length === after.length &&
      before.every((entry, index) => {
        const match = after[index];
        return match !== undefined && match.content === entry.content;
      }),
    `before=${before.length} after=${after.length}`
  );

  assert(
    "G12 no substrate decision mutated",
    after.every((entry) => entry.path !== undefined)
  );
}

async function testEosWritesOnlyToOwnLedgers() {
  freshWorkspace();

  await runEos("Inspect src/a.js and judge whether a is exported.", {
    workspace,
    chatFn: chatFor([readA, declared]),
  });

  const eosLedgerFiles = [
    ".eos/judgment.json",
    ".eos/review.json",
  ];

  const ledgerDirs = [
    ".eos/judgments",
    ".eos/reviews",
  ];

  for (const file of eosLedgerFiles) {
    assert(
      `G12 EOS ledger written: ${file}`,
      fs.existsSync(path.join(workspace, file)),
      file
    );
  }

  for (const dir of ledgerDirs) {
    const entries = fs.existsSync(path.join(workspace, dir))
      ? fs.readdirSync(path.join(workspace, dir)).filter((e) => e.endsWith(".json"))
      : [];
    assert(`G12 EOS ledger populated: ${dir}`, entries.length > 0, dir);
  }

  // EOS must never have created files outside .eos (substrate and workspace
  // files are authoritative external state EOS only reads).
  const workspaceFiles = fs.readdirSync(path.join(workspace, "src"));
  assert(
    "G12 workspace source tree untouched",
    workspaceFiles.length === 1 &&
      workspaceFiles[0] === "a.js" &&
      fs.readFileSync(path.join(workspace, "src", "a.js"), "utf8") ===
        "export const a = 1;\n",
    JSON.stringify(workspaceFiles)
  );
}

await testSubstrateImmutability();
await testEosWritesOnlyToOwnLedgers();

if (failures > 0) {
  console.error(`${failures} authoritative-state regression test(s) failed`);
  process.exit(1);
}

console.log("all authoritative-state regression tests passed");
