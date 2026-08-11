import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { runEos } from "../src/loop.js";
import { verifyLineage, sha256, serializeProjection } from "../src/lineage.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-phase2d-lineage"
);

let failures = 0;

function freshWorkspace() {
  fs.rmSync(workspace, { recursive: true, force: true });

  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });

  fs.writeFileSync(
    path.join(workspace, "src", "index.js"),
    "export const x = 1;\n"
  );

  fs.writeFileSync(
    path.join(workspace, "src", "other.js"),
    "export const y = 2;\n"
  );

  fs.mkdirSync(path.join(workspace, ".ige"), { recursive: true });
}

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

function nodeCount() {
  const dir = path.join(workspace, ".eos", "judgments");

  if (!fs.existsSync(dir)) return 0;

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json")).length;
}

function nodeFile(judgmentId) {
  return path.join(workspace, ".eos", "judgments", `${judgmentId}.json`);
}

function latestPath() {
  return path.join(workspace, ".eos", "judgment.json");
}

function readLatest() {
  return JSON.parse(fs.readFileSync(latestPath(), "utf8"));
}

function ewaSnapshot() {
  const dir = path.join(workspace, ".ewa");

  if (!fs.existsSync(dir)) return {};

  const out = {};

  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);

      if (entry.isDirectory()) {
        walk(full);
      } else {
        out[path.relative(workspace, full)] = sha256(fs.readFileSync(full));
      }
    }
  };

  walk(dir);
  return out;
}

async function testCommitCreatesExactlyOneNode() {
  freshWorkspace();

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [judgment("blocked", [])]
  );

  assert("first commit is blocked", surface.status === "blocked");
  assert("first commit reason is judgment", surface.commit_reason === "judgment");
  assert("first commit has null previous id", surface.previous_judgment_id === null);
  assert("first commit has null previous digest", surface.previous_judgment_digest === null);
  assert("exactly one ledger node created", nodeCount() === 1);
  assert(
    "ledger node exists for judgment id",
    fs.existsSync(nodeFile(surface.judgment_id))
  );
  assert(
    "latest projection is byte-identical to the ledger node",
    fs.readFileSync(latestPath()).equals(fs.readFileSync(nodeFile(surface.judgment_id)))
  );

  const v = verifyLineage(workspace);
  assert("single-node lineage state is none", v.state === "none", v.reason);
}

async function testThreeNodeChainReconstructs() {
  freshWorkspace();

  const blocked = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [judgment("blocked", [])]
  );

  const candidate = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("candidate", ["src/index.js"]),
    ]
  );

  const declared = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("declared", ["src/index.js"]),
    ]
  );

  assert("blocked established", blocked.surface.status === "blocked");
  assert("candidate established", candidate.surface.status === "candidate");
  assert("declared established", declared.surface.status === "declared");

  assert(
    "candidate links previous id to blocked",
    candidate.surface.previous_judgment_id === blocked.surface.judgment_id
  );
  assert(
    "candidate links previous digest to blocked node",
    candidate.surface.previous_judgment_digest ===
      sha256(fs.readFileSync(nodeFile(blocked.surface.judgment_id)))
  );
  assert(
    "declared links previous id to candidate",
    declared.surface.previous_judgment_id === candidate.surface.judgment_id
  );
  assert(
    "declared links previous digest to candidate node",
    declared.surface.previous_judgment_digest ===
      sha256(fs.readFileSync(nodeFile(candidate.surface.judgment_id)))
  );

  assert("three ledger nodes created", nodeCount() === 3);
  assert(
    "all commits are judgment commits",
    blocked.surface.commit_reason === "judgment" &&
      candidate.surface.commit_reason === "judgment" &&
      declared.surface.commit_reason === "judgment"
  );

  const v = verifyLineage(workspace);
  assert("chain verifies as consistent", v.state === "consistent", v.reason);
  assert("chain depth is two", v.depth === 2);

  const statuses = [];
  let current = readLatest();
  let guard = 0;

  while (current) {
    statuses.push(current.status);

    if (current.previous_judgment_id == null) break;

    current = JSON.parse(
      fs.readFileSync(nodeFile(current.previous_judgment_id), "utf8")
    );
    guard += 1;

    if (guard > 10) break;
  }

  assert(
    "lineage reconstructs declared -> candidate -> blocked",
    JSON.stringify(statuses) === JSON.stringify(["declared", "candidate", "blocked"])
  );
}

async function testInspectionDigest() {
  freshWorkspace();

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("candidate", ["src/index.js"]),
    ]
  );

  assert("one inspection recorded", surface.evidence.inspections.length === 1);
  assert(
    "inspection digest is a sha256 hex digest",
    typeof surface.evidence.inspections[0].digest === "string" &&
      /^[0-9a-f]{64}$/.test(surface.evidence.inspections[0].digest)
  );
  assert(
    "inspection digest matches the content returned by the read",
    surface.evidence.inspections[0].digest === sha256("export const x = 1;\n")
  );
}

async function testFreshProcessReconstruction() {
  freshWorkspace();

  await runWithResponses("Investigate src/index.js and judge it.", [
    judgment("blocked", []),
  ]);
  await runWithResponses("Investigate src/index.js and judge it.", [
    {
      type: "tool",
      tool: "read_file",
      input: { path: "src/index.js" },
    },
    judgment("candidate", ["src/index.js"]),
  ]);
  await runWithResponses("Investigate src/index.js and judge it.", [
    {
      type: "tool",
      tool: "read_file",
      input: { path: "src/index.js" },
    },
    judgment("declared", ["src/index.js"]),
  ]);

  const lineageUrl = pathToFileURL(
    path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      "..",
      "src",
      "lineage.js"
    )
  ).href;

  const script = `
import { verifyLineage } from ${JSON.stringify(lineageUrl)};
import fs from "node:fs";

const root = process.argv[1];
const v = verifyLineage(root);
const latest = JSON.parse(fs.readFileSync(root + "/.eos/judgment.json", "utf8"));
const statuses = [];
let current = latest;
let guard = 0;

while (current) {
  statuses.push(current.status);
  if (current.previous_judgment_id == null) break;
  current = JSON.parse(fs.readFileSync(root + "/.eos/judgments/" + current.previous_judgment_id + ".json", "utf8"));
  guard += 1;
  if (guard > 10) throw new Error("lineage loop");
}

console.log(JSON.stringify({ state: v.state, statuses }));
`;

  const res = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script, workspace],
    { encoding: "utf8" }
  );

  assert("fresh process exits cleanly", res.status === 0, res.stderr);

  let out = null;
  try {
    out = JSON.parse(res.stdout.trim());
  } catch {
    out = null;
  }

  assert("fresh process emits reconstruction", out !== null, res.stdout);
  assert("fresh process verifies chain", out !== null && out.state === "consistent");
  assert(
    "fresh process reconstructs statuses from disk",
    out !== null &&
      JSON.stringify(out.statuses) === JSON.stringify(["declared", "candidate", "blocked"])
  );
}

async function testFabricatedEvidenceRefNoNode() {
  freshWorkspace();

  await runWithResponses("Investigate src/index.js and judge it.", [
    judgment("blocked", []),
  ]);

  const before = nodeCount();

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      judgment("candidate", ["fabricated-evidence-id"]),
      judgment("candidate", ["src/index.js"]),
      judgment("blocked", []),
    ]
  );

  assert("fabricated evidence ref cannot produce candidate", surface.status === "blocked");
  assert(
    "only the accepted blocked judgment becomes a node",
    nodeCount() === before + 1
  );
}

async function testRejectedAttemptsProduceNoNode() {
  freshWorkspace();

  await runWithResponses("Investigate src/index.js and judge it.", [
    judgment("blocked", []),
  ]);

  const before = nodeCount();

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      judgment("declared", ["fabricated-id"]),
      judgment("candidate", ["src/index.js"]),
      judgment("blocked", []),
    ]
  );

  assert("rejected attempts leave exactly one accepted node", nodeCount() === before + 1);
  assert("rejected attempts leave status blocked", surface.status === "blocked");
}

async function testIllegalTransitionNoNode() {
  freshWorkspace();

  await runWithResponses("Investigate src/index.js and judge it.", [
    judgment("blocked", []),
  ]);

  const before = nodeCount();

  const { surface, calls } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("declared", ["src/index.js"]),
      judgment("blocked", []),
    ]
  );

  assert("blocked to declared rejected", calls >= 3);
  assert("illegal transition creates no node", nodeCount() === before + 1);
  assert("status remains blocked", surface.status === "blocked");
}

async function testDecisionIdAsEvidenceRejected() {
  freshWorkspace();

  fs.mkdirSync(path.join(workspace, ".ewa", "engineering", "decisions"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(workspace, ".ewa", "engineering", "decisions", "dec1.json"),
    JSON.stringify(
      {
        id: "DEC-1",
        title: "Test decision",
        status: "accepted",
        decision: "yes",
        relatedArtifacts: [],
      },
      null,
      2
    ) + "\n"
  );

  await runWithResponses("Investigate src/index.js and judge it.", [
    judgment("blocked", []),
  ]);

  const before = nodeCount();

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("declared", ["DEC-1"]),
      judgment("blocked", []),
    ]
  );

  assert(
    "decision id is not accepted as evidence",
    surface.judgment.every(
      (item) => !(item.evidence_refs ?? []).includes("DEC-1")
    )
  );
  assert(
    "decision id citation creates no node",
    nodeCount() === before + 1
  );
  assert(
    "decision remains listed as a decision, not evidence",
    surface.evidence.decisions.some((decision) => decision.id === "DEC-1") &&
      surface.evidence.evidence.every((item) => item.id !== "DEC-1")
  );
}

async function testJudgmentIdAsEvidenceRejected() {
  freshWorkspace();

  const first = await runWithResponses("Investigate src/index.js and judge it.", [
    judgment("blocked", []),
  ]);

  const before = nodeCount();

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("declared", [first.surface.judgment_id]),
      judgment("blocked", []),
    ]
  );

  assert(
    "prior judgment id is not accepted as evidence",
    surface.judgment.every(
      (item) => !(item.evidence_refs ?? []).includes(first.surface.judgment_id)
    )
  );
  assert(
    "judgment id citation creates no node",
    nodeCount() === before + 1
  );
}

async function testProjectionPathsAsEvidenceRejected() {
  freshWorkspace();

  const first = await runWithResponses("Investigate src/index.js and judge it.", [
    judgment("blocked", []),
  ]);

  const before = nodeCount();

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("declared", [
        "src/index.js",
        ".eos/judgment.json",
        `.eos/judgments/${first.surface.judgment_id}.json`,
      ]),
      judgment("blocked", []),
    ]
  );

  assert(
    "projection paths are rejected as evidence",
    surface.judgment.every(
      (item) =>
        !(item.evidence_refs ?? []).some((ref) => ref.includes(".eos"))
    )
  );
  assert(
    "projection path citation creates no node",
    nodeCount() === before + 1
  );
  assert("status remains blocked", surface.status === "blocked");
}

async function testUninspectedFileRefRejected() {
  freshWorkspace();

  await runWithResponses("Investigate src/index.js and judge it.", [
    judgment("blocked", []),
  ]);

  const before = nodeCount();

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("declared", ["src/other.js"]),
      judgment("blocked", []),
    ]
  );

  assert(
    "uninspected existing file is rejected as evidence",
    surface.judgment.every(
      (item) => !(item.evidence_refs ?? []).includes("src/other.js")
    )
  );
  assert(
    "uninspected citation creates no node",
    nodeCount() === before + 1
  );
}

async function testCandidateDeclaredNewUninspectedEvidenceRejected() {
  freshWorkspace();

  await runWithResponses("Investigate src/index.js and judge it.", [
    {
      type: "tool",
      tool: "read_file",
      input: { path: "src/index.js" },
    },
    judgment("candidate", ["src/index.js"]),
  ]);

  const before = nodeCount();

  const { surface, calls } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("declared", ["src/index.js", "src/other.js"]),
    ],
    { maxIterations: 3 }
  );

  assert("declared with new uninspected evidence rejected", calls === 3);
  assert("status does not elevate beyond candidate", surface.status === "candidate");
  assert(
    "rejected declared transition creates no node",
    nodeCount() === before + 1
  );
}

async function testMalformedLedgerDetected() {
  freshWorkspace();

  const blocked = await runWithResponses("Investigate src/index.js and judge it.", [
    judgment("blocked", []),
  ]);
  await runWithResponses("Investigate src/index.js and judge it.", [
    {
      type: "tool",
      tool: "read_file",
      input: { path: "src/index.js" },
    },
    judgment("candidate", ["src/index.js"]),
  ]);

  fs.writeFileSync(nodeFile(blocked.surface.judgment_id), "{ not valid json\n");

  const v = verifyLineage(workspace);
  assert("malformed ledger node detected", v.state === "inconsistent", v.reason);
  assert("malformed reason reported", v.reason === "malformed-node");

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("declared", ["src/index.js"]),
    ]
  );

  assert(
    "malformed lineage starts a fresh chain (never inherits history)",
    surface.previous_judgment_id === null
  );
}

async function testDanglingPointerDetected() {
  freshWorkspace();

  const blocked = await runWithResponses("Investigate src/index.js and judge it.", [
    judgment("blocked", []),
  ]);
  await runWithResponses("Investigate src/index.js and judge it.", [
    {
      type: "tool",
      tool: "read_file",
      input: { path: "src/index.js" },
    },
    judgment("candidate", ["src/index.js"]),
  ]);

  fs.rmSync(nodeFile(blocked.surface.judgment_id));

  const v = verifyLineage(workspace);
  assert("dangling previous pointer detected", v.state === "inconsistent", v.reason);
  assert("dangling reason reported", v.reason === "dangling-previous");
}

async function testTamperedNodeDetected() {
  freshWorkspace();

  const blocked = await runWithResponses("Investigate src/index.js and judge it.", [
    judgment("blocked", []),
  ]);
  await runWithResponses("Investigate src/index.js and judge it.", [
    {
      type: "tool",
      tool: "read_file",
      input: { path: "src/index.js" },
    },
    judgment("candidate", ["src/index.js"]),
  ]);
  await runWithResponses("Investigate src/index.js and judge it.", [
    {
      type: "tool",
      tool: "read_file",
      input: { path: "src/index.js" },
    },
    judgment("declared", ["src/index.js"]),
  ]);

  const tampered = nodeFile(blocked.surface.judgment_id);
  const original = fs.readFileSync(tampered, "utf8");
  fs.writeFileSync(tampered, original.replace('"blocked"', '"candidate"'));

  const v = verifyLineage(workspace);
  assert("tampered ledger node detected", v.state === "inconsistent", v.reason);
  assert("digest mismatch reason reported", v.reason === "digest-mismatch");
}

async function testConflictingStatusDetected() {
  freshWorkspace();

  await runWithResponses("Investigate src/index.js and judge it.", [
    judgment("blocked", []),
  ]);

  const latest = JSON.parse(fs.readFileSync(latestPath(), "utf8"));
  latest.status = "declared";
  fs.writeFileSync(latestPath(), serializeProjection(latest));

  const v = verifyLineage(workspace);
  assert("conflicting status detected", v.state === "inconsistent", v.reason);
  assert("conflicting status reason reported", v.reason === "conflicting-status");

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("candidate", ["src/index.js"]),
    ]
  );

  assert(
    "tampered status is not used to elevate state",
    surface.previous_judgment_id === null
  );
  assert(
    "candidate after reset still requires the evidence gate",
    surface.status === "candidate" &&
      surface.evidence.inspections.some(
        (inspection) => inspection.path.endsWith("src/index.js")
      )
  );
}

async function testCorruptLineageCannotBackdoorElevation() {
  freshWorkspace();

  const blocked = await runWithResponses("Investigate src/index.js and judge it.", [
    judgment("blocked", []),
  ]);
  await runWithResponses("Investigate src/index.js and judge it.", [
    {
      type: "tool",
      tool: "read_file",
      input: { path: "src/index.js" },
    },
    judgment("candidate", ["src/index.js"]),
  ]);

  fs.writeFileSync(nodeFile(blocked.surface.judgment_id), "{ not valid json\n");

  const v = verifyLineage(workspace);
  assert("corrupt lineage is detected", v.state === "inconsistent");

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("declared", ["src/index.js"]),
    ]
  );

  assert(
    "declared accepted only as a fresh start, never via corrupt lineage",
    surface.status === "declared" && surface.previous_judgment_id === null
  );

  freshWorkspace();

  const blocked2 = await runWithResponses("Investigate src/index.js and judge it.", [
    judgment("blocked", []),
  ]);
  await runWithResponses("Investigate src/index.js and judge it.", [
    {
      type: "tool",
      tool: "read_file",
      input: { path: "src/index.js" },
    },
    judgment("candidate", ["src/index.js"]),
  ]);

  fs.rmSync(nodeFile(blocked2.surface.judgment_id));

  const { surface: s2 } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [judgment("declared", ["src/index.js"])],
    { maxIterations: 2 }
  );

  assert(
    "corrupt lineage does not manufacture evidence",
    s2.evidence.inspections.length === 0
  );
  assert(
    "corrupt lineage cannot produce declared without inspection",
    s2.status !== "declared"
  );
}

async function testFabricatedLineageCannotBypassEvidenceGate() {
  freshWorkspace();

  fs.mkdirSync(path.join(workspace, ".eos", "judgments"), { recursive: true });

  const base = {
    schema: "eos-judgment/v1",
    investigation_id: "fabricated-inv",
    recorded_at: "2026-01-01T00:00:00.000Z",
    status: "candidate",
    previous_judgment_id: null,
    previous_judgment_digest: null,
    commit_reason: "judgment",
    investigation: {
      target: "fabricated",
      required_evidence: [],
      inspected_evidence: [],
      gaps: [],
    },
    evidence: {
      source: "ewa",
      evidence: [],
      inspections: [],
      decisions: [],
      consumed: [],
    },
    judgment: [
      {
        claim: "fabricated candidate",
        type: "candidate",
        confidence: "high",
        evidence_refs: [],
      },
    ],
    restrictions: [],
  };

  const node1 = { ...base, judgment_id: "aaaa0000-0000-4000-8000-000000000001" };
  const bytes1 = serializeProjection(node1);
  fs.writeFileSync(
    nodeFile("aaaa0000-0000-4000-8000-000000000001"),
    bytes1
  );

  const latest = {
    ...base,
    judgment_id: "aaaa0000-0000-4000-8000-000000000002",
    investigation_id: "fabricated-inv-2",
    previous_judgment_id: "aaaa0000-0000-4000-8000-000000000001",
    previous_judgment_digest: sha256(bytes1),
  };
  const bytesLatest = serializeProjection(latest);
  fs.writeFileSync(
    nodeFile("aaaa0000-0000-4000-8000-000000000002"),
    bytesLatest
  );
  fs.writeFileSync(latestPath(), bytesLatest);

  const v = verifyLineage(workspace);
  assert(
    "hand-fabricated self-consistent chain verifies structurally",
    v.state === "consistent",
    v.reason
  );

  const { surface, calls } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [judgment("declared", ["src/index.js"])],
    { maxIterations: 2 }
  );

  assert(
    "fabricated lineage does not bypass the evidence gate",
    calls === 2 && surface.evidence.inspections.length === 0
  );
  assert(
    "fabricated lineage cannot manufacture declared evidence",
    surface.status !== "declared"
  );
}

async function testSuccessiveInvestigationsUniqueNodes() {
  freshWorkspace();

  const judgmentIds = [];
  const investigationIds = [];

  for (let i = 0; i < 3; i++) {
    const { surface } = await runWithResponses(
      "Investigate src/index.js and judge it.",
      [
        {
          type: "tool",
          tool: "read_file",
          input: { path: "src/index.js" },
        },
        judgment("candidate", ["src/index.js"]),
      ]
    );
    judgmentIds.push(surface.judgment_id);
    investigationIds.push(surface.investigation_id);
  }

  assert("three distinct judgment ids", new Set(judgmentIds).size === 3);
  assert("three distinct investigation ids", new Set(investigationIds).size === 3);
  assert("three ledger nodes committed", nodeCount() === 3);

  const v = verifyLineage(workspace);
  assert("successive chain verifies as consistent", v.state === "consistent", v.reason);
}

async function testFallbackCommitReason() {
  freshWorkspace();

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [judgment("declared", ["src/index.js"])],
    { maxIterations: 2 }
  );

  assert("fallback commits blocked", surface.status === "blocked");
  assert("fallback commit reason is fallback", surface.commit_reason === "fallback");
  assert("fallback creates a ledger node", fs.existsSync(nodeFile(surface.judgment_id)));
}

async function testEwaSubstratePreserved() {
  freshWorkspace();

  fs.mkdirSync(path.join(workspace, ".ewa", "engineering", "evidence"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(workspace, ".ewa", "engineering", "decisions"), {
    recursive: true,
  });

  fs.writeFileSync(
    path.join(workspace, ".ewa", "engineering", "evidence", "ev1.json"),
    JSON.stringify(
      { id: "EV-1", subject: "subject", attempted: "attempt", observed: "observed", outcome: "ok" },
      null,
      2
    ) + "\n"
  );

  fs.writeFileSync(
    path.join(workspace, ".ewa", "engineering", "decisions", "dec1.json"),
    JSON.stringify(
      { id: "DEC-1", title: "title", status: "accepted", decision: "yes", relatedArtifacts: [] },
      null,
      2
    ) + "\n"
  );

  fs.writeFileSync(
    path.join(workspace, ".ewa", "engineering", "traceability.json"),
    JSON.stringify(
      [
        {
          id: "L-1",
          from: "a",
          to: "b",
          relationship: "implements",
          rationale: "reason",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      null,
      2
    ) + "\n"
  );

  fs.writeFileSync(
    path.join(workspace, ".ewa", "knowledge.json"),
    JSON.stringify(
      {
        knowledge: {
          repository: { root: workspace, packages: [], sourceFiles: 0 },
          symbols: [],
          generatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      null,
      2
    ) + "\n"
  );

  const before = ewaSnapshot();
  assert("substrate snapshot contains four files", Object.keys(before).length === 4);

  const { surface } = await runWithResponses(
    "Investigate src/index.js and judge it.",
    [
      {
        type: "tool",
        tool: "read_file",
        input: { path: "src/index.js" },
      },
      judgment("declared", ["EV-1", "src/index.js"]),
    ]
  );

  const after = ewaSnapshot();
  assert(
    ".ewa files are byte-identical across a run",
    JSON.stringify(before) === JSON.stringify(after)
  );

  assert(
    "surface records evidence digest matching substrate",
    surface.evidence.evidence.some(
      (item) =>
        item.id === "EV-1" &&
        item.digest === before[".ewa/engineering/evidence/ev1.json"]
    )
  );
  assert(
    "surface records decision digest matching substrate",
    surface.evidence.decisions.some(
      (item) =>
        item.id === "DEC-1" &&
        item.digest === before[".ewa/engineering/decisions/dec1.json"]
    )
  );
  assert(
    "surface records traceability digest matching substrate",
    surface.evidence.traceability !== undefined &&
      surface.evidence.traceability.digest === before[".ewa/engineering/traceability.json"]
  );
  assert(
    "surface records knowledge digest matching substrate",
    surface.evidence.knowledge !== undefined &&
      surface.evidence.knowledge.digest === before[".ewa/knowledge.json"]
  );
}

async function main() {
  await testCommitCreatesExactlyOneNode();
  await testThreeNodeChainReconstructs();
  await testInspectionDigest();
  await testFreshProcessReconstruction();
  await testFabricatedEvidenceRefNoNode();
  await testRejectedAttemptsProduceNoNode();
  await testIllegalTransitionNoNode();
  await testDecisionIdAsEvidenceRejected();
  await testJudgmentIdAsEvidenceRejected();
  await testProjectionPathsAsEvidenceRejected();
  await testUninspectedFileRefRejected();
  await testCandidateDeclaredNewUninspectedEvidenceRejected();
  await testMalformedLedgerDetected();
  await testDanglingPointerDetected();
  await testTamperedNodeDetected();
  await testConflictingStatusDetected();
  await testCorruptLineageCannotBackdoorElevation();
  await testFabricatedLineageCannotBypassEvidenceGate();
  await testSuccessiveInvestigationsUniqueNodes();
  await testFallbackCommitReason();
  await testEwaSubstratePreserved();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }

  console.log("all Phase 2D lineage tests passed");
}

main();
