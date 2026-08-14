import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { sha256 } from "./lineage.js";
import {
  evidenceDirectory,
  decisionsDirectory,
  traceabilityFile,
  knowledgeFile,
} from "./evidence.js";
import { changesDirectory } from "./change.js";
import { latestProjectionFile } from "./lineage.js";

export const INTENT_SCHEMA = "eos-formation-intent/v1";

export const FORMATION_DIR = path.join(".eos", "formation");
export const INTENT_RECORDS_DIR = path.join(FORMATION_DIR, "records");
export const LATEST_INTENT_FILE = path.join(FORMATION_DIR, "intent.json");

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

/**
 * Project-formation request marker. Detection is request-intent based: a
 * request classifies as formation only when it directs an act of project
 * creation or constitution (create, form, establish, constitute, set up,
 * stand up, initialize, scaffold) at a project object.
 *
 * Topical discussion of formation — charter, constitution, project
 * formation, lifecycle, governing artifacts, greenfield, a new project — is
 * never a formation request on its own. An audit/investigation that merely
 * discusses such topics stays in repository mode; it does not persist a
 * formation intent.
 */
const FORMATION_REQUEST =
  /(?:create|form|establish|constitute|set up|stand up|initialize|scaffold)\s+(?:a |an |the |our |their )?(?:new )?project\b/i;

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function iso() {
  return new Date().toISOString();
}

function directoryHasJson(dir) {
  if (!fs.existsSync(dir)) return false;

  try {
    return fs.readdirSync(dir).some((entry) => entry.endsWith(".json"));
  } catch {
    return false;
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
 * Greenfield workspace: no engineering substrate to investigate and no source
 * content anywhere. A workspace with observed/declared substrate, repository
 * knowledge, change records, judgments, or any source file is not greenfield.
 *
 * Hidden directories (.eos, .ewa, .ige, .git) are never treated as content;
 * substrate presence is checked explicitly against the known stores.
 *
 * A path that does not exist or is not a directory is never greenfield:
 * absence of a target is an unavailable-workspace condition, not evidence of
 * an empty project. Formation is admitted only for an existing directory or by
 * an explicit formation request; it is never inferred from a missing path.
 */
export function isGreenfield(root) {
  if (!fs.existsSync(root)) return false;

  try {
    if (!fs.statSync(root).isDirectory()) return false;
  } catch {
    return false;
  }

  const substratePresent =
    directoryHasJson(evidenceDirectory(root)) ||
    directoryHasJson(decisionsDirectory(root)) ||
    directoryHasJson(changesDirectory(root)) ||
    fs.existsSync(traceabilityFile(root)) ||
    fs.existsSync(knowledgeFile(root)) ||
    fs.existsSync(latestProjectionFile(root));

  if (substratePresent) return false;

  return !hasSourceFile(root);
}

/**
 * Explicit project-formation request. This is a conservative heuristic for
 * formation requests made against workspaces that are not empty; an empty
 * workspace is classified as formation regardless of wording.
 */
export function isFormationRequest(userInput) {
  const input = String(userInput ?? "");

  return FORMATION_REQUEST.test(input);
}

/**
 * Deterministic formation classification for a request against a workspace.
 */
export function detectFormation(root, userInput) {
  const reasons = [];

  if (isFormationRequest(userInput)) reasons.push("formation-marker");
  if (isGreenfield(root)) reasons.push("greenfield-workspace");

  if (reasons.length === 0) {
    return { mode: "repository", reasons };
  }

  return { mode: "formation", reasons };
}

export function intentRecordsDirectory(root) {
  return path.join(root, INTENT_RECORDS_DIR);
}

export function latestIntentFile(root) {
  return path.join(root, LATEST_INTENT_FILE);
}

export function intentRecordFile(root, intentId) {
  return path.join(intentRecordsDirectory(root), `${intentId}.json`);
}

export function serializeIntentRecord(record) {
  return JSON.stringify(record, null, 2) + "\n";
}

/**
 * Load every persisted formation intent record, newest-first irrelevant to
 * citation: each record is independently citable by intent:<id> or path.
 */
export function loadIntents(root) {
  const dir = intentRecordsDirectory(root);

  if (!fs.existsSync(dir)) return [];

  const items = [];

  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(".json")) continue;

    const file = path.join(dir, entry);

    let raw;
    let intent;

    try {
      raw = fs.readFileSync(file, "utf8");
      intent = JSON.parse(raw);
    } catch {
      continue;
    }

    if (intent === null || typeof intent.intent_id !== "string") continue;

    items.push({
      intent,
      source: file,
      digest: sha256(raw),
    });
  }

  items.sort((a, b) => (a.intent.intent_id < b.intent.intent_id ? -1 : 1));

  return items;
}

export function loadLatestIntent(root) {
  const file = latestIntentFile(root);

  if (!fs.existsSync(file)) return undefined;

  try {
    const bytes = fs.readFileSync(file);
    const intent = JSON.parse(bytes);
    return { intent, source: file, digest: sha256(bytes) };
  } catch {
    return undefined;
  }
}

/**
 * Persist the engineer's intent as a write-once, digest-bound formation
 * record and advance the latest-intent pointer. Re-persisting the identical
 * intent is idempotent: it reuses the existing record.
 */
export function persistIntent(root, intentText) {
  const latest = loadLatestIntent(root);

  if (
    latest !== undefined &&
    typeof latest.intent?.intent === "string" &&
    latest.intent.intent === intentText
  ) {
    return latest;
  }

  const record = {
    schema: INTENT_SCHEMA,
    intent_id: crypto.randomUUID(),
    recorded_at: iso(),
    source: "engineer",
    intent: intentText,
  };

  const file = intentRecordFile(root, record.intent_id);

  fs.mkdirSync(path.dirname(file), { recursive: true });

  const bytes = serializeIntentRecord(record);
  fs.writeFileSync(file, bytes);

  const latestFile = latestIntentFile(root);
  const tmpPath = path.join(path.dirname(latestFile), "intent.json.tmp");
  fs.mkdirSync(path.dirname(latestFile), { recursive: true });
  fs.writeFileSync(tmpPath, bytes);
  fs.renameSync(tmpPath, latestFile);

  return { intent: record, source: file, digest: sha256(bytes) };
}

export function intentIdFromRef(ref) {
  if (typeof ref !== "string") return null;

  if (ref.startsWith("intent:")) {
    const id = ref.slice("intent:".length).trim();
    return id.length > 0 ? id : null;
  }

  const match = ref.match(
    /(?:^|\/)\.eos\/formation\/records\/([^/]+)\.json$/
  );

  if (match) return match[1];

  if (
    ref === ".eos/formation/intent.json" ||
    ref.endsWith("/.eos/formation/intent.json")
  ) {
    return "latest";
  }

  return null;
}

export function isIntentRef(ref, intents = []) {
  const id = intentIdFromRef(ref);

  if (id === null) return false;
  if (intents.length === 0) return false;

  if (id === "latest") {
    const ids = intents.map((record) => record.intent.intent_id).sort();
    const latestId = ids[ids.length - 1];
    return intents.some((record) => record.intent.intent_id === latestId);
  }

  return intents.some((record) => record.intent.intent_id === id);
}

export function isPersistedIntentRef(ref, workspaceRoot) {
  if (typeof ref !== "string") return false;

  const recordsDir = normalizePath(
    path.relative(workspaceRoot, intentRecordsDirectory(workspaceRoot))
  );

  const latestFile = normalizePath(
    path.relative(workspaceRoot, latestIntentFile(workspaceRoot))
  );

  const normalizedRef = normalizePath(ref).replace(/^\.\//, "");

  return (
    normalizedRef === latestFile ||
    normalizedRef.endsWith(`/${latestFile}`) ||
    normalizedRef === recordsDir ||
    normalizedRef.startsWith(`${recordsDir}/`)
  );
}
