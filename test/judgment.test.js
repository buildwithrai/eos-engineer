import fs from "node:fs";
import path from "node:path";
import { readFile } from "../src/tools/readFile.js";
import { runEos } from "../src/loop.js";

const workspace = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", ".tmp-test-workspace");

function freshWorkspace() {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
  fs.mkdirSync(path.join(workspace, ".ige"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "src", "index.js"), "export const x = 1;\n");
  fs.writeFileSync(path.join(workspace, "src", "other.js"), "export const y = 2;\n");
  fs.writeFileSync(path.join(workspace, ".ige", "inspect.json"), "{\"project\":{\"name\":\"t\"}}\n");
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

async function testReadConfinement() {
  freshWorkspace();
  const r = await readFile({ path: "../secret.txt" }, workspace);
  assert("readFile blocks escape", r.ok === false);
}

async function testGateBlockThenJudge() {
  freshWorkspace();

  let calls = 0;

  const fakeChat = async (messages) => {
    calls += 1;
    const last = messages[messages.length - 1];

    if (calls === 1) {
      return { content: JSON.stringify({ type: "judgment", judgment: [{ claim: "early", type: "declared", confidence: "high", evidence_refs: ["src/index.js"] }] }) };
    }

    if (calls === 2) {
      return { content: JSON.stringify({ type: "tool", tool: "read_file", input: { path: "src/index.js" } }) };
    }

    return { content: JSON.stringify({ type: "judgment", judgment: [{ claim: "inspected", type: "declared", confidence: "high", evidence_refs: ["src/index.js"] }] }) };
  };

  const surface = await runEos("Investigate src/index.js and judge it.", { workspace, chatFn: fakeChat });

  assert("early judgment blocked", calls >= 3);
  assert("final judgment recorded", surface.judgment.length === 1);
  assert("judgment references inspected evidence", surface.judgment[0].evidence_refs[0] === "src/index.js");
  assert("schema correct", surface.schema === "eos-judgment/v1");
  assert("no .ige write", !fs.readdirSync(path.join(workspace, ".ige")).includes("judgment.json"));
}

async function main() {
  await testReadConfinement();
  await testGateBlockThenJudge();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all tests passed");
}

main();
