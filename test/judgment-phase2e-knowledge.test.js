import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { runEos } from "../src/runtime/run.js";
import { loadKnowledge } from "../src/investigation/evidence.js";
import {
  buildKnowledgeProjection,
  isKnowledgeRef,
  isKnowledgeEntityRef,
  resolveKnowledgeEntityRef,
} from "../src/knowledge.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-phase2e-knowledge"
);

let failures = 0;

function assert(name, condition, detail = "") {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}${detail ? ` :: ${detail}` : ""}`);
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

function writeKnowledge(overrides = {}) {
  const knowledge = {
    generatedAt: "2026-08-09T18:30:40.616Z",
    repository: {
      root: workspace,
      packages: ["@ewa/agent", "@ewa/workspace"],
      sourceFiles: 3,
      testFiles: 1,
      readmes: 1,
      scripts: 0,
      sourceFilePaths: ["src/index.ts", "src/util.ts", "src/agent.ts"],
      testFilePaths: ["test/agent.test.ts"],
      readmePaths: ["README.md"],
      packageJsonPaths: ["package.json", "packages/agent/package.json"],
      scriptPaths: [],
    },
    symbols: [
      { name: "Agent", kind: "class", file: "src/index.ts" },
      { name: "buildIndex", kind: "function", file: "src/util.ts" },
    ],
    imports: [
      { file: "src/index.ts", specifier: "./util", resolvedFile: "src/util.ts" },
    ],
    exports: [{ file: "src/index.ts", symbol: "Agent" }],
    packageDependencies: [
      { package: "@ewa/agent", dependency: "@ewa/workspace" },
    ],
    ...overrides,
  };

  fs.writeFileSync(
    path.join(workspace, ".eos", "substrate", "knowledge.json"),
    JSON.stringify(knowledge, null, 2) + "\n"
  );
}

function freshWorkspace(withKnowledge = true) {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspace, ".eos", "substrate"), { recursive: true });
  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "src", "index.ts"), "export class Agent {}\n");
  fs.writeFileSync(path.join(workspace, "src", "util.ts"), "export function buildIndex() {}\n");

  if (withKnowledge) writeKnowledge();
}

async function runWithResponses(userInput, responses, options = {}) {
  let calls = 0;

  const chatFn = async () => {
    const response = responses[Math.min(calls, responses.length - 1)];
    calls += 1;
    return { content: JSON.stringify(response) };
  };

  const surface = await runEos(userInput, {
    workspace,
    chatFn,
    maxIterations: options.maxIterations ?? 10,
  });

  return { surface, calls };
}

function snapshot(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort().flatMap((f) => {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isFile()) {
      return [{ name: f, content: fs.readFileSync(full, "utf8") }];
    }
    return [];
  });
}

async function testProjectionBlock() {
  freshWorkspace();

  let seenPrompt = "";
  const fakeChat = async (messages) => {
    seenPrompt = messages[0].content;
    return { content: JSON.stringify(judgment("candidate", ["symbol:Agent"])) };
  };

  const surface = await runEos("Judge the repository knowledge.", {
    workspace,
    chatFn: fakeChat,
  });

  assert("REPOSITORY KNOWLEDGE block present", seenPrompt.includes("REPOSITORY KNOWLEDGE"));
  assert("projection header lists packages", seenPrompt.includes("Packages: @ewa/agent, @ewa/workspace"));
  assert("projection header lists source count", seenPrompt.includes("Source files: 3"));
  assert("projection header lists symbol count", seenPrompt.includes("Symbols: 2"));
  assert("PACKAGES section present", seenPrompt.includes("PACKAGES\n- @ewa/agent\n- @ewa/workspace"));
  assert("SYMBOLS section lists name kind and file", seenPrompt.includes("- Agent (class) — src/index.ts"));
  assert("SYMBOLS section lists second symbol", seenPrompt.includes("- buildIndex (function) — src/util.ts"));
  assert("IMPORTS section lists resolved import", seenPrompt.includes("src/index.ts (./util) -> src/util.ts"));
  assert("EXPORTS section lists export", seenPrompt.includes("src/index.ts -> Agent"));
  assert("PACKAGE DEPENDENCIES section present", seenPrompt.includes("@ewa/agent -> @ewa/workspace"));
  assert("knowledge ref accepted", surface.judgment[0].type === "candidate");
}

async function testValidKnowledgeRefsAccepted() {
  const scenarios = [
    ["symbol:Agent", "symbol ref"],
    ["package:@ewa/workspace", "package ref"],
    ["import:src/index.ts->src/util.ts", "import ref"],
    ["export:src/index.ts:Agent", "export ref"],
    ["dependency:@ewa/agent->@ewa/workspace", "dependency ref"],
    ["symbol: Agent", "symbol ref with whitespace"],
  ];

  for (const [ref, label] of scenarios) {
    freshWorkspace();
    const { surface, calls } = await runWithResponses(
      "Judge the repository knowledge.",
      [judgment("candidate", [ref])]
    );

    assert(`${label} accepted`, surface.judgment[0].type === "candidate");
    assert(`${label} resolved in one call`, calls === 1);
    assert(`${label} preserved`, surface.judgment[0].evidence_refs[0] === ref);
  }
}

async function testFabricatedKnowledgeRefsRejected() {
  const scenarios = [
    ["symbol:NeverExisted", "fabricated symbol"],
    ["package:@fabricated/pkg", "fabricated package"],
    ["import:src/index.ts->src/none.ts", "fabricated import"],
    ["export:src/index.ts:NeverExported", "fabricated export"],
    ["dependency:@ewa/agent->@ewa/nowhere", "fabricated dependency"],
  ];

  for (const [ref, label] of scenarios) {
    freshWorkspace();
    const { surface, calls } = await runWithResponses(
      "Judge the repository knowledge.",
      [judgment("declared", [ref])],
      { maxIterations: 3 }
    );

    assert(`${label} rejected`, calls >= 3);
    assert(`${label} never elevates state`, surface.judgment[0].type === "blocked");
  }
}

async function testBlanketKnowledgeRefCompatibility() {
  freshWorkspace();
  const { surface, calls } = await runWithResponses(
    "Judge the repository knowledge.",
    [judgment("candidate", ["REPOSITORY KNOWLEDGE"])]
  );

  assert("blanket REPOSITORY KNOWLEDGE ref accepted", surface.judgment[0].type === "candidate");
  assert("blanket ref resolved in one call", calls === 1);
  assert("blanket ref preserved", surface.judgment[0].evidence_refs[0] === "REPOSITORY KNOWLEDGE");
}

async function testKnowledgeAbsent() {
  freshWorkspace(false);

  const scenarios = [
    ["symbol:Agent", "knowledge entity ref"],
    ["REPOSITORY KNOWLEDGE", "blanket knowledge ref"],
  ];

  for (const [ref, label] of scenarios) {
    freshWorkspace(false);
    let seenPrompt = "";
    const fakeChat = async (messages) => {
      seenPrompt = messages[0].content;
      return { content: JSON.stringify(judgment("declared", [ref])) };
    };

    const surface = await runEos("Judge the repository knowledge.", {
      workspace,
      chatFn: fakeChat,
      maxIterations: 3,
    });

    assert(`${label} rejected when knowledge absent`, surface.judgment[0].type === "blocked");
    assert("no REPOSITORY KNOWLEDGE block in prompt", !seenPrompt.includes("REPOSITORY KNOWLEDGE\nRoot:"));
  }
}

async function testProvenance() {
  freshWorkspace();

  const { surface } = await runWithResponses(
    "Judge the repository knowledge.",
    [judgment("candidate", ["symbol:Agent", "dependency:@ewa/agent->@ewa/workspace"])]
  );

  const expectedDigest = crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(workspace, ".eos", "substrate", "knowledge.json")))
    .digest("hex");

  assert("consumed records knowledge refs", surface.evidence.consumed.includes("symbol:Agent"));
  assert("consumed records dependency ref", surface.evidence.consumed.includes("dependency:@ewa/agent->@ewa/workspace"));
  assert("knowledge node present", surface.evidence.knowledge !== undefined);
  assert("knowledge node id is REPOSITORY KNOWLEDGE", surface.evidence.knowledge.id === "REPOSITORY KNOWLEDGE");
  assert("knowledge node digest matches source bytes", surface.evidence.knowledge.digest === expectedDigest);
  assert("knowledge node generatedAt preserved", surface.evidence.knowledge.generatedAt === "2026-08-09T18:30:40.616Z");
  assert("knowledge node repository root preserved", surface.evidence.knowledge.repositoryRoot === workspace);
  assert("knowledge ref canonical form preserved", surface.judgment[0].evidence_refs[0] === "symbol:Agent");
}

async function testProjectionDeterministic() {
  freshWorkspace();

  const first = buildKnowledgeProjection(loadKnowledge(workspace));
  const second = buildKnowledgeProjection(loadKnowledge(workspace));

  assert("projection deterministic across loads", first === second);

  const otherWorkspace = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    ".tmp-phase2e-knowledge-other"
  );

  fs.rmSync(otherWorkspace, { recursive: true, force: true });
  fs.mkdirSync(path.join(otherWorkspace, ".eos", "substrate"), { recursive: true });
  fs.writeFileSync(
    path.join(otherWorkspace, ".eos", "substrate", "knowledge.json"),
    fs.readFileSync(path.join(workspace, ".eos", "substrate", "knowledge.json"))
  );

  const third = buildKnowledgeProjection(loadKnowledge(otherWorkspace));
  assert("projection identical across identical files", first === third);

  fs.rmSync(otherWorkspace, { recursive: true, force: true });
}

async function testReadOnly() {
  freshWorkspace();

  const before = snapshot(path.join(workspace, ".eos", "substrate"));

  const { surface } = await runWithResponses(
    "Judge the repository knowledge.",
    [judgment("candidate", ["symbol:Agent"])]
  );

  const after = snapshot(path.join(workspace, ".eos", "substrate"));

  assert("judgment committed", surface.status === "candidate");
  assert(".eos substrate untouched across a run", JSON.stringify(before) === JSON.stringify(after));
}

function testRefResolutionModule() {
  freshWorkspace();
  const knowledge = loadKnowledge(workspace);

  assert("isKnowledgeRef true for blanket ref", isKnowledgeRef("REPOSITORY KNOWLEDGE", knowledge) === true);
  assert("isKnowledgeRef true for valid symbol", isKnowledgeRef("symbol:Agent", knowledge) === true);
  assert("isKnowledgeRef true for valid package", isKnowledgeRef("package:@ewa/agent", knowledge) === true);
  assert("isKnowledgeRef true for valid import", isKnowledgeRef("import:src/index.ts->src/util.ts", knowledge) === true);
  assert("isKnowledgeRef true for valid export", isKnowledgeRef("export:src/index.ts:Agent", knowledge) === true);
  assert("isKnowledgeRef true for valid dependency", isKnowledgeRef("dependency:@ewa/agent->@ewa/workspace", knowledge) === true);
  assert("isKnowledgeRef false for fabricated symbol", isKnowledgeRef("symbol:NeverExisted", knowledge) === false);
  assert("isKnowledgeRef false for fabricated package", isKnowledgeRef("package:@fabricated/pkg", knowledge) === false);
  assert("isKnowledgeRef false without knowledge", isKnowledgeRef("symbol:Agent", undefined) === false);
  assert("isKnowledgeRef false for plain path", isKnowledgeRef("src/index.ts", knowledge) === false);
  assert("isKnowledgeEntityRef true for entity prefix", isKnowledgeEntityRef("dependency:a->b") === true);
  assert("isKnowledgeEntityRef false for blanket ref", isKnowledgeEntityRef("REPOSITORY KNOWLEDGE") === false);
  assert("resolveKnowledgeEntityRef resolves import", resolveKnowledgeEntityRef("import:src/index.ts->src/util.ts", knowledge).ok === true);
  assert("resolveKnowledgeEntityRef rejects unknown import", resolveKnowledgeEntityRef("import:src/index.ts->src/none.ts", knowledge).ok === false);
  assert("resolveKnowledgeEntityRef rejects non-entity ref", resolveKnowledgeEntityRef("src/index.ts", knowledge).ok === false);
}

async function main() {
  await testProjectionBlock();
  await testValidKnowledgeRefsAccepted();
  await testFabricatedKnowledgeRefsRejected();
  await testBlanketKnowledgeRefCompatibility();
  await testKnowledgeAbsent();
  await testProvenance();
  await testProjectionDeterministic();
  await testReadOnly();
  testRefResolutionModule();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all phase 2E knowledge tests passed");
}

main();
