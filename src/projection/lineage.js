import fs from "node:fs";

import { sha256, latestProjectionFile, nodePath } from "./persistence.js";

const SCHEMA = "eos-judgment/v1";
const MAX_LINEAGE_DEPTH = 1000;

const LEGAL_STATES = ["blocked", "candidate", "declared"];

const STATE_RANKS = {
  blocked: { rank: 0 },
  candidate: { rank: 1 },
  declared: { rank: 2 },
};

function surfaceStatusOf(judgment) {
  let status = "declared";

  for (const item of judgment) {
    const state = STATE_RANKS[item.type];

    if (!state) continue;

    if (state.rank < STATE_RANKS[status].rank) {
      status = item.type;
    }
  }

  return status;
}

function minimalStructural(surface) {
  if (surface === null || typeof surface !== "object") {
    return { ok: false, reason: "not-an-object" };
  }

  if (surface.schema !== SCHEMA) {
    return { ok: false, reason: "missing-schema" };
  }

  if (
    typeof surface.judgment_id !== "string" ||
    surface.judgment_id.length === 0
  ) {
    return { ok: false, reason: "missing-judgment-id" };
  }

  if (
    typeof surface.investigation_id !== "string" ||
    surface.investigation_id.length === 0
  ) {
    return { ok: false, reason: "missing-investigation-id" };
  }

  if (
    typeof surface.status !== "string" ||
    !LEGAL_STATES.includes(surface.status)
  ) {
    return { ok: false, reason: "invalid-status" };
  }

  if (!Array.isArray(surface.judgment) || surface.judgment.length === 0) {
    return { ok: false, reason: "empty-judgment" };
  }

  return { ok: true };
}

export function verifyLineage(root) {
  const latestFile = latestProjectionFile(root);

  if (!fs.existsSync(latestFile)) {
    return { state: "none", reason: "missing-latest", depth: 0 };
  }

  let latestBytes;
  let latest;

  try {
    latestBytes = fs.readFileSync(latestFile);
    latest = JSON.parse(latestBytes);
  } catch {
    return { state: "inconsistent", reason: "malformed-latest", depth: 0 };
  }

  const structural = minimalStructural(latest);

  if (!structural.ok) {
    return { state: "inconsistent", reason: structural.reason, depth: 0 };
  }

  if (surfaceStatusOf(latest.judgment) !== latest.status) {
    return { state: "inconsistent", reason: "conflicting-status", depth: 0 };
  }

  const latestNodeFile = nodePath(root, latest.judgment_id);

  if (!fs.existsSync(latestNodeFile)) {
    return { state: "inconsistent", reason: "missing-latest-node", depth: 0 };
  }

  let latestNodeBytes;

  try {
    latestNodeBytes = fs.readFileSync(latestNodeFile);
  } catch {
    return { state: "inconsistent", reason: "malformed-node", depth: 0, nodeId: latest.judgment_id };
  }

  if (sha256(latestNodeBytes) !== sha256(latestBytes)) {
    return { state: "inconsistent", reason: "latest-node-mismatch", depth: 0, nodeId: latest.judgment_id };
  }

  if (latest.previous_judgment_id == null) {
    return {
      state: "none",
      reason: "fresh-chain",
      depth: 0,
      latestId: latest.judgment_id,
    };
  }

  const chain = [latest.judgment_id];
  let current = latest;
  let depth = 0;

  while (current.previous_judgment_id != null) {
    depth += 1;

    if (depth > MAX_LINEAGE_DEPTH) {
      return { state: "inconsistent", reason: "lineage-loop", depth };
    }

    const id = current.previous_judgment_id;
    const file = nodePath(root, id);

    if (!fs.existsSync(file)) {
      return {
        state: "inconsistent",
        reason: "dangling-previous",
        depth,
        missingId: id,
      };
    }

    let nodeBytes;
    let node;

    try {
      nodeBytes = fs.readFileSync(file);
      node = JSON.parse(nodeBytes);
    } catch {
      return {
        state: "inconsistent",
        reason: "malformed-node",
        depth,
        nodeId: id,
      };
    }

    const nodeStructural = minimalStructural(node);

    if (!nodeStructural.ok) {
      return {
        state: "inconsistent",
        reason: nodeStructural.reason,
        depth,
        nodeId: id,
      };
    }

    if (node.judgment_id !== id) {
      return {
        state: "inconsistent",
        reason: "id-mismatch",
        depth,
        nodeId: id,
      };
    }

    if (sha256(nodeBytes) !== current.previous_judgment_digest) {
      return {
        state: "inconsistent",
        reason: "digest-mismatch",
        depth,
        nodeId: id,
      };
    }

    if (surfaceStatusOf(node.judgment) !== node.status) {
      return {
        state: "inconsistent",
        reason: "conflicting-status",
        depth,
        nodeId: id,
      };
    }

    chain.push(id);
    current = node;
  }

  return {
    state: "consistent",
    reason: "ok",
    depth,
    chain,
    latestId: latest.judgment_id,
  };
}
