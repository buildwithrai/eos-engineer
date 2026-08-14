import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/loop.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-phase3-noop-plan-liveness"
);

const A_IMPORTS_B = 'import { b } from "./b.js";\nexport const a = b;\n';
const STANDALONE_B = "export const b = 2;\n";

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
  writeFile("src/a.js", A_IMPORTS_B);
  writeFile("src/b.js", STANDALONE_B);
  writeFile(".ige/inspect.json", '{"project":{"name":"phase3-noop-plan-liveness"}}\n');
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

function emptyPlan() {
  return { type: "plan" };
}

function readFileTool(rel) {
  return { type: "tool", tool: "read_file", input: { path: rel } };
}

function lastContent(messages) {
  const last = messages[messages.length - 1];
  return typeof last?.content === "string" ? last.content : "";
}

/**
 * N1: a mutating adoption is reported as progress, but the identical
 * re-adoption of the same already-adopted dependency is a no-op: the runtime
 * must not report it as progress and must instead name the uninspected
 * adopted requirement as the concrete next read.
 */
async function testRepeatedAdoptionPlanIsNoop() {
  freshWorkspace();

  let calls = 0;
  let sawPlanApplied = false;
  let sawNoopDirective = false;

  const chatFn = async (messages) => {
    calls += 1;

    if (calls === 1) return { content: JSON.stringify(readFileTool("src/a.js")) };
    if (calls === 2) return { content: JSON.stringify(plan(["src/b.js"], [])) };
    if (calls === 3) {
      sawPlanApplied = lastContent(messages).includes(
        "Plan applied. Continue investigating"
      );
      return { content: JSON.stringify(plan(["src/b.js"], [])) };
    }

    const content = lastContent(messages);
    sawNoopDirective =
      content.includes("Plan produced no investigation-state change") &&
      content.includes("Call read_file or read_files with: src/b.js") &&
      !content.includes("Plan applied");

    return { content: JSON.stringify(judgment("blocked", [])) };
  };

  const surface = await runEos("Investigate src/a.js and judge it.", {
    workspace,
    chatFn,
    maxIterations: 5,
  });

  assert(
    "N1 first adoption reports progress",
    sawPlanApplied,
    "the first (mutating) adoption must still be reported as progress"
  );

  assert(
    "N1 repeated adoption flagged as no state change with directive",
    sawNoopDirective,
    "re-adopting an adopted dependency must not be reported as progress"
  );

  assert(
    "N1 b remains an adopted requirement",
    surface.investigation.adopted_requirements.includes("src/b.js")
  );

  assert(
    "N1 b remains uninspected (no hidden inspection)",
    !surface.investigation.inspected_evidence.includes("src/b.js")
  );
}

/**
 * N2: an empty plan while inspection is pending is a no-op: the runtime must
 * name the uninspected explicit requirement as the next read.
 */
async function testEmptyPlanWhilePending() {
  freshWorkspace();

  let calls = 0;
  let sawDirective = false;

  const chatFn = async (messages) => {
    calls += 1;

    if (calls === 1) return { content: JSON.stringify(emptyPlan()) };

    const content = lastContent(messages);
    sawDirective =
      content.includes("Plan produced no investigation-state change") &&
      content.includes("Call read_file or read_files with: src/a.js");

    return { content: JSON.stringify(judgment("blocked", [])) };
  };

  const surface = await runEos("Investigate src/a.js and judge it.", {
    workspace,
    chatFn,
    maxIterations: 4,
  });

  assert(
    "N2 empty plan flagged as no state change with directive",
    sawDirective
  );

  assert(
    "N2 no inspection fabricated on the model's behalf",
    surface.investigation.inspected_evidence.length === 0
  );

  assert("N2 explicit requirement still a gap", surface.investigation.gaps.includes("src/a.js"));
}

/**
 * N3: after a no-op intervention names the uninspected requirement, the model
 * can read it and the investigation completes normally.
 */
async function testReadAfterNoopIntervention() {
  freshWorkspace();

  let calls = 0;
  let readAfterDirective = false;

  const chatFn = async (messages) => {
    calls += 1;

    if (calls === 1) return { content: JSON.stringify(readFileTool("src/a.js")) };
    if (calls === 2) return { content: JSON.stringify(plan(["src/b.js"], [])) };
    if (calls === 3) return { content: JSON.stringify(plan(["src/b.js"], [])) };

    if (calls === 4) {
      const content = lastContent(messages);
      readAfterDirective =
        content.includes("Plan produced no investigation-state change") &&
        content.includes("Call read_file or read_files with: src/b.js");
      return {
        content: JSON.stringify(
          readAfterDirective ? readFileTool("src/b.js") : plan(["src/b.js"], [])
        ),
      };
    }

    return {
      content: JSON.stringify(
        judgment("declared", ["src/a.js", "src/b.js"], "a and b inspected.")
      ),
    };
  };

  const surface = await runEos("Investigate src/a.js and judge it.", {
    workspace,
    chatFn,
    maxIterations: 6,
  });

  assert(
    "N3 read performed after no-op directive",
    readAfterDirective
  );

  assert(
    "N3 b inspected after directive",
    surface.investigation.inspected_evidence.includes("src/b.js")
  );

  assert("N3 declared admitted after required inspection", surface.status === "declared");
  assert("N3 phase complete", surface.investigation.phase === "complete");
  assert("N3 gaps empty", surface.investigation.gaps.length === 0);
  assert("N3 not a fallback judgment", surface.commit_reason !== "fallback");
}

/**
 * N4: judgment gating is unchanged. A declared judgment is still rejected
 * while an adopted requirement remains uninspected, even after a no-op plan
 * was called out.
 */
async function testJudgmentRejectedWhileAdoptedUninspected() {
  freshWorkspace();

  let calls = 0;
  let sawRejected = false;

  const chatFn = async (messages) => {
    calls += 1;

    if (calls === 1) return { content: JSON.stringify(readFileTool("src/a.js")) };
    if (calls === 2) return { content: JSON.stringify(plan(["src/b.js"], [])) };
    if (calls === 3) {
      return {
        content: JSON.stringify(judgment("declared", ["src/a.js"], "a is sound.")),
      };
    }

    const content = lastContent(messages);
    sawRejected =
      content.includes("You cannot finish yet") &&
      content.includes("Adopted evidence not inspected: src/b.js");

    return { content: JSON.stringify(judgment("blocked", [])) };
  };

  const surface = await runEos("Investigate src/a.js and judge it.", {
    workspace,
    chatFn,
    maxIterations: 5,
  });

  assert(
    "N4 declared rejected while adopted b uninspected",
    sawRejected
  );

  assert("N4 b remains a gap", surface.investigation.gaps.includes("src/b.js"));
  assert("N4 phase inspecting", surface.investigation.phase === "inspecting");
}

/**
 * N5: the no-op intervention does not interfere with the normal completion
 * path: adopt, inspect, then judge is still admitted.
 */
async function testDeclaredAfterRequiredInspection() {
  freshWorkspace();

  let calls = 0;

  const chatFn = async () => {
    calls += 1;

    if (calls === 1) return { content: JSON.stringify(readFileTool("src/a.js")) };
    if (calls === 2) return { content: JSON.stringify(plan(["src/b.js"], [])) };
    if (calls === 3) return { content: JSON.stringify(readFileTool("src/b.js")) };
    return {
      content: JSON.stringify(
        judgment("declared", ["src/a.js", "src/b.js"], "a and b inspected.")
      ),
    };
  };

  const surface = await runEos("Investigate src/a.js and judge it.", {
    workspace,
    chatFn,
    maxIterations: 5,
  });

  assert(
    "N5 declared admitted after inspecting adopted requirement",
    surface.status === "declared"
  );
  assert("N5 phase complete", surface.investigation.phase === "complete");
  assert("N5 gaps empty", surface.investigation.gaps.length === 0);
  assert(
    "N5 b inspected",
    surface.investigation.inspected_evidence.includes("src/b.js")
  );
  assert("N5 not a fallback judgment", surface.commit_reason !== "fallback");
}

async function main() {
  await testRepeatedAdoptionPlanIsNoop();
  await testEmptyPlanWhilePending();
  await testReadAfterNoopIntervention();
  await testJudgmentRejectedWhileAdoptedUninspected();
  await testDeclaredAfterRequiredInspection();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all Phase 3 no-op plan liveness tests passed");
}

main();
