import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SCHEMA = "eos-judgment/v1";
const LATEST_FILE = path.join(".eos", "judgment.json");
const LEDGER_DIR = path.join(".eos", "judgments");

const LEGAL_STATES = ["blocked", "candidate", "declared"];

export function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function serializeProjection(surface) {
  return JSON.stringify(surface, null, 2) + "\n";
}

export function latestProjectionFile(root) {
  return path.join(root, LATEST_FILE);
}

export function ledgerDirectory(root) {
  return path.join(root, LEDGER_DIR);
}

export function nodePath(root, judgmentId) {
  return path.join(ledgerDirectory(root), `${judgmentId}.json`);
}

export function loadLatestProjection(root) {
  const file = latestProjectionFile(root);

  if (!fs.existsSync(file)) return null;

  let bytes;
  let surface;

  try {
    bytes = fs.readFileSync(file);
    surface = JSON.parse(bytes);
  } catch {
    return null;
  }

  return { surface, bytes, digest: sha256(bytes) };
}

export function validateProjection(surface) {
  if (surface === null || typeof surface !== "object") {
    return { ok: false, reason: "not-an-object" };
  }

  if (surface.schema !== SCHEMA) {
    return { ok: false, reason: "schema" };
  }

  if (
    typeof surface.judgment_id !== "string" ||
    surface.judgment_id.length === 0
  ) {
    return { ok: false, reason: "judgment-id" };
  }

  if (
    typeof surface.investigation_id !== "string" ||
    surface.investigation_id.length === 0
  ) {
    return { ok: false, reason: "investigation-id" };
  }

  if (
    typeof surface.recorded_at !== "string" ||
    surface.recorded_at.length === 0
  ) {
    return { ok: false, reason: "recorded-at" };
  }

  if (!LEGAL_STATES.includes(surface.status)) {
    return { ok: false, reason: "status" };
  }

  if (
    surface.commit_reason !== "judgment" &&
    surface.commit_reason !== "fallback" &&
    surface.commit_reason !== "revision" &&
    surface.commit_reason !== "no-progress" &&
    surface.commit_reason !== "blocked"
  ) {
    return { ok: false, reason: "commit-reason" };
  }

  if (
    surface.previous_judgment_id !== null &&
    typeof surface.previous_judgment_id !== "string"
  ) {
    return { ok: false, reason: "previous-judgment-id" };
  }

  if (
    surface.previous_judgment_digest !== null &&
    typeof surface.previous_judgment_digest !== "string"
  ) {
    return { ok: false, reason: "previous-judgment-digest" };
  }

  if (!Array.isArray(surface.judgment) || surface.judgment.length === 0) {
    return { ok: false, reason: "judgment-empty" };
  }

  for (const item of surface.judgment) {
    if (!item || !LEGAL_STATES.includes(item.type)) {
      return { ok: false, reason: "judgment-type" };
    }
  }

  return { ok: true };
}

export function writeLatestProjection(root, bytes) {
  const finalPath = latestProjectionFile(root);
  const eosDir = path.dirname(finalPath);

  if (!fs.existsSync(eosDir)) {
    fs.mkdirSync(eosDir, { recursive: true });
  }

  const tmpPath = path.join(eosDir, "judgment.json.tmp");
  fs.writeFileSync(tmpPath, bytes);
  fs.renameSync(tmpPath, finalPath);
}

export function commitProjection(root, surface) {
  const validation = validateProjection(surface);

  if (!validation.ok) {
    throw new Error(`cannot commit invalid projection: ${validation.reason}`);
  }

  if (surface.previous_judgment_id != null) {
    const target = nodePath(root, surface.previous_judgment_id);

    if (!fs.existsSync(target)) {
      throw new Error(
        `cannot commit: previous lineage node missing (${surface.previous_judgment_id})`
      );
    }

    const targetBytes = fs.readFileSync(target);

    if (sha256(targetBytes) !== surface.previous_judgment_digest) {
      throw new Error("cannot commit: previous lineage digest mismatch");
    }
  }

  const nodeFile = nodePath(root, surface.judgment_id);

  if (fs.existsSync(nodeFile)) {
    throw new Error(
      `ledger is write-once; node already exists (${surface.judgment_id})`
    );
  }

  fs.mkdirSync(path.dirname(nodeFile), { recursive: true });

  const bytes = serializeProjection(surface);
  fs.writeFileSync(nodeFile, bytes);
  writeLatestProjection(root, bytes);
}
