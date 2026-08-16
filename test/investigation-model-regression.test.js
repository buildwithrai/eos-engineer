import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/runtime/run.js";
import {
  createInvestigation,
  completionReason,
  understandingOf,
} from "../src/investigation.js";
import { recordInspection } from "../src/investigation.js";
import { buildSurface } from "../src/judgmentSurface.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-investigation-model"
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

function freshWorkspace() {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, "src", "a.js"),
    "export const a = 1;\n"
  );
  fs.writeFileSync(
    path.join(workspace, "src", "b.js"),
    "import { a } from './a.js';\nexport const b = a + 1;\n"
  );
  fs.writeFileSync(path.join(workspace, "src", "c.js"), "export const c = 2;\n");
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

async function runWithResponses(userInput, responses) {
  let calls = 0;

  const chatFn = async () => {
    const response = responses[Math.min(calls, responses.length - 1)];
    calls += 1;
    return { content: JSON.stringify(response) };
  };

  return runEos(userInput, { workspace, chatFn });
}

freshWorkspace();

{
  const inv = createInvestigation("Check src/a.js", { workspaceRoot: workspace });

  recordInspection(
    inv,
    {
      ok: true,
      path: path.join(workspace, "src", "a.js"),
      content: "export const a = 1;\n",
    },
    workspace
  );

  const observation = inv.observations[0];

  assert(
    "G5 observation recorded per evidence",
    observation !== undefined &&
      observation.path === "src/a.js" &&
      observation.exists === true &&
      typeof observation.digest === "string" &&
      observation.digest.length === 64,
    JSON.stringify(observation)
  );

  assert(
    "G5 observation is deterministic (bytes and lines)",
    observation !== undefined &&
      observation.bytes === Buffer.byteLength("export const a = 1;\n", "utf8") &&
      observation.lines === "export const a = 1;\n".split("\n").length,
    JSON.stringify(observation)
  );

  const reObservation = recordInspection;
  reObservation(
    inv,
    {
      ok: true,
      path: path.join(workspace, "src", "a.js"),
      content: "export const a = 1;\n",
    },
    workspace
  );

  assert(
    "G5 re-inspection updates observation, never duplicates",
    inv.observations.length === 1,
    `observations=${inv.observations.length}`
  );

  recordInspection(
    inv,
    {
      ok: true,
      path: path.join(workspace, "src", "b.js"),
      content: "import { a } from './a.js';\nexport const b = a + 1;\n",
    },
    workspace
  );

  const understanding = understandingOf(inv);

  assert(
    "G5 understanding synthesizes the account from observations",
    Array.isArray(understanding.observations) &&
      understanding.observations.length === 2 &&
      understanding.inspected.includes("src/a.js") &&
      understanding.inspected.includes("src/b.js") &&
      understanding.completion.status === "complete",
    JSON.stringify(understanding)
  );
}

freshWorkspace();

{
  const inv = createInvestigation("Check src/a.js", {
    workspaceRoot: workspace,
  });

  recordInspection(
    inv,
    {
      ok: true,
      path: path.join(workspace, "src", "a.js"),
      content: "import { c } from './c.js';\nexport const a = c;\n",
    },
    workspace
  );

  const incomplete = completionReason(inv);

  assert(
    "G5 completion reason is deterministic (incomplete while dependency pending)",
    incomplete.status === "incomplete" &&
      incomplete.reason === "planning-pending" &&
      typeof incomplete.detail === "string",
    JSON.stringify(incomplete)
  );
}

freshWorkspace();

{
  const responses = [
    { type: "tool", tool: "read_file", input: { path: "src/a.js" } },
    { type: "tool", tool: "read_file", input: { path: "src/b.js" } },
    judgment("declared", ["src/a.js", "src/b.js"]),
  ];

  const surface = await runWithResponses(
    "Inspect src/a.js and src/b.js, then judge.",
    responses
  );

  const investigation = surface.investigation;

  assert(
    "G5 surface records per-evidence observations",
    Array.isArray(investigation.observations) &&
      investigation.observations.length === 2 &&
      investigation.observations.every(
        (observation) =>
          typeof observation.path === "string" &&
          observation.exists === true &&
          typeof observation.digest === "string" &&
          typeof observation.lines === "number"
      ),
    JSON.stringify(investigation.observations)
  );

  assert(
    "G5 surface exposes deterministic completion reason",
    investigation.completion !== undefined &&
      investigation.completion.status === "complete" &&
      investigation.completion.reason === "investigation-complete",
    JSON.stringify(investigation.completion)
  );

  assert(
    "G5 surface exposes understanding distinct from judgment",
    investigation.understanding !== undefined &&
      investigation.understanding.inspected.length === 2 &&
      Array.isArray(surface.judgment) &&
      surface.judgment.length === 1,
    JSON.stringify(investigation.understanding)
  );

  assert(
    "G5 observation refs correspond to inspected evidence",
    investigation.observations
      .map((observation) => observation.path)
      .sort()
      .join(",") === [...investigation.inspected_evidence].sort().join(","),
    JSON.stringify({
      observations: investigation.observations.map((o) => o.path),
      inspected: investigation.inspected_evidence,
    })
  );
}

freshWorkspace();

{
  const inv = createInvestigation("Form a project charter.", {
    mode: "formation",
    workspaceRoot: workspace,
  });

  const completion = completionReason(inv);

  assert(
    "G5 formation completion reason distinct",
    completion.status === "complete" &&
      completion.reason === "formation-satisfied",
    JSON.stringify(completion)
  );
}

freshWorkspace();

{
  const responses = [
    { type: "tool", tool: "read_file", input: { path: "src/a.js" } },
    { type: "tool", tool: "read_file", input: { path: "src/b.js" } },
    judgment("declared", ["src/a.js", "src/b.js"]),
  ];

  const first = await runWithResponses(
    "Inspect src/a.js and src/b.js, then judge.",
    responses
  );

  const engineeringState = first.engineering_state;

  assert(
    "G8 first surface has explicit engineering-state transition",
    engineeringState !== undefined &&
      engineeringState.schema === "eos-engineering-state/v1" &&
      engineeringState.from === null &&
      engineeringState.transition.reason === "judgment" &&
      engineeringState.to.status === "declared" &&
      engineeringState.to.judgment_id === first.judgment_id,
    JSON.stringify(engineeringState)
  );

  const second = await runWithResponses(
    "Inspect src/a.js and src/b.js, then judge.",
    responses
  );

  const transition = second.engineering_state;

  assert(
    "G8 subsequent surface records from -> transition -> to",
    transition !== undefined &&
      transition.from !== null &&
      transition.from.judgment_id === first.judgment_id &&
      transition.from.status === "declared" &&
      typeof transition.from.digest === "string" &&
      transition.to.status === "declared" &&
      transition.to.judgment_id === second.judgment_id,
    JSON.stringify(transition)
  );
}

{
  const surface = buildSurface(
    {
      mode: "repository",
      target: "check",
      objective: "check",
      explicitRequirements: new Set(["src/a.js"]),
      requiredFiles: ["src/a.js"],
      adoptedRequirements: new Set(),
      inspectedEvidence: new Set(["src/a.js"]),
      discoveredDependencies: [],
      inspections: [
        {
          ok: true,
          path: path.join(workspace, "src", "a.js"),
          content: "export const a = 1;\n",
        },
      ],
      prospectiveArtifacts: [],
      evidenceObligations: [],
      observations: [
        {
          path: "src/a.js",
          exists: true,
          digest: "0".repeat(64),
          bytes: 18,
          lines: 1,
          observedAt: "2026-08-15T00:00:00.000Z",
        },
      ],
    },
    [{ claim: "a exists", type: "declared", evidence_refs: ["src/a.js"] }],
    [],
    [],
    undefined,
    [],
    undefined,
    [],
    null,
    null,
    "judgment",
    [],
    [],
    null,
    undefined,
    "declared"
  );

  assert(
    "G5 buildSurface accepts observations/understanding/completion",
    surface.investigation.observations.length === 1 &&
      surface.investigation.completion.status === "complete" &&
      surface.investigation.understanding.inspected.includes("src/a.js"),
    JSON.stringify(surface.investigation)
  );
}

if (failures > 0) {
  console.error(`${failures} investigation-model regression assertion(s) failed`);
  process.exit(1);
} else {
  console.log("all investigation-model regression tests passed");
}
