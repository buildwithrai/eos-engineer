import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/runtime/run.js";
import {
  detectGovernance,
  detectParticipants,
  detectSubstrate,
  buildPerspective,
  buildPerspectiveProjection,
  isPerspectiveRef,
  isPerspectiveEntityRef,
} from "../src/perspective.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-test-perspective"
);

function freshWorkspace() {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "src", "index.js"), "export const x = 1;\n");
}

function writeJson(relative, value) {
  const file = path.join(workspace, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
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

/* ---------- Governance detection ---------- */

function testUngovernedIncoherent() {
  freshWorkspace();
  fs.rmSync(path.join(workspace, "src"), { recursive: true, force: true });

  const g = detectGovernance(workspace);
  assert("empty workspace is ungoverned", g.framework === "none");
  assert("empty workspace is incoherent", g.coherence === "incoherent");
  assert("empty workspace classification", g.classification === "ungoverned+incoherent");
}

function testUngovernedCoherent() {
  freshWorkspace();

  const g = detectGovernance(workspace);
  assert("source-only workspace is ungoverned", g.framework === "none");
  assert("source-only workspace is coherent", g.coherence === "coherent");
  assert("source-only classification", g.classification === "ungoverned+coherent");
}

function testGovernedCoherentIge() {
  freshWorkspace();
  writeJson(".ige/inspect.json", { project: { name: "t" } });

  const g = detectGovernance(workspace);
  assert("ige markers detected", g.framework === "ige");
  assert("ige markers listed", g.markers.some((m) => m === "ige:.ige/inspect.json"));
  assert("ige coherent", g.coherence === "coherent");
  assert("ige classification", g.classification === "governed+coherent");
}

function testGovernedIncoherentIge() {
  freshWorkspace();
  fs.mkdirSync(path.join(workspace, ".ige"), { recursive: true });
  fs.writeFileSync(path.join(workspace, ".ige", "inspect.json"), "{not json");

  const g = detectGovernance(workspace);
  assert("ige markers detected with malformed inspect", g.framework === "ige");
  assert("ige incoherent", g.coherence === "incoherent");
  assert("ige incoherent classification", g.classification === "governed+incoherent");
}

function testGovernedCoherentEos() {
  freshWorkspace();
  const projection = {
    schema: "eos-judgment/v1",
    judgment_id: "11111111-1111-4111-8111-111111111111",
    investigation_id: "22222222-2222-4222-8222-222222222222",
    recorded_at: new Date().toISOString(),
    status: "blocked",
    commit_reason: "blocked",
    previous_judgment_id: null,
    previous_judgment_digest: null,
    judgment: [{ claim: "x", type: "blocked", confidence: "low", evidence_refs: [] }],
  };
  writeJson(".eos/judgment.json", projection);
  writeJson(`.eos/judgments/${projection.judgment_id}.json`, projection);

  const g = detectGovernance(workspace);
  assert("eos markers detected", g.framework === "eos");
  assert("eos coherent", g.coherence === "coherent");
  assert("eos classification", g.classification === "governed+coherent");
}

function testGovernedCoherentLocal() {
  freshWorkspace();
  fs.mkdirSync(path.join(workspace, "constitution"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "constitution", "CONSTITUTION.md"), "# Local\n");

  const g = detectGovernance(workspace);
  assert("local markers detected", g.framework === "local");
  assert("local coherent", g.coherence === "coherent");
  assert("local classification", g.classification === "governed+coherent");
}

/* ---------- Participant detection ---------- */

function testParticipants() {
  freshWorkspace();
  fs.mkdirSync(path.join(workspace, ".ige"), { recursive: true });
  fs.mkdirSync(path.join(workspace, ".eos"), { recursive: true });

  const participants = detectParticipants(workspace);
  const byId = Object.fromEntries(participants.map((p) => [p.id, p.status]));

  assert("ige participant existing", byId.ige === "existing");
  assert("eos participant existing", byId.eos === "existing");
  assert("ocs participant new", byId.ocs === "new");
  assert("omnia participant new", byId.omnia === "new");
}

/* ---------- Substrate detection ---------- */

function testSubstrate() {
  freshWorkspace();
  writeJson(".eos/substrate/engineering/evidence/e1.json", { id: "e1", subject: "s", attempted: "a", observed: "o", outcome: "forward" });
  writeJson(".eos/substrate/engineering/decisions/d1.json", { id: "d1", title: "t", status: "decided", decision: "d" });
  writeJson(".eos/substrate/engineering/traceability.json", { item: [] });
  writeJson(".eos/substrate/knowledge.json", { repository: { root: "x" } });

  const s = detectSubstrate(workspace);
  assert("evidence substrate detected", s.evidence === true);
  assert("decisions substrate detected", s.decisions === true);
  assert("traceability substrate detected", s.traceability === true);
  assert("knowledge substrate detected", s.knowledge === true);
  assert("judgments substrate absent", s.judgments === false);
  assert("reviews substrate absent", s.reviews === false);
  assert("changes substrate absent", s.changes === false);
  assert("intents substrate absent", s.intents === false);
}

/* ---------- buildPerspective ---------- */

function testBuildPerspectiveRepository() {
  freshWorkspace();

  const p = buildPerspective(workspace, { mode: "repository" });
  assert("perspective workspace exists", p.workspace.exists === true);
  assert("perspective governance ungoverned+coherent", p.governance.classification === "ungoverned+coherent");
  assert("perspective participants present", Array.isArray(p.participants) && p.participants.length === 5);
  assert("perspective substrate present", typeof p.substrate === "object");
  assert("perspective epistemic known empty", Array.isArray(p.epistemic.known) && p.epistemic.known.length === 0);
  assert("perspective epistemic absent includes evidence", p.epistemic.absent.includes("evidence"));
  assert("perspective epistemic absent includes judgments", p.epistemic.absent.includes("judgments"));
}

function testBuildPerspectiveFormation() {
  freshWorkspace();

  const p = buildPerspective(workspace, {
    mode: "formation",
    prospectiveArtifacts: ["docs/charter.md", "docs/plan.md"],
  });
  assert("formation perspective expected artifacts", p.epistemic.expected.includes("docs/charter.md"));
  assert("formation perspective expected plan", p.epistemic.expected.includes("docs/plan.md"));
}

function testBuildPerspectiveUnavailable() {
  const missing = path.join(workspace, "does-not-exist");
  const p = buildPerspective(missing, { mode: "repository" });
  assert("missing workspace perspective undefined", p === undefined);
}

/* ---------- buildPerspectiveProjection ---------- */

function testProjection() {
  freshWorkspace();

  const p = buildPerspective(workspace, { mode: "repository" });
  const projection = buildPerspectiveProjection(p);

  assert("projection is a string", typeof projection === "string");
  assert("projection has PERSPECTIVE header", projection.includes("PERSPECTIVE"));
  assert("projection has governance line", projection.includes("Governance:"));
  assert("projection has participants line", projection.includes("Participants:"));
  assert("projection has known line", projection.includes("Known:"));
  assert("projection has observed line", projection.includes("Observed:"));
  assert("projection has expected line", projection.includes("Expected:"));
  assert("projection has absent line", projection.includes("Absent:"));
  assert("projection has unknown line", projection.includes("Unknown:"));
  assert("projection has boundary statement", projection.includes("does not establish normative authority"));

  assert("undefined perspective projection undefined", buildPerspectiveProjection(undefined) === undefined);
}

/* ---------- isPerspectiveRef ---------- */

function testPerspectiveRefs() {
  freshWorkspace();

  const p = buildPerspective(workspace, { mode: "repository" });

  assert("perspective:workspace citable", isPerspectiveRef("perspective:workspace", p) === true);
  assert("perspective:governance citable", isPerspectiveRef("perspective:governance", p) === true);
  assert("perspective:participants citable", isPerspectiveRef("perspective:participants", p) === true);
  assert("perspective:substrate citable", isPerspectiveRef("perspective:substrate", p) === true);
  assert("perspective:known citable", isPerspectiveRef("perspective:known", p) === true);
  assert("perspective:observed citable", isPerspectiveRef("perspective:observed", p) === true);
  assert("perspective:expected citable", isPerspectiveRef("perspective:expected", p) === true);
  assert("perspective:absent citable", isPerspectiveRef("perspective:absent", p) === true);
  assert("perspective:unknown citable", isPerspectiveRef("perspective:unknown", p) === true);

  assert("unknown perspective ref rejected", isPerspectiveRef("perspective:nonexistent", p) === false);
  assert("non-perspective ref rejected", isPerspectiveRef("src/index.js", p) === false);
  assert("perspective ref without perspective rejected", isPerspectiveRef("perspective:workspace", undefined) === false);

  assert("perspective entity ref detected", isPerspectiveEntityRef("perspective:governance") === true);
  assert("non-perspective entity ref not detected", isPerspectiveEntityRef("src/index.js") === false);
}

/* ---------- runEos integration ---------- */

async function testRunEosPerspectiveBlock() {
  freshWorkspace();

  let calls = 0;

  const fakeChat = async (messages) => {
    calls += 1;

    if (calls === 1) {
      return {
        content: JSON.stringify({
          type: "judgment",
          judgment: [
            {
              claim: "The workspace is ungoverned but operationally coherent.",
              type: "candidate",
              confidence: "high",
              evidence_refs: ["perspective:governance", "perspective:workspace"],
            },
          ],
          restrictions: [],
        }),
      };
    }

    return {
      content: JSON.stringify({
        type: "judgment",
        judgment: [
          {
            claim: "The workspace is ungoverned but operationally coherent.",
            type: "candidate",
            confidence: "high",
            evidence_refs: ["perspective:governance", "perspective:workspace"],
          },
        ],
        restrictions: [],
      }),
    };
  };

  const surface = await runEos("Judge the workspace.", {
    workspace,
    chatFn: fakeChat,
  });

  assert("surface has perspective block", surface.perspective !== undefined);
  assert("surface perspective governance", surface.perspective.governance.classification === "ungoverned+coherent");
  assert("surface perspective workspace exists", surface.perspective.workspace.exists === true);
  assert("perspective refs accepted by gate", surface.status === "candidate");
  assert("perspective refs in judgment", surface.judgment[0].evidence_refs.includes("perspective:governance"));
}

async function testRunEosUnknownPerspectiveRefRejected() {
  freshWorkspace();

  let calls = 0;

  const fakeChat = async (messages) => {
    calls += 1;

    if (calls === 1) {
      return {
        content: JSON.stringify({
          type: "judgment",
          judgment: [
            {
              claim: "This workspace has an implicit governing framework.",
              type: "candidate",
              confidence: "high",
              evidence_refs: ["perspective:governance"],
            },
          ],
          restrictions: [],
        }),
      };
    }

    if (calls === 2) {
      return {
        content: JSON.stringify({
          type: "tool",
          tool: "read_file",
          input: { path: "src/index.js" },
        }),
      };
    }

    return {
      content: JSON.stringify({
        type: "judgment",
        judgment: [
          {
            claim: "The workspace is ungoverned but operationally coherent.",
            type: "candidate",
            confidence: "high",
            evidence_refs: ["perspective:governance", "perspective:workspace"],
          },
        ],
        restrictions: [],
      }),
    };
  };

  const surface = await runEos("Investigate src/index.js and judge it.", {
    workspace,
    chatFn: fakeChat,
  });

  assert("unknown perspective ref rejected first", calls >= 3);
  assert("perspective refs accepted after inspection", surface.status === "candidate");
  assert("surface perspective present", surface.perspective !== undefined);
}

async function testRunEosFormationPerspective() {
  freshWorkspace();

  let calls = 0;

  const fakeChat = async (messages) => {
    calls += 1;

    return {
      content: JSON.stringify({
        type: "judgment",
        judgment: [
          {
            claim: "Formation proposal for a greenfield project.",
            type: "candidate",
            confidence: "high",
            evidence_refs: ["perspective:workspace", "perspective:governance", "perspective:expected"],
          },
        ],
        restrictions: ["This charter is a candidate proposal; canonical declaration is the Engineer's act."],
      }),
    };
  };

  const surface = await runEos("Create a new project with a charter at docs/charter.md.", {
    workspace,
    chatFn: fakeChat,
  });

  assert("formation surface mode", surface.mode === "formation");
  assert("formation surface perspective present", surface.perspective !== undefined);
  assert("formation perspective expected artifacts", surface.perspective.epistemic.expected.includes("docs/charter.md"));
  assert("formation perspective refs accepted", surface.status === "candidate");
}

async function testRunEosUnavailablePerspective() {
  const missing = path.join(workspace, "missing-target");

  let calls = 0;

  const fakeChat = async () => {
    calls += 1;
    return {
      content: JSON.stringify({
        type: "judgment",
        judgment: [{ claim: "x", type: "blocked", confidence: "low", evidence_refs: [] }],
      }),
    };
  };

  const surface = await runEos("Investigate src/index.js and judge it.", {
    workspace: missing,
    chatFn: fakeChat,
  });

  assert("unavailable surface blocked", surface.status === "blocked");
  assert("unavailable surface perspective undefined", surface.perspective === undefined);
  assert("unavailable surface blocker", surface.blocker?.reason === "workspace-unavailable");
}

async function main() {
  testUngovernedIncoherent();
  testUngovernedCoherent();
  testGovernedCoherentIge();
  testGovernedIncoherentIge();
  testGovernedCoherentEos();
  testGovernedCoherentLocal();
  testParticipants();
  testSubstrate();
  testBuildPerspectiveRepository();
  testBuildPerspectiveFormation();
  testBuildPerspectiveUnavailable();
  testProjection();
  testPerspectiveRefs();
  await testRunEosPerspectiveBlock();
  await testRunEosUnknownPerspectiveRefRejected();
  await testRunEosFormationPerspective();
  await testRunEosUnavailablePerspective();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all perspective tests passed");
}

main();