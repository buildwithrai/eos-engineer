import fs from "node:fs";
import path from "node:path";
import { verifyLineage } from "./projection/lineage.js";
import {
  evidenceDirectory,
  decisionsDirectory,
  traceabilityFile,
  knowledgeFile,
} from "./investigation/evidence.js";
import { latestIntentFile } from "./formation.js";

const IGE_MARKERS = [
  ".ige/inspect.json",
  ".ige/reconcile",
  ".ige/handoff",
  ".ige/sync",
  ".ige/PROJECT_STATE",
  ".ige/PROJECT_TIMELINE",
  ".ige/PROJECT_BACKLOG",
  ".ige/schema-manifest.yaml",
  ".ige/provider.yaml",
];

const EOS_MARKERS = [
  ".eos/judgment.json",
  ".eos/judgments",
  ".eos/review.json",
  ".eos/reviews",
  ".eos/change.json",
  ".eos/changes",
  ".eos/formation/intent.json",
  ".eos/formation/records",
];

const LOCAL_MARKERS = [
  "constitution",
  "CONSTITUTION.md",
  "AGENTS.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  ".github",
  "governance",
  "GOVERNANCE.md",
  "charter",
  "CHARTER.md",
];

const PARTICIPANT_MARKERS = {
  ige: [".ige"],
  eos: [".eos"],
  substrate: [".eos/substrate"],
  ocs: [".ocs", "ocs"],
  omnia: [".omnia", "omnia"],
};

const MANIFEST_MARKERS = [
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "requirements.txt",
  "composer.json",
  "Gemfile",
];

const SOURCE_EXTENSIONS = new Set([
  "js",
  "ts",
  "tsx",
  "jsx",
  "json",
  "md",
  "sql",
  "yaml",
  "yml",
  "py",
  "sh",
]);

const PERSPECTIVE_REF_PREFIX = "perspective:";

const PERSPECTIVE_REFS = [
  "workspace",
  "governance",
  "participants",
  "substrate",
  "known",
  "observed",
  "expected",
  "absent",
  "unknown",
];

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function exists(root, relative) {
  return fs.existsSync(path.join(root, relative));
}

function directoryHasJson(dir) {
  if (!fs.existsSync(dir)) return false;

  try {
    return fs.readdirSync(dir).some((entry) => entry.endsWith(".json"));
  } catch {
    return false;
  }
}

function readJsonIfPresent(file) {
  if (!fs.existsSync(file)) return undefined;

  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

function hasSourceFile(dir, seen = new Set()) {
  if (seen.has(dir)) return false;

  seen.add(dir);

  let entries;

  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules") continue;

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (hasSourceFile(full, seen)) return true;
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).slice(1).toLowerCase();

      if (SOURCE_EXTENSIONS.has(ext)) return true;
    }
  }

  return false;
}

/**
 * Operational coherence of an ungoverned workspace.
 *
 * A workspace is operationally coherent when it has a recognizable
 * engineering structure: a manifest or source content. Operational
 * coherence is distinct from governance: a workspace may be coherent
 * without being governed, and governed without being coherent.
 */
function detectOperationalCoherence(root) {
  const hasManifest = MANIFEST_MARKERS.some((marker) => exists(root, marker));
  const hasSource = hasSourceFile(root);

  return hasManifest || hasSource ? "coherent" : "incoherent";
}

/**
 * Detect the governing framework present in a workspace.
 *
 * Governance is detected from artifacts, never declared. A workspace may be:
 * - governed + coherent
 * - governed + incoherent
 * - ungoverned + coherent
 * - ungoverned + incoherent
 *
 * Coherence is assessed from the detected framework's own artifacts:
 * - IGE: .ige/inspect.json parses
 * - EOS: the judgment lineage verifies
 * - local: governing markers exist and are readable
 * - ungoverned: operational coherence from workspace structure
 *
 * Returns { framework, markers, coherence, classification }.
 */
export function detectGovernance(root) {
  const markers = [];

  const igeMarkers = IGE_MARKERS.filter((marker) => exists(root, marker));
  const eosMarkers = EOS_MARKERS.filter((marker) => exists(root, marker));
  const localMarkers = LOCAL_MARKERS.filter((marker) => exists(root, marker));

  let framework = "none";
  let coherence = "unknown";

  if (igeMarkers.length > 0) {
    framework = "ige";
    markers.push(...igeMarkers.map((marker) => `ige:${marker}`));

    const inspect = readJsonIfPresent(path.join(root, ".ige", "inspect.json"));
    coherence = inspect !== undefined ? "coherent" : "incoherent";
  } else if (eosMarkers.length > 0) {
    framework = "eos";
    markers.push(...eosMarkers.map((marker) => `eos:${marker}`));

    const lineage = verifyLineage(root);
    // A fresh chain (single node, no previous judgment) is a coherent EOS
    // ledger: verifyLineage reports state "none" with reason "fresh-chain"
    // for a valid single-node chain, not "consistent".
    coherence =
      lineage.state === "consistent" ||
      (lineage.state === "none" && lineage.reason === "fresh-chain")
        ? "coherent"
        : "incoherent";
  } else if (localMarkers.length > 0) {
    framework = "local";
    markers.push(...localMarkers.map((marker) => `local:${marker}`));
    coherence = "coherent";
  } else {
    coherence = detectOperationalCoherence(root);
  }

  const governed = framework !== "none";

  const classification =
    governed && coherence === "coherent"
      ? "governed+coherent"
      : governed && coherence === "incoherent"
        ? "governed+incoherent"
        : !governed && coherence === "coherent"
          ? "ungoverned+coherent"
          : !governed && coherence === "incoherent"
            ? "ungoverned+incoherent"
            : "unknown";

  return { framework, markers, coherence, classification };
}

/**
 * Detect participant presence in a workspace.
 *
 * A participant is "existing" when its marker directory is present.
 * A participant is "new" when it is not present but is a known ecosystem
 * participant that could legitimately participate.
 *
 * Returns an array of { id, status }.
 */
export function detectParticipants(root) {
  const participants = [];

  for (const [id, markers] of Object.entries(PARTICIPANT_MARKERS)) {
    const present = markers.some((marker) => exists(root, marker));
    participants.push({ id, status: present ? "existing" : "new" });
  }

  return participants;
}

/**
 * Detect substrate existence in a workspace.
 *
 * Substrate is the engineering evidence base EOS consumes:
 * evidence, decisions, traceability, knowledge, judgments, reviews,
 * changes, and formation intents.
 *
 * Returns { evidence, decisions, traceability, knowledge, judgments, reviews, changes, intents }.
 */
export function detectSubstrate(root) {
  return {
    evidence: directoryHasJson(evidenceDirectory(root)),
    decisions: directoryHasJson(decisionsDirectory(root)),
    traceability: fs.existsSync(traceabilityFile(root)),
    knowledge: fs.existsSync(knowledgeFile(root)),
    judgments: fs.existsSync(path.join(root, ".eos", "judgment.json")),
    reviews: fs.existsSync(path.join(root, ".eos", "review.json")),
    changes: fs.existsSync(path.join(root, ".eos", "change.json")),
    intents: fs.existsSync(latestIntentFile(root)),
  };
}

/**
 * Build the deterministic perspective for a workspace.
 *
 * The perspective establishes what world EOS is participating in before
 * investigation: workspace existence, governing framework, participants,
 * substrate, and the epistemic status of what is known/observed/expected/
 * absent/unknown.
 *
 * Returns undefined when the workspace is unavailable (missing, not a
 * directory, or inaccessible) — perspective cannot be established for a
 * target that does not exist.
 */
export function buildPerspective(
  workspaceRoot,
  { mode = "repository", prospectiveArtifacts = [] } = {}
) {
  const root = path.resolve(workspaceRoot);

  if (!fs.existsSync(root)) return undefined;

  let stat;

  try {
    stat = fs.statSync(root);
  } catch {
    return undefined;
  }

  if (!stat.isDirectory()) return undefined;

  const governance = detectGovernance(root);
  const participants = detectParticipants(root);
  const substrate = detectSubstrate(root);

  const known = [];
  const observed = [];
  const expected = [];
  const absent = [];
  const unknown = [];

  if (substrate.evidence) known.push("evidence");
  if (substrate.decisions) known.push("decisions");
  if (substrate.traceability) known.push("traceability");
  if (substrate.knowledge) known.push("knowledge");

  if (substrate.judgments) observed.push("judgments");
  if (substrate.reviews) observed.push("reviews");
  if (substrate.changes) observed.push("changes");
  if (substrate.intents) observed.push("intents");

  if (mode === "formation") {
    expected.push(...prospectiveArtifacts);
  }

  if (!substrate.evidence) absent.push("evidence");
  if (!substrate.decisions) absent.push("decisions");
  if (!substrate.traceability) absent.push("traceability");
  if (!substrate.knowledge) absent.push("knowledge");
  if (!substrate.judgments) absent.push("judgments");
  if (!substrate.reviews) absent.push("reviews");
  if (!substrate.changes) absent.push("changes");
  if (!substrate.intents) absent.push("intents");

  if (governance.coherence === "unknown") unknown.push("governance-coherence");
  if (participants.every((participant) => participant.status === "new")) {
    unknown.push("participant-relationships");
  }

  return {
    workspace: {
      root: normalizePath(root),
      exists: true,
      is_directory: true,
      accessible: true,
    },
    governance,
    participants,
    substrate,
    epistemic: {
      known,
      observed,
      expected,
      absent,
      unknown,
    },
  };
}

/**
 * Render the perspective as a deterministic, model-facing text block.
 */
export function buildPerspectiveProjection(perspective) {
  if (perspective === undefined) return undefined;

  const lines = [
    "PERSPECTIVE",
    `Workspace: ${perspective.workspace.root}`,
    `Governance: ${perspective.governance.framework} (${perspective.governance.classification})`,
    `Coherence: ${perspective.governance.coherence}`,
  ];

  if (perspective.governance.markers.length > 0) {
    lines.push(
      `Governance markers: ${perspective.governance.markers.join(", ")}`
    );
  }

  const participants = perspective.participants
    .map((participant) => `${participant.id}:${participant.status}`)
    .join(", ");
  lines.push(`Participants: ${participants}`);

  const substrate = Object.entries(perspective.substrate)
    .filter(([, present]) => present)
    .map(([key]) => key)
    .join(", ");
  lines.push(`Substrate present: ${substrate || "(none)"}`);

  lines.push(`Known: ${perspective.epistemic.known.join(", ") || "(none)"}`);
  lines.push(`Observed: ${perspective.epistemic.observed.join(", ") || "(none)"}`);
  lines.push(`Expected: ${perspective.epistemic.expected.join(", ") || "(none)"}`);
  lines.push(`Absent: ${perspective.epistemic.absent.join(", ") || "(none)"}`);
  lines.push(`Unknown: ${perspective.epistemic.unknown.join(", ") || "(none)"}`);

  lines.push(
    "Perspective is deterministic runtime state. It establishes what world EOS participates in; it does not establish normative authority. Governance detection is observation, not declaration. Never claim a governing framework exists unless the PERSPECTIVE block reports it."
  );

  return lines.join("\n");
}

/**
 * Validate a perspective reference.
 *
 * A perspective ref is citable only when it resolves against the
 * deterministic perspective object. Unknown perspective refs are rejected.
 */
export function isPerspectiveRef(ref, perspective) {
  if (perspective === undefined) return false;
  if (typeof ref !== "string") return false;
  if (!ref.startsWith(PERSPECTIVE_REF_PREFIX)) return false;

  const key = ref.slice(PERSPECTIVE_REF_PREFIX.length);

  if (!PERSPECTIVE_REFS.includes(key)) return false;

  if (key === "workspace") return perspective.workspace !== undefined;
  if (key === "governance") return perspective.governance !== undefined;
  if (key === "participants") return perspective.participants !== undefined;
  if (key === "substrate") return perspective.substrate !== undefined;
  if (key === "known") return perspective.epistemic?.known !== undefined;
  if (key === "observed") return perspective.epistemic?.observed !== undefined;
  if (key === "expected") return perspective.epistemic?.expected !== undefined;
  if (key === "absent") return perspective.epistemic?.absent !== undefined;
  if (key === "unknown") return perspective.epistemic?.unknown !== undefined;

  return false;
}

/**
 * True when a ref is a perspective-shaped ref (prefix match), regardless of
 * whether it resolves. Used for guidance when a perspective ref is rejected.
 */
export function isPerspectiveEntityRef(ref) {
  if (typeof ref !== "string") return false;
  return ref.startsWith(PERSPECTIVE_REF_PREFIX);
}