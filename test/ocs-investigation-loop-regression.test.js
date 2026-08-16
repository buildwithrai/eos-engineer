import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/runtime/run.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-ocs-investigation-loop"
);

const TARGET = "backend/src/events/processEvent.js";

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
  writeFile(
    TARGET,
    "export async function processEvent(event) { return event; }\n"
  );
  writeFile(".ige/inspect.json", '{"project":{"name":"ocs-loop"}}\n');
}

/**
 * This scripted model reproduces the exact responses observed in the OCS
 * acceptance failure:
 *   1. a plan proposing to adopt the EXPLICIT requirement, and
 *   2. a declared judgment claiming the target "is being inspected" while
 *      citing only "REPOSITORY KNOWLEDGE" with no read having occurred.
 *
 * The model is cooperative: the moment EOS's feedback explicitly directs a
 * read_file/read_files of the target, it performs that read, and only after
 * the tool result is present does it emit a declared judgment citing the
 * inspected path. A well-formed EOS contract must be able to drive this model
 * to real inspection; pre-fix EOS cannot (the observed failure).
 */
function buildModel() {
  let calls = 0;
  let inspected = false;

  const chatFn = async (messages) => {
    calls += 1;

    if (calls === 1) {
      return { content: JSON.stringify({ type: "plan", adopt: [TARGET] }) };
    }

    if (calls === 2) {
      return {
        content: JSON.stringify({
          type: "judgment",
          judgment: [
            {
              claim: `The file ${TARGET} is being inspected as part of the initial investigation scope.`,
              type: "declared",
              confidence: "high",
              evidence_refs: ["REPOSITORY KNOWLEDGE"],
            },
          ],
          restrictions: [
            `${TARGET} must be read and its contents inspected before any judgment can be made.`,
          ],
        }),
      };
    }

    const last = messages[messages.length - 1];
    const lastContent =
      typeof last?.content === "string" ? last.content : "";

    const readDirective =
      /read_file|read_files/.test(lastContent) && lastContent.includes(TARGET);

    if (!inspected && readDirective) {
      inspected = true;
      return {
        content: JSON.stringify({
          type: "tool",
          tool: "read_file",
          input: { path: TARGET },
        }),
      };
    }

    if (inspected && last?.role === "tool") {
      return {
        content: JSON.stringify({
          type: "judgment",
          judgment: [
            {
              claim: `Inspected ${TARGET}.`,
              type: "declared",
              confidence: "high",
              evidence_refs: [TARGET],
            },
          ],
          restrictions: [],
        }),
      };
    }

    return {
      content: JSON.stringify(
        calls % 2 === 1
          ? { type: "plan", adopt: [TARGET] }
          : {
              type: "judgment",
              judgment: [
                {
                  claim: `The file ${TARGET} is being inspected as part of the initial investigation scope.`,
                  type: "declared",
                  confidence: "high",
                  evidence_refs: ["REPOSITORY KNOWLEDGE"],
                },
              ],
              restrictions: [],
            }
      ),
    };
  };

  return { chatFn, calls: () => calls };
}

async function testOcsInvestigationLoop() {
  freshWorkspace();

  const { chatFn, calls } = buildModel();

  const surface = await runEos(
    `Inspect ${TARGET}. Determine what the file imports, inspect its direct local dependencies where supported by the investigation, and determine whether the implementation is structurally sound.`,
    { workspace, chatFn, maxIterations: 6 }
  );

  const inspections = surface.evidence.inspections ?? [];
  const inspectedEvidence = surface.investigation.inspected_evidence ?? [];

  assert(
    "target actually returned by read_file",
    inspections.length === 1 &&
      inspections[0].path.endsWith(TARGET) &&
      /^[0-9a-f]{64}$/.test(inspections[0].digest)
  );

  assert(
    "target recorded as inspected evidence",
    inspectedEvidence.includes(TARGET)
  );

  assert(
    "target no longer a gap",
    !(surface.investigation.gaps ?? []).includes(TARGET)
  );

  assert(
    "declared judgment accepted only after real inspection",
    surface.status === "declared" &&
      surface.judgment[0].evidence_refs.includes(TARGET)
  );

  assert(
    "uninspected claiming judgment never accepted",
    surface.commit_reason !== "fallback"
  );

  assert("investigation progressed past the non-advancing cycle", calls() <= 4);
}

async function main() {
  await testOcsInvestigationLoop();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all OCS investigation-loop regression tests passed");
}

main();
