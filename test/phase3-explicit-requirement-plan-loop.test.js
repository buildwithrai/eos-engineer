import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/runtime/run.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-explicit-requirement-plan-loop"
);

const TARGET = "src/app.js";

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
  const full = path.join(workspace, TARGET);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, "export const answer = 42;\n");
  const ige = path.join(workspace, ".ige");
  fs.mkdirSync(ige, { recursive: true });
  fs.writeFileSync(
    path.join(ige, "inspect.json"),
    '{"project":{"name":"explicit-requirement-plan-loop"}}\n'
  );
}

/**
 * This scripted model reproduces the exact responses observed in the OCS
 * acceptance failure: it alternates between an adopt-plan for the EXPLICIT
 * requirement and a waive-plan for it, forever, unless EOS's feedback is
 * prescriptive enough to name the exact read to perform.
 *
 * It mirrors the observed qwen2.5-coder:7b behavior: as long as the last
 * feedback only says the file "must be inspected with read_file or
 * read_files" (prose), the model keeps alternating inadmissible plans. The
 * moment EOS says "Call read_file or read_files with: <path>", the model
 * performs that read and then judges on the inspected evidence.
 *
 * A well-formed contract must therefore respond to an invalid plan against an
 * explicit requirement by directing the read, not by re-describing the plan
 * contract. Pre-fix EOS never emits the directive, so the model alternates
 * until blocked (the observed failure).
 */
function buildAlternatingModel(target) {
  let calls = 0;
  let inspected = false;

  const chatFn = async (messages) => {
    calls += 1;

    const last = messages[messages.length - 1];
    const lastContent =
      typeof last?.content === "string" ? last.content : "";

    const readDirective =
      lastContent.includes("Call read_file or read_files with:") &&
      lastContent.includes(target);

    if (!inspected && readDirective) {
      inspected = true;
      return {
        content: JSON.stringify({
          type: "tool",
          tool: "read_file",
          input: { path: target },
        }),
      };
    }

    if (inspected && last?.role === "tool") {
      return {
        content: JSON.stringify({
          type: "judgment",
          judgment: [
            {
              claim: `Inspected ${target}.`,
              type: "declared",
              confidence: "high",
              evidence_refs: [target],
            },
          ],
          restrictions: [],
        }),
      };
    }

    return {
      content: JSON.stringify(
        calls % 2 === 1
          ? { type: "plan", adopt: [target] }
          : {
              type: "plan",
              waive: [
                {
                  path: target,
                  reason:
                    "It is already an explicit requirement of this investigation.",
                },
              ],
            }
      ),
    };
  };

  return { chatFn, calls: () => calls };
}

async function testExplicitRequirementPlanLoop() {
  freshWorkspace();

  const { chatFn, calls } = buildAlternatingModel(TARGET);

  const surface = await runEos(`Inspect ${TARGET} and judge it.`, {
    workspace,
    chatFn,
    maxIterations: 6,
  });

  const inspections = surface.evidence.inspections ?? [];

  assert(
    "target actually returned by read_file",
    inspections.length === 1 &&
      inspections[0].path.endsWith(TARGET) &&
      /^[0-9a-f]{64}$/.test(inspections[0].digest)
  );

  assert(
    "target recorded as inspected evidence",
    (surface.investigation.inspected_evidence ?? []).includes(TARGET)
  );

  assert(
    "target no longer a gap",
    !(surface.investigation.gaps ?? []).includes(TARGET)
  );

  assert(
    "declared judgment accepted after real inspection",
    surface.status === "declared" &&
      surface.judgment[0].evidence_refs.includes(TARGET)
  );

  assert(
    "no fabricated fallback judgment",
    surface.commit_reason !== "fallback"
  );

  assert(
    "investigation progressed to read_file within the turn budget",
    calls() <= 4
  );
}

async function main() {
  await testExplicitRequirementPlanLoop();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all explicit-requirement plan-loop regression tests passed");
}

main();
