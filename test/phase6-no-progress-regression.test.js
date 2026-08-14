import fs from "node:fs";
import path from "node:path";
import { runEos, NO_PROGRESS_LIMIT } from "../src/loop.js";
import { loadIntents } from "../src/formation.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-no-progress-regression"
);

const STANDALONE = "export const value = 1;\n";
const IMPORTS_B = 'import b from "./b.js";\nexport const value = b;\n';

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

function freshRepo() {
  fs.rmSync(workspace, { recursive: true, force: true });
  writeFile("src/a.js", IMPORTS_B);
  writeFile("src/b.js", STANDALONE);
}

function freshEmpty() {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(workspace, { recursive: true });
}

function knowledgeJudgment() {
  return {
    type: "judgment",
    judgment: [
      {
        claim: "The architecture is suitable based on repository knowledge.",
        type: "declared",
        confidence: "medium",
        evidence_refs: ["REPOSITORY KNOWLEDGE"],
      },
    ],
  };
}

/**
 * S1: the SaaS failure regression. The model alternates a judgment that only
 * cites "REPOSITORY KNOWLEDGE" (rejected: nothing inspected) with plans that
 * adopt fictional paths (rejected: not discovered dependencies). Neither ever
 * changes investigation state. Pre-fix, this consumed the entire iteration
 * budget and ended in a generic fallback; post-fix it must terminate early as
 * no-progress with a distinct reason.
 */
async function testAlternatingJudgmentPlanNoProgress() {
  freshRepo();

  let calls = 0;

  const surface = await runEos("Inspect src/a.js and judge it.", {
    workspace,
    chatFn: async () => {
      calls += 1;
      if (calls % 2 === 1) {
        return { content: JSON.stringify(knowledgeJudgment()) };
      }
      return {
        content: JSON.stringify({
          type: "plan",
          adopt: ["packages/fictional/Module.ts"],
        }),
      };
    },
    maxIterations: 10,
  });

  assert("S1 status blocked", surface.status === "blocked");
  assert(
    "S1 commit_reason no-progress",
    surface.commit_reason === "no-progress"
  );
  assert(
    "S1 blocker reason no-progress",
    surface.blocker?.reason === "no-progress" &&
      surface.blocker?.limit === NO_PROGRESS_LIMIT
  );
  assert(
    "S1 judgment claims no-progress",
    surface.judgment.some((item) => /no-progress/.test(item.claim))
  );
  assert(
    "S1 loop terminated before the budget",
    calls < 10 && calls === NO_PROGRESS_LIMIT
  );
  assert("S1 nothing was inspected", surface.investigation.inspected_evidence.length === 0);
}

/**
 * S2: a cooperative model must still be drivable to real inspection within the
 * no-progress budget. The moment feedback directs a read of the explicit
 * requirement, the model reads it and then judges with the inspected path.
 * No-progress detection must not prevent legitimate progress.
 */
async function testCooperativeModelStillProgresses() {
  fs.rmSync(workspace, { recursive: true, force: true });
  writeFile("src/a.js", STANDALONE);

  let calls = 0;
  let inspected = false;

  const chatFn = async (messages) => {
    calls += 1;

    if (calls === 1) {
      return { content: JSON.stringify(knowledgeJudgment()) };
    }

    const last = messages[messages.length - 1];
    const lastContent =
      typeof last?.content === "string" ? last.content : "";

    const readDirective =
      /read_file|read_files/.test(lastContent) && lastContent.includes("src/a.js");

    if (!inspected && readDirective) {
      inspected = true;
      return {
        content: JSON.stringify({
          type: "tool",
          tool: "read_file",
          input: { path: "src/a.js" },
        }),
      };
    }

    if (inspected && last?.role === "tool") {
      return {
        content: JSON.stringify({
          type: "judgment",
          judgment: [
            {
              claim: "Inspected src/a.js.",
              type: "declared",
              confidence: "high",
              evidence_refs: ["src/a.js"],
            },
          ],
        }),
      };
    }

    return { content: JSON.stringify(knowledgeJudgment()) };
  };

  const surface = await runEos("Inspect src/a.js and judge it.", {
    workspace,
    chatFn,
    maxIterations: 6,
  });

  assert(
    "S2 declared admitted after real inspection",
    surface.status === "declared" &&
      surface.judgment[0].evidence_refs.includes("src/a.js")
  );
  assert(
    "S2 inspected evidence recorded",
    surface.investigation.inspected_evidence.includes("src/a.js")
  );
  assert(
    "S2 not terminated as no-progress",
    surface.commit_reason === "judgment" && surface.blocker === null
  );
  assert("S2 completed within budget", calls <= 4);
}

/**
 * S3: formation-mode no-progress. An uncooperative formation model plans
 * without ever judging; adoption of non-discoverable paths changes no state.
 */
async function testFormationModeNoProgress() {
  freshEmpty();

  let calls = 0;

  const surface = await runEos(
    "Create a project charter for a greenfield irrigation controller project.",
    {
      workspace,
      chatFn: async () => {
        calls += 1;
        return {
          content: JSON.stringify({
            type: "plan",
            adopt: ["docs/charter.md"],
          }),
        };
      },
      maxIterations: 10,
    }
  );

  assert("S3 formation mode detected", surface.mode === "formation");
  assert("S3 status blocked", surface.status === "blocked");
  assert(
    "S3 commit_reason no-progress",
    surface.commit_reason === "no-progress" &&
      surface.blocker?.reason === "no-progress"
  );
  assert("S3 terminated before the budget", calls === NO_PROGRESS_LIMIT);
  assert(
    "S3 intent record still persisted as the sole artifact",
    loadIntents(workspace).length === 1
  );
}

/**
 * S4: repeated re-adoption of an already-adopted dependency is accepted but
 * changes no state; the loop must not consume the budget. The model first
 * reads the importing file (real progress) and adopts the discovered
 * dependency once (real progress), then re-adopts without inspecting.
 */
async function testRepeatedAdoptNoProgress() {
  freshRepo();

  let calls = 0;

  const surface = await runEos("Inspect src/a.js and judge it.", {
    workspace,
    chatFn: async () => {
      calls += 1;

      if (calls === 1) {
        return {
          content: JSON.stringify({
            type: "tool",
            tool: "read_file",
            input: { path: "src/a.js" },
          }),
        };
      }

      return {
        content: JSON.stringify({
          type: "plan",
          adopt: ["src/b.js"],
        }),
      };
    },
    maxIterations: 10,
  });

  assert("S4 status blocked", surface.status === "blocked");
  assert(
    "S4 commit_reason no-progress",
    surface.commit_reason === "no-progress" &&
      surface.blocker?.reason === "no-progress"
  );
  assert(
    "S4 first adopt was real progress then terminated",
    calls === NO_PROGRESS_LIMIT + 2
  );
  assert(
    "S4 dependency adopted but never inspected",
    surface.investigation.adopted_requirements.includes("src/b.js") &&
      !surface.investigation.inspected_evidence.includes("src/b.js")
  );
}

/**
 * S5: evidence gating is preserved — repeated declared judgments without any
 * inspected evidence are still rejected, and the loop ends honestly as
 * no-progress instead of silently accepting or burning the budget.
 */
async function testRepeatedDeclaredWithoutEvidenceNoProgress() {
  freshRepo();

  let calls = 0;

  const surface = await runEos("Inspect src/a.js and judge it.", {
    workspace,
    chatFn: async () => {
      calls += 1;
      return {
        content: JSON.stringify({
          type: "judgment",
          judgment: [
            {
              claim: "declared without inspection",
              type: "declared",
              confidence: "high",
              evidence_refs: [],
            },
          ],
        }),
      };
    },
    maxIterations: 10,
  });

  assert("S5 cannot bypass to declared", surface.status === "blocked");
  assert(
    "S5 commit_reason no-progress",
    surface.commit_reason === "no-progress" &&
      surface.blocker?.reason === "no-progress"
  );
  assert(
    "S5 nothing was inspected",
    surface.investigation.inspected_evidence.length === 0
  );
  assert(
    "S5 explicit requirement remains a gap",
    surface.investigation.gaps.includes("src/a.js")
  );
}

async function main() {
  await testAlternatingJudgmentPlanNoProgress();
  await testCooperativeModelStillProgresses();
  await testFormationModeNoProgress();
  await testRepeatedAdoptNoProgress();
  await testRepeatedDeclaredWithoutEvidenceNoProgress();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all no-progress regression tests passed");
}

main();
