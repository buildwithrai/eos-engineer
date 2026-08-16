import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const EVIDENCE_DIR = path.join(".eos", "substrate", "engineering", "evidence");
const DECISIONS_DIR = path.join(".eos", "substrate", "engineering", "decisions");
const TRACEABILITY_FILE = path.join(".eos", "substrate", "engineering", "traceability.json");
const KNOWLEDGE_FILE = path.join(".eos", "substrate", "knowledge.json");

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function readJson(file) {
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

export function evidenceDirectory(root) {
  return path.join(root, EVIDENCE_DIR);
}

export function decisionsDirectory(root) {
  return path.join(root, DECISIONS_DIR);
}

export function traceabilityFile(root) {
  return path.join(root, TRACEABILITY_FILE);
}

export function knowledgeFile(root) {
  return path.join(root, KNOWLEDGE_FILE);
}

export function loadEvidence(root) {
  const dir = evidenceDirectory(root);
  const items = [];

  if (!fs.existsSync(dir)) return items;

  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(".json")) continue;

    const file = path.join(dir, entry);
    const raw = fs.readFileSync(file, "utf8");
    const evidence = JSON.parse(raw);

    if (!evidence || typeof evidence.id !== "string") continue;

    items.push({
      evidence,
      source: file,
      digest: sha256(raw),
    });
  }

  return items;
}

export function findEvidence(items, id) {
  return items.find((item) => item.evidence.id === id);
}

export function evidenceExists(items, id) {
  return findEvidence(items, id) !== undefined;
}

export function loadDecisions(root) {
  const dir = decisionsDirectory(root);
  const items = [];

  if (!fs.existsSync(dir)) return items;

  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(".json")) continue;

    const file = path.join(dir, entry);
    const raw = fs.readFileSync(file, "utf8");
    const decision = JSON.parse(raw);

    if (!decision || typeof decision.id !== "string") continue;

    items.push({
      item: decision,
      source: file,
      digest: sha256(raw),
    });
  }

  return items;
}

export function loadTraceability(root) {
  const file = traceabilityFile(root);
  const raw = readJson(file);

  if (raw === undefined) return undefined;

  return {
    item: raw,
    source: file,
    digest: sha256(fs.readFileSync(file, "utf8")),
  };
}

export function loadKnowledge(root) {
  const file = knowledgeFile(root);
  const raw = readJson(file);

  if (raw === undefined) return undefined;

  return {
    knowledge: raw,
    source: file,
    digest: sha256(fs.readFileSync(file, "utf8")),
  };
}
