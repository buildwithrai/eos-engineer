import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/loop.js";
import { verifyLineage } from "../src/lineage.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-phase3-investigation-lifecycle"
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
    '{"project":{"name":"phase3-investigation-lifecycle"}}\n'
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
    maxIterations: options.maxIterations ?? 8,
  });

  return { surface, calls };
}

function lastContent(messages) {
  const last = messages[messages.length - 1];
  return typeof last?.content === "string" ? last.content : "";
}

const STANDALONE_A = "export const a = 1;\n";
const A_IMPORTS_B = 'import { b } from "./b.js";\nexport const a = b;\n';
const B_IMPORTS_C = 'import { c } from "./c.js";\nexport const b = c;\n';
const STANDALONE_B = "export const b = 2;\n";
const STANDALONE_C = "export const c = 3;\n";
const STANDALONE_EXTRA = "export const extra = 4;\n";

/**
 * L1: explicit requirement -> inspection -> completion.
 */
async function testExplicitInspectionCompletion() {
  freshWorkspace();
  writeFile("src/a.js", STANDALONE_A);

  const { surface } = await runWithResponses(
    "Investigate src/a.js and judge it.",
    [readFileTool("src/a.js"), judgment("declared", ["src/a.js"])]
  );

  assert("L1 declared admitted", surface.status === "declared");
  assert("L1 phase complete", surface.investigation.phase === "complete");
  assert("L1 gaps empty", surface.investigation.gaps.length === 0);
  assert(
    "L1 inspected evidence recorded",
    surface.investigation.inspected_evidence.includes("src/a.js")
  );
}

/**
 * L2: inspection -> dependency discovery.
 */
async function testDependencyDiscovery() {
  freshWorkspace();
  writeFile("src/a.js", A_IMPORTS_B);
  writeFile("src/b.js", STANDALONE_B);

  const { surface } = await runWithResponses(
    "Investigate src/a.js and judge it.",
    [readFileTool("src/a.js")]
  );

  assert(
    "L2 discovered a -> b",
    surface.investigation.discovered_dependencies.some(
      (d) => d.from === "src/a.js" && d.to === "src/b.js" && d.status === "pending"
    )
  );
  assert("L2 phase planning", surface.investigation.phase === "planning");
}

/**
 * L3: pending dependency blocks judgment.
 */
async function testPendingBlocksJudgment() {
  freshWorkspace();
  writeFile("src/a.js", A_IMPORTS_B);
  writeFile("src/b.js", STANDALONE_B);

  const { surface, calls } = await runWithResponses(
    "Investigate src/a.js and judge it.",
    [readFileTool("src/a.js"), judgment("declared", ["src/a.js"])],
    { maxIterations: 3 }
  );

  assert("L3 declared rejected while pending", calls >= 3);
  assert("L3 falls back to blocked", surface.status === "blocked");
  assert(
    "L3 unresolved relationship recorded",
    surface.investigation.unresolved_relationships.includes("src/a.js -> src/b.js")
  );
  assert("L3 phase planning recorded", surface.investigation.phase === "planning");
}

/**
 * L4: valid adoption -> required inspection.
 */
async function testValidAdoptionRequiresInspection() {
  freshWorkspace();
  writeFile("src/a.js", A_IMPORTS_B);
  writeFile("src/b.js", STANDALONE_B);

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

  assert("L4 adopted-but-uninspected rejected", calls >= 4);
  assert("L4 declared admitted after adopting inspected", surface.status === "declared");
  assert(
    "L4 adopted requirement recorded",
    surface.investigation.adopted_requirements.includes("src/b.js")
  );
  assert("L4 phase complete", surface.investigation.phase === "complete");
}

/**
 * L5: valid waiver -> no inspection required.
 */
async function testValidWaiver() {
  freshWorkspace();
  writeFile("src/a.js", A_IMPORTS_B);
  writeFile("src/b.js", STANDALONE_B);

  const { surface } = await runWithResponses(
    "Investigate src/a.js and judge it.",
    [
      readFileTool("src/a.js"),
      plan([], [{ path: "src/b.js", reason: "b is a leaf; not needed for the trace" }]),
      judgment("declared", ["src/a.js"]),
    ]
  );

  assert("L5 declared admitted after waiver", surface.status === "declared");
  assert(
    "L5 b waived with reason",
    surface.investigation.discovered_dependencies.some(
      (d) => d.to === "src/b.js" && d.status === "waived" && d.reason.length > 0
    )
  );
  assert("L5 no unresolved relationships", surface.investigation.unresolved_relationships.length === 0);
  assert("L5 phase complete", surface.investigation.phase === "complete");
}

/**
 * L6: invalid adoption (unknown file) rejected, and the model can recover.
 */
async function testInvalidAdoptionRejected() {
  freshWorkspace();
  writeFile("src/a.js", A_IMPORTS_B);
  writeFile("src/b.js", STANDALONE_B);

  let calls = 0;
  let sawPlanRejected = false;

  const chatFn = async (messages) => {
    calls += 1;

    if (calls === 1) return { content: JSON.stringify(readFileTool("src/a.js")) };
    if (calls === 2) {
      return { content: JSON.stringify(plan(["src/ghost.js"], [])) };
    }
    if (calls === 3) {
      sawPlanRejected = lastContent(messages).includes("Plan rejected");
      return {
        content: JSON.stringify(
          plan([], [{ path: "src/b.js", reason: "b is a leaf; not needed for the trace" }])
        ),
      };
    }
    return { content: JSON.stringify(judgment("declared", ["src/a.js"])) };
  };

  const surface = await runEos("Investigate src/a.js and judge it.", {
    workspace,
    chatFn,
    maxIterations: 6,
  });

  assert("L6 invalid adoption rejected", sawPlanRejected);
  assert(
    "L6 unknown file never adopted",
    !surface.investigation.adopted_requirements.includes("src/ghost.js")
  );
  assert("L6 declared admitted after recovery", surface.status === "declared");
  assert("L6 phase complete", surface.investigation.phase === "complete");
}

/**
 * L7: invalid waiver (empty reason) rejected, and the model can recover.
 */
async function testInvalidWaiverRejected() {
  freshWorkspace();
  writeFile("src/a.js", A_IMPORTS_B);
  writeFile("src/b.js", STANDALONE_B);

  let calls = 0;
  let sawPlanRejected = false;

  const chatFn = async (messages) => {
    calls += 1;

    if (calls === 1) return { content: JSON.stringify(readFileTool("src/a.js")) };
    if (calls === 2) {
      return {
        content: JSON.stringify(
          plan([], [{ path: "src/b.js", reason: "   " }])
        ),
      };
    }
    if (calls === 3) {
      sawPlanRejected = lastContent(messages).includes("Plan rejected");
      return {
        content: JSON.stringify(
          plan([], [{ path: "src/b.js", reason: "b is a leaf; not needed for the trace" }])
        ),
      };
    }
    return { content: JSON.stringify(judgment("declared", ["src/a.js"])) };
  };

  const surface = await runEos("Investigate src/a.js and judge it.", {
    workspace,
    chatFn,
    maxIterations: 6,
  });

  assert("L7 invalid waiver rejected", sawPlanRejected);
  assert("L7 declared admitted after recovery", surface.status === "declared");
  assert(
    "L7 b waived with reason",
    surface.investigation.discovered_dependencies.some(
      (d) => d.to === "src/b.js" && d.status === "waived" && d.reason.length > 0
    )
  );
  assert("L7 phase complete", surface.investigation.phase === "complete");
}

/**
 * L8: adopted dependency discovers another dependency (a -> b -> c).
 */
async function testAdoptedDiscoversFurtherDependency() {
  freshWorkspace();
  writeFile("src/a.js", A_IMPORTS_B);
  writeFile("src/b.js", B_IMPORTS_C);
  writeFile("src/c.js", STANDALONE_C);

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

  assert("L8 declared admitted", surface.status === "declared");
  assert(
    "L8 b adopted",
    surface.investigation.discovered_dependencies.some(
      (d) => d.to === "src/b.js" && d.status === "adopted"
    )
  );
  assert(
    "L8 c discovered from b and waived",
    surface.investigation.discovered_dependencies.some(
      (d) => d.from === "src/b.js" && d.to === "src/c.js" && d.status === "waived"
    )
  );
  assert("L8 no unresolved relationships", surface.investigation.unresolved_relationships.length === 0);
  assert("L8 phase complete", surface.investigation.phase === "complete");
}

/**
 * L9: repeated early judgment cannot bypass investigation.
 */
async function testRepeatedEarlyJudgmentCannotBypass() {
  freshWorkspace();
  writeFile("src/a.js", STANDALONE_A);

  const { surface, calls } = await runWithResponses(
    "Investigate src/a.js and judge it.",
    [
      judgment("declared", ["src/a.js"]),
      judgment("declared", ["src/a.js"]),
      judgment("declared", ["src/a.js"]),
      judgment("declared", ["src/a.js"]),
    ],
    { maxIterations: 5 }
  );

  assert("L9 judgment rejected every attempt", calls >= 4);
  assert("L9 cannot bypass to declared", surface.status === "blocked");
  assert(
    "L9 explicit requirement still a gap",
    surface.investigation.gaps.includes("src/a.js")
  );
  assert("L9 phase inspecting", surface.investigation.phase === "inspecting");
  assert("L9 nothing was inspected", surface.investigation.inspected_evidence.length === 0);
}

/**
 * L10: malformed model response cannot corrupt investigation state.
 */
async function testMalformedResponseDoesNotCorrupt() {
  freshWorkspace();
  writeFile("src/a.js", STANDALONE_A);

  let calls = 0;

  const chatFn = async () => {
    calls += 1;

    if (calls === 1) return { content: "this is not json at all" };
    if (calls === 2) return { content: JSON.stringify(readFileTool("src/a.js")) };
    return { content: JSON.stringify(judgment("declared", ["src/a.js"])) };
  };

  const surface = await runEos("Investigate src/a.js and judge it.", {
    workspace,
    chatFn,
    maxIterations: 5,
  });

  assert("L10 malformed response consumed", calls === 3);
  assert("L10 declared admitted after recovery", surface.status === "declared");
  assert(
    "L10 inspection recorded",
    surface.investigation.inspected_evidence.includes("src/a.js")
  );
  assert("L10 phase complete", surface.investigation.phase === "complete");
}

/**
 * L11: multiple tool reads preserve investigation state.
 */
async function testMultipleReadsPreserveState() {
  freshWorkspace();
  writeFile("src/a.js", STANDALONE_A);
  writeFile("src/extra.js", STANDALONE_EXTRA);

  const { surface } = await runWithResponses(
    "Investigate src/a.js and judge it.",
    [
      readFileTool("src/a.js"),
      readFileTool("src/a.js"),
      readFileTool("src/extra.js"),
      judgment("declared", ["src/a.js", "src/extra.js"]),
    ]
  );

  assert("L11 declared admitted", surface.status === "declared");
  assert(
    "L11 inspected evidence unique and complete",
    surface.investigation.inspected_evidence.includes("src/a.js") &&
      surface.investigation.inspected_evidence.includes("src/extra.js")
  );
  assert("L11 no invented dependencies", surface.investigation.discovered_dependencies.length === 0);
  assert("L11 phase complete", surface.investigation.phase === "complete");
}

/**
 * L12: final projection records the actual investigation state, on the
 * returned surface and in the persisted ledger node.
 */
async function testProjectionRecordsInvestigationState() {
  freshWorkspace();
  writeFile("src/a.js", A_IMPORTS_B);
  writeFile("src/b.js", B_IMPORTS_C);
  writeFile("src/c.js", STANDALONE_C);

  const { surface } = await runWithResponses(
    "Investigate src/a.js and judge it.",
    [
      readFileTool("src/a.js"),
      plan(["src/b.js"], []),
      readFileTool("src/b.js"),
      plan([], [{ path: "src/c.js", reason: "c is a leaf; the trace stops at b" }]),
      judgment("declared", ["src/a.js", "src/b.js"]),
    ]
  );

  assert("L12 phase complete in surface", surface.investigation.phase === "complete");
  assert(
    "L12 adopted requirement recorded",
    surface.investigation.adopted_requirements.includes("src/b.js")
  );
  assert(
    "L12 dependency statuses recorded",
    surface.investigation.discovered_dependencies.some(
      (d) => d.to === "src/b.js" && d.status === "adopted"
    ) &&
      surface.investigation.discovered_dependencies.some(
        (d) => d.to === "src/c.js" && d.status === "waived" && d.reason.length > 0
      )
  );

  const persisted = JSON.parse(
    fs.readFileSync(path.join(workspace, ".eos", "judgment.json"), "utf8")
  );

  assert("L12 phase persisted", persisted.investigation.phase === "complete");
  assert(
    "L12 adopted requirement persisted",
    persisted.investigation.adopted_requirements.includes("src/b.js")
  );
  assert(
    "L12 dependency dispositions persisted",
    persisted.investigation.discovered_dependencies.some(
      (d) => d.to === "src/b.js" && d.status === "adopted"
    ) &&
      persisted.investigation.discovered_dependencies.some(
        (d) => d.to === "src/c.js" && d.status === "waived"
      )
  );

  const lineage = verifyLineage(workspace);
  assert(
    "L12 lineage valid after lifecycle",
    lineage.state === "none" || lineage.state === "consistent"
  );
}

/**
 * L13: the model cannot lose the thread after a tool result; the runtime
 * surfaces the INVESTIGATION STATE (including pending relationships) in the
 * message immediately following the tool result.
 */
async function testThreadPreservedAfterToolResult() {
  freshWorkspace();
  writeFile("src/a.js", A_IMPORTS_B);
  writeFile("src/b.js", STANDALONE_B);

  let calls = 0;
  let sawPendingStateAfterTool = false;
  let sawCompleteState = false;

  const chatFn = async (messages) => {
    calls += 1;
    const content = lastContent(messages);

    if (calls === 1) return { content: JSON.stringify(readFileTool("src/a.js")) };

    if (calls === 2) {
      sawPendingStateAfterTool =
        content.includes("INVESTIGATION STATE") &&
        content.includes("Phase: planning") &&
        content.includes("src/a.js -> src/b.js");
      return {
        content: JSON.stringify(
          plan([], [{ path: "src/b.js", reason: "b is a leaf; not needed for the trace" }])
        ),
      };
    }

    if (calls === 3) {
      sawCompleteState =
        content.includes("INVESTIGATION STATE") && content.includes("complete");
      return { content: JSON.stringify(judgment("declared", ["src/a.js"])) };
    }

    return { content: JSON.stringify(judgment("blocked", [])) };
  };

  const surface = await runEos("Investigate src/a.js and judge it.", {
    workspace,
    chatFn,
    maxIterations: 5,
  });

  assert("L13 pending state surfaced after tool result", sawPendingStateAfterTool);
  assert("L13 complete state surfaced after plan", sawCompleteState);
  assert("L13 declared admitted", surface.status === "declared");
}

/**
 * L14: reading a discovered dependency implicitly adopts it, exactly like a
 * plan adoption. The runtime determines the disposition; the read path and
 * the plan path must converge on the same state.
 */
async function testImplicitAdoptionViaReadMatchesPlan() {
  freshWorkspace();
  writeFile("src/a.js", A_IMPORTS_B);
  writeFile("src/b.js", B_IMPORTS_C);
  writeFile("src/c.js", STANDALONE_C);

  const { surface } = await runWithResponses(
    "Investigate src/a.js and judge it.",
    [
      readFileTool("src/a.js"),
      readFileTool("src/b.js"),
      plan([], [{ path: "src/c.js", reason: "c is a leaf; the trace stops at b" }]),
      judgment("declared", ["src/a.js", "src/b.js"]),
    ]
  );

  assert("L14 declared admitted", surface.status === "declared");
  assert(
    "L14 read implicitly adopted b",
    surface.investigation.discovered_dependencies.some(
      (d) => d.to === "src/b.js" && d.status === "adopted"
    )
  );
  assert(
    "L14 implicitly adopted b is a requirement",
    surface.investigation.adopted_requirements.includes("src/b.js")
  );
  assert(
    "L14 c discovered from adopted b and waived",
    surface.investigation.discovered_dependencies.some(
      (d) => d.from === "src/b.js" && d.to === "src/c.js" && d.status === "waived"
    )
  );
  assert("L14 no unresolved relationships", surface.investigation.unresolved_relationships.length === 0);
  assert("L14 phase complete", surface.investigation.phase === "complete");
}

/**
 * L15: adoption of an explicit requirement is rejected with prescriptive
 * guidance, and the model can still complete the investigation.
 */
async function testAdoptExplicitRejected() {
  freshWorkspace();
  writeFile("src/a.js", STANDALONE_A);

  let calls = 0;
  let sawGuidance = false;

  const chatFn = async (messages) => {
    calls += 1;

    if (calls === 1) return { content: JSON.stringify(readFileTool("src/a.js")) };
    if (calls === 2) return { content: JSON.stringify(plan(["src/a.js"], [])) };
    if (calls === 3) {
      sawGuidance =
        lastContent(messages).includes("Plan rejected") &&
        lastContent(messages).includes("must be inspected with read_file");
      return { content: JSON.stringify(judgment("declared", ["src/a.js"])) };
    }
    return { content: JSON.stringify(judgment("blocked", [])) };
  };

  const surface = await runEos("Investigate src/a.js and judge it.", {
    workspace,
    chatFn,
    maxIterations: 5,
  });

  assert("L15 adopt-explicit rejected with guidance", sawGuidance);
  assert("L15 declared admitted", surface.status === "declared");
  assert("L15 phase complete", surface.investigation.phase === "complete");
}

async function main() {
  await testExplicitInspectionCompletion();
  await testDependencyDiscovery();
  await testPendingBlocksJudgment();
  await testValidAdoptionRequiresInspection();
  await testValidWaiver();
  await testInvalidAdoptionRejected();
  await testInvalidWaiverRejected();
  await testAdoptedDiscoversFurtherDependency();
  await testRepeatedEarlyJudgmentCannotBypass();
  await testMalformedResponseDoesNotCorrupt();
  await testMultipleReadsPreserveState();
  await testProjectionRecordsInvestigationState();
  await testThreadPreservedAfterToolResult();
  await testImplicitAdoptionViaReadMatchesPlan();
  await testAdoptExplicitRejected();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all Phase 3 investigation-lifecycle tests passed");
}

main();
