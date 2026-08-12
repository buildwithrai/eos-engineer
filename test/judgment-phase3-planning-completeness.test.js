import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/loop.js";
import { runReview } from "../src/review.js";
import { verifyLineage } from "../src/lineage.js";
import { readFile } from "../src/tools/readFile.js";
import {
  createInvestigation,
  recordInspection,
  applyPlan,
  planningComplete,
  investigationComplete,
  scopeOf,
} from "../src/investigation.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-phase3-planning"
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

function writeFile(rel, content) {
  const full = path.join(workspace, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function freshWorkspace() {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
  fs.mkdirSync(path.join(workspace, ".ige"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, ".ige", "inspect.json"),
    '{"project":{"name":"phase3-planning"}}\n'
  );
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

function plan(adopt = [], waive = []) {
  return { type: "plan", adopt, waive };
}

function readFileTool(rel) {
  return { type: "tool", tool: "read_file", input: { path: rel } };
}

function readFilesTool(paths) {
  return { type: "tool", tool: "read_files", input: { paths } };
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

function writeKnowledge(overrides = {}) {
  const knowledge = {
    generatedAt: "2026-08-09T18:30:40.616Z",
    repository: {
      root: workspace,
      packages: ["@ewa/agent"],
      sourceFiles: 2,
      testFiles: 0,
      readmes: 0,
      scripts: 0,
      sourceFilePaths: ["src/index.ts", "src/util.ts"],
      testFilePaths: [],
      readmePaths: [],
      packageJsonPaths: [],
      scriptPaths: [],
    },
    symbols: [{ name: "Agent", kind: "class", file: "src/index.ts" }],
    imports: [
      { file: "src/index.ts", specifier: "./util", resolvedFile: "src/util.ts" },
    ],
    exports: [{ file: "src/index.ts", symbol: "Agent" }],
    packageDependencies: [],
    ...overrides,
  };

  writeFile(
    ".ewa/knowledge.json",
    JSON.stringify(knowledge, null, 2) + "\n"
  );
}

/**
 * T1: planning gate.
 * a.js imports b.js. Read a.js, immediately declare.
 * Must reject due to pending b.js.
 */
async function testPlanningGate() {
  freshWorkspace();
  writeFile("src/a.js", 'import { b } from "./b.js";\nexport const a = b;\n');
  writeFile("src/b.js", "export const b = 1;\n");

  const { surface, calls } = await runWithResponses(
    "Investigate src/a.js and judge it.",
    [readFileTool("src/a.js"), judgment("declared", ["src/a.js"])],
    { maxIterations: 4 }
  );

  assert("T1 declared rejected while pending", calls >= 3);
  assert("T1 surface falls back to blocked", surface.status === "blocked");
  assert(
    "T1 unresolved relationship recorded",
    surface.investigation.unresolved_relationships.includes("src/a.js -> src/b.js")
  );
  assert(
    "T1 discovered dependency pending",
    surface.investigation.discovered_dependencies.some(
      (d) => d.from === "src/a.js" && d.to === "src/b.js" && d.status === "pending"
    )
  );
}

/**
 * T2: waiver.
 * a.js imports b.js. Read a.js. Waive b.js with reason. Declare a.js.
 * Must admit. Surface records waiver.
 */
async function testWaiver() {
  freshWorkspace();
  writeFile("src/a.js", 'import { b } from "./b.js";\nexport const a = b;\n');
  writeFile("src/b.js", "export const b = 1;\n");

  const { surface, calls } = await runWithResponses(
    "Investigate src/a.js and judge it.",
    [
      readFileTool("src/a.js"),
      plan([], [{ path: "src/b.js", reason: "b is a leaf constant; not needed for the trace" }]),
      judgment("declared", ["src/a.js"]),
    ]
  );

  assert("T2 declared admitted after waiver", surface.status === "declared");
  assert("T2 no unresolved relationships", surface.investigation.unresolved_relationships.length === 0);
  assert(
    "T2 waiver recorded with reason",
    surface.investigation.discovered_dependencies.some(
      (d) =>
        d.to === "src/b.js" &&
        d.status === "waived" &&
        typeof d.reason === "string" &&
        d.reason.length > 0
    )
  );
  assert("T2 gaps empty", surface.investigation.gaps.length === 0);
}

/**
 * T3: adoption.
 * a.js imports b.js. Read a.js. Adopt b.js. Declare -> reject (uninspected).
 * Read b.js. Declare a.js + b.js -> admit.
 */
async function testAdoption() {
  freshWorkspace();
  writeFile("src/a.js", 'import { b } from "./b.js";\nexport const a = b;\n');
  writeFile("src/b.js", "export const b = 1;\n");

  const { surface, calls } = await runWithResponses(
    "Investigate src/a.js and judge it.",
    [
      readFileTool("src/a.js"),
      plan(["src/b.js"], []),
      judgment("declared", ["src/a.js"]),
      readFileTool("src/b.js"),
      judgment("declared", ["src/a.js", "src/b.js"]),
    ]
  );

  assert("T3 adopted-but-uninspected rejected", calls >= 4);
  assert("T3 declared admitted after inspecting adopted", surface.status === "declared");
  assert(
    "T3 adopted requirement recorded",
    surface.investigation.adopted_requirements.includes("src/b.js")
  );
  assert(
    "T3 discovered dependency adopted",
    surface.investigation.discovered_dependencies.some(
      (d) => d.to === "src/b.js" && d.status === "adopted"
    )
  );
  assert("T3 gaps empty", surface.investigation.gaps.length === 0);
}

/**
 * T4: bounded chain.
 * a -> b -> c. Read a. Adopt b. Read b. Waive c. Declare a+b.
 * Must admit. c must NOT become automatically required.
 */
async function testBoundedChain() {
  freshWorkspace();
  writeFile("src/a.js", 'import { b } from "./b.js";\nexport const a = b;\n');
  writeFile("src/b.js", 'import { c } from "./c.js";\nexport const b = c;\n');
  writeFile("src/c.js", "export const c = 3;\n");

  const { surface, calls } = await runWithResponses(
    "Investigate src/a.js and judge it.",
    [
      readFileTool("src/a.js"),
      plan(["src/b.js"], []),
      readFileTool("src/b.js"),
      plan([], [{ path: "src/c.js", reason: "c is a leaf; the trace stops at b" }]),
      judgment("declared", ["src/a.js", "src/b.js"]),
    ]
  );

  assert("T4 declared admitted", surface.status === "declared");
  assert("T4 c not auto-required", !surface.investigation.adopted_requirements.includes("src/c.js"));
  assert(
    "T4 c waived with reason",
    surface.investigation.discovered_dependencies.some(
      (d) => d.to === "src/c.js" && d.status === "waived"
    )
  );
  assert("T4 no unresolved relationships", surface.investigation.unresolved_relationships.length === 0);
  assert("T4 gaps empty", surface.investigation.gaps.length === 0);
}

/**
 * T5: universal citability.
 * Read explicit a. Read non-required b. Declare citing both. Must admit.
 */
async function testUniversalCitability() {
  freshWorkspace();
  writeFile("src/a.js", "export const a = 1;\n");
  writeFile("src/b.js", "export const b = 2;\n");

  const { surface, calls } = await runWithResponses(
    "Investigate src/a.js and judge it.",
    [
      readFileTool("src/a.js"),
      readFileTool("src/b.js"),
      judgment("declared", ["src/a.js", "src/b.js"]),
    ]
  );

  assert("T5 declared admitted citing both", surface.status === "declared");
  assert(
    "T5 both inspected files citable",
    surface.investigation.inspected_evidence.includes("src/a.js") &&
      surface.investigation.inspected_evidence.includes("src/b.js")
  );
  assert("T5 no pending from out-of-scope read", surface.investigation.unresolved_relationships.length === 0);
}

/**
 * T6: read_files.
 * read_files a+b. Both recorded independently and citable. Judgment admits.
 */
async function testReadFiles() {
  freshWorkspace();
  writeFile("src/a.js", "export const a = 1;\n");
  writeFile("src/b.js", "export const b = 2;\n");

  const { surface, calls } = await runWithResponses(
    "Investigate src/a.js and src/b.js and judge them.",
    [
      readFilesTool(["src/a.js", "src/b.js"]),
      judgment("declared", ["src/a.js", "src/b.js"]),
    ]
  );

  assert("T6 declared admitted", surface.status === "declared");
  assert(
    "T6 both files inspected independently",
    surface.investigation.inspected_evidence.includes("src/a.js") &&
      surface.investigation.inspected_evidence.includes("src/b.js")
  );
  assert(
    "T6 two inspection records with digests",
    surface.evidence.inspections.length === 2 &&
      surface.evidence.inspections.every((i) => /^[0-9a-f]{64}$/.test(i.digest))
  );
  assert("T6 gaps empty", surface.investigation.gaps.length === 0);
}

/**
 * T7: knowledge topology.
 * Knowledge import ref may remain citable without inspection.
 * No scope obligation is created.
 */
async function testKnowledgeTopology() {
  freshWorkspace();
  writeFile("src/index.ts", "export class Agent {}\n");
  writeFile("src/util.ts", "export function buildIndex() {}\n");
  writeKnowledge();

  const { surface, calls } = await runWithResponses(
    "Judge the repository knowledge.",
    [judgment("candidate", ["import:src/index.ts->src/util.ts"])]
  );

  assert("T7 knowledge import ref citable without inspection", surface.judgment[0].type === "candidate");
  assert("T7 resolved in one call", calls === 1);
  assert(
    "T7 no scope obligation created",
    surface.investigation.discovered_dependencies.length === 0
  );
  assert("T7 no unresolved relationships", surface.investigation.unresolved_relationships.length === 0);
}

/**
 * T8: out-of-scope context.
 * a imports b. Read a. Read unrelated ctx.js that imports d.js. Waive b. Declare a.
 * Must admit. d must not appear in discovered_dependencies.
 */
async function testOutOfScopeContext() {
  freshWorkspace();
  writeFile("src/a.js", 'import { b } from "./b.js";\nexport const a = b;\n');
  writeFile("src/b.js", "export const b = 1;\n");
  writeFile("src/ctx.js", 'import { d } from "./d.js";\nexport const ctx = d;\n');
  writeFile("src/d.js", "export const d = 4;\n");

  const { surface, calls } = await runWithResponses(
    "Investigate src/a.js and judge it.",
    [
      readFileTool("src/a.js"),
      readFileTool("src/ctx.js"),
      plan([], [{ path: "src/b.js", reason: "b is a leaf; not needed" }]),
      judgment("declared", ["src/a.js"]),
    ]
  );

  assert("T8 declared admitted", surface.status === "declared");
  assert(
    "T8 d not in discovered dependencies",
    !surface.investigation.discovered_dependencies.some((d) => d.to === "src/d.js")
  );
  assert(
    "T8 ctx read recorded as inspected",
    surface.investigation.inspected_evidence.includes("src/ctx.js")
  );
  assert("T8 no unresolved relationships", surface.investigation.unresolved_relationships.length === 0);
}

/**
 * T9: candidate.
 * Same planning gate behavior must apply to candidate.
 */
async function testCandidateGate() {
  freshWorkspace();
  writeFile("src/a.js", 'import { b } from "./b.js";\nexport const a = b;\n');
  writeFile("src/b.js", "export const b = 1;\n");

  const { surface, calls } = await runWithResponses(
    "Investigate src/a.js and judge it.",
    [readFileTool("src/a.js"), judgment("candidate", ["src/a.js"])],
    { maxIterations: 4 }
  );

  assert("T9 candidate rejected while pending", calls >= 3);
  assert("T9 surface falls back to blocked", surface.status === "blocked");
  assert(
    "T9 unresolved relationship recorded",
    surface.investigation.unresolved_relationships.includes("src/a.js -> src/b.js")
  );
}

/**
 * T10: persistence/lineage.
 * Extended investigation survives projection/lineage. verifyLineage valid.
 * Review still resolves all inspections.
 */
async function testPersistenceLineage() {
  freshWorkspace();
  writeFile("src/a.js", 'import { b } from "./b.js";\nexport const a = b;\n');
  writeFile("src/b.js", "export const b = 1;\n");

  const { surface } = await runWithResponses(
    "Investigate src/a.js and judge it.",
    [
      readFileTool("src/a.js"),
      plan(["src/b.js"], []),
      readFileTool("src/b.js"),
      judgment("declared", ["src/a.js", "src/b.js"]),
    ]
  );

  assert("T10 declared committed", surface.status === "declared");
  assert(
    "T10 extended investigation persisted",
    surface.investigation.objective !== undefined &&
      Array.isArray(surface.investigation.explicit_requirements) &&
      Array.isArray(surface.investigation.adopted_requirements) &&
      Array.isArray(surface.investigation.discovered_dependencies) &&
      Array.isArray(surface.investigation.pending_requirements) &&
      Array.isArray(surface.investigation.unresolved_relationships)
  );

  const lineage = verifyLineage(workspace);
  assert(
    "T10 lineage valid (single-node chain is fresh-chain)",
    lineage.state === "none" && lineage.reason === "fresh-chain",
    lineage.reason
  );

  const persisted = JSON.parse(
    fs.readFileSync(path.join(workspace, ".eos", "judgment.json"), "utf8")
  );
  assert(
    "T10 extended investigation persisted to disk",
    persisted.investigation.objective !== undefined &&
      persisted.investigation.inspected_evidence !== undefined &&
      Array.isArray(persisted.investigation.discovered_dependencies) &&
      Array.isArray(persisted.investigation.unresolved_relationships)
  );

  const review = runReview(workspace);
  assert("T10 review resolves all inspections", review.outcome === "forward");
  assert(
    "T10 review claims supported",
    review.claims.every((claim) => claim.verdict === "supported")
  );
}

/**
 * T11: predicate truth tables.
 */
function testPredicates() {
  const inv = createInvestigation("Investigate src/a.js and judge it.");
  inv.explicitRequirements.add("src/a.js");

  assert("T11 empty investigation is planning complete", planningComplete(inv) === true);
  assert("T11 empty investigation is not investigation complete", investigationComplete(inv) === false);

  inv.inspectedEvidence.add("src/a.js");
  assert("T11 explicit inspected is investigation complete", investigationComplete(inv) === true);

  inv.discoveredDependencies.push({
    from: "src/a.js",
    specifier: "./b",
    to: "src/b.js",
    status: "pending",
  });
  assert("T11 pending makes planning incomplete", planningComplete(inv) === false);

  inv.discoveredDependencies[0].status = "waived";
  inv.discoveredDependencies[0].reason = "leaf";
  assert("T11 waived is planning complete", planningComplete(inv) === true);

  inv.discoveredDependencies[0].status = "adopted";
  inv.adoptedRequirements.add("src/b.js");
  assert("T11 adopted pending is planning complete", planningComplete(inv) === true);
  assert("T11 adopted uninspected is not investigation complete", investigationComplete(inv) === false);

  inv.inspectedEvidence.add("src/b.js");
  assert("T11 adopted inspected is investigation complete", investigationComplete(inv) === true);

  const scope = scopeOf(inv);
  assert(
    "T11 scope is explicit + adopted",
    scope.has("src/a.js") && scope.has("src/b.js") && scope.size === 2
  );
}

async function main() {
  await testPlanningGate();
  await testWaiver();
  await testAdoption();
  await testBoundedChain();
  await testUniversalCitability();
  await testReadFiles();
  await testKnowledgeTopology();
  await testOutOfScopeContext();
  await testCandidateGate();
  await testPersistenceLineage();
  testPredicates();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all Phase 3 planning-completeness tests passed");
}

main();