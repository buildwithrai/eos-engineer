import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/runtime/run.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-phase3-implicit-adoption"
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
  writeFile("src/a.js", 'import { b } from "./b.js";\nexport const a = b;\n');
  writeFile("src/b.js", 'import { c } from "./c.js";\nexport const b = c;\n');
  writeFile("src/c.js", "export const c = 3;\n");
  writeFile(".ige/inspect.json", '{"project":{"name":"phase3-implicit-adoption"}}\n');
}

/**
 * EOS prompt contract: "Reading a discovered dependency implicitly adopts it."
 * applyPlan adoption does two things: the dependency status becomes "adopted"
 * AND the file becomes an investigation requirement (adoptedRequirements),
 * which brings it into scope so its own structural dependencies are extracted.
 *
 * The read path must produce the SAME state. If reading a discovered
 * dependency only flips its status without adding it to the investigation
 * scope, its sub-dependencies are silently never discovered and the traversal
 * stops one level too early.
 */
function buildModel(secondMessage) {
  let calls = 0;
  const sequence = [
    { type: "tool", tool: "read_file", input: { path: "src/a.js" } },
    { type: "tool", tool: "read_file", input: { path: "src/b.js" } },
    secondMessage,
    {
      type: "judgment",
      judgment: [
        {
          claim: "src/a.js is sound and src/b.js is sound.",
          type: "declared",
          confidence: "high",
          evidence_refs: ["src/a.js", "src/b.js"],
        },
      ],
      restrictions: [],
    },
  ];

  const chatFn = async () => {
    const response = sequence[Math.min(calls, sequence.length - 1)];
    calls += 1;
    return { content: JSON.stringify(response) };
  };

  return { chatFn, calls: () => calls };
}

/**
 * IA1: implicit adoption (read without a plan) must behave exactly like
 * plan adoption: the read file joins adopted_requirements, and its own
 * structural dependencies are discovered as pending.
 *
 * Sequence: read a (discovers b), read b (implicitly adopts b), then the
 * model must dispose of the newly discovered c. If the traversal stops at b,
 * c is never discovered and the surface silently reports a shallower
 * investigation than the architecture promises.
 */
async function testImplicitAdoptionDrivesTraversal() {
  freshWorkspace();

  const { chatFn, calls } = buildModel({
    type: "plan",
    adopt: [],
    waive: [{ path: "src/c.js", reason: "c is a leaf constant; the trace stops at b" }],
  });

  const surface = await runEos(
    "Investigate src/a.js and judge it.",
    { workspace, chatFn, maxIterations: 6 }
  );

  const deps = surface.investigation.discovered_dependencies ?? [];
  const b = deps.find((d) => d.to === "src/b.js");
  const c = deps.find((d) => d.to === "src/c.js");

  assert(
    "IA1 read of discovered dependency transitions b to adopted",
    b?.status === "adopted",
    JSON.stringify(b)
  );

  assert(
    "IA1 implicitly adopted b joins adopted_requirements",
    (surface.investigation.adopted_requirements ?? []).includes("src/b.js"),
    JSON.stringify(surface.investigation.adopted_requirements)
  );

  assert(
    "IA1 sub-dependency c discovered from b and waived",
    c?.from === "src/b.js" && c?.status === "waived",
    JSON.stringify(c)
  );

  assert("IA1 declared admitted after disposing c", surface.status === "declared");

  assert(
    "IA1 no unresolved relationships",
    (surface.investigation.unresolved_relationships ?? []).length === 0
  );

  assert(
    "IA1 investigation completed in the 4 planned turns",
    calls() <= 4
  );
}

/**
 * IA2: the planning gate must hold at depth 2. After implicitly adopting b,
 * c is pending, so a declared judgment that does not dispose of c must be
 * rejected and the surface must fall back to blocked.
 */
async function testDeepTraversalPlanningGate() {
  freshWorkspace();

  const { chatFn, calls } = buildModel({
    type: "judgment",
    judgment: [
      {
        claim: "src/a.js and src/b.js are sound.",
        type: "declared",
        confidence: "high",
        evidence_refs: ["src/a.js", "src/b.js"],
      },
    ],
    restrictions: [],
  });

  const surface = await runEos(
    "Investigate src/a.js and judge it.",
    { workspace, chatFn, maxIterations: 6 }
  );

  assert("IA2 declared rejected while sub-dependency pending", calls() >= 3);

  assert("IA2 falls back to blocked", surface.status === "blocked");

  assert(
    "IA2 unresolved relationship b -> c recorded",
    (surface.investigation.unresolved_relationships ?? []).includes("src/b.js -> src/c.js"),
    JSON.stringify(surface.investigation.unresolved_relationships)
  );

  assert(
    "IA2 c discovered as pending",
    (surface.investigation.discovered_dependencies ?? []).some(
      (d) => d.to === "src/c.js" && d.status === "pending"
    )
  );
}

async function main() {
  await testImplicitAdoptionDrivesTraversal();
  await testDeepTraversalPlanningGate();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all Phase 3 implicit-adoption tests passed");
}

main();
