import fs from "node:fs";
import path from "node:path";
import { runEos } from "../src/runtime/run.js";
import { validateWorkspace } from "../src/workspace.js";
import {
  detectFormation,
  isGreenfield,
  loadIntents,
  intentRecordsDirectory,
} from "../src/formation.js";

const workspace = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".tmp-workspace-validation"
);

const MISSING = path.join(workspace, "missing-repo");
const MISSING_FORMATION = path.join(workspace, "missing-formation");
const NOT_A_DIRECTORY = path.join(workspace, "a-plain-file");
const REPO = path.join(workspace, "repo");

let failures = 0;

function assert(name, condition, detail = "") {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

function freshPaths() {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(NOT_A_DIRECTORY, "just a file\n");
  fs.mkdirSync(path.join(REPO, "src"), { recursive: true });
  fs.writeFileSync(path.join(REPO, "src", "a.js"), "export const a = 1;\n");
}

function formationChat(claimsFactory) {
  return async () => ({
    content: JSON.stringify({
      type: "judgment",
      judgment: claimsFactory(),
    }),
  });
}

/**
 * W1: a repository request against a nonexistent target is a deterministic
 * blocked surface (not a formation flow), creates nothing, and persists
 * nothing. This is the Omnia failure regression: a missing workspace was
 * previously misclassified as formation and received a persisted formation
 * intent plus a burned iteration budget.
 */
async function testMissingWorkspaceIsBlockedNotFormation() {
  freshPaths();

  const surface = await runEos("Inspect src/a.js and judge it.", {
    workspace: MISSING,
    maxIterations: 10,
  });

  assert(
    "W1 blocked surface with workspace-unavailable blocker",
    surface.status === "blocked" &&
      surface.commit_reason === "blocked" &&
      surface.blocker?.reason === "workspace-unavailable" &&
      surface.blocker?.detail === "missing"
  );
  assert("W1 repository mode (not formation)", surface.mode === "repository");
  assert("W1 phase blocked", surface.investigation.phase === "blocked");
  assert(
    "W1 judgment names the unavailable workspace",
    surface.judgment.some(
      (item) =>
        item.type === "blocked" && /workspace/.test(item.claim)
    )
  );
  assert(
    "W1 no directory was created",
    !fs.existsSync(MISSING) && !fs.existsSync(path.join(MISSING, ".eos"))
  );
  assert(
    "W1 no formation intent persisted",
    !fs.existsSync(intentRecordsDirectory(MISSING))
  );
}

/**
 * W2: a repository request against a path that exists but is a file (not a
 * directory) is equally unavailable and never reinterpreted as formation.
 */
async function testFileTargetIsUnavailable() {
  freshPaths();

  const surface = await runEos("Inspect the repository and judge it.", {
    workspace: NOT_A_DIRECTORY,
    maxIterations: 10,
  });

  assert(
    "W2 not-a-directory is workspace-unavailable",
    surface.status === "blocked" &&
      surface.commit_reason === "blocked" &&
      surface.blocker?.reason === "workspace-unavailable" &&
      surface.blocker?.detail === "not-a-directory"
  );
  assert(
    "W2 file target never classified as formation",
    surface.mode === "repository" &&
      !fs.existsSync(path.join(NOT_A_DIRECTORY, ".eos"))
  );
}

/**
 * W3: an explicit formation request against a nonexistent path is the one
 * legitimate greenfield target; it proceeds, materializes the workspace, and
 * persists the intent.
 */
async function testExplicitFormationOnMissingPathProceeds() {
  freshPaths();

  const surface = await runEos(
    "Create a project charter for a greenfield irrigation controller project. Mission: keep gardens alive with minimal water.",
    {
      workspace: MISSING_FORMATION,
      chatFn: formationChat(() => [
        {
          claim: "Mission: keep gardens alive with minimal water.",
          type: "candidate",
          confidence: "high",
          evidence_refs: ["intent:latest"],
        },
      ]),
      maxIterations: 3,
    }
  );

  assert(
    "W3 explicit formation on missing path proceeds",
    surface.mode === "formation" &&
      surface.investigation.phase === "formation" &&
      surface.status === "candidate"
  );
  assert(
    "W3 workspace materialized by intentional formation",
    fs.existsSync(MISSING_FORMATION) &&
      fs.existsSync(path.join(MISSING_FORMATION, ".eos"))
  );
  assert(
    "W3 formation intent persisted",
    loadIntents(MISSING_FORMATION).length === 1
  );
}

/**
 * W4: an existing repository directory follows the normal repository flow.
 */
async function testExistingRepoUnaffected() {
  freshPaths();

  const surface = await runEos("Inspect src/a.js and judge it.", {
    workspace: REPO,
    maxIterations: 10,
  });

  assert(
    "W4 existing repo is repository mode and not workspace-unavailable",
    surface.mode === "repository" &&
      surface.blocker === null &&
      surface.commit_reason !== "blocked"
  );
}

/**
 * W5: classification semantics for nonexistent targets — never greenfield,
 * repository by default, formation only via an explicit marker.
 */
async function testClassificationSemantics() {
  freshPaths();

  assert(
    "W5 nonexistent path is never greenfield",
    isGreenfield(MISSING) === false
  );
  assert(
    "W5 nonexistent path stays repository mode without a formation marker",
    detectFormation(MISSING, "Investigate src/a.js and judge it.").mode ===
      "repository"
  );
  assert(
    "W5 explicit formation marker still admits formation on a nonexistent path",
    detectFormation(
      MISSING,
      "Create a project charter for a greenfield widget project."
    ).mode === "formation"
  );
}

/**
 * W6: validateWorkspace unit behavior.
 */
async function testValidateWorkspaceUnit() {
  freshPaths();

  assert(
    "W6 missing path is reason missing",
    validateWorkspace(MISSING).reason === "missing" &&
      validateWorkspace(MISSING).ok === false
  );
  assert(
    "W6 file path is reason not-a-directory",
    validateWorkspace(NOT_A_DIRECTORY).reason === "not-a-directory"
  );
  assert(
    "W6 existing directory is valid",
    validateWorkspace(REPO).ok === true
  );
}

async function main() {
  await testMissingWorkspaceIsBlockedNotFormation();
  await testFileTargetIsUnavailable();
  await testExplicitFormationOnMissingPathProceeds();
  await testExistingRepoUnaffected();
  await testClassificationSemantics();
  await testValidateWorkspaceUnit();

  fs.rmSync(workspace, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all workspace-validation regression tests passed");
}

main();
