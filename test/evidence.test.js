import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  loadEvidence,
  loadKnowledge,
  loadDecisions,
  loadTraceability,
  findEvidence,
  evidenceExists,
} from "../src/investigation/evidence.js";
import { runEos } from "../src/runtime/run.js";

const workspace = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", ".tmp-evid-workspace");

const EVIDENCE_A = {
  id: "11111111-1111-1111-1111-111111111111",
  subject: "HIPAA coverage boundary",
  attempted: "Determine whether HIPAA alone satisfies healthcare regulatory scope",
  observed: "State, contractual, and professional obligations identified but unclassified",
  outcome: "unresolved",
  basis: ["docs/architecture/README.md"],
  unresolved: ["state obligations", "contractual obligations"],
  createdAt: "2026-08-01T00:00:00.000Z",
};

const EVIDENCE_B = {
  id: "22222222-2222-2222-2222-222222222222",
  subject: "Transportation driver-quality requirement",
  attempted: "Verify driver-quality requirement captured",
  observed: "Requirement linked to discovery",
  outcome: "forward",
  stateBefore: "unlinked",
  stateAfter: "linked",
  basis: ["discoveries/discovery-01.md"],
  unresolved: [],
  createdAt: "2026-08-02T00:00:00.000Z",
};

const DECISION_A = {
  id: "33333333-3333-3333-3333-333333333333",
  title: "Adopt evidence-gated judgment",
  context: "EOS judgment must be backed by recorded evidence",
  options: ["free-form reasoning", "evidence-gated"],
  decision: "evidence-gated judgment",
  rationale: "Evidence is the gating substrate; decisions are declared context",
  impacts: ["judgment"],
  relatedArtifacts: ["discoveries/discovery-01.md"],
  status: "active",
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};

const TRACEABILITY_LINK = {
  id: "44444444-4444-4444-4444-444444444444",
  from: DECISION_A.id,
  to: "discoveries/discovery-01.md",
  relationship: "impacts",
  rationale: "",
  createdAt: "2026-08-03T00:00:00.000Z",
};

function freshWorkspace() {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspace, ".eos", "substrate", "engineering", "evidence"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, ".eos", "substrate", "engineering", "evidence", `${EVIDENCE_A.id}.json`),
    JSON.stringify(EVIDENCE_A, null, 2)
  );
  fs.writeFileSync(
    path.join(workspace, ".eos", "substrate", "engineering", "evidence", `${EVIDENCE_B.id}.json`),
    JSON.stringify(EVIDENCE_B, null, 2)
  );
}

function freshWorkspaceWithDecisions() {
  freshWorkspace();
  fs.mkdirSync(path.join(workspace, ".eos", "substrate", "engineering", "decisions"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, ".eos", "substrate", "engineering", "decisions", `${DECISION_A.id}.json`),
    JSON.stringify(DECISION_A, null, 2)
  );
  fs.writeFileSync(
    path.join(workspace, ".eos", "substrate", "engineering", "traceability.json"),
    JSON.stringify([TRACEABILITY_LINK], null, 2)
  );
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
function testEvidenceSchema() {
  freshWorkspace();
  const items = loadEvidence(workspace);

  assert("loadEvidence returns both records", items.length === 2);

  const found = findEvidence(items, EVIDENCE_A.id);
  assert("evidence record schema preserved", found !== undefined);
  assert("record id preserved", found.evidence.id === EVIDENCE_A.id);
  assert("record outcome preserved", found.evidence.outcome === "unresolved");
  assert("record basis preserved", Array.isArray(found.evidence.basis) && found.evidence.basis.length === 1);
  assert("record createdAt preserved", found.evidence.createdAt === "2026-08-01T00:00:00.000Z");
  assert("stateBefore/After preserved", found.evidence.stateAfter === undefined && EVIDENCE_B.stateAfter === "linked");
}

function testEvidenceProvenance() {
  freshWorkspace();
  const items = loadEvidence(workspace);

  const found = findEvidence(items, EVIDENCE_A.id);
  assert("provenance source is absolute evidence file", found.source.endsWith(path.join(".eos", "substrate", "engineering", "evidence", `${EVIDENCE_A.id}.json`)));
  assert("provenance digest is hex", /^[0-9a-f]{64}$/.test(found.digest));

  const expected = crypto.createHash("sha256").update(JSON.stringify(EVIDENCE_A, null, 2)).digest("hex");
  assert("digest matches source bytes", found.digest === expected);

  assert("unknown evidence id resolves undefined", findEvidence(items, "missing-id") === undefined);
  assert("evidenceExists false for unknown id", evidenceExists(items, "missing-id") === false);
  assert("evidenceExists true for known id", evidenceExists(items, EVIDENCE_B.id) === true);
}

function testReadOnly() {
  freshWorkspace();
  const before = snapshot(path.join(workspace, ".eos"));

  loadEvidence(workspace);
  loadKnowledge(workspace);

  const after = snapshot(path.join(workspace, ".eos"));
  assert("EWA evidence and knowledge untouched after load", JSON.stringify(before) === JSON.stringify(after));
  assert("no EOS substrate mutation by adapter", JSON.stringify(before) === JSON.stringify(after));
}

function testKnowledge() {
  freshWorkspace();

  fs.writeFileSync(
    path.join(workspace, ".eos", "substrate", "knowledge.json"),
    JSON.stringify({
      generatedAt: "2026-08-09T18:30:40.616Z",
      repository: {
        root: workspace,
        packages: ["@ewa/agent"],
        sourceFiles: 2,
        testFiles: 0,
        readmes: 1,
        scripts: 0,
        sourceFilePaths: ["src/index.ts"],
        testFilePaths: [],
        readmePaths: ["README.md"],
        packageJsonPaths: ["package.json"],
        scriptPaths: [],
      },
      symbols: [{ name: "Agent", kind: "class", file: "src/index.ts" }],
      imports: [{ file: "src/index.ts", specifier: "./util", resolvedFile: "src/util.ts" }],
      exports: [{ file: "src/index.ts", symbol: "Agent" }],
      packageDependencies: [{ package: "@ewa/agent", dependency: "@ewa/workspace" }],
    })
  );

  const knowledge = loadKnowledge(workspace);
  assert("knowledge loaded", knowledge !== undefined);
  assert("knowledge generatedAt preserved", knowledge.knowledge.generatedAt === "2026-08-09T18:30:40.616Z");
  assert("knowledge symbols preserved", knowledge.knowledge.symbols[0].name === "Agent");
  assert("knowledge source is .eos/substrate/knowledge.json", knowledge.source.endsWith(path.join(".eos", "substrate", "knowledge.json")));

  fs.rmSync(path.join(workspace, ".eos", "substrate", "knowledge.json"), { force: true });
  const missing = loadKnowledge(workspace);
  assert("missing knowledge returns undefined", missing === undefined);
  assert("missing knowledge not created", fs.existsSync(path.join(workspace, ".eos", "substrate", "knowledge.json")) === false);
}

async function testGateFabrication() {
  freshWorkspace();

  let calls = 0;
  const fakeChat = async () => {
    calls += 1;
    return {
      content: JSON.stringify({
        type: "judgment",
        judgment: [
          {
            claim: "fabricated evidence reference",
            type: "declared",
            confidence: "high",
            evidence_refs: ["99999999-9999-9999-9999-999999999999"],
          },
        ],
      }),
    };
  };

  const surface = await runEos("Judge whether evidence supports the HIPAA claim.", {
    workspace,
    chatFn: fakeChat,
    maxIterations: 3,
  });

  assert("fabricated evidence id rejected", calls >= 3);
  assert("blocked fallback recorded", surface.judgment[0].type === "blocked");
}

async function testGateRealEvidenceId() {
  freshWorkspaceWithDecisions();

  const fakeChat = async () => ({
    content: JSON.stringify({
      type: "judgment",
      judgment: [
        {
          claim: "HIPAA coverage unresolved; state and contractual obligations unclassified",
          type: "candidate",
          confidence: "medium",
          evidence_refs: [EVIDENCE_A.id],
        },
      ],
    }),
  });

  const surface = await runEos("Judge the HIPAA coverage evidence.", {
    workspace,
    chatFn: fakeChat,
  });

  assert("real evidence id accepted", surface.judgment[0].type === "candidate");
  assert("evidence ref preserved", surface.judgment[0].evidence_refs[0] === EVIDENCE_A.id);
  assert("evidence block lists evidence", surface.evidence.evidence.length === 2);
  assert("consumed records the cited id", surface.evidence.consumed.includes(EVIDENCE_A.id));
  assert("projection written to .eos only", fs.existsSync(path.join(workspace, ".eos", "judgment.json")));
  assert("evidence block source is eos", surface.evidence.source === "eos");
  assert("decision provenance in surface", Array.isArray(surface.evidence.decisions) && surface.evidence.decisions.length === 1);
  assert("decision digest in surface", surface.evidence.decisions[0].digest === crypto.createHash("sha256").update(JSON.stringify(DECISION_A, null, 2)).digest("hex"));
  assert("traceability provenance in surface", surface.evidence.traceability !== undefined);
  assert("traceability link in surface", surface.evidence.traceability.links[0].relationship === "impacts");
}

async function testGateEmptyRefs() {
  freshWorkspace();

  let calls = 0;
  const fakeChat = async () => {
    calls += 1;
    return {
      content: JSON.stringify({
        type: "judgment",
        judgment: [
          { claim: "unsupported", type: "declared", confidence: "high", evidence_refs: [] },
        ],
      }),
    };
  };

  const surface = await runEos("Judge with no evidence.", {
    workspace,
    chatFn: fakeChat,
    maxIterations: 3,
  });

  assert("empty evidence_refs rejected", calls >= 3);
  assert("blocked fallback for empty refs", surface.judgment[0].type === "blocked");
}

function testDecisionsLoad() {
  freshWorkspaceWithDecisions();
  const items = loadDecisions(workspace);

  assert("loadDecisions returns both records", items.length === 1);

  const decision = items[0];
  assert("decision id preserved", decision.item.id === DECISION_A.id);
  assert("decision title preserved", decision.item.title === "Adopt evidence-gated judgment");
  assert("decision status preserved", decision.item.status === "active");
  assert("decision decision preserved", decision.item.decision === "evidence-gated judgment");
  assert("decision rationale preserved", decision.item.rationale.includes("gating substrate"));
  assert("decision relatedArtifacts preserved", Array.isArray(decision.item.relatedArtifacts) && decision.item.relatedArtifacts.length === 1);
}

function testDecisionsProvenance() {
  freshWorkspaceWithDecisions();
  const items = loadDecisions(workspace);

  const decision = items[0];
  assert("provenance source is absolute decision file", decision.source.endsWith(path.join(".eos", "substrate", "engineering", "decisions", `${DECISION_A.id}.json`)));
  assert("provenance digest is hex", /^[0-9a-f]{64}$/.test(decision.digest));

  const expected = crypto.createHash("sha256").update(JSON.stringify(DECISION_A, null, 2)).digest("hex");
  assert("decision digest matches source bytes", decision.digest === expected);
}

function testTraceabilityLoad() {
  freshWorkspaceWithDecisions();
  const trace = loadTraceability(workspace);

  assert("traceability loaded", trace !== undefined);
  assert("traceability is array", Array.isArray(trace.item));
  assert("traceability has one link", trace.item.length === 1);

  const link = trace.item[0];
  assert("link id preserved", link.id === TRACEABILITY_LINK.id);
  assert("link from preserved", link.from === DECISION_A.id);
  assert("link to preserved", link.to === "discoveries/discovery-01.md");
  assert("link relationship preserved", link.relationship === "impacts");
  assert("link rationale preserved", link.rationale === "");
}

function testTraceabilityProvenance() {
  freshWorkspaceWithDecisions();
  const trace = loadTraceability(workspace);

  assert("provenance source is absolute traceability file", trace.source.endsWith(path.join(".eos", "substrate", "engineering", "traceability.json")));
  assert("provenance digest is hex", /^[0-9a-f]{64}$/.test(trace.digest));

  const expected = crypto.createHash("sha256").update(JSON.stringify([TRACEABILITY_LINK], null, 2)).digest("hex");
  assert("traceability digest matches source bytes", trace.digest === expected);
}

function testMissingDecisionsDirectory() {
  freshWorkspace();
  fs.rmSync(path.join(workspace, ".eos", "substrate", "engineering"), { recursive: true, force: true });

  const items = loadDecisions(workspace);
  assert("missing decisions dir returns empty array", Array.isArray(items) && items.length === 0);
  assert("missing decisions dir not created", fs.existsSync(path.join(workspace, ".eos", "substrate", "engineering", "decisions")) === false);
}

function testEmptyDecisionsDirectory() {
  freshWorkspace();
  fs.mkdirSync(path.join(workspace, ".eos", "substrate", "engineering", "decisions"), { recursive: true });

  const items = loadDecisions(workspace);
  assert("empty decisions dir returns empty array", Array.isArray(items) && items.length === 0);
  assert("empty decisions dir left untouched", fs.existsSync(path.join(workspace, ".eos", "substrate", "engineering", "decisions")) === true);
}

function testMissingTraceabilityFile() {
  freshWorkspace();

  const trace = loadTraceability(workspace);
  assert("missing traceability returns undefined", trace === undefined);
  assert("missing traceability file not created", fs.existsSync(path.join(workspace, ".eos", "substrate", "engineering", "traceability.json")) === false);
}

function testReadOnlyDecisionsTraceability() {
  freshWorkspaceWithDecisions();
  const before = snapshot(path.join(workspace, ".eos"));

  loadDecisions(workspace);
  loadTraceability(workspace);

  const after = snapshot(path.join(workspace, ".eos"));
  assert("EWA tree untouched after decision/traceability load", JSON.stringify(before) === JSON.stringify(after));
}

async function testGateRejectsDecisionId() {
  freshWorkspaceWithDecisions();

  let calls = 0;
  const fakeChat = async () => {
    calls += 1;
    return {
      content: JSON.stringify({
        type: "judgment",
        judgment: [
          {
            claim: "judgment backed by a decision id",
            type: "declared",
            confidence: "high",
            evidence_refs: [DECISION_A.id],
          },
        ],
      }),
    };
  };

  const surface = await runEos("Judge whether the decision supports the claim.", {
    workspace,
    chatFn: fakeChat,
    maxIterations: 3,
  });

  assert("decision id rejected as evidence ref", calls >= 3);
  assert("blocked fallback for decision-only refs", surface.judgment[0].type === "blocked");
}

function testSurfaceProvenance() {
  freshWorkspaceWithDecisions();

  fs.writeFileSync(
    path.join(workspace, ".eos", "substrate", "knowledge.json"),
    JSON.stringify({
      generatedAt: "2026-08-09T18:30:40.616Z",
      repository: { root: workspace, packages: [], sourceFiles: 0 },
      symbols: [],
    })
  );

  const evidence = loadEvidence(workspace);
  const knowledge = loadKnowledge(workspace);
  const decisions = loadDecisions(workspace);
  const traceability = loadTraceability(workspace);

  assert("decisions provenance array present", Array.isArray(decisions) && decisions.length === 1);
  assert("traceability provenance present", traceability !== undefined && traceability.source.endsWith("traceability.json"));
  assert("evidence provenance array present", Array.isArray(evidence) && evidence.length === 2);
  assert("knowledge provenance present", knowledge !== undefined && knowledge.source.endsWith("knowledge.json"));
}

async function testSubstrateBlocks() {
  freshWorkspaceWithDecisions();

  fs.writeFileSync(
    path.join(workspace, ".eos", "substrate", "knowledge.json"),
    JSON.stringify({
      generatedAt: "2026-08-09T18:30:40.616Z",
      repository: { root: workspace, packages: ["@ewa/agent"], sourceFiles: 1 },
      symbols: [{ name: "Agent", kind: "class", file: "src/index.ts" }],
    })
  );

  let seenPrompt = "";
  const fakeChat = async (messages) => {
    seenPrompt = messages[0].content;
    return {
      content: JSON.stringify({
        type: "judgment",
        judgment: [
          {
            claim: "substrate blocks visible",
            type: "candidate",
            confidence: "medium",
            evidence_refs: [EVIDENCE_A.id],
          },
        ],
      }),
    };
  };

  const surface = await runEos("Judge with full substrate.", {
    workspace,
    chatFn: fakeChat,
  });

  assert("REPOSITORY KNOWLEDGE block present", seenPrompt.includes("REPOSITORY KNOWLEDGE"));
  assert("ENGINEERING EVIDENCE block present", seenPrompt.includes("ENGINEERING EVIDENCE"));
  assert("DECISIONS block present", seenPrompt.includes("DECISIONS"));
  assert("TRACEABILITY block present", seenPrompt.includes("TRACEABILITY"));
  assert("decision id in context", seenPrompt.includes(DECISION_A.id));
  assert("decision status in context", seenPrompt.includes("[active]"));
  assert("decision decision in context", seenPrompt.includes("evidence-gated judgment"));
  assert("traceability relationship in context", seenPrompt.includes("[impacts]"));
  assert("judgment still evidence-backed", surface.judgment[0].evidence_refs[0] === EVIDENCE_A.id);
}

async function main() {
  testEvidenceSchema();
  testEvidenceProvenance();
  testReadOnly();
  testKnowledge();
  await testGateFabrication();
  await testGateRealEvidenceId();
  await testGateEmptyRefs();
  testDecisionsLoad();
  testDecisionsProvenance();
  testTraceabilityLoad();
  testTraceabilityProvenance();
  testMissingDecisionsDirectory();
  testEmptyDecisionsDirectory();
  testMissingTraceabilityFile();
  testReadOnlyDecisionsTraceability();
  await testGateRejectsDecisionId();
  testSurfaceProvenance();
  await testSubstrateBlocks();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all evidence tests passed");
}

main();
